
import express from 'express';
import { usersCollection, paymentsCollection } from '../config/db.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { verifyAdmin } from '../middleware/verifyRole.js';

const router = express.Router();

router.get('/', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const users = await usersCollection
      .find({ role: 'citizen' })
      .sort({ createdAt: -1 })
      .toArray();
    
    res.send({ 
      success: true,
      data: users 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error fetching users', 
      error: error.message 
    });
  }
});

router.patch('/:email/block', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const email = req.params.email;
    const { isBlocked } = req.body;
    
    const result = await usersCollection.updateOne(
      { email },
      { 
        $set: { 
          isBlocked,
          updatedAt: new Date() 
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).send({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    res.send({ 
      success: true,
      message: `User ${isBlocked ? 'blocked' : 'unblocked'} successfully`, 
      data: result 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error updating user status', 
      error: error.message 
    });
  }
});

router.patch('/:email/premium', verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    
    if (email !== req.user.email) {
      return res.status(403).send({ 
        success: false,
        message: 'Forbidden access' 
      });
    }
    
    const result = await usersCollection.updateOne(
      { email },
      { 
        $set: { 
          isPremium: true,
          premiumSince: new Date(),
          updatedAt: new Date() 
        } 
      }
    );
    
    res.send({ 
      success: true,
      message: 'Premium subscription activated', 
      data: result 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error updating premium status', 
      error: error.message 
    });
  }
});

router.get('/:email/stats', verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    
    if (email !== req.user.email) {
      return res.status(403).send({ 
        success: false,
        message: 'Forbidden access' 
      });
    }
    
    const user = await usersCollection.findOne({ email });
    
    if (!user) {
      return res.status(404).send({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    const payments = await paymentsCollection
      .find({ userEmail: email })
      .toArray();
    
    const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);
    
    res.send({ 
      success: true,
      data: {
        issueCount: user.issueCount,
        isPremium: user.isPremium,
        isBlocked: user.isBlocked,
        totalPayments,
        paymentCount: payments.length
      }
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error fetching user stats', 
      error: error.message 
    });
  }
});

export default router;