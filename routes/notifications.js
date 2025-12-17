import express from 'express';
import { ObjectId } from 'mongodb';
import { notificationsCollection, usersCollection } from '../config/db.js';
import { verifyToken } from '../middleware/verifyToken.js';

const router = express.Router();

// Get all notifications for a user
router.get('/:email', verifyToken, async (req, res) => {
  try {
    const { email } = req.params;
    
    // Verify user can only access their own notifications
    if (req.user.email !== email) {
      return res.status(403).send({
        success: false,
        message: 'Forbidden: You can only access your own notifications'
      });
    }

    const notifications = await notificationsCollection
      .find({ userEmail: email })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    res.send({
      success: true,
      data: notifications
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).send({
      success: false,
      message: 'Error fetching notifications',
      error: error.message
    });
  }
});

// Mark notification as read
router.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await notificationsCollection.findOne({ _id: new ObjectId(id) });
    
    if (!notification) {
      return res.status(404).send({
        success: false,
        message: 'Notification not found'
      });
    }

    // Verify user owns this notification
    if (notification.userEmail !== req.user.email) {
      return res.status(403).send({
        success: false,
        message: 'Forbidden: You can only update your own notifications'
      });
    }

    await notificationsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { read: true, readAt: new Date() } }
    );

    res.send({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).send({
      success: false,
      message: 'Error marking notification as read',
      error: error.message
    });
  }
});

// Mark all notifications as read
router.patch('/read-all/:email', verifyToken, async (req, res) => {
  try {
    const { email } = req.params;
    
    // Verify user can only update their own notifications
    if (req.user.email !== email) {
      return res.status(403).send({
        success: false,
        message: 'Forbidden: You can only update your own notifications'
      });
    }

    await notificationsCollection.updateMany(
      { userEmail: email, read: false },
      { $set: { read: true, readAt: new Date() } }
    );

    res.send({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).send({
      success: false,
      message: 'Error marking all notifications as read',
      error: error.message
    });
  }
});

// Delete notification
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await notificationsCollection.findOne({ _id: new ObjectId(id) });
    
    if (!notification) {
      return res.status(404).send({
        success: false,
        message: 'Notification not found'
      });
    }

    // Verify user owns this notification
    if (notification.userEmail !== req.user.email) {
      return res.status(403).send({
        success: false,
        message: 'Forbidden: You can only delete your own notifications'
      });
    }

    await notificationsCollection.deleteOne({ _id: new ObjectId(id) });

    res.send({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).send({
      success: false,
      message: 'Error deleting notification',
      error: error.message
    });
  }
});

// Create notification (used by other routes)
export const createNotification = async (userEmail, { title, message, type = 'info', link = null }) => {
  try {
    const notification = {
      userEmail,
      title,
      message,
      type, // 'info', 'success', 'error'
      link,
      read: false,
      createdAt: new Date(),
      readAt: null
    };

    const result = await notificationsCollection.insertOne(notification);
    return result.insertedId;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

export default router;

