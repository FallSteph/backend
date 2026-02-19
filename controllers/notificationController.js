import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import sendEmail from "../utils/sendEmail.js";

// Create notification
export const createNotification = async (req, res) => {
    try {
        const { userEmail, message, type, boardTitle, addedBy } = req.body;

        // ✅ 1️⃣ Save notification to DB
        const notification = new Notification({
            userEmail,
            message,
            type,
            read: false,
            boardTitle,
            addedBy,
            createdAt: new Date(),
        });

        await notification.save();

        // ✅ 2️⃣ Send email using your sendEmail util
        const subject = "New Notification from Nexora";
        const text = message;
        const html = `
            <h3>Hello!</h3>
            <p>${message}</p>
            ${boardTitle ? `<p><strong>Board:</strong> ${boardTitle}</p>` : ""}
            ${addedBy ? `<p><strong>From:</strong> ${addedBy}</p>` : ""}
            <p>Visit Nexora to view this notification.</p>
        `;

        try {
            await sendEmail(userEmail, subject, text, html);
            console.log(`✅ Email sent to ${userEmail}`);
        } catch (emailErr) {
            console.error(`❌ Failed to send email to ${userEmail}:`, emailErr.message);
        }

        // ✅ 3️⃣ Respond to frontend
        res.status(201).json(notification);
    } catch (error) {
        console.error("Error creating notification:", error);
        res.status(500).json({ message: "Failed to create notification" });
    }
};

// Mark all notifications as read for a user
export const markAllNotificationsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { userEmail: req.params.userEmail },
            { $set: { read: true } }
        );
        res.json({ message: 'All notifications marked as read' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Mark notification as read
export const markNotificationAsRead = async (req, res) => {
    try {
        const { id } = req.params;
    
        // Validate MongoDB ObjectId format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            console.error('❌ Invalid ObjectId format:', id);
            return res.status(400).json({ message: 'Invalid notification ID format' });
        }
    
        console.log('📝 Attempting to mark notification as read:', id);
    
        const notification = await Notification.findByIdAndUpdate(
            id,
            { $set: { read: true } },  // Use $set for explicit update
            { new: true }
        );
    
        if (!notification) {
            console.error('❌ Notification not found:', id);
            return res.status(404).json({ message: 'Notification not found' });
        }
    
        console.log('✅ Notification marked as read:', notification._id, 'read:', notification.read);
        res.json(notification);
    } catch (error) {
        console.error('❌ Error marking notification as read:', error);
        res.status(500).json({ message: 'Failed to update notification', error: error.message });
    }
};

// Delete notification
export const deleteNotification = async (req, res) => {
    try {
        const notification = await Notification.findByIdAndDelete(req.params.id);
    
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }
    
        res.json({ message: 'Notification deleted' });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({ message: 'Failed to delete notification' });
    }
};

// Clear all notifications for a user
export const clearAllNotifications = async (req, res) => {
    try {
        const { userEmail } = req.params;
        await Notification.deleteMany({ userEmail });
        res.json({ message: 'All notifications cleared' });
    } catch (error) {
        console.error('Error clearing notifications:', error);
        res.status(500).json({ message: 'Failed to clear notifications' });
    }
};

// Get all notifications for a user
export const getAllNotifications = async (req, res) => {
    try {
        const { userEmail } = req.params;
        const notifications = await Notification.find({ userEmail })
            .sort({ createdAt: -1 })
            .limit(100);
        
        res.json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Failed to fetch notifications' });
    }
};

export const getNotificationSettings = async (req, res) => {
  try {
    const userId = req.params.userId || req.user._id;
    
    const user = await User.findById(userId).select('notificationSettings email firstName lastName');
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }
    
    res.json({
      success: true,
      settings: user.getNotificationSettings(),
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      }
    });
    
  } catch (error) {
    console.error("❌ Error fetching notification settings:", error);
    res.status(500).json({ 
      success: false,
      message: "Error fetching notification settings",
      error: error.message 
    });
  }
};

// ============= UPDATE NOTIFICATION SETTINGS =============
export const updateNotificationSettings = async (req, res) => {
  try {
    const userId = req.params.userId || req.user._id;
    const { emailNotifications, projectUpdates } = req.body;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }
    
    // Update notification settings
    user.updateNotificationSettings(emailNotifications, projectUpdates);
    await user.save();
    
    res.json({
      success: true,
      message: "Notification settings updated successfully",
      settings: user.getNotificationSettings()
    });
    
  } catch (error) {
    console.error("❌ Error updating notification settings:", error);
    res.status(500).json({ 
      success: false,
      message: "Error updating notification settings",
      error: error.message 
    });
  }
};

// ============= RESET NOTIFICATION SETTINGS =============
export const resetNotificationSettings = async (req, res) => {
  try {
    const userId = req.params.userId || req.user._id;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }
    
    // Reset to defaults
    user.updateNotificationSettings(true, true);
    await user.save();
    
    res.json({
      success: true,
      message: "Notification settings reset to defaults",
      settings: user.getNotificationSettings()
    });
    
  } catch (error) {
    console.error("❌ Error resetting notification settings:", error);
    res.status(500).json({ 
      success: false,
      message: "Error resetting notification settings",
      error: error.message 
    });
  }
};
