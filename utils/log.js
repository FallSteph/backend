import { logAction } from "../controllers/logController.js";

// ---------------- LOG HELPER FUNCTION FOR AUTH----------------
export const logAuthAction = async ({ userId, userEmail, action, description, metadata = {}, req, status = 'success' }) => {
  try {
    await logAction({
      userId,
      action,
      description,
      req,
      metadata: {
        ...metadata,
        resource: 'auth',
        userEmail
      },
      status
    });
  } catch (error) {
    console.error('Failed to log auth action:', error);
  }
};

// ---------------- LOG HELPER FUNCTION FOR BOARD----------------
export const logBoardAction = async ({ userId, userEmail, action, description, boardId, metadata = {}, req }) => {
  try {
    // Convert 'multiple' to null to avoid ObjectId casting errors
    const validBoardId = boardId === 'multiple' ? null : boardId;
    
    // Get the user information from req.userForLogging if not provided
    const finalUserId = userId || req.userForLogging?._id;
    const finalUserEmail = userEmail || req.userForLogging?.email;
    
    // If no userEmail is available, try to get it from metadata or request
    let effectiveUserEmail = finalUserEmail;
    if (!effectiveUserEmail) {
      if (metadata?.userEmail) effectiveUserEmail = metadata.userEmail;
      else if (req.query?.userEmail) effectiveUserEmail = req.query.userEmail;
      else if (req.body?.userEmail) effectiveUserEmail = req.body.userEmail;
    }
    
    // Validate we have at least some user identifier
    if (!finalUserId && !effectiveUserEmail) {
      console.warn('No user identifier available for logging:', { action, description });
      return;
    }
    
    await logAction({
      userId: finalUserId,
      userEmail: effectiveUserEmail || 'system', // Don't use 'unknown'
      action,
      description,
      req,
      metadata: {
        ...metadata,
        resource: 'board',
        boardId: validBoardId,
        userEmail: effectiveUserEmail // Add userEmail to metadata for reference
      }
    });
  } catch (error) {
    console.error('Failed to log board action:', error);
  }
};