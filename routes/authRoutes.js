import express from "express";
import fetch from "node-fetch"; // or "undici" if using newer Node
import nodemailer from "nodemailer";
import User from "../models/User.js"; // adjust path to your User model
import bcrypt from 'bcrypt';
import crypto from "crypto";

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


// ---------------- FORGOT PASSWORD ----------------
const verificationCodes = {};

// Gmail Transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Send verification code
router.post("/send-code", async (req, res) => {
  const { email } = req.body;
  if (!email)
    return res
      .status(400)
      .json({ success: false, message: "Email is required" });

  const user = await User.findOne({ email, authProvider: "local" });
  if (!user)
    return res
      .status(404)
      .json({ success: false, message: "No user found with this email" });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  verificationCodes[email] = code;

  try {
    await transporter.sendMail({
      from: `"Nexora Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Password Reset Verification Code",
      text: `Your password reset code is: ${code}`,
    });

    return res.json({
      success: true,
      message: "Verification code sent successfully",
    });
  } catch (err) {
    console.error("Failed to send email:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to send verification code" });
  }
});

// Verify code
router.post("/verify-code", (req, res) => {
  const { email, code } = req.body;

  if (!email || !code)
    return res
      .status(400)
      .json({ success: false, message: "Email and code are required" });

  if (verificationCodes[email] === code) {
    delete verificationCodes[email];
    return res.json({ success: true, message: "Code verified" });
  }

  return res
    .status(400)
    .json({ success: false, message: "Invalid or expired code" });
});

// Reset password
router.post("/reset-password", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required" });

    const user = await User.findOne({ email, authProvider: "local" });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    await user.save();

    return res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    console.error("Reset password error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to reset password" });
  }
});

export default router;
