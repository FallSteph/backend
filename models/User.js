import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: { type: String, unique: true, required: true },
  password: String, // optional for Google users
  role: { type: String, enum: ["user", "admin"], default: "user" },
  avatar: String,
  authProvider: { type: String, enum: ["local", "google"], default: "local" },

  // 🔽 Added for Forgot Password feature
  resetCode: String,
  resetCodeExpires: Date,
});

export default mongoose.model("User", userSchema);
