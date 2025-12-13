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
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'https://civix-auth-system.web.app',
      'https://civix-backend-livid.vercel.app',
      process.env.CLIENT_URL,
      // Development origins
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5174'
    ].filter(Boolean); // Remove undefined values
    
    // Check if origin is in allowed list or is a localhost origin in development
    const isLocalhost = origin && /^http:\/\/localhost(:\d+)?$/.test(origin) || 
                       origin && /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
    
    if (allowedOrigins.includes(origin) || (isLocalhost && process.env.NODE_ENV !== 'production')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
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
