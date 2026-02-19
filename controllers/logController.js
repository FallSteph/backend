// controllers/logController.js - FIXED VERSION
import AuthLog from '../models/AuthLog.js';
import BoardLog from '../models/BoardLog.js';
import * as UAParser from 'ua-parser-js';

/**
 * Parse user agent string to get device information
 */
const parseUserAgent = (userAgent) => {
  try {
    const parser = UAParser.default ? new UAParser.default() : new UAParser.UAParser();
    parser.setUA(userAgent || '');
    const result = parser.getResult();
    
    return {
      browser: result.browser.name || 'Unknown',
      browserVersion: result.browser.version || '',
      os: result.os.name || 'Unknown',
      osVersion: result.os.version || '',
      deviceType: result.device.type || 'desktop',
      isMobile: result.device.type === 'mobile',
      isTablet: result.device.type === 'tablet',
      isDesktop: result.device.type === undefined || result.device.type === 'desktop'
    };
  } catch (error) {
    console.error('Failed to parse user agent:', error);
    return {
      browser: 'Unknown',
      browserVersion: '',
      os: 'Unknown',
      osVersion: '',
      deviceType: 'desktop',
      isMobile: false,
      isTablet: false,
      isDesktop: true
    };
  }
};

/**
 * Extract IP address from request
 */
const getClientIp = (req) => {
  return req.ip || 
         req.headers['x-forwarded-for'] || 
         req.headers['x-real-ip'] || 
         req.connection.remoteAddress || 
         'unknown';
};

/**
 * Check if action is authentication-related
 */
const isAuthAction = (action) => {
  const authActions = [
    'signup_attempt', 'signup_success', 'signup_failed', 'signup_error',
    'login_attempt', 'login_success', 'login_failed', 'login_error',
    'google_login_attempt', 'google_login_success', 'google_login_failed', 'google_login_error',
    'logout', 'forgot_password_request', 'forgot_password_error', 'reset_code_verification',
    'reset_code_verified', 'reset_code_failed', 'reset_code_error', 'password_reset',
    'password_reset_success', 'password_reset_failed', 'password_reset_error',
    'token_verification', 'token_verified', 'token_verification_failed', 'token_verification_error',
    'update_profile', 'profile_updated', 'profile_update_error', 'view_activity',
    'auth_provider_upgraded', 'account_locked', 'account_unlocked', 'failed_attempt_limit_reached',
    'admin_login', 'admin_action'
  ];
  return authActions.includes(action);
};

/**
 * Check if it's a board-related action
 */
const isBoardAction = (action) => {
  const boardActions = [
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
  ];
  
  return boardActions.includes(action);
};

/**
 * Check if boardId is valid for BoardLog
 */
const isValidBoardIdForBoardLog = (boardId) => {
  if (!boardId) {
    return false;
  }
  
  // Check if it's 'multiple' or 'null' string
  if (typeof boardId === 'string' && (boardId.toLowerCase() === 'multiple' || boardId.toLowerCase() === 'null')) {
    return false;
  }
  
  // Check if it's a valid MongoDB ObjectId (24-character hex string)
  if (typeof boardId === 'string') {
    return /^[0-9a-fA-F]{24}$/.test(boardId);
  }
  
  // If it's already an ObjectId
  if (boardId && boardId._bsontype === 'ObjectId') {
    return true;
  }
  
  // Check if it's mongoose ObjectId
  if (boardId && typeof boardId === 'object' && boardId.toString && boardId.toString().length === 24) {
    return true;
  }
  
  return false;
};

/**
 * Transform action for AuthLog if needed (for board actions that fall back)
 */
const transformActionForAuthLog = (action) => {
  // If it's already an auth action, keep it as is
  if (isAuthAction(action)) {
    return action;
  }
  
  // Map board actions to generic auth log actions
  if (action.includes('_error') || action.includes('_failed')) {
    return 'board_action_error';
  }
  
  if (action.includes('_board')) {
    return 'board_action';
  }
  
  if (action.includes('_list')) {
    return 'list_action';
  }
  
  if (action.includes('_card')) {
    return 'card_action';
  }
  
  // Default generic action
  return 'general_action';
};

/**
 * Log an action (automatically chooses correct model)
 */
export const logAction = async ({ 
  userId, 
  userEmail,
  action, 
  description, 
  req, 
  metadata = {}, 
  status = 'success', 
  responseTime = 0 
}) => {
  try {
    console.log('📝 Logging action:', { 
      action, 
      userId, 
      userEmail: userEmail || metadata?.userEmail,
      boardId: metadata?.boardId 
    });
    
    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';
    const deviceInfo = parseUserAgent(userAgent);
    
    // Extract endpoint from request
    const endpoint = req.originalUrl || req.url || '';
    
    // Determine status based on action name
    let finalStatus = status;
    if (!status) {
      if (action.includes('_error')) finalStatus = 'error';
      else if (action.includes('_failed')) finalStatus = 'failure';
      else if (action.includes('_success')) finalStatus = 'success';
      else finalStatus = 'success';
    }
    
    // Get boardId from metadata
    const boardId = metadata?.boardId;
    
    // Determine which user email to use
    const effectiveUserEmail = userEmail || metadata?.userEmail || 'system';
    
    // Always try BoardLog first for board-related actions
    if (isBoardAction(action) || metadata?.resource === 'board') {
      console.log('📋 Attempting to log to BoardLog for action:', action);
      
      try {
        // Create BoardLog entry (even with null boardId)
        const boardLog = new BoardLog({
          userId,
          userEmail: effectiveUserEmail,
          action,
          description,
          boardId: isValidBoardIdForBoardLog(boardId) ? boardId : null,
          listId: metadata?.listId || null,
          cardId: metadata?.cardId || null,
          metadata: {
            ...metadata,
            originalUserId: userId,
            originalUserEmail: effectiveUserEmail,
            loggedAt: new Date().toISOString()
          },
          ipAddress,
          userAgent,
          resource: metadata?.resource || 'board',
          severity: finalStatus === 'error' ? 'error' : 'info',
          sessionId: req.sessionID || null,
          timestamp: new Date()
        });
        
        await boardLog.save();
        console.log('✅ Successfully logged to BoardLog:', { 
          id: boardLog._id, 
          action,
          userEmail: boardLog.userEmail 
        });
        return { model: 'BoardLog', id: boardLog._id };
        
      } catch (boardLogError) {
        console.warn('❌ Failed to save to BoardLog, falling back:', boardLogError.message);
        
        // Transform action for AuthLog
        const authLogAction = transformActionForAuthLog(action);
        
        try {
          // Fall back to AuthLog with transformed action
          const authLog = new AuthLog({
            userId,
            action: authLogAction,
            description: `[Board Action] ${action}: ${description}`,
            metadata: {
              ...metadata,
              originalAction: action,
              boardId: boardId,
              userEmail: effectiveUserEmail,
              loggedVia: 'AuthLog_fallback',
              boardLogError: boardLogError.message
            },
            ipAddress,
            userAgent,
            deviceInfo,
            requestMethod: req.method,
            endpoint,
            status: finalStatus,
            responseTime,
            sessionId: req.sessionID || null,
            timestamp: new Date()
          });
          
          await authLog.save();
          console.log('✅ Fallback logged to AuthLog:', { 
            id: authLog._id, 
            action: authLogAction,
            originalAction: action 
          });
          return { model: 'AuthLog', id: authLog._id };
          
        } catch (authLogError) {
          console.error('❌ Failed to save to AuthLog fallback:', authLogError.message);
          throw authLogError;
        }
      }
    }
    
    // Authentication actions go to AuthLog
    if (isAuthAction(action)) {
      console.log('🔐 Logging auth action to AuthLog:', action);
      
      try {
        const authLog = new AuthLog({
          userId,
          action,
          description,
          metadata: {
            ...metadata,
            userEmail: effectiveUserEmail
          },
          ipAddress,
          userAgent,
          deviceInfo,
          requestMethod: req.method,
          endpoint,
          status: finalStatus,
          responseTime,
          sessionId: req.sessionID || null,
          timestamp: new Date()
        });
        
        await authLog.save();
        console.log('✅ Successfully logged to AuthLog:', { id: authLog._id, action });
        return { model: 'AuthLog', id: authLog._id };
        
      } catch (authLogError) {
        console.error('❌ Failed to save to AuthLog:', authLogError.message);
        throw authLogError;
      }
    }
    
    // Default: use BoardLog for everything else (with generic category)
    console.log('📝 Default logging to BoardLog for action:', action);
    
    try {
      const boardLog = new BoardLog({
        userId,
        userEmail: effectiveUserEmail,
        action: action.includes('_error') ? 'general_error' : 'general_action',
        description: `[General] ${description}`,
        boardId: null,
        metadata: {
          ...metadata,
          originalAction: action,
          userEmail: effectiveUserEmail,
          category: 'general'
        },
        ipAddress,
        userAgent,
        resource: 'general',
        severity: finalStatus === 'error' ? 'error' : 'info',
        sessionId: req.sessionID || null,
        timestamp: new Date()
      });
      
      await boardLog.save();
      console.log('✅ Successfully logged to BoardLog (general):', { id: boardLog._id, action });
      return { model: 'BoardLog', id: boardLog._id };
      
    } catch (error) {
      console.error('❌ Failed to save to BoardLog (general):', error.message);
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Failed to log action:', error);
    // Log to console as last resort
    console.error('Last resort log info:', {
      action,
      userEmail: userEmail || metadata?.userEmail,
      description,
      error: error.message
    });
    return null;
  }
};

/**
 * Get user activity logs (combined from both AuthLog and BoardLog)
 */
export const getUserActivity = async (userId, options = {}) => {
  try {
    const {
      limit = 50,
      skip = 0,
      startDate,
      endDate,
      actions = [],
      status,
      includeBoardLogs = true
    } = options;
    
    // Build base query for AuthLog
    const authLogQuery = { userId };
    
    // Date range filter
    if (startDate || endDate) {
      authLogQuery.timestamp = {};
      if (startDate) authLogQuery.timestamp.$gte = new Date(startDate);
      if (endDate) authLogQuery.timestamp.$lte = new Date(endDate);
    }
    
    // Action filter
    if (actions.length > 0) {
      authLogQuery.action = { $in: actions };
    }
    
    // Status filter
    if (status) {
      authLogQuery.status = status;
    }
    
    // Get AuthLog entries
    const authLogs = await AuthLog.find(authLogQuery)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    // Format AuthLog results
    const formattedAuthLogs = authLogs.map(log => ({
      ...log,
      model: 'AuthLog'
    }));
    
    let combinedLogs = formattedAuthLogs;
    let total = await AuthLog.countDocuments(authLogQuery);
    
    // If requested, also get BoardLog entries
    if (includeBoardLogs) {
      // Build query for BoardLog
      const boardLogQuery = { userId };
      
      // Date range filter
      if (startDate || endDate) {
        boardLogQuery.timestamp = {};
        if (startDate) boardLogQuery.timestamp.$gte = new Date(startDate);
        if (endDate) boardLogQuery.timestamp.$lte = new Date(endDate);
      }
      
      // Action filter
      if (actions.length > 0) {
        boardLogQuery.action = { $in: actions };
      }
      
      // Get BoardLog entries
      const boardLogs = await BoardLog.find(boardLogQuery)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      
      // Format BoardLog results
      const formattedBoardLogs = boardLogs.map(log => ({
        ...log,
        model: 'BoardLog'
      }));
      
      // Combine and sort by timestamp
      combinedLogs = [...formattedAuthLogs, ...formattedBoardLogs]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
      
      // Get total count from both collections
      const boardLogCount = await BoardLog.countDocuments(boardLogQuery);
      total += boardLogCount;
    }
    
    return {
      logs: combinedLogs,
      pagination: {
        total,
        limit,
        skip,
        hasMore: total > skip + limit
      }
    };
  } catch (error) {
    console.error('Failed to get user activity:', error);
    throw error;
  }
};

/**
 * Get board activity logs
 */
export const getBoardActivity = async (boardId, options = {}) => {
  try {
    const {
      limit = 50,
      skip = 0,
      startDate,
      endDate,
      actions = [],
      severity
    } = options;
    
    const query = { boardId };
    
    // Date range filter
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    
    // Action filter
    if (actions.length > 0) {
      query.action = { $in: actions };
    }
    
    // Severity filter
    if (severity) {
      query.severity = severity;
    }
    
    const logs = await BoardLog.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    const total = await BoardLog.countDocuments(query);
    
    return {
      logs,
      pagination: {
        total,
        limit,
        skip,
        hasMore: total > skip + limit
      }
    };
  } catch (error) {
    console.error('Failed to get board activity:', error);
    throw error;
  }
};

/**
 * Get failed login attempts for security monitoring
 */
export const getFailedAttempts = async (timeWindowMinutes = 15, limit = 100) => {
  try {
    const timeAgo = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
    
    const failedAttempts = await AuthLog.find({
      action: { $in: ['login_failed', 'signup_failed'] },
      timestamp: { $gte: timeAgo }
    })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
    
    return failedAttempts;
  } catch (error) {
    console.error('Failed to get failed attempts:', error);
    throw error;
  }
};

/**
 * Get logs by user email (across both collections)
 */
export const getLogsByUserEmail = async (userEmail, options = {}) => {
  try {
    const {
      limit = 50,
      skip = 0,
      startDate,
      endDate
    } = options;
    
    // Get from BoardLog
    const boardLogQuery = { userEmail };
    if (startDate || endDate) {
      boardLogQuery.timestamp = {};
      if (startDate) boardLogQuery.timestamp.$gte = new Date(startDate);
      if (endDate) boardLogQuery.timestamp.$lte = new Date(endDate);
    }
    
    const boardLogs = await BoardLog.find(boardLogQuery)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    // Get from AuthLog (via metadata or user lookup)
    const authLogQuery = {
      $or: [
        { 'metadata.userEmail': userEmail },
        { userId: { $exists: true } } // We'll filter this in code
      ]
    };
    
    if (startDate || endDate) {
      authLogQuery.timestamp = {};
      if (startDate) authLogQuery.timestamp.$gte = new Date(startDate);
      if (endDate) authLogQuery.timestamp.$lte = new Date(endDate);
    }
    
    const authLogs = await AuthLog.find(authLogQuery)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    // Filter AuthLogs by userId lookup if needed
    const filteredAuthLogs = authLogs.filter(log => 
      log.metadata?.userEmail === userEmail
    );
    
    // Combine results
    const formattedBoardLogs = boardLogs.map(log => ({ ...log, model: 'BoardLog' }));
    const formattedAuthLogs = filteredAuthLogs.map(log => ({ ...log, model: 'AuthLog' }));
    
    const combinedLogs = [...formattedBoardLogs, ...formattedAuthLogs]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
    
    const boardLogCount = await BoardLog.countDocuments(boardLogQuery);
    const authLogCount = filteredAuthLogs.length; // Approximate
    
    return {
      logs: combinedLogs,
      pagination: {
        total: boardLogCount + authLogCount,
        limit,
        skip,
        hasMore: (boardLogCount + authLogCount) > skip + limit
      }
    };
  } catch (error) {
    console.error('Failed to get logs by user email:', error);
    throw error;
  }
};

// Get logs with filters
export const getLogsController = async (req, res) => {
  try {
    const { userId, action, startDate, endDate, page = 1, limit = 50 } = req.query;

    const filters = {};
    if (userId) filters.userId = userId;
    if (action) filters.action = action;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const result = await getLogs(filters, parseInt(page), parseInt(limit));

    res.json({
      success: true,
      data: result.logs,
      pagination: result.pagination
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Delete old logs (admin only)
export const deleteOldLogsController = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const result = await deleteOldLogs(parseInt(days));
    
    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} old logs`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
