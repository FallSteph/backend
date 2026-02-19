// ES module syntax
import express from 'express';
import { createNotification, markAllNotificationsRead, markNotificationAsRead, deleteNotification, clearAllNotifications, getAllNotifications } from '../controllers/notificationController.js';

const router = express.Router();

// Create notification
router.post('/', createNotification);

// Mark all notifications as read for a user
router.patch('/mark-all-read/:userEmail', markAllNotificationsRead);

// Mark notification as read
router.patch('/:id/read', markNotificationAsRead);

// Delete notification
router.delete('/:id', deleteNotification);

// Clear all notifications for a user
router.delete('/clear/:userEmail', clearAllNotifications);

// Get all notifications for a user
router.get('/:userEmail', getAllNotifications);

export default router;
