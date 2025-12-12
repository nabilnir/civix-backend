import express from 'express';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';
import { usersCollection, issuesCollection } from '../config/db.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { verifyAdmin, verifyStaff } from '../middleware/verifyRole.js';

const router = express.Router();

router.get('/', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const staff = await usersCollection
      .find({ role: 'staff' })
      .sort({ createdAt: -1 })
      .toArray();
    
    res.send({ 
      success: true,
      data: staff 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error fetching staff', 
      error: error.message 
    });
  }
});

router.post('/', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { name, email, phone, photoURL, password } = req.body;
    
    const existingStaff = await usersCollection.findOne({ email });
    if (existingStaff) {
      return res.status(400).send({ 
        success: false,
        message: 'Staff member already exists' 
      });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newStaff = {
      name,
      email,
      phone,
      photoURL: photoURL || 'https://i.ibb.co/2W8Py4W/default-avatar.png',
      role: 'staff',
      password: hashedPassword, 
      isBlocked: false,
      assignedIssuesCount: 0,
      resolvedIssuesCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await usersCollection.insertOne(newStaff);
    
    delete newStaff.password;
    
    res.status(201).send({ 
      success: true,
      message: 'Staff member created successfully', 
      data: { ...newStaff, _id: result.insertedId }
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error creating staff', 
      error: error.message 
    });
  }
});

router.patch('/:email', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const email = req.params.email;
    const updates = req.body;
    
    delete updates.role;
    delete updates.email;
    delete updates.password;
    
    updates.updatedAt = new Date();
    
    const result = await usersCollection.updateOne(
      { email, role: 'staff' },
      { $set: updates }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).send({ 
        success: false,
        message: 'Staff member not found' 
      });
    }
    
    res.send({ 
      success: true,
      message: 'Staff member updated successfully', 
      data: result 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error updating staff', 
      error: error.message 
    });
  }
});

router.delete('/:email', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const email = req.params.email;
    
    const assignedIssues = await issuesCollection.countDocuments({ 
      'assignedStaff.email': email 
    });
    
    if (assignedIssues > 0) {
      return res.status(400).send({ 
        success: false,
        message: 'Cannot delete staff with assigned issues. Reassign issues first.' 
      });
    }
    
    const result = await usersCollection.deleteOne({ 
      email, 
      role: 'staff' 
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).send({ 
        success: false,
        message: 'Staff member not found' 
      });
    }
    
    res.send({ 
      success: true,
      message: 'Staff member deleted successfully', 
      data: result 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error deleting staff', 
      error: error.message 
    });
  }
});

router.get('/:email/assigned-issues', verifyToken, verifyStaff, async (req, res) => {
  try {
    const email = req.params.email;
    
    if (email !== req.user.email) {
      return res.status(403).send({ 
        success: false,
        message: 'Forbidden access' 
      });
    }
    
    const issues = await issuesCollection
      .aggregate([
        { $match: { 'assignedStaff.email': email } },
        {
          $addFields: {
            priorityOrder: {
              $switch: {
                branches: [
                  { case: { $eq: ['$priority', 'high'] }, then: 3 },
                  { case: { $eq: ['$priority', 'normal'] }, then: 2 },
                  { case: { $eq: ['$priority', 'low'] }, then: 1 }
                ],
                default: 2
              }
            }
          }
        },
        { $sort: { priorityOrder: -1, createdAt: -1 } },
        { $project: { priorityOrder: 0 } }
      ])
      .toArray();
    
    res.send({ 
      success: true,
      data: issues 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error fetching assigned issues', 
      error: error.message 
    });
  }
});

router.patch('/issues/:id/status', verifyToken, verifyStaff, async (req, res) => {
  try {
    const id = req.params.id;
    const { status, message } = req.body;
    const staffEmail = req.user.email;
    
    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    
    if (!issue) {
      return res.status(404).send({ 
        success: false,
        message: 'Issue not found' 
      });
    }
    
    if (issue.assignedStaff?.email !== staffEmail) {
      return res.status(403).send({ 
        success: false,
        message: 'You can only update issues assigned to you' 
      });
    }
    
    const validTransitions = {
      'pending': ['in-progress'],
      'in-progress': ['working', 'resolved'],
      'working': ['resolved'],
      'resolved': ['closed']
    };
    
    if (!validTransitions[issue.status]?.includes(status)) {
      return res.status(400).send({ 
        success: false,
        message: `Cannot change status from ${issue.status} to ${status}` 
      });
    }
    
    const timelineEntry = {
      status,
      message: message || `Status changed to ${status}`,
      updatedBy: staffEmail,
      updatedByRole: 'staff',
      date: new Date()
    };
    
    const result = await issuesCollection.updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          status,
          updatedAt: new Date() 
        },
        $push: { timeline: timelineEntry }
      }
    );
    
    if (status === 'resolved') {
      await usersCollection.updateOne(
        { email: staffEmail },
        { $inc: { resolvedIssuesCount: 1 } }
      );
    }
    
    res.send({ 
      success: true,
      message: 'Issue status updated successfully', 
      data: result 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error updating issue status', 
      error: error.message 
    });
  }
});

router.get('/:email/stats', verifyToken, verifyStaff, async (req, res) => {
  try {
    const email = req.params.email;
    
    if (email !== req.user.email) {
      return res.status(403).send({ 
        success: false,
        message: 'Forbidden access' 
      });
    }
    
    const staff = await usersCollection.findOne({ email, role: 'staff' });
    
    if (!staff) {
      return res.status(404).send({ 
        success: false,
        message: 'Staff member not found' 
      });
    }
    
    const assignedIssues = await issuesCollection.countDocuments({ 
      'assignedStaff.email': email 
    });
    
    const resolvedIssues = await issuesCollection.countDocuments({ 
      'assignedStaff.email': email,
      status: 'resolved'
    });
    
    const pendingIssues = await issuesCollection.countDocuments({ 
      'assignedStaff.email': email,
      status: 'pending'
    });
    
    const inProgressIssues = await issuesCollection.countDocuments({ 
      'assignedStaff.email': email,
      status: { $in: ['in-progress', 'working'] }
    });
    
    res.send({ 
      success: true,
      data: {
        assignedIssues,
        resolvedIssues,
        pendingIssues,
        inProgressIssues
      }
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error fetching staff stats', 
      error: error.message 
    });
  }
});

export default router;