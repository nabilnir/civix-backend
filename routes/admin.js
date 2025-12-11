import express from 'express';
import { ObjectId } from 'mongodb';
import { issuesCollection, usersCollection, paymentsCollection } from '../config/db.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { verifyAdmin } from '../middleware/verifyRole.js';

const router = express.Router();

// Get All Issues (Admin Only) - with sorting by priority
router.get('/issues', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const issues = await issuesCollection
      .find({})
      .sort({ priority: -1, createdAt: -1 }) 
      .toArray();
    
    res.send({ 
      success: true,
      data: issues 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error fetching issues', 
      error: error.message 
    });
  }
});

// Assign Staff to Issue (Admin Only)
router.patch('/issues/:id/assign', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { staffEmail } = req.body;
    
    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    
    if (!issue) {
      return res.status(404).send({ 
        success: false,
        message: 'Issue not found' 
      });
    }
    
    // Check if already assigned
    if (issue.assignedStaff) {
      return res.status(400).send({ 
        success: false,
        message: 'Issue already assigned to staff' 
      });
    }
    
    // Get staff details
    const staff = await usersCollection.findOne({ 
      email: staffEmail, 
      role: 'staff' 
    });
    
    if (!staff) {
      return res.status(404).send({ 
        success: false,
        message: 'Staff member not found' 
      });
    }
    
    // Add timeline entry
    const timelineEntry = {
      status: 'assigned',
      message: `Issue assigned to staff: ${staff.name}`,
      updatedBy: req.user.email,
      updatedByRole: 'admin',
      date: new Date()
    };
    
    const result = await issuesCollection.updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          assignedStaff: {
            email: staff.email,
            name: staff.name,
            photoURL: staff.photoURL
          },
          updatedAt: new Date()
        },
        $push: { timeline: timelineEntry }
      }
    );
    
    // Increment staff's assigned issues count
    await usersCollection.updateOne(
      { email: staffEmail },
      { $inc: { assignedIssuesCount: 1 } }
    );
    
    res.send({ 
      success: true,
      message: 'Staff assigned successfully', 
      data: result 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error assigning staff', 
      error: error.message 
    });
  }
});

// Reject Issue (Admin Only) - only if status is pending
router.patch('/issues/:id/reject', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { reason } = req.body;
    
    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    
    if (!issue) {
      return res.status(404).send({ 
        success: false,
        message: 'Issue not found' 
      });
    }
    
    if (issue.status !== 'pending') {
      return res.status(400).send({ 
        success: false,
        message: 'Can only reject pending issues' 
      });
    }
    
    // Add timeline entry
    const timelineEntry = {
      status: 'rejected',
      message: `Issue rejected by admin. Reason: ${reason || 'No reason provided'}`,
      updatedBy: req.user.email,
      updatedByRole: 'admin',
      date: new Date()
    };
    
    const result = await issuesCollection.updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          status: 'rejected',
          rejectedReason: reason,
          rejectedAt: new Date(),
          updatedAt: new Date()
        },
        $push: { timeline: timelineEntry }
      }
    );
    
    res.send({ 
      success: true,
      message: 'Issue rejected successfully', 
      data: result 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error rejecting issue', 
      error: error.message 
    });
  }
});

// Get Dashboard Statistics (Admin Only)
router.get('/stats', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const totalIssues = await issuesCollection.countDocuments();
    const pendingIssues = await issuesCollection.countDocuments({ status: 'pending' });
    const inProgressIssues = await issuesCollection.countDocuments({ 
      status: { $in: ['in-progress', 'working'] } 
    });
    const resolvedIssues = await issuesCollection.countDocuments({ status: 'resolved' });
    const rejectedIssues = await issuesCollection.countDocuments({ status: 'rejected' });
    
    const totalUsers = await usersCollection.countDocuments({ role: 'citizen' });
    const premiumUsers = await usersCollection.countDocuments({ 
      role: 'citizen', 
      isPremium: true 
    });
    const blockedUsers = await usersCollection.countDocuments({ 
      role: 'citizen', 
      isBlocked: true 
    });
    
    const totalStaff = await usersCollection.countDocuments({ role: 'staff' });
    
    const allPayments = await paymentsCollection.find({}).toArray();
    const totalRevenue = allPayments.reduce((sum, p) => sum + p.amount, 0);
    
    res.send({ 
      success: true,
      data: {
        issues: {
          total: totalIssues,
          pending: pendingIssues,
          inProgress: inProgressIssues,
          resolved: resolvedIssues,
          rejected: rejectedIssues
        },
        users: {
          total: totalUsers,
          premium: premiumUsers,
          blocked: blockedUsers
        },
        staff: totalStaff,
        payments: {
          total: allPayments.length,
          revenue: totalRevenue
        }
      }
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error fetching dashboard stats', 
      error: error.message 
    });
  }
});

// Get Latest Data for Dashboard Widgets
router.get('/latest', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const latestIssues = await issuesCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();
    
    const latestPayments = await paymentsCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();
    
    const latestUsers = await usersCollection
      .find({ role: 'citizen' })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();
    
    res.send({ 
      success: true,
      data: {
        latestIssues,
        latestPayments,
        latestUsers
      }
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error fetching latest data', 
      error: error.message 
    });
  }
});

export default router;