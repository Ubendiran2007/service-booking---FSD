import { api } from './api';

export const bookingService = {
  createBooking: async (bookingData: any) => {
    return await api.post('/bookings', bookingData);
  },

  submitFeedback: async (bookingId: string, rating: number, comment: string) => {
    return await api.post(`/bookings/${bookingId}/feedback`, { rating, comment });
  },

  updateStatus: async (bookingId: string, status: string, rejectionReason?: string) => {
    return await api.patch(`/bookings/${bookingId}/status`, { status, rejectionReason });
  }
};
