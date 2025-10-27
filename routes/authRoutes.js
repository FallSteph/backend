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

// ---------------- FORGOT PASSWORD ----------------
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: "No user found with that email." });

    // Generate code and save
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetCode = resetCode;
    await user.save();

    // --- Send email via Brevo HTTPS API ---
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": process.env.BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Nexora Support", email: process.env.EMAIL_FROM },
        to: [{ email }],
        subject: "Password Reset Code",
        htmlContent: `
          <html>
            <body>
              <p>Hello ${user.firstName || ""},</p>
              <p>Your password reset code is:</p>
              <h2>${resetCode}</h2>
              <p>This code will expire soon.</p>
            </body>
          </html>
        `,
      }),
    });

    res.json({ message: "Reset code sent to email." });
  } catch (err) {
    console.error("Error in forgot-password:", err);
    res.status(500).json({ message: "Server error while sending email." });
  }
});

// ---------------- VERIFY CODE ----------------
router.post("/verify-code", async (req, res) => {
  try {
    const { email, code } = req.body;
    const user = await User.findOne({ email });
    if (!user || user.resetCode !== code)
      return res.status(400).json({ message: "Invalid or incorrect code." });

    user.resetCodeVerified = true;
    await user.save();

    res.json({ message: "Code verified. You may now reset your password." });
  } catch (err) {
    console.error("Error verifying code:", err);
    res.status(500).json({ message: "Server error verifying code." });
  }
});

// ---------------- RESET PASSWORD ----------------
router.post("/reset-password", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !user.resetCodeVerified)
      return res
        .status(400)
        .json({ message: "Code not verified or user not found." });

    user.password = await bcrypt.hash(password, 10);
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
