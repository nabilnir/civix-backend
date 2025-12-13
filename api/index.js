import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { connectDB } from '../config/db.js';
import authRoutes from '../routes/auth.js';
import issuesRoutes from '../routes/issues.js';
import usersRoutes from '../routes/users.js';
import staffRoutes from '../routes/staff.js';
import paymentsRoutes from '../routes/payments.js';
import adminRoutes from '../routes/admin.js';

dotenv.config();

const app = express();

app.use(cors({
  origin: [
    'https://civix-auth-system.web.app',
    'https://civix-backend-livid.vercel.app',
    process.env.CLIENT_URL
  ],
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).send({
      success: false,
      message: 'Database connection failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.get('/api', (req, res) => {
  res.send({ 
    success: true, 
    message: 'Civix Server is running!',
    timestamp: new Date(),
    endpoints: {
      auth: '/api/auth',
      issues: '/api/issues',
      users: '/api/users',
      staff: '/api/staff',
      payments: '/api/payments',
      admin: '/api/admin'
    }
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/issues', issuesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).send({
    success: false,
    message: 'Route not found',
    requestedUrl: req.originalUrl
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).send({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export default app;
