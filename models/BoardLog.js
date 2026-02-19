import mongoose from "mongoose";

const BoardLogSchema = new mongoose.Schema(
  {
    
    userEmail: {
      type: String,
      required: true,
      index: true
    },
    
    // Action details
    action: {
      type: String,
      required: true,
      enum: [
        // Board operations
        'create_board', 'view_board', 'update_board', 'soft_delete_board', 
        'permanent_delete_board', 'restore_board', 'duplicate_board',
        'view_boards', 'view_board_failed', 'cleanup_boards',
        
        // List operations
        'create_list', 'update_list', 'delete_list', 'archive_list_cards',
        
        // Card operations
        'create_card', 'update_card', 'delete_card', 'move_card',
        
        // Member operations
        'update_members', 'invite_member', 'remove_member',
        
        // Comment operations
        'add_comment', 'update_comment', 'delete_comment',
        
        // Attachment operations
        'add_attachment', 'delete_attachment',
        
        // Label operations
        'add_label', 'remove_label',
        
        // Search & export
        'search_board', 'export_board', 'view_board_stats',
        
        // Notification operations
        'send_assignment_notification', 'notification_send_failed',
        
        // Error actions
        'create_board_error', 'view_board_error', 'update_board_error',
        'create_list_error', 'update_list_error', 'delete_list_error',
        'create_card_error', 'update_card_error', 'delete_card_error',
        'move_card_error', 'update_members_error', 'add_comment_error',
        'add_attachment_error', 'delete_attachment_error',
        'add_label_error', 'remove_label_error', 'update_comment_error',
        'delete_comment_error', 'archive_list_cards_error',
        'search_board_error', 'export_board_error', 'view_board_stats_error',
        'duplicate_board_error'
      ],
      index: true
    },
    
    description: {
      type: String,
      required: true
    },
    
    // Board reference
    boardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Board',
      index: true
    },
    
    // List and card references (for granular tracking)
    listId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true
    },
    
    cardId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true
    },
    
    // Rich metadata for detailed analytics
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    
    // IP and user agent for security tracking
    ipAddress: {
      type: String,
      index: true
    },
    
    userAgent: {
      type: String
    },
    
    // Resource type (board, list, card, etc.)
    resource: {
      type: String,
      default: 'board',
      enum: ['board', 'list', 'card', 'comment', 'attachment', 'label', 'member']
    },
    
    // Severity level for filtering
    severity: {
      type: String,
      enum: ['info', 'warning', 'error', 'critical'],
      default: 'info'
    },
    
    // Session information
    sessionId: {
      type: String,
      index: true
    },
    
    // Timestamps
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Compound indexes for efficient queries
BoardLogSchema.index({ boardId: 1, timestamp: -1 });
BoardLogSchema.index({ userEmail: 1, timestamp: -1 });
BoardLogSchema.index({ action: 1, timestamp: -1 });
BoardLogSchema.index({ severity: 1, timestamp: -1 });
BoardLogSchema.index({ resource: 1, timestamp: -1 });
BoardLogSchema.index({ userId: 1, action: 1 });
BoardLogSchema.index({ boardId: 1, userEmail: 1 });

// Virtual for formatted date
BoardLogSchema.virtual('formattedDate').get(function() {
  return this.timestamp.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
});

// Virtual for time ago
BoardLogSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diffMs = now - this.timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffDay > 0) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  if (diffHour > 0) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
  if (diffMin > 0) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
  return 'Just now';
});

// Static methods for analytics
BoardLogSchema.statics.getBoardActivitySummary = async function(boardId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const [summary] = await this.aggregate([
    {
      $match: {
        boardId: new mongoose.Types.ObjectId(boardId),
        timestamp: { $gte: startDate }
      }
    },
    {
      $facet: {
        // Total activities
        totalActivities: [{ $count: "count" }],
        
        // Activities by type
        activitiesByType: [
          {
            $group: {
              _id: "$action",
              count: { $sum: 1 },
              lastActivity: { $max: "$timestamp" }
            }
          },
          { $sort: { count: -1 } }
        ],
        
        // Activities by user
        activitiesByUser: [
          {
            $group: {
              _id: "$userEmail",
              count: { $sum: 1 },
              lastActivity: { $max: "$timestamp" },
              actions: { $push: { action: "$action", timestamp: "$timestamp" } }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ],
        
        // Daily activity
        dailyActivity: [
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$timestamp" }
              },
              count: { $sum: 1 },
              users: { $addToSet: "$userEmail" }
            }
          },
          { $sort: { _id: 1 } }
        ],
        
        // Error count
        errors: [
          { $match: { severity: "error" } },
          { $count: "count" }
        ]
      }
    }
  ]);
  
  return summary;
};

// Get user's activity on a board
BoardLogSchema.statics.getUserBoardActivity = async function(userEmail, boardId, limit = 50) {
  return await this.find({
    userEmail,
    boardId: new mongoose.Types.ObjectId(boardId)
  })
  .sort({ timestamp: -1 })
  .limit(limit)
  .lean();
};

// Get recent board activities
BoardLogSchema.statics.getRecentBoardActivities = async function(boardId, limit = 20) {
  return await this.find({
    boardId: new mongoose.Types.ObjectId(boardId),
    severity: { $ne: 'error' } // Exclude errors from recent activities
  })
  .sort({ timestamp: -1 })
  .limit(limit)
  .select('action description userEmail timestamp metadata severity')
  .lean();
};

// Get error logs for a board
BoardLogSchema.statics.getBoardErrors = async function(boardId, days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return await this.find({
    boardId: new mongoose.Types.ObjectId(boardId),
    severity: { $in: ['error', 'critical'] },
    timestamp: { $gte: startDate }
  })
  .sort({ timestamp: -1 })
  .lean();
};

// Get most active users on a board
BoardLogSchema.statics.getTopBoardUsers = async function(boardId, limit = 10) {
  const results = await this.aggregate([
    {
      $match: {
        boardId: new mongoose.Types.ObjectId(boardId)
      }
    },
    {
      $group: {
        _id: "$userEmail",
        activityCount: { $sum: 1 },
        lastActivity: { $max: "$timestamp" },
        actions: { $push: "$action" }
      }
    },
    {
      $project: {
        userEmail: "$_id",
        activityCount: 1,
        lastActivity: 1,
        uniqueActions: { $size: { $setUnion: ["$actions", []] } }
      }
    },
    { $sort: { activityCount: -1 } },
    { $limit: limit }
  ]);
  
  return results;
};

// Cleanup old logs (keep logs for 90 days by default)
BoardLogSchema.statics.cleanupOldLogs = async function(daysToKeep = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  const result = await this.deleteMany({
    timestamp: { $lt: cutoffDate },
    severity: { $ne: 'critical' } // Keep critical logs longer
  });
  
  return result;
};

// Export board activity logs
BoardLogSchema.statics.exportBoardLogs = async function(boardId, format = 'json') {
  const logs = await this.find({
    boardId: new mongoose.Types.ObjectId(boardId)
  })
  .sort({ timestamp: -1 })
  .lean();
  
  if (format === 'csv') {
    // Generate CSV
    const headers = ['Timestamp', 'Action', 'Description', 'User Email', 'Severity', 'IP Address', 'Resource', 'Metadata'];
    const rows = logs.map(log => [
      new Date(log.timestamp).toISOString(),
      log.action,
      log.description,
      log.userEmail,
      log.severity,
      log.ipAddress || '',
      log.resource,
      JSON.stringify(log.metadata || {})
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    
    return csvContent;
  }
  
  return logs;
};

// Create model
const BoardLog = mongoose.model('BoardLog', BoardLogSchema);

export default BoardLog;