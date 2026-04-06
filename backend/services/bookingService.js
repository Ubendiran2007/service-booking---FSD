import { db } from '../config/firebase.js';

export class BookingService {
    async _notify(userId, title, message, type) {
        await db.collection('notifications').add({
            userId, title, message, type, isRead: false, createdAt: new Date().toISOString()
        });
    }

    async createBooking(data) {
        const bookingData = {
            ...data,
            location: data.location || "",
            status: "pending",
            payment: { amount: data.amount || 50, status: "pending" },
            createdAt: new Date().toISOString()
        };
        const bookingRef = await db.collection('bookings').add(bookingData);
        
        await this._notify(data.workerId, "New Booking Request", `You received a ${data.serviceType} request for ${data.date}.`, "booking");

        return { id: bookingRef.id, message: "Request sent successfully" };
    }

    async getUserBookings(uid) {
        const [customerSnap, workerSnap] = await Promise.all([
            db.collection('bookings').where('customerId', '==', uid).get(),
            db.collection('bookings').where('workerId', '==', uid).get()
        ]);
        return [
            ...customerSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
            ...workerSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        ];
    }

    async updateBookingStatus(id, status, rejectionReason) {
        const bookingRef = db.collection('bookings').doc(id);
        const bookingDoc = await bookingRef.get();
        if(bookingDoc.exists) {
           const booking = bookingDoc.data();
           await bookingRef.update({
               status,
               ...(rejectionReason && { rejectionReason })
           });

           let title = "";
           let message = "";
           
           if(status === 'accepted') {
               title = "Booking Confirmed";
               message = `Your ${booking.serviceType} request has been confirmed. The professional is on the way.`;
           } else if(status === 'rejected') {
               title = "Booking Declined";
               message = `Your ${booking.serviceType} request was declined.`;
           } else if(status === 'completed') {
               title = "Service Completed";
               message = `Your ${booking.serviceType} service is complete. Please pay and rate the professional.`;
           }

           if(title) {
               await this._notify(booking.customerId, title, message, "booking");
           }
        }

        return { message: `Booking updated to ${status}` };
    }

    async submitFeedback(id, rating, comment) {
        const bookingRef = db.collection('bookings').doc(id);
        const bookingDoc = await bookingRef.get();
        if(!bookingDoc.exists) throw new Error("Booking not found");
        const booking = bookingDoc.data();

        await bookingRef.update({
            feedback: { rating, comment },
            'payment.status': 'paid'
        });

        // Update professional's stats
        const workerRef = db.collection('users').doc(booking.workerId);
        const workerData = (await workerRef.get()).data();
        const curR = workerData.profile.rating || 0;
        const totR = workerData.profile.totalReviews || 0;
        const newR = ((curR * totR) + rating) / (totR + 1);

        await workerRef.update({
            'profile.rating': Number(newR.toFixed(1)),
            'profile.totalReviews': totR + 1
        });

        await this._notify(booking.workerId, "Payment Received", `You received payment and a ${rating}-star rating for ${booking.serviceType}.`, "payment");

        return { message: "Payment & Feedback successful" };
    }
}

export const bookingService = new BookingService();
