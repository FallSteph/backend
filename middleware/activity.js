import jwt from "jsonwebtoken";

// ---------------- ACTIVITY TRACKING MIDDLEWARE FOR AUTH----------------
export const trackAuthActivity = (actionType) => {
  return async (req, res, next) => {
    try {
      const authHeader = req.header('Authorization');
      let userId = null;
      let userEmail = null;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.replace('Bearer ', '');
          
          if (token && token !== 'undefined' && token !== 'null') {
            try {
              const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key-change-in-production');
              userId = decoded.userId;
              userEmail = decoded.email;
            } catch (verifyError) {
              console.log('⚠️ Token verification failed in trackAuthActivity:', verifyError.message);
            }
          }
        } catch (extractError) {
          console.error('❌ Error extracting token:', extractError.message);
        }
      }

      req.userForLogging = { 
        _id: userId || null, 
        email: userEmail || undefined,
        name: null 
      };
      
      next();
    } catch (error) {
      console.error('💥 Activity tracking middleware error:', error);
      req.userForLogging = { _id: null, email: undefined, name: null };
      next();
    }
  };
};

// ---------------- ACTIVITY TRACKING MIDDLEWARE FOR BOARD----------------
export const trackBoardActivity = () => {
  return async (req, res, next) => {
    // DECLARE VARIABLES HERE - THIS IS THE FIX!
    let userId = null;
    let userEmail = null;
    let userName = null;
    
    try {
      // Extract user from token if available
      const token = req.header('Authorization')?.replace('Bearer ', '');
      
      if (token) {
        try {
          // Use the imported jwt
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key-change-in-production');
          userId = decoded.userId;
          userEmail = decoded.email;
          userName = decoded.firstName ? `${decoded.firstName} ${decoded.lastName || ''}` : null;
          
          console.log('Token decoded successfully:', { userId, userEmail, userName });
        } catch (err) {
          console.warn('Token invalid or expired for tracking:', err.message);
        }
      }
      
      // Also try to get user from query or body as fallback
      if (!userEmail) {
        userEmail = req.query?.userEmail || req.body?.userEmail;
      }

      // Add user info to request for logging
      req.userForLogging = { 
        _id: userId, 
        email: userEmail,
        name: userName
      };
      
      console.log('User for logging:', req.userForLogging);
      
      next();
    } catch (error) {
      console.error('Activity tracking error:', error);
      req.userForLogging = { 
        _id: null, 
        email: 'unknown@system.com',
        name: 'Unknown User'
      };
      next();
    }
  };
};