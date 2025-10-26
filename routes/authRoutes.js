import express from "express";
import fetch from "node-fetch"; // or "undici" if using newer Node
import nodemailer from "nodemailer";
import User from "../models/User.js"; // adjust path to your User model

const router = express.Router();

// ----------------- GOOGLE LOGIN -----------------
router.post("/google", async (req, res) => {
  try {
    const { token } = req.body;

    // ✅ Fetch user info using the access token (since it’s NOT a JWT)
    const googleRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const profile = await googleRes.json();
    if (!profile.email) {
      return res.status(400).json({ error: "Invalid Google token" });
    }

    const { email, name, picture } = profile;

    // ✅ Find or create user
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name,
        email,
        avatar: picture,
        password: "", // skip password for Google users
      });
    }

    return res.status(200).json({ success: true, user });
  } catch (err) {
    console.error("Google login error:", err);
    return res.status(500).json({ error: "Google login failed" });
  }
});

// ----------------- FORGOT PASSWORD -----------------

// Temporary in-memory store for verification codes
const verificationCodes = {};

// Nodemailer setup using Gmail App Password
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // your Gmail
    pass: process.env.EMAIL_APP_PASSWORD, // Gmail App Password
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
