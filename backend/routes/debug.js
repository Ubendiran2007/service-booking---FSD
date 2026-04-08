import express from 'express';
import { db } from '../config/firebase.js';
import { collection, query, where, getDocs } from 'firebase/firestore';

const router = express.Router();

router.get('/admin-check', async (req, res) => {
  try {
    const snap = await db.collection('users').where('role', '==', 'admin').get();
    const admins = [];
    snap.forEach(doc => {
      admins.push({ id: doc.id, ...doc.data() });
    });
    res.json({ count: snap.size, admins });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
