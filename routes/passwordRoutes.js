import express from "express";
import nodemailer from "nodemailer";

const router = express.Router();

// Temporary in-memory store for verification codes
const verificationCodes = {};

// Nodemailer setup using Gmail App Password
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

// Send verification code
router.post('/send-code', async (req, res) => {
  const { email } = req.body;
  const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
  verificationCodes[email] = code;

  try {
    await transporter.sendMail({
      from: `"Your App Name" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset Verification Code',
      text: `Your verification code is: ${code}`,
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to send code' });
  }
});

// Verify code
router.post('/verify-code', (req, res) => {
  const { email, code } = req.body;
  if (verificationCodes[email] && verificationCodes[email] === code) {
    delete verificationCodes[email]; // remove after verification
    return res.json({ success: true });
  }
  res.status(400).json({ success: false, message: 'Invalid code' });
});

export default router;
