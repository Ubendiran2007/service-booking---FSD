export type UserRole = 'admin' | 'customer' | 'worker';
export type UserStatus = 'pending' | 'approved' | 'active' | 'rejected';

export type VerificationStatus = 'none' | 'pending' | 'verified' | 'rejected';

export interface WorkerVerification {
  status: VerificationStatus;
  certificateUrls: string[];
  /** Worker-provided company/employee ID, validated by admin list. */
  employeeId?: string;
  skills: string[];
  experienceYears: number;
  adminRemarks?: string;
  reviewedAt?: string;
  submittedAt?: string;
}

export interface ReliabilityStats {
  cancellations: number;
  delays: number;
  onTimeCompletes: number;
}

export interface UserProfile {
  name: string;
  phone: string;
  address: string;
  location?: {
    lat: number;
    lng: number;
  };
  category?: string;
  rating?: number;
  totalReviews?: number;
  welcomeShown?: boolean;
  isOnline?: boolean;
  /** Admin-verified professional (documents + skills reviewed). */
  verification?: WorkerVerification;
  /** km — worker only; jobs outside radius from worker base should be filtered. */
  serviceRadiusKm?: number;
  /** 0–100 platform reliability score (cancellations / delays reduce). */
  reliabilityScore?: number;
  reliabilityStats?: ReliabilityStats;
}

export interface User {
  uid: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  profile: UserProfile;
  createdAt: string;
}

export type BookingStatus = 'pending' | 'accepted' | 'rejected' | 'completed' | 'cancelled';

export type BookingUrgency = 'normal' | 'urgent';
export type BookingLocationSource = 'live' | 'home' | 'manual';

/** Job complexity tier — drives work cost in the pricing engine. */
export type ServiceLevel = 'small' | 'medium' | 'large';

export interface Booking {
  id: string;
  customerId: string;
  workerId: string;
  serviceType: string;
  date: string;
  time: string;
  status: BookingStatus;
  location?: { lat: number; lng: number } | string;
  locationSource?: BookingLocationSource;
  notes?: string;
  payment: {
    amount: number;
    status: 'pending' | 'paid';
  };
  feedback?: {
    rating: number;
    comment: string;
  };
  rejectionReason?: string;
  createdAt: string;
  urgency?: BookingUrgency;
  /** Complexity tier for pricing (work cost). */
  serviceLevel?: ServiceLevel;
  /** Default 60 — used for overlap detection across adjacent slots. */
  slotDurationMinutes?: number;
  acceptedAt?: string;
  completedAt?: string;
  wasDelayed?: boolean;
  cancelledBy?: 'customer' | 'worker';
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'booking' | 'payment' | 'system';
  isRead: boolean;
  createdAt: string;
}
