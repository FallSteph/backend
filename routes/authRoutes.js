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
const verificationCodes = {};

// Setup Gmail transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// 1️⃣ Request password reset — send email with secure token link
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email, authProvider: "local" });

    if (!user) return res.status(404).json({ error: "No user found with this email" });

    const token = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: "Password Reset Request",
      text: `You requested a password reset. Click the link below to set a new password:\n\n${resetUrl}\n\nIf you didn’t request this, please ignore this email.`,
    });

    return res.json({ success: true, message: "Password reset email sent" });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ error: "Failed to send reset email" });
  }
});

// ---------------- Send Verification Code ----------------
router.post("/verify-code", async (req, res) => {
  try {
    const { email, code } = req.body;
    const user = await User.findOne({ email });

    if (!user || user.resetCode !== code)
      return res.status(400).json({ message: "Invalid code" });

    if (user.resetCodeExpires < new Date())
      return res.status(400).json({ message: "Code expired" });

    res.json({ message: "Code verified successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to verify code" });
  }
});

// ---------------- Reset Password ----------------
router.post("/reset-password", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ message: "User not found" });

    user.password = password; // ✅ you can later add bcrypt hash here
    user.resetCode = null;
    user.resetCodeExpires = null;
    await user.save();

    res.json({ message: "Password reset successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to reset password" });
  }
});

export default router;
