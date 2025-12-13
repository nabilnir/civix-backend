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
    'https://civix-auth-system.web.app/',
    'https://civix-backend-livid.vercel.app',
    process.env.CLIENT_URL
  ],
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());
connectDB();

app.get('/', (req, res) => {
  res.send({ 
    success: true, 
    message: 'Civix Server is running!',
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

app.use('/auth', authRoutes);
app.use('/issues', issuesRoutes);
app.use('/users', usersRoutes);
app.use('/staff', staffRoutes);
app.use('/payments', paymentsRoutes);
app.use('/admin', adminRoutes);

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
