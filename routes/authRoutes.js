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

// ---------------- EMAIL TRANSPORTER (using Brevo) ----------------
const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // fix SSL issues on Render
  },
});

// ---------------- FORGOT PASSWORD ----------------
// --- STEP 1: Forgot Password (send reset code) ---
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    // Check if email exists in DB
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "No user found with that email." });
    }

    // Generate 6-digit code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Save code temporarily to user document
    user.resetCode = resetCode;
    await user.save();

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: "Password Reset Code",
      html: `<p>Hello, this is your Password Reset Code: <strong>${resetCode}</strong></p>`,
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: "Reset code sent to email." });
  } catch (err) {
    console.error("Error in forgot-password:", err);
    res.status(500).json({ message: "Server error while sending email." });
  }
});

// --- STEP 2: Verify Code ---
router.post("/verify-code", async (req, res) => {
  try {
    const { email, code } = req.body;

    const user = await User.findOne({ email });
    if (!user || user.resetCode !== code) {
      return res.status(400).json({ message: "Invalid or incorrect code." });
    }

    // Mark as verified (optional: store flag or expire code)
    user.resetCodeVerified = true;
    await user.save();

    res.json({ message: "Code verified. You may now reset your password." });
  } catch (err) {
    console.error("Error verifying code:", err);
    res.status(500).json({ message: "Server error verifying code." });
  }
});

// --- STEP 3: Reset Password ---
router.post("/reset-password", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !user.resetCodeVerified) {
      return res
        .status(400)
        .json({ message: "Code not verified or user not found." });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;

    // Clear reset-related fields
    user.resetCode = undefined;
    user.resetCodeVerified = undefined;

    await user.save();
    res.json({ message: "Password reset successful. You may now log in." });
  } catch (err) {
    console.error("Error resetting password:", err);
    res.status(500).json({ message: "Server error resetting password." });
  }
});

export default router;
