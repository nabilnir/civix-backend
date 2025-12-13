
import express from 'express';
import { ObjectId } from 'mongodb';
import Stripe from 'stripe';
import { paymentsCollection, issuesCollection, usersCollection } from '../config/db.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { verifyAdmin } from '../middleware/verifyRole.js';

const router = express.Router();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-11-20.acacia',
});

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
    
    if (type === 'boost' && issueId) {
      const issue = await issuesCollection.findOne({ _id: new ObjectId(issueId) });
      if (!issue) {
        return res.status(404).send({ 
          success: false,
          message: 'Issue not found' 
        });
      }
      if (issue.userEmail !== userEmail) {
        return res.status(403).send({ 
          success: false,
          message: 'You can only boost your own issues' 
        });
      }
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

router.get('/user/:email', verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    
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

router.get('/stats', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const allPayments = await paymentsCollection.find({}).toArray();
    
    const totalRevenue = allPayments.reduce((sum, p) => sum + p.amount, 0);
    const boostPayments = allPayments.filter(p => p.type === 'boost').length;
    const subscriptionPayments = allPayments.filter(p => p.type === 'subscription').length;
    
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

// Create Stripe Checkout Session
router.post('/create-checkout-session', verifyToken, async (req, res) => {
  try {
    const { amount, type, issueId } = req.body;
    const userEmail = req.user.email;
    const userName = req.user.name || req.user.displayName || 'User';
    
    if (!amount || !type) {
      return res.status(400).send({
        success: false,
        message: 'Amount and type are required'
      });
    }

    // Validate user
    const user = await usersCollection.findOne({ email: userEmail });
    if (!user) {
      return res.status(404).send({
        success: false,
        message: 'User not found'
      });
    }

    // Get client URL from environment
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    
    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'bdt',
            product_data: {
              name: type === 'premium_subscription' || type === 'subscription' 
                ? 'Premium Subscription - Civix' 
                : 'Issue Boost - Civix',
              description: type === 'premium_subscription' || type === 'subscription'
                ? 'Unlock unlimited issue reports and premium features'
                : 'Boost your issue to high priority',
            },
            unit_amount: amount * 100, // Convert to paisa (BDT smallest unit)
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&type=${type}${issueId ? `&issueId=${issueId}` : ''}`,
      cancel_url: `${clientUrl}/payment/cancel`,
      customer_email: userEmail,
      metadata: {
        userEmail,
        userName,
        type,
        issueId: issueId || '',
        amount: amount.toString(),
      },
    });

    res.send({
      success: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).send({
      success: false,
      message: 'Error creating checkout session',
      error: error.message,
    });
  }
});

// Verify payment and update user (called after successful Stripe payment)
router.post('/verify-payment', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const userEmail = req.user.email;

    if (!sessionId) {
      return res.status(400).send({
        success: false,
        message: 'Session ID is required'
      });
    }

    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return res.status(404).send({
        success: false,
        message: 'Payment session not found'
      });
    }

    // Verify the session belongs to the user
    if (session.customer_email !== userEmail && session.metadata?.userEmail !== userEmail) {
      return res.status(403).send({
        success: false,
        message: 'Unauthorized access to this payment session'
      });
    }

    // Check if payment was successful
    if (session.payment_status !== 'paid') {
      return res.status(400).send({
        success: false,
        message: 'Payment not completed',
        paymentStatus: session.payment_status
      });
    }

    // Check if payment already recorded
    const existingPayment = await paymentsCollection.findOne({
      transactionId: sessionId,
    });

    if (existingPayment) {
      return res.send({
        success: true,
        message: 'Payment already processed',
        data: existingPayment
      });
    }

    // Record payment
    const { type, issueId, amount } = session.metadata;
    const user = await usersCollection.findOne({ email: userEmail });

    const paymentType = type === 'premium_subscription' ? 'subscription' : type;
    const payment = {
      userEmail,
      userName: user?.name || session.metadata.userName,
      amount: parseInt(amount),
      type: paymentType,
      issueId: issueId || null,
      transactionId: sessionId,
      method: 'stripe',
      status: 'completed',
      invoiceId: `INV-${Date.now()}`,
      createdAt: new Date(),
    };

    const result = await paymentsCollection.insertOne(payment);

    // Update user or issue based on payment type
    if (paymentType === 'subscription') {
      await usersCollection.updateOne(
        { email: userEmail },
        {
          $set: {
            isPremium: true,
            premiumSince: new Date(),
          },
        }
      );
    }

    if (type === 'boost' && issueId) {
      await issuesCollection.updateOne(
        { _id: new ObjectId(issueId) },
        {
          $set: {
            priority: 'high',
            boostedAt: new Date(),
          },
          $push: {
            timeline: {
              status: 'boosted',
              message: 'Issue priority boosted to high',
              updatedBy: userEmail,
              updatedByRole: 'citizen',
              date: new Date(),
            },
          },
        }
      );
    }

    res.send({
      success: true,
      message: 'Payment verified and processed successfully',
      data: { ...payment, _id: result.insertedId },
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).send({
      success: false,
      message: 'Error verifying payment',
      error: error.message,
    });
  }
});

export default router;