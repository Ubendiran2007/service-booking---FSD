import express from 'express';
import { 
    getPendingWorkers, 
    approveWorker, 
    getStats 
} from '../controllers/adminController.js';

const router = express.Router();

/**
 * @route   GET /api/admin/pending
 * @desc    Fetch workers awaiting verification
 */
router.get('/pending', getPendingWorkers);

/**
 * @route   PATCH /api/admin/approve/:uid
 * @desc    Approve or reject a professional
 */
router.patch('/approve/:uid', approveWorker);

/**
 * @route   GET /api/admin/dashboard-stats
 * @desc    Overview of platform health
 */
router.get('/dashboard-stats', getStats);

export default router;
