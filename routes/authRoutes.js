import express from "express";
import fetch from "node-fetch"; // or "undici" if using newer Node
import nodemailer from "nodemailer";
import User from "../models/User.js"; // adjust path to your User model
import bcrypt from 'bcrypt';

const router = express.Router();

// ---------------- SIGNUP ----------------
router.post("/signup", async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role: "user",
      authProvider: "local",
    });

    return res.status(201).json({ success: true, user: newUser });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Signup failed" });
  }
});

// ----------------- LOGIN -----------------
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }

    // Find user by email and local auth
    const user = await User.findOne({ email, authProvider: "local" });
    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Compare hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    return res.status(200).json({ success: true, user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Login failed" });
  }
});


// ----------------- GOOGLE LOGIN -----------------
router.post("/google", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token is required" });

    // Fetch user info from Google
    const googleRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const profile = await googleRes.json();

    if (!profile.email) return res.status(400).json({ error: "Invalid Google token" });

    const { email, given_name, family_name, picture } = profile;

    // Find or create user in MongoDB
    let user = await User.findOne({ email, authProvider: "google" });

    if (!user) {
      user = await User.create({
        firstName: given_name,
        lastName: family_name,
        email,
        avatar: picture,
        role: "user",
        authProvider: "google",
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
    user: process.env.EMAIL_USER,        // your Gmail
    pass: process.env.EMAIL_APP_PASSWORD // Gmail App Password
  },
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,
  socketTimeout: 10000
});

// Verify transporter connection at startup
transporter.verify((err, success) => {
  if (err) {
    console.error("Transporter verification failed:", err);
  } else {
    console.log("Mailer ready to send emails");
  }
});

// ---------------- Send Verification Code ----------------
router.post('/send-code', async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ success: false, message: "Email is required" });

  const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
  verificationCodes[email] = code;

  try {
    const sendMailPromise = new Promise((resolve, reject) => {
      transporter.sendMail({
        from: `"Nexora Support" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Password Reset Verification Code',
        text: `Your verification code is: ${code}`
      }, (err, info) => {
        if (err) return reject(err);
        resolve(info);
      });
    });

    // Fail fast if takes more than 10 seconds
    const info = await Promise.race([
      sendMailPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Email sending timed out')), 10000))
    ]);

    console.log("Email sent:", info.response || info);
    return res.json({ success: true, message: "Verification code sent" });
  } catch (err) {
    console.error("Failed to send email:", err);
    return res.status(500).json({ success: false, message: "Failed to send verification code" });
  }
});

// ---------------- Verify Code ----------------
router.post('/verify-code', (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) return res.status(400).json({ success: false, message: "Email and code are required" });

  if (verificationCodes[email] && verificationCodes[email] === code) {
    delete verificationCodes[email]; // remove after verification
    return res.json({ success: true, message: "Code verified" });
  }

  return res.status(400).json({ success: false, message: 'Invalid code' });
});

// ---------------- Reset Password ----------------
router.post('/reset-password', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and new password are required' });
    }

    const user = await User.findOne({ email, authProvider: 'local' });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    await user.save();

    return res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
});

export default router;
