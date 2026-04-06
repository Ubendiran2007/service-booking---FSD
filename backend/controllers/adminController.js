import { db } from '../config/firebase.js';

/**
 * Fetch all pending worker registrations for approval
 */
export const getPendingWorkers = async (req, res) => {
    try {
        const workersSnapshot = await db.collection('users')
            .where('role', '==', 'worker')
            .where('status', '==', 'pending')
            .get();
        
        const workers = workersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(workers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Update worker's status to Active or Rejected
 */
export const approveWorker = async (req, res) => {
    try {
        const { uid } = req.params;
        const { approve } = req.body;
        
        const userRef = db.collection('users').doc(uid);
        await userRef.update({
            status: approve ? 'active' : 'rejected'
        });

        res.status(200).json({ message: `Professional ${approve ? 'approved' : 'rejected'} successfully` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Get simple statistics for admin overview
 */
export const getStats = async (req, res) => {
    try {
        const [usersSnap, bookingsSnap] = await Promise.all([
            db.collection('users').get(),
            db.collection('bookings').get()
        ]);
        
        const stats = {
            totalUsers: usersSnap.size,
            totalBookings: bookingsSnap.size,
            completedBookings: bookingsSnap.docs.filter(d => d.data().status === 'completed').size
        };

        res.status(200).json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
