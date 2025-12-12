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
    'https://civix-com.web.app',
    'https://civix-backend-livid.vercel.app',
    process.env.CLIENT_URL
  ],
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());
connectDB();

app.get('/', (req, res) => {
  res.send({ success: true, message: 'Civix Server is running!' });
});

app.use('/api/auth', authRoutes);
app.use('/api/issues', issuesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/admin', adminRoutes);

export default app;
