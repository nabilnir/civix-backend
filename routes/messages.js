import express from 'express';
import { ObjectId } from 'mongodb';
import { messagesCollection, usersCollection } from '../config/db.js';
import { verifyToken } from '../middleware/verifyToken.js';

const router = express.Router();

// Get all messages for a user
router.get('/:email', verifyToken, async (req, res) => {
  try {
    const { email } = req.params;
    
    // Verify user can only access their own messages
    if (req.user.email !== email) {
      return res.status(403).send({
        success: false,
        message: 'Forbidden: You can only access your own messages'
      });
    }

    const messages = await messagesCollection
      .find({ recipientEmail: email })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    res.send({
      success: true,
      data: messages
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).send({
      success: false,
      message: 'Error fetching messages',
      error: error.message
    });
  }
});

// Get a single message by ID
router.get('/detail/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const message = await messagesCollection.findOne({ _id: new ObjectId(id) });
    
    if (!message) {
      return res.status(404).send({
        success: false,
        message: 'Message not found'
      });
    }

    // Verify user owns this message
    if (message.recipientEmail !== req.user.email && message.senderEmail !== req.user.email) {
      return res.status(403).send({
        success: false,
        message: 'Forbidden: You can only access your own messages'
      });
    }

    res.send({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).send({
      success: false,
      message: 'Error fetching message',
      error: error.message
    });
  }
});

// Mark message as read
router.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const message = await messagesCollection.findOne({ _id: new ObjectId(id) });
    
    if (!message) {
      return res.status(404).send({
        success: false,
        message: 'Message not found'
      });
    }

    // Verify user owns this message
    if (message.recipientEmail !== req.user.email) {
      return res.status(403).send({
        success: false,
        message: 'Forbidden: You can only update your own messages'
      });
    }

    await messagesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { read: true, readAt: new Date() } }
    );

    res.send({
      success: true,
      message: 'Message marked as read'
    });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).send({
      success: false,
      message: 'Error marking message as read',
      error: error.message
    });
  }
});

// Send a reply to a message
router.post('/:id/reply', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;
    
    if (!reply || !reply.trim()) {
      return res.status(400).send({
        success: false,
        message: 'Reply message is required'
      });
    }

    const originalMessage = await messagesCollection.findOne({ _id: new ObjectId(id) });
    
    if (!originalMessage) {
      return res.status(404).send({
        success: false,
        message: 'Message not found'
      });
    }

    // Verify user is the recipient
    if (originalMessage.recipientEmail !== req.user.email) {
      return res.status(403).send({
        success: false,
        message: 'Forbidden: You can only reply to messages sent to you'
      });
    }

    // Get sender info
    const sender = await usersCollection.findOne({ email: req.user.email });
    
    // Add reply to the message
    const replyData = {
      message: reply.trim(),
      senderName: sender?.name || sender?.displayName || 'User',
      senderEmail: req.user.email,
      createdAt: new Date()
    };

    await messagesCollection.updateOne(
      { _id: new ObjectId(id) },
      { 
        $push: { replies: replyData },
        $set: { updatedAt: new Date() }
      }
    );

    res.send({
      success: true,
      message: 'Reply sent successfully',
      data: replyData
    });
  } catch (error) {
    console.error('Error sending reply:', error);
    res.status(500).send({
      success: false,
      message: 'Error sending reply',
      error: error.message
    });
  }
});

// Delete message
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const message = await messagesCollection.findOne({ _id: new ObjectId(id) });
    
    if (!message) {
      return res.status(404).send({
        success: false,
        message: 'Message not found'
      });
    }

    // Verify user owns this message (recipient can delete)
    if (message.recipientEmail !== req.user.email) {
      return res.status(403).send({
        success: false,
        message: 'Forbidden: You can only delete messages sent to you'
      });
    }

    await messagesCollection.deleteOne({ _id: new ObjectId(id) });

    res.send({
      success: true,
      message: 'Message deleted'
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).send({
      success: false,
      message: 'Error deleting message',
      error: error.message
    });
  }
});

// Create message (used by other routes - admin/staff can send messages)
export const createMessage = async (recipientEmail, { subject, message, senderEmail, senderName }) => {
  try {
    const messageData = {
      recipientEmail,
      senderEmail: senderEmail || 'system',
      senderName: senderName || 'System',
      subject: subject || 'New Message',
      message,
      read: false,
      replies: [],
      createdAt: new Date(),
      readAt: null,
      updatedAt: new Date()
    };

    const result = await messagesCollection.insertOne(messageData);
    return result.insertedId;
  } catch (error) {
    console.error('Error creating message:', error);
    return null;
  }
};

export default router;

