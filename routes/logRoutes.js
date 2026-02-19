import express from 'express';
import { getLogsController, deleteOldLogsController } from '../controllers/logController.js';

const router = express.Router();

// Get logs with filters
router.get('/', getLogsController);

// Delete old logs (admin only)
router.delete('/cleanup', deleteOldLogsController);

export default router;