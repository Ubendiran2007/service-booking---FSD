import { db } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { adjustWorkerReliability } from '../lib/reliability';
import { DEFAULT_SLOT_DURATION_MINUTES } from '../lib/scheduling';

function scheduledEndMs(dateStr: string, timeStr: string, slotMin: number): number {
  const [hh, mm] = timeStr.split(':').map(Number);
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(hh, mm || 0, 0, 0);
  return d.getTime() + slotMin * 60 * 1000;
}

export const bookingService = {
  createBooking: async (bookingData: Record<string, unknown>) => {
    const urgency = bookingData.urgency === 'urgent' ? 'urgent' : 'normal';
    const docRef = await addDoc(collection(db, 'bookings'), {
      ...bookingData,
      urgency,
      slotDurationMinutes: bookingData.slotDurationMinutes ?? DEFAULT_SLOT_DURATION_MINUTES,
      status: 'pending',
      createdAt: new Date().toISOString(),
      serverCreatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, 'notifications'), {
      userId: bookingData.workerId,
      title: urgency === 'urgent' ? 'Urgent booking request' : 'New booking request',
      message:
        urgency === 'urgent'
          ? `Urgent ${bookingData.serviceType} request for ${bookingData.date} at ${bookingData.time}.`
          : `You received a ${bookingData.serviceType} request for ${bookingData.date} at ${bookingData.time}.`,
      type: 'booking',
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    return { id: docRef.id };
  },

  submitFeedback: async (bookingId: string, rating: number, comment: string) => {
    const bookingRef = doc(db, 'bookings', bookingId);
    await updateDoc(bookingRef, {
      feedback: { rating, comment },
      'payment.status': 'paid',
    });
    return { success: true };
  },

  cancelBooking: async (bookingId: string, by: 'customer' | 'worker') => {
    const bookingRef = doc(db, 'bookings', bookingId);
    const snap = await getDoc(bookingRef);
    if (!snap.exists()) return { success: false };
    const booking = snap.data() as { workerId: string; customerId?: string; serviceType?: string; status?: string };
    await updateDoc(bookingRef, {
      status: 'cancelled',
      cancelledBy: by,
    });
    if (by === 'worker') {
      await adjustWorkerReliability(booking.workerId, 'worker_reject');
    }
    const otherParty = by === 'customer' ? booking.workerId : booking.customerId;
    if (otherParty) {
      await addDoc(collection(db, 'notifications'), {
        userId: otherParty,
        title: 'Booking cancelled',
        message: `A booking was cancelled (${booking.serviceType || 'service'}).`,
        type: 'booking',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }
    return { success: true };
  },

  updateStatus: async (
    bookingId: string,
    status: string,
    rejectionReason?: string,
    customerId?: string,
    serviceType?: string
  ) => {
    const bookingRef = doc(db, 'bookings', bookingId);
    const snap = await getDoc(bookingRef);
    const booking = snap.exists() ? snap.data() : null;
    const workerId = (booking?.workerId as string) || '';
    const slotMin = (booking?.slotDurationMinutes as number) || DEFAULT_SLOT_DURATION_MINUTES;

    const patch: Record<string, unknown> = {
      status,
      ...(rejectionReason && { rejectionReason }),
    };

    if (status === 'accepted') {
      patch.acceptedAt = new Date().toISOString();
    }

    if (status === 'completed') {
      const completedAt = new Date().toISOString();
      patch.completedAt = completedAt;
      const dateStr = booking?.date as string;
      const timeStr = booking?.time as string;
      if (dateStr && timeStr && workerId) {
        const end = scheduledEndMs(dateStr, timeStr, slotMin);
        const late = Date.now() > end + 15 * 60 * 1000;
        patch.wasDelayed = late;
        await adjustWorkerReliability(workerId, late ? 'completed_late' : 'completed_ontime');
      }
    }

    if (status === 'rejected' && workerId) {
      await adjustWorkerReliability(workerId, 'worker_reject');
    }

    await updateDoc(bookingRef, patch);

    if (customerId) {
      let title = '';
      let message = '';
      if (status === 'accepted') {
        title = 'Booking Confirmed';
        message = `Your ${serviceType} request has been confirmed. The professional is on the way.`;
      } else if (status === 'rejected') {
        title = 'Booking Declined';
        message = `Your ${serviceType} request was declined.`;
      } else if (status === 'completed') {
        title = 'Service Completed';
        message = `Your ${serviceType} service is complete. Please pay and rate the professional.`;
      }

      if (title) {
        await addDoc(collection(db, 'notifications'), {
          userId: customerId,
          title,
          message,
          type: 'booking',
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }
    }

    return { success: true };
  },
};
