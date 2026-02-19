// reportRoutes.js
import express from 'express';
import { getAnalytics } from '../controllers/reportController.js';

const router = express.Router();

// Get analytics data
router.get('/analytics', getAnalytics);

export default router; 
