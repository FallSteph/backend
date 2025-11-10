import express from 'express';
import nodemailer from 'nodemailer';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import User from '../models/User.js';
import PasswordReset from '../models/PasswordReset.js';

dotenv.config();
const router = express.Router();

// 🔹 Helper to send email
async function sendResetCodeEmail(toEmail, code) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Gmail app password
    },
  });

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Nexora'}" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Password Reset Code',
    html: `
      <h2>Reset Your Password</h2>
      <p>Use this code to reset your password:</p>
      <h3>${code}</h3>
      <p>This code expires in 15 minutes.</p>
    `,
  };

  await transporter.sendMail(mailOptions);
}

// 🔹 Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await User.findOne({ email });
    if (!user) return res.json({ ok: true }); // silent for security

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // invalidate previous codes
    await PasswordReset.updateMany({ email }, { used: true });
    await PasswordReset.create({ email, code, expiresAt });

    await sendResetCodeEmail(email, code);
    res.json({ ok: true, message: 'If that email exists, a reset code was sent.' });
  } catch (err) {
    console.error('forgot-password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 🔹 Verify code
router.post('/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Missing fields' });

    const record = await PasswordReset.findOne({ email, code, used: false }).sort({ createdAt: -1 });
    if (!record) return res.status(400).json({ error: 'Invalid code' });
    if (new Date() > record.expiresAt) return res.status(400).json({ error: 'Code expired' });

    res.json({ ok: true, message: 'Code verified' });
  } catch (err) {
    console.error('verify-code error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 🔹 Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, password } = req.body;
    if (!email || !code || !password) return res.status(400).json({ error: 'Missing fields' });

    // Strong password validation
    const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    if (!passwordPattern.test(password)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long, include 1 uppercase, 1 lowercase, 1 number, and 1 special character.',
      });
    }

    const record = await PasswordReset.findOne({ email, code, used: false }).sort({ createdAt: -1 });
    if (!record) return res.status(400).json({ error: 'Invalid or used code' });
    if (new Date() > record.expiresAt) return res.status(400).json({ error: 'Code expired' });

    const hashed = await bcrypt.hash(password, 10);
    await User.updateOne({ email }, { $set: { password: hashed } });

    record.used = true;
    await record.save();

    res.json({ ok: true, message: 'Password successfully reset' });
  } catch (err) {
    console.error('reset-password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;