import express from "express";
import fetch from "node-fetch";
import User from "../models/User.js";

const router = express.Router();

// ----------------- GOOGLE LOGIN -----------------
router.post("/google", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token is required" });

    const googleRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const profile = await googleRes.json();

    if (!profile.email) return res.status(400).json({ error: "Invalid Google token" });

    const { email, given_name, family_name, picture } = profile;

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

export default router;
