import express from 'express';
import { 
    createBooking, 
    updateBookingStatus, 
    getUserBookings, 
    submitFeedback 
} from '../controllers/bookingController.js';
import { validateBooking, validateStatusUpdate, validateFeedback } from '../middleware/validation.js';

const router = express.Router();

/**
 * @route   POST /api/bookings
 * @desc    Create a new booking request
 */
router.post('/', validateBooking, createBooking);

/**
 * @route   GET /api/bookings/user/:uid
 * @desc    Get all bookings for a specific customer or worker
 */
router.get('/user/:uid', getUserBookings);

/**
 * @route   PATCH /api/bookings/:id/status
 * @desc    Update booking status (Accept/Reject/Complete)
 */
router.patch('/:id/status', validateStatusUpdate, updateBookingStatus);

/**
 * @route   POST /api/bookings/:id/feedback
 * @desc    Submit rating and payment confirmation
 */
router.post('/:id/feedback', validateFeedback, submitFeedback);

export default router;
