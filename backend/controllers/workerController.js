import { db } from '../config/firebase.js';

/**
 * Fetch all active workers for the customer marketplace
 */
export const getActiveWorkers = async (req, res) => {
    try {
        const workersSnapshot = await db.collection('users')
            .where('role', '==', 'worker')
            .where('status', '==', 'active')
            .get();
        
        const workers = workersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(workers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Get detailed profile for a specific professional
 */
export const getWorkerDetail = async (req, res) => {
    try {
        const workerDoc = await db.collection('users').doc(req.params.id).get();
        if (!workerDoc.exists) {
            return res.status(404).json({ error: 'Professional not found' });
        }
        res.status(200).json({ id: workerDoc.id, ...workerDoc.data() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
