import express from 'express';
import fetch from 'node-fetch';
import jwtDecode from 'jwt-decode';
import User from '../models/User.js'; // adjust path

const router = express.Router();

router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;

    // 1️⃣ Verify token with Google
    const googleRes = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const profile = await googleRes.json();

    if (!profile.email) {
      return res.status(400).json({ error: 'Invalid Google token' });
    }

    // 2️⃣ Check if user exists in your DB
    let user = await User.findOne({ email: profile.email });
    if (!user) {
      user = await User.create({
        name: profile.name,
        email: profile.email,
        avatar: profile.picture,
        password: '', // no password for OAuth users
      });
    }

    // 3️⃣ Return success (you could also generate your own JWT here)
    res.json({ success: true, user });
  } catch (err) {
    console.error('Google login error:', err);
    res.status(500).json({ error: 'Google login failed' });
  }
});

export default router;
