export type UserRole = 'admin' | 'customer' | 'worker';
export type UserStatus = 'pending' | 'approved' | 'active';

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

export interface Booking {
  id: string;
  customerId: string;
  workerId: string;
  serviceType: string;
  date: string;
  time: string;
  status: BookingStatus;
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
