import type { Booking } from '../types';

export const BOOKING_SLOT_TIMES = [
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
] as const;

export type BookingSlotTime = (typeof BOOKING_SLOT_TIMES)[number];

export const DEFAULT_SLOT_DURATION_MINUTES = 60;

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Two fixed-duration intervals overlap if they share any minute. */
export function slotsOverlap(timeA: string, timeB: string, durationMin = DEFAULT_SLOT_DURATION_MINUTES): boolean {
  const a0 = timeToMinutes(timeA);
  const a1 = a0 + durationMin;
  const b0 = timeToMinutes(timeB);
  const b1 = b0 + durationMin;
  return a0 < b1 && b0 < a1;
}

export function bookingBlocksSlot(b: Pick<Booking, 'status' | 'time'> & { slotDurationMinutes?: number }): boolean {
  return !['rejected', 'cancelled'].includes(b.status);
}

/** True if worker already has a blocking booking overlapping this slot on this date. */
export function isWorkerSlotBlocked(
  workerId: string,
  date: string,
  time: string,
  bookings: Booking[],
  durationMin = DEFAULT_SLOT_DURATION_MINUTES
): boolean {
  return bookings.some(
    (b) =>
      b.workerId === workerId &&
      b.date === date &&
      bookingBlocksSlot(b) &&
      slotsOverlap(b.time, time, b.slotDurationMinutes ?? durationMin)
  );
}

/** Demand = count of platform bookings in that slot for the category (non-rejected). */
export function slotDemandForCategory(
  category: string | undefined,
  date: string,
  time: string,
  bookings: Booking[]
): number {
  if (!category) return 0;
  return bookings.filter(
    (b) =>
      b.serviceType === category &&
      b.date === date &&
      b.time === time &&
      b.status !== 'rejected' &&
      b.status !== 'cancelled'
  ).length;
}

/** Best slots first: low demand, and not blocked for this worker. */
export function suggestSlotsForWorker(
  workerId: string,
  category: string | undefined,
  date: string,
  allBookings: Booking[]
): { time: string; demand: number; free: boolean }[] {
  return [...BOOKING_SLOT_TIMES]
    .map((time) => {
      const demand = slotDemandForCategory(category, date, time, allBookings);
      const free = !isWorkerSlotBlocked(workerId, date, time, allBookings);
      return { time, demand, free };
    })
    .sort((a, b) => {
      if (a.free !== b.free) return a.free ? -1 : 1;
      return a.demand - b.demand;
    });
}
