import { usersCollection } from '../config/db.js';

export const verifyAdmin = async (req, res, next) => {
  const email = req.user.email;
  
  try {
    const user = await usersCollection.findOne({ email });
    
    if (!user) {
      return res.status(404).send({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    if (user.role !== 'admin') {
      return res.status(403).send({ 
        success: false,
        message: 'Forbidden: Admin access required' 
      });
    }
    
    next();
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error verifying admin role', 
      error: error.message 
    });
  }
};

export const verifyStaff = async (req, res, next) => {
  const email = req.user.email;
  
  try {
    const user = await usersCollection.findOne({ email });
    
    if (!user) {
      return res.status(404).send({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    if (user.role !== 'staff' && user.role !== 'admin') {
      return res.status(403).send({ 
        success: false,
        message: 'Forbidden: Staff access required' 
      });
    }
    
    next();
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error verifying staff role', 
      error: error.message 
    });
  }
};

export const verifyCitizen = async (req, res, next) => {
  const email = req.user.email;
  
  try {
    const user = await usersCollection.findOne({ email });
    
    if (!user) {
      return res.status(404).send({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    if (user.isBlocked) {
      return res.status(403).send({ 
        success: false,
        message: 'Your account has been blocked. Please contact authorities.' 
      });
    }
    
    next();
  } catch (error) {
    res.status(500).send({ 
      success: false,
      message: 'Error verifying citizen', 
      error: error.message 
    });
  }
};