import express from "express";
import { getAllUsers, lockUserAccount, unlockUserAccount, getUserLockHistory, getUserLockStatus, createUser,updateUser, deleteUser, changeUserRole, searchUsers } from "../controllers/userController.js";
import { startEditSession, heartbeatEditSession, checkEditSessionStatus, endEditSession } from "../controllers/editSessionController.js"

const router = express.Router();

// ============= GET ALL USERS =============
router.get('/', getAllUsers);

// ============= ADMIN LOCK ACCOUNT =============
router.post('/:id/lock', lockUserAccount);

// ============= ADMIN UNLOCK ACCOUNT =============
router.post('/:id/unlock', unlockUserAccount);

// ============= GET LOCK HISTORY =============
router.get('/:id/lock-history', getUserLockHistory);

// ============= GET LOCK STATUS =============
router.get('/:id/lock-status', getUserLockStatus);

// ✅ Start edit session with expiration
router.post('/:id/start-edit', startEditSession);

// ✅ Heartbeat endpoint to keep session alive
router.post('/:id/heartbeat', heartbeatEditSession);

// ✅ Check session status
router.get('/:id/edit-status', checkEditSessionStatus);

// ✅ End edit session
router.delete('/:id/end-edit', endEditSession);

// ============= CREATE NEW USER ============= ✅ ADD THIS ROUTE
router.post('/', createUser);

// ============= UPDATE USER ROUTE WITH EXPIRATION CHECK =============
router.put('/:id', updateUser);

// ============= DELETE USER =============
router.delete('/:id', deleteUser);

// ============= CHANGE USER ROLE =============
router.put('/:id/role', changeUserRole);

// ============= SEARCH USERS =============
router.get('/search', searchUsers);



export default router;
