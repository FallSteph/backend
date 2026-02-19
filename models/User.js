// models/User.js - WITH ADMIN ACCOUNT LOCKING
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  // Basic Info
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  
  // Authentication
  password: {
    type: String,
    required: function() { return this.authProvider === 'local'; }
  },
  authProvider: {
    type: String,
    enum: ['local', 'google', 'facebook'],
    default: 'local'
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'moderator'],
    default: 'user'
  },
  avatar: {
    type: String,
    default: ''
  },
  
  // Activity Tracking
  lastLogin: {
    type: Date,
    default: null
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  loginCount: {
    type: Number,
    default: 0
  },
  signupDate: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
   notificationSettings: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    projectUpdates: {
      type: Boolean,
      default: true
    },
    updatedAt: {
      type: Date,
      default: null
    }
  },

  // Password Reset
  resetCode: {
    type: String,
    default: null
  },
  resetCodeVerified: {
    type: Boolean,
    default: false
  },
  resetCodeExpires: {
    type: Date,
    default: null
  },
  
  // Session Management
  refreshToken: {
    type: String,
    default: null
  },
  devices: [{
    deviceId: String,
    userAgent: String,
    ipAddress: String,
    lastUsed: Date,
    isBlocked: { type: Boolean, default: false }
  }],
  
  // Security - Auto Lock (failed login attempts)
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  accountLockedUntil: {
    type: Date,
    default: null
  },
  
  // ✅ NEW: Admin Account Locking Feature
  lockedByAdmin: {
    type: Boolean,
    default: false
  },
  lockedByAdminAt: {
    type: Date,
    default: null
  },
  lockedByAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  lockedByAdminName: {
    type: String,
    default: null
  },
  lockReason: {
    type: String,
    default: null
  },
  lockExpiresAt: {
    type: Date,
    default: null  // null = permanent lock until manually unlocked
  },
  lockHistory: [{
    action: {
      type: String,
      enum: ['locked', 'unlocked']
    },
    adminId: mongoose.Schema.Types.ObjectId,
    adminName: String,
    reason: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    expiresAt: Date
  }],
  
  // Two Factor Auth
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Indexes
userSchema.index({ role: 1 });
userSchema.index({ lastActive: -1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'devices.lastUsed': -1 });
userSchema.index({ lockedByAdmin: 1 }); // ✅ NEW: Index for locked accounts

// ✅ Methods that DON'T save - they just update the document
userSchema.methods.updateLastActive = function() {
  this.lastActive = new Date();
  return this;
};

userSchema.methods.incrementLoginCount = function() {
  this.loginCount += 1;
  this.lastLogin = new Date();
  this.lastActive = new Date();
  return this;
};

userSchema.methods.addDevice = function(deviceInfo) {
  const existingDevice = this.devices.find(d => d.deviceId === deviceInfo.deviceId);
  
  if (existingDevice) {
    existingDevice.lastUsed = new Date();
    existingDevice.userAgent = deviceInfo.userAgent;
    existingDevice.ipAddress = deviceInfo.ipAddress;
  } else {
    this.devices.push({
      deviceId: deviceInfo.deviceId,
      userAgent: deviceInfo.userAgent,
      ipAddress: deviceInfo.ipAddress,
      lastUsed: new Date(),
      isBlocked: false
    });
  }
  
  return this;
};

// ✅ NEW: Check if account is locked by admin
userSchema.methods.isLockedByAdmin = function() {
  if (!this.lockedByAdmin) return false;
  
  // Check if lock has expired
  if (this.lockExpiresAt && this.lockExpiresAt < new Date()) {
    return false; // Lock expired
  }
  
  return true;
};

// ✅ NEW: Lock account by admin
// In models/User.js, update the lockAccount method:

userSchema.methods.lockAccount = function(adminId, adminName, reason, duration = null) {
  this.lockedByAdmin = true;
  this.lockedByAdminAt = new Date();
  this.lockedByAdminId = adminId;
  this.lockedByAdminName = adminName;
  this.lockReason = reason;
  
  // Handle duration (duration is in minutes, null for permanent)
  if (duration) {
    this.lockExpiresAt = new Date(Date.now() + duration * 60 * 1000);
  } else {
    this.lockExpiresAt = null; // Permanent lock
  }
  
  this.isActive = false;
  
  // Add to lock history
  this.lockHistory.push({
    action: 'locked',
    adminId,
    adminName,
    reason,
    timestamp: new Date(),
    expiresAt: this.lockExpiresAt
  });
  
  return this;
};

// ✅ NEW: Unlock account by admin
userSchema.methods.unlockAccount = function(adminId, adminName, reason = 'Account unlocked by admin') {
  this.lockedByAdmin = false;
  this.lockedByAdminAt = null;
  this.lockedByAdminId = null;
  this.lockedByAdminName = null;
  this.lockReason = null;
  this.lockExpiresAt = null;
  this.isActive = true;
  this.failedLoginAttempts = 0;
  this.accountLockedUntil = null;
  
  // Add to lock history
  this.lockHistory.push({
    action: 'unlocked',
    adminId,
    adminName,
    reason,
    timestamp: new Date()
  });
  
  return this;
};

// Helper method to safely save with conflict prevention
userSchema.methods.safeSave = async function() {
  try {
    const update = {};
    const modifiedPaths = this.modifiedPaths();
    
    modifiedPaths.forEach(path => {
      if (path.includes('.')) {
        const [parent, child] = path.split('.');
        if (!update[parent]) update[parent] = {};
        update[parent][child] = this[parent][child];
      } else {
        update[path] = this[path];
      }
    });
    
    if (Object.keys(update).length === 0) {
      return this;
    }
    
    const updated = await User.findByIdAndUpdate(
      this._id,
      { $set: update },
      { new: true, runValidators: true }
    );
    
    Object.assign(this, updated.toObject());
    return this;
  } catch (error) {
    console.error('Safe save error:', error);
    throw error;
  }
};

// ✅ NEW: Method to update notification settings
userSchema.methods.updateNotificationSettings = function(emailNotifications, projectUpdates) {
  this.notificationSettings = {
    emailNotifications: emailNotifications !== undefined ? emailNotifications : true,
    projectUpdates: projectUpdates !== undefined ? projectUpdates : true,
    updatedAt: new Date()
  };
  return this;
};

// ✅ NEW: Method to get notification settings
userSchema.methods.getNotificationSettings = function() {
  return {
    emailNotifications: this.notificationSettings?.emailNotifications ?? true,
    projectUpdates: this.notificationSettings?.projectUpdates ?? true,
    updatedAt: this.notificationSettings?.updatedAt,
    userEmail: this.email
  };
};

const User = mongoose.model('User', userSchema);
export default User;