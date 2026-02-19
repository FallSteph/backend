// models/AuthLog.js
import mongoose from 'mongoose';

const authLogSchema = new mongoose.Schema({
  // User Reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: false // Can be null for failed attempts before user exists
  },
  
  // Action Details
  action: {
    type: String,
    required: true,
    enum: [
      // Authentication Actions
      'signup_attempt',
      'signup_success',
      'signup_failed',
      'signup_error',
      
      'login_attempt',
      'login_success',
      'login_failed',
      'login_error',
      
      'google_login_attempt',
      'google_login_success',
      'google_login_failed',
      'google_login_error',
      
      'logout',
      
      // Password Actions
      'forgot_password_request',
      'forgot_password_error',
      'reset_code_verification',
      'reset_code_verified',
      'reset_code_failed',
      'reset_code_error',
      'password_reset',
      'password_reset_success',
      'password_reset_failed',
      'password_reset_error',
      
      // Token Actions
      'token_verification',
      'token_verified',
      'token_verification_failed',
      'token_verification_error',
      
      // Profile Actions
      'update_profile',
      'profile_updated',
      'profile_update_error',
      
      // View Actions
      'view_activity',
      
      // Security Actions
      'auth_provider_upgraded',
      'account_locked',
      'account_unlocked',
      'failed_attempt_limit_reached',
      
      // Admin Actions
      'admin_login',
      'admin_action'
    ],
    index: true
  },
  
  // Description
  description: {
    type: String,
    required: true
  },
  
  // Metadata for detailed tracking
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Request Information
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    default: ''
  },
  
  // Geolocation (if you want to add it)
  location: {
    country: String,
    region: String,
    city: String,
    latitude: Number,
    longitude: Number
  },
  
  // Device Information
  deviceInfo: {
    type: {
      browser: String,
      browserVersion: String,
      os: String,
      osVersion: String,
      deviceType: String,
      isMobile: Boolean,
      isTablet: Boolean,
      isDesktop: Boolean
    },
    default: {}
  },
  
  // Request Details
  requestMethod: {
    type: String,
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    default: 'POST'
  },
  endpoint: {
    type: String,
    default: ''
  },
  
  // Status
  status: {
    type: String,
    enum: ['success', 'failure', 'error', 'warning'],
    default: 'success'
  },
  
  // Response Information
  responseStatus: {
    type: Number,
    default: 200
  },
  
  // Timestamps
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Session Information
  sessionId: {
    type: String,
    default: null
  },
  
  // Performance Metrics
  responseTime: {
    type: Number, // in milliseconds
    default: 0
  }
}, {
  timestamps: true // createdAt and updatedAt
});

// Compound indexes for common queries
authLogSchema.index({ userId: 1, timestamp: -1 });
authLogSchema.index({ action: 1, timestamp: -1 });
authLogSchema.index({ ipAddress: 1, timestamp: -1 });
authLogSchema.index({ status: 1, timestamp: -1 });
authLogSchema.index({ 'metadata.email': 1 });

// Static method to get user's activity logs
authLogSchema.statics.findByUserId = function(userId, limit = 50, skip = 0) {
  return this.find({ userId })
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

// Static method to get failed attempts by IP
authLogSchema.statics.getFailedAttemptsByIp = function(ipAddress, timeWindowMinutes = 15) {
  const timeAgo = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
  return this.countDocuments({
    ipAddress,
    action: { $in: ['login_failed', 'signup_failed'] },
    timestamp: { $gte: timeAgo }
  });
};

// Static method to cleanup old logs (for cron job)
authLogSchema.statics.cleanupOldLogs = function(daysToKeep = 90) {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
  return this.deleteMany({ timestamp: { $lt: cutoffDate } });
};

// Virtual for formatted timestamp
authLogSchema.virtual('formattedTime').get(function() {
  return this.timestamp.toLocaleString();
});

const AuthLog = mongoose.model('AuthLog', authLogSchema);
export default AuthLog;