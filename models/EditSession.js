import mongoose from 'mongoose';

const editSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  adminName: {
    type: String,
    required: true
  },
  lastActivity: {
    type: Date,
    default: Date.now,
    index: true
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'completed'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Index for faster queries
editSessionSchema.index({ userId: 1, status: 1 });

// Method to check if session is active
editSessionSchema.methods.isActive = function() {
  const now = new Date();
  const isNotExpired = this.expiresAt > now;
  const isRecent = now - this.lastActivity < 5 * 60 * 1000; // 5 minutes inactivity
  return isNotExpired && isRecent && this.status === 'active';
};

const EditSession = mongoose.model('EditSession', editSessionSchema);
export default EditSession;