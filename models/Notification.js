import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userEmail: {
    type: String,
    required: true,
    index: true,
  },
  message: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['welcome', 'board_added', 'card_assigned', 'card_comment', 'new_signup', 'board_created'],
    required: true,
  },
  read: {
    type: Boolean,
    default: false,
    index: true,
  },
  boardId: {
    type: String,
  },
  boardTitle: {
    type: String,
  },
  addedBy: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24 * 30, // ← Simpler: 30 days TTL
  },
});

// Compound index: get newest notifications for a user, optionally unread
notificationSchema.index({ userEmail: 1, read: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;