import User from "../models/User.js";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";

let codeStore = {}; // Temporary store for test codes (use DB or Redis in production)

// Send verification code to email
export const sendResetCode = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "Email not found" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    codeStore[email] = code;

    // send email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    /*await transporter.sendMail({
      from: `"Nexora Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Password Reset Code",
      text: `Your verification code is: ${code}`,
    });*/

    res.json({ message: "Verification code sent!" });
  } catch (err) {
    res.status(500).json({ error: "Failed to send code" });
  }
};

// Verify code
export const verifyResetCode = (req, res) => {
  const { email, code } = req.body;
  if (codeStore[email] && codeStore[email] === code) {
    res.json({ message: "Code verified" });
  } else {
    res.status(400).json({ error: "Invalid code" });
  }
};

// Reset password
export const resetPassword = async (req, res) => {
  const { email, newPassword } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();
    delete codeStore[email];

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset password" });
  }
};
