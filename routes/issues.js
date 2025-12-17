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
    
    const search = req.query.search || '';
    const status = req.query.status || '';
    const priority = req.query.priority || '';
    const category = req.query.category || '';
    
    const baseQuery = {};
    
    if (search) {
      baseQuery.$or = [
        { title: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) baseQuery.status = status;
    if (priority) baseQuery.priority = priority;
    if (category) baseQuery.category = category;
    
    // Step 1: Fetch ALL boosted issues (those with boostedAt field) that match filters
    const boostedQuery = { ...baseQuery, boostedAt: { $exists: true, $ne: null } };
    const boostedIssues = await issuesCollection
      .aggregate([
        { $match: boostedQuery },
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
        { $sort: { priorityOrder: -1, boostedAt: -1, createdAt: -1 } },
        { $project: { priorityOrder: 0 } }
      ])
      .toArray();
    
    // Step 2: Fetch regular (non-boosted) issues with pagination
    // Regular issues are those without boostedAt or with null boostedAt
    const regularQuery = {
      ...baseQuery,
      $or: [
        { boostedAt: { $exists: false } },
        { boostedAt: null }
      ]
    };
    
    const regularTotal = await issuesCollection.countDocuments(regularQuery);
    
    let regularIssues = [];
    let skip = 0;
    
    if (page === 1) {
      // On page 1, we need to account for boosted issues
      // Calculate how many regular issues we need after boosted issues
      const boostedCount = boostedIssues.length;
      const remainingSlots = Math.max(0, limit - boostedCount);
      
      if (remainingSlots > 0) {
        regularIssues = await issuesCollection
          .aggregate([
            { $match: regularQuery },
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
            { $limit: remainingSlots },
            { $project: { priorityOrder: 0 } }
          ])
          .toArray();
      }
    } else {
      // On subsequent pages, skip the regular issues that were shown on page 1
      const boostedCount = boostedIssues.length;
      // Page 1 showed: boostedCount + (limit - boostedCount) regular issues
      // So page 2+ should skip: (limit - boostedCount) + (page - 2) * limit
      skip = (limit - boostedCount) + (page - 2) * limit;
      
      regularIssues = await issuesCollection
        .aggregate([
          { $match: regularQuery },
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
    }
    
    // Step 3: Combine boosted and regular issues
    const allIssues = page === 1 
      ? [...boostedIssues, ...regularIssues]
      : regularIssues;
    
    // Calculate total pages: boosted issues always on page 1, then regular issues
    const totalIssues = boostedIssues.length + regularTotal;
    const totalPages = Math.ceil(totalIssues / limit);
    
    res.send({
      success: true,
      data: {
        issues: allIssues,
        currentPage: page,
        totalPages: totalPages,
        totalIssues: totalIssues,
        boostedCount: boostedIssues.length
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
    
    // Get user name for timeline entry
    const user = await usersCollection.findOne({ email: userEmail });
    const userName = user?.name || userEmail;
    
    // Create timeline entry for issue edit
    const timelineEntry = {
      status: issue.status, // Keep current status
      message: `Issue updated by ${userName}`,
      updatedBy: userEmail,
      updatedByRole: 'citizen',
      date: new Date()
    };
    
    const result = await issuesCollection.updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: updates,
        $push: { timeline: timelineEntry }
      }
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