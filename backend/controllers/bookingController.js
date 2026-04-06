import { bookingService } from '../services/bookingService.js';

export const createBooking = async (req, res) => {
    try {
        const result = await bookingService.createBooking(req.body);
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getUserBookings = async (req, res) => {
    try {
        const bookings = await bookingService.getUserBookings(req.params.uid);
        res.status(200).json(bookings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const updateBookingStatus = async (req, res) => {
    try {
        const result = await bookingService.updateBookingStatus(req.params.id, req.body.status, req.body.rejectionReason);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const submitFeedback = async (req, res) => {
    try {
        const result = await bookingService.submitFeedback(req.params.id, req.body.rating, req.body.comment);
        res.status(200).json(result);
    } catch (error) {
        const statusCode = error.message === "Booking not found" ? 404 : 500;
        res.status(statusCode).json({ error: error.message });
    }
};
