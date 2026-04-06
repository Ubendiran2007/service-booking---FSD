import express from 'express';
import { getActiveWorkers, getWorkerDetail } from '../controllers/workerController.js';

const router = express.Router();

/**
 * @route   GET /api/workers
 * @desc    Get all active service professionals
 */
router.get('/', getActiveWorkers);

/**
 * @route   GET /api/workers/:id
 * @desc    Get single worker by UID
 */
router.get('/:id', getWorkerDetail);

export default router;
