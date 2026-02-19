import jwt from "jsonwebtoken";

// ---------------- JWT TOKEN GENERATION ----------------
export const generateToken = (user) => {
  return jwt.sign(
    { 
      userId: user._id, 
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName
    },
    process.env.JWT_SECRET || 'fallback-secret-key-change-in-production',
    { expiresIn: '7d' }
  );
};