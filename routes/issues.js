import express from 'express';
import { ObjectId } from 'mongodb';
import { issuesCollection, usersCollection } from '../config/db.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { verifyCitizen } from '../middleware/verifyRole.js';

const router = express.Router();


router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const search = req.query.search || '';
    const status = req.query.status || '';
    const priority = req.query.priority || '';
    const category = req.query.category || '';
    
    const query = {};
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (category) query.category = category;
    
    const issues = await issuesCollection
      .aggregate([
        { $match: query },
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
        { $skip: skip },
        { $limit: limit },
        { $project: { priorityOrder: 0 } }
      ])
      .toArray();
    
    const total = await issuesCollection.countDocuments(query);
    
    res.send({
      success: true,
      data: {
        issues,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalIssues: total
      }
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error fetching issues', 
      error: error.message 
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    
    if (!issue) {
      return res.status(404).send({ 
        success: false,
        message: 'Issue not found' 
      });
    }
    
    res.send({ 
      success: true,
      data: issue 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error fetching issue', 
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
    
    const issues = await issuesCollection
      .find({ userEmail: email })
      .sort({ createdAt: -1 })
      .toArray();
    
    res.send({ 
      success: true,
      data: issues 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error fetching user issues', 
      error: error.message 
    });
  }
});

router.post('/', verifyToken, verifyCitizen, async (req, res) => {
  try {
    const issueData = req.body;
    const userEmail = req.user.email;
    
    const user = await usersCollection.findOne({ email: userEmail });
    
    if (!user) {
      return res.status(404).send({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    if (user.isBlocked) {
      return res.status(403).send({ 
        success: false,
        message: 'Your account is blocked. Contact authorities.' 
      });
    }
    
    if (!user.isPremium && user.issueCount >= 3) {
      return res.status(403).send({ 
        success: false,
        message: 'Free users can only report 3 issues. Upgrade to premium for unlimited.',
        needsPremium: true
      });
    }
    
    const newIssue = {
      ...issueData,
      userEmail,
      userName: user.name,
      userPhoto: user.photoURL,
      status: 'pending',
      priority: 'normal',
      upvotes: 0,
      upvotedBy: [],
      assignedStaff: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      timeline: [
        {
          status: 'pending',
          message: `Issue reported by ${user.name}`,
          updatedBy: userEmail,
          updatedByRole: 'citizen',
          date: new Date()
        }
      ]
    };
    
    const result = await issuesCollection.insertOne(newIssue);
    
    await usersCollection.updateOne(
      { email: userEmail },
      { $inc: { issueCount: 1 } }
    );
    
    res.status(201).send({ 
      success: true,
      message: 'Issue created successfully', 
      data: result 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error creating issue', 
      error: error.message 
    });
  }
});

router.patch('/:id', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const updates = req.body;
    const userEmail = req.user.email;
    
    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    
    if (!issue) {
      return res.status(404).send({ 
        success: false,
        message: 'Issue not found' 
      });
    }
    
    if (issue.userEmail !== userEmail) {
      return res.status(403).send({ 
        success: false,
        message: 'You can only edit your own issues' 
      });
    }
    
    if (issue.status !== 'pending') {
      return res.status(400).send({ 
        success: false,
        message: 'Can only edit pending issues' 
      });
    }
    
    delete updates.userEmail;
    delete updates.status;
    delete updates.priority;
    delete updates.upvotes;
    delete updates.upvotedBy;
    delete updates.assignedStaff;
    
    updates.updatedAt = new Date();
    
    const result = await issuesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );
    
    res.send({ 
      success: true,
      message: 'Issue updated successfully', 
      data: result 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error updating issue', 
      error: error.message 
    });
  }
});

router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const userEmail = req.user.email;
    
    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    
    if (!issue) {
      return res.status(404).send({ 
        success: false,
        message: 'Issue not found' 
      });
    }
    
    if (issue.userEmail !== userEmail) {
      return res.status(403).send({ 
        success: false,
        message: 'You can only delete your own issues' 
      });
    }
    
    const result = await issuesCollection.deleteOne({ _id: new ObjectId(id) });
    
    await usersCollection.updateOne(
      { email: userEmail },
      { $inc: { issueCount: -1 } }
    );
    
    res.send({ 
      success: true,
      message: 'Issue deleted successfully', 
      data: result 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error deleting issue', 
      error: error.message 
    });
  }
});

router.post('/:id/upvote', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const userEmail = req.user.email;
    
    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    
    if (!issue) {
      return res.status(404).send({ 
        success: false,
        message: 'Issue not found' 
      });
    }
    
    if (issue.upvotedBy?.includes(userEmail)) {
      return res.status(400).send({ 
        success: false,
        message: 'You already upvoted this issue' 
      });
    }
    
    if (issue.userEmail === userEmail) {
      return res.status(403).send({ 
        success: false,
        message: 'You cannot upvote your own issue' 
      });
    }
    
    const result = await issuesCollection.updateOne(
      { _id: new ObjectId(id) },
      { 
        $inc: { upvotes: 1 },
        $push: { upvotedBy: userEmail }
      }
    );
    
    res.send({ 
      success: true,
      message: 'Upvoted successfully', 
      data: result 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error upvoting issue', 
      error: error.message 
    });
  }
});

router.get('/resolved/latest', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;
    
    const issues = await issuesCollection
      .find({ status: 'resolved' })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();
    
    res.send({ 
      success: true,
      data: issues 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error fetching resolved issues', 
      error: error.message 
    });
  }
});

export default router;