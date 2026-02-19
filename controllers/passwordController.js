import bcrypt from "bcrypt"
import User from "../models/User.js";
import PasswordReset from "../models/PasswordReset.js";
import nodemailer from "nodemailer";

// 🔹 Send Email Helper
async function sendResetEmail(toEmail, code) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Gmail App Password
    },
  });

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || "Nexora"}" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Password Reset Code",
    html: `
      <h2>Password Reset Request</h2>
      <p>Use this code to reset your password:</p>
      <h3>${code}</h3>
      <p>This code will expire in 15 minutes.</p>
    `,
  };

  await transporter.sendMail(mailOptions);
}

// 🔹 Request Password Reset
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });
    if (!user) return res.json({ ok: true }); // silent fail for security

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Invalidate old codes
    await PasswordReset.updateMany({ email }, { used: true });
    await PasswordReset.create({ email, code, expiresAt });

    await sendResetEmail(email, code);
    res.json({ ok: true, message: "If the email exists, a reset code has been sent." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: "Server error." });
  }
};

// 🔹 Verify code
export const verifyCode = async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Missing fields' });

    const record = await PasswordReset
      .findOne({ email, code, used: false })
      .sort({ createdAt: -1 });

    if (!record) return res.status(400).json({ error: 'Invalid code' });
    if (new Date() > record.expiresAt) return res.status(400).json({ error: 'Code expired' });

    res.json({ ok: true, message: 'Code verified' });
  } catch (err) {
    console.error('verify-code error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// 🔹 Reset password
export const resetPassword = async (req, res) => {
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

    const record = await PasswordReset
      .findOne({ email, code, used: false })
      .sort({ createdAt: -1 });

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
};
