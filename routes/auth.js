import express from 'express';
import jwt from 'jsonwebtoken';
import { usersCollection } from '../config/db.js';
import { verifyToken } from '../middleware/verifyToken.js';

const router = express.Router();


router.post('/jwt', async (req, res) => {
  try {
    const user = req.body;
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    res.send({ 
      success: true,
      token 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error generating token', 
      error: error.message 
    });
  }
});

// Register User
router.post('/register', async (req, res) => {
  try {
    const { name, email, photoURL, role = 'citizen' } = req.body;
    
    // Checking if user exists
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).send({ 
        success: false,
        message: 'User already exists' 
      });
    }
    
    const newUser = {
      name,
      email,
      photoURL: photoURL || 'https://i.ibb.co/2W8Py4W/default-avatar.png',
      role,
      isPremium: false,
      isBlocked: false,
      issueCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await usersCollection.insertOne(newUser);
    
    res.status(201).send({ 
      success: true,
      message: 'User registered successfully', 
      result 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Registration failed', 
      error: error.message 
    });
  }
});

// Get User Info by Email
router.get('/users/:email', verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    
    // Verify user is requesting their own data
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
    
    res.send({ 
      success: true,
      data: user 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error fetching user', 
      error: error.message 
    });
  }
});

// Update User Profile
router.patch('/users/:email', verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    const updates = req.body;
    
    
    if (email !== req.user.email) {
      return res.status(403).send({ 
        success: false,
        message: 'Forbidden access' 
      });
    }
    
   
    delete updates.role;
    delete updates.isPremium;
    delete updates.isBlocked;
    delete updates.email;
    
    updates.updatedAt = new Date();
    
    const result = await usersCollection.updateOne(
      { email },
      { $set: updates }
    );
    
    res.send({ 
      success: true,
      message: 'Profile updated successfully', 
      result 
    });
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error updating profile', 
      error: error.message 
    });
  }
});

export default router;