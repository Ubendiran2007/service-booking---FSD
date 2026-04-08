import type { BookingUrgency, ServiceLevel } from '../types';

/** Primary factor: work cost by complexity (currency units as in UI). */
export const WORK_COST_BY_LEVEL: Record<ServiceLevel, number> = {
  small: 300,
  medium: 700,
  large: 2000,
};

export interface PricingBreakdown {
  workCost: number;
  travelCost: number;
  urgencyCharge: number;
  timeCharge: number;
  demandCharge: number;
  finalPrice: number;
  /** Great-circle km worker base → customer destination (for travel slab only). */
  distanceKm: number;
  timeBand: 'peak' | 'normal' | 'low_demand';
}

export interface ComputePriceInput {
  serviceLevel: ServiceLevel;
  urgency: BookingUrgency;
  bookingTime: string;
  jobsInSlotForCategory: number;
  workersInCategory: number;
  workerBase: { lat: number; lng: number } | null | undefined;
  customerDestination: { lat: number; lng: number } | null | undefined;
}

export function workCostForLevel(level: ServiceLevel): number {
  return WORK_COST_BY_LEVEL[level];
}

export function haversineDistanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

/** Distance slabs: travel cost only (work cost is separate). */
export function travelCostFromDistanceKm(distanceKm: number): number {
  if (distanceKm < 2) return 30;
  if (distanceKm < 5) return 80;
  if (distanceKm < 10) return 150;
  return 250;
}

/**
 * Morning 9:00–12:00 and evening 18:00–21:00 (slot start time, local).
 * Evening peak applies when those hours exist in your slot config.
 */
export function isPeakHour(bookingTime: string): boolean {
  const [h, m] = bookingTime.split(':').map(Number);
  const minutes = (h || 0) * 60 + (m || 0);
  const morningStart = 9 * 60;
  const morningEnd = 12 * 60;
  const eveningStart = 18 * 60;
  const eveningEnd = 21 * 60;
  return (
    (minutes >= morningStart && minutes < morningEnd) ||
    (minutes >= eveningStart && minutes < eveningEnd)
  );
}

/**
 * Final Price =
 *   Work Cost + Travel Cost + urgencyCharge + timeCharge + demandCharge
 * Base Price = Work Cost (urgency/time/demand components multiply Base Price per spec).
 */
export function computeServiFlowPrice(input: ComputePriceInput): PricingBreakdown {
  const workCost = workCostForLevel(input.serviceLevel);
  const basePrice = workCost;

  let distanceKm = 0;
  if (input.workerBase && input.customerDestination) {
    distanceKm = haversineDistanceKm(input.workerBase, input.customerDestination);
  }
  const travelCost = travelCostFromDistanceKm(distanceKm);

  const urgencyCharge = input.urgency === 'urgent' ? basePrice * 0.35 : 0;

  const peak = isPeakHour(input.bookingTime);
  const workers = Math.max(input.workersInCategory, 1);
  const slotDemandRatio = input.jobsInSlotForCategory / workers;

  let timeCharge = 0;
  let timeBand: PricingBreakdown['timeBand'] = 'normal';
  if (peak) {
    timeCharge = basePrice * 0.2;
    timeBand = 'peak';
  } else if (slotDemandRatio < 0.5) {
    timeCharge = basePrice * -0.1;
    timeBand = 'low_demand';
  }

  const demandCharge = basePrice * slotDemandRatio;

  let finalPrice = workCost + travelCost + urgencyCharge + timeCharge + demandCharge;
  finalPrice = Math.max(0, Math.round(finalPrice * 100) / 100);

  return {
    workCost,
    travelCost,
    urgencyCharge,
    timeCharge,
    demandCharge,
    finalPrice,
    distanceKm,
    timeBand,
  };
}
