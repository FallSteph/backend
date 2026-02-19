import express from 'express';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { forgotPassword, verifyCode, resetPassword } from '../controllers/passwordController.js';

dotenv.config();
const router = express.Router();

// 🔹 Request password reset
router.post('/forgot-password', forgotPassword);

// 🔹 Verify code
router.post('/verify-code', verifyCode);

// 🔹 Reset password
router.post('/reset-password', resetPassword);

export default router;