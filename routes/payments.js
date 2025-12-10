
import express from 'express';
import { ObjectId } from 'mongodb';
import { paymentsCollection, issuesCollection, usersCollection } from '../config/db.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { verifyAdmin } from '../middleware/verifyRole.js';

const router = express.Router();

// Create Payment Record 
router.post('/', verifyToken, async (req, res) => {
  try {
    const { amount, type, issueId, transactionId, method } = req.body;
    const userEmail = req.user.email;
    
    const user = await usersCollection.findOne({ email: userEmail });
    
    if (!user) {
      return res.status(404).send({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    const payment = {
      userEmail,
      userName: user.name,
      amount,
      type, 
      issueId: issueId || null,
      transactionId,
      method: method || 'stripe',
      status: 'completed',
      invoiceId: `INV-${Date.now()}`,
      createdAt: new Date()
    };
    
    const result = await paymentsCollection.insertOne(payment);
    
    // If boost payment, update issue priority
    if (type === 'boost' && issueId) {
      await issuesCollection.updateOne(
        { _id: new ObjectId(issueId) },
        { 
          $set: { 
            priority: 'high',
            boostedAt: new Date()
          },
          $push: {
            timeline: {
              status: 'boosted',
              message: 'Issue priority boosted to high',
              updatedBy: userEmail,
              updatedByRole: 'citizen',
              date: new Date()
            }
          }
        }
      );
    }
    
    // If subscription payment, make user premium
    if (type === 'subscription') {
      await usersCollection.updateOne(
        { email: userEmail },
        { 
          $set: { 
            isPremium: true,
            premiumSince: new Date()
          } 
        }
      );
    }
    
    res.status(201).send({ 
      success: true,
      message: 'Payment recorded successfully', 
      data: { ...payment, _id: result.insertedId }
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error recording payment', 
      error: error.message 
    });
  }
});

// Get User Payment History
router.get('/user/:email', verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    
    // Verify user is requesting their own payments
    if (email !== req.user.email) {
      return res.status(403).send({ 
        success: false,
        message: 'Forbidden access' 
      });
    }
    
    const payments = await paymentsCollection
      .find({ userEmail: email })
      .sort({ createdAt: -1 })
      .toArray();
    
    res.send({ 
      success: true,
      data: payments 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error fetching payment history', 
      error: error.message 
    });
  }
});

// Get All Payments (Admin Only) with filters
router.get('/', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const type = req.query.type || '';
    const month = req.query.month || '';
    
    const query = {};
    
    if (type) query.type = type;
    
    if (month) {
      const year = new Date().getFullYear();
      const monthNum = parseInt(month);
      const startDate = new Date(year, monthNum - 1, 1);
      const endDate = new Date(year, monthNum, 0, 23, 59, 59);
      
      query.createdAt = {
        $gte: startDate,
        $lte: endDate
      };
    }
    
    const payments = await paymentsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();
    
    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    
    res.send({ 
      success: true,
      data: {
        payments,
        totalRevenue,
        totalCount: payments.length
      }
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error fetching payments', 
      error: error.message 
    });
  }
});

// Get Payment Statistics (Admin Only)
router.get('/stats', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const allPayments = await paymentsCollection.find({}).toArray();
    
    const totalRevenue = allPayments.reduce((sum, p) => sum + p.amount, 0);
    const boostPayments = allPayments.filter(p => p.type === 'boost').length;
    const subscriptionPayments = allPayments.filter(p => p.type === 'subscription').length;
    
    // Group by month for chart
    const paymentsByMonth = {};
    allPayments.forEach(payment => {
      const month = new Date(payment.createdAt).toLocaleString('default', { month: 'short' });
      paymentsByMonth[month] = (paymentsByMonth[month] || 0) + payment.amount;
    });
    
    res.send({ 
      success: true,
      data: {
        totalRevenue,
        totalPayments: allPayments.length,
        boostPayments,
        subscriptionPayments,
        paymentsByMonth
      }
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error fetching payment stats', 
      error: error.message 
    });
  }
});

export default router;