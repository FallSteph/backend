import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: { type: String, unique: true, required: true },
  password: String,
  role: { type: String, enum: ["user", "admin"], default: "user" },
  avatar: String,
  authProvider: { type: String, enum: ["local", "google"], default: "local" },

  // Forgot password fields
  resetCode: String,
  resetCodeVerified: { type: Boolean, default: false },
});

export default mongoose.model("User", userSchema);
