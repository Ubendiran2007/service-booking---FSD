import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Routes (to be built)
import workerRoutes from './routes/workers.js';
import bookingRoutes from './routes/bookings.js';
import adminRoutes from './routes/admin.js';
import debugRoutes from './routes/debug.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Static Health Check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'ServiFlow Back-End' }));

// Route Groups
app.use('/api/workers', workerRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/debug', debugRoutes);

// Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`Backend Server running on http://localhost:${PORT}`);
});
