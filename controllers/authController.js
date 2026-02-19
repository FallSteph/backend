import express from 'express';
import fetch from 'node-fetch';
import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { generateToken } from "../utils/jwt.js"
import { validatePassword } from "../utils/validation.js"
import { logAuthAction } from "../utils/log.js"
import User from '../models/User.js';
import Notification from '../models/Notification.js';

const router = express.Router();

// ---------------- SIGNUP ----------------
export const signup = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    if (!firstName || !lastName || !email || !password) {
      await logAuthAction({
        userId: null,
        userEmail: email,
        action: "signup_failed",
        description: "Missing required fields",
        metadata: {
          reason: "validation",
          missing: !firstName
            ? "firstName"
            : !lastName
            ? "lastName"
            : !email
            ? "email"
            : "password",
        },
        req,
        status: "failure",
      });
      return res.status(400).json({ error: "Missing fields" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      await logAuthAction({
        userId: null,
        userEmail: email,
        action: "signup_failed",
        description: "Invalid email format",
        metadata: { reason: "validation", field: "email", value: email },
        req,
        status: "failure",
      });
      return res.status(400).json({ error: "Invalid email format" });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      await logAuthAction({
        userId: null,
        userEmail: email,
        action: "signup_failed",
        description: `Weak password: ${passwordValidation.message}`,
        metadata: {
          reason: "validation",
          field: "password",
          requirement: passwordValidation.message,
        },
        req,
        status: "failure",
      });
      return res.status(400).json({ error: passwordValidation.message });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      await logAuthAction({
        userId: existingUser._id,
        userEmail: email,
        action: "signup_failed",
        description: `User with email ${email} already exists`,
        metadata: { reason: "duplicate", existingUserId: existingUser._id },
        req,
        status: "failure",
      });
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role: "user",
      authProvider: "local",
      lastActive: new Date(),
      loginCount: 0,
      signupDate: new Date(),
      isActive: true,
    });

    const admins = await User.find({ role: "admin" });
    const message = `New user registered: ${firstName} ${lastName} (${email})`;

    for (const admin of admins) {
      await Notification.create({
        userEmail: admin.email,
        message,
        type: "new_signup",
        read: false,
        addedBy: email,
      });

      await logAuthAction({
        userId: admin._id,
        userEmail: admin.email,
        action: "admin_notified_signup",
        description: `Admin notified about new user signup: ${email}`,
        metadata: {
          adminEmail: admin.email,
          newUserEmail: email,
          newUserName: `${firstName} ${lastName}`,
        },
        req,
      });
    }

    const token = generateToken(newUser);

    await logAuthAction({
      userId: newUser._id,
      userEmail: email,
      action: "signup_success",
      description: `New user registered: ${firstName} ${lastName}`,
      metadata: {
        firstName,
        lastName,
        authProvider: "local",
        userRole: newUser.role,
        signupDate: newUser.signupDate,
      },
      req,
    });

    return res.status(201).json({
      success: true,
      token,
      user: {
        _id: newUser._id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        role: newUser.role,
        authProvider: newUser.authProvider,
        avatar: newUser.avatar,
        lastActive: newUser.lastActive,
        loginCount: newUser.loginCount,
        signupDate: newUser.signupDate,
      },
    });
  } catch (err) {
    console.error(err);
    await logAuthAction({
      userId: null,
      userEmail: req.body.email,
      action: "signup_error",
      description: `Signup error: ${err.message}`,
      metadata: { error: err.message, stack: err.stack },
      req,
      status: "error",
    });
    return res.status(500).json({ error: "Signup failed" });
  }
};

// ----------------- LOGIN (with reCAPTCHA) -----------------
export const login = async (req, res) => {
  try {
    const { email, password, recaptchaToken } = req.body;

    if (!email || !password || !recaptchaToken) {
      await logAuthAction({
        userId: null,
        userEmail: email,
        action: "login_failed",
        description: "Missing required fields for login",
        metadata: {
          reason: "validation",
          missing: !email ? "email" : !password ? "password" : "recaptchaToken",
        },
        req,
        status: "failure",
      });
      return res.status(400).json({ error: "Missing fields" });
    }

    // --- Verify reCAPTCHA ---
    const googleVerifyURL = "https://www.google.com/recaptcha/api/siteverify";
    const recaptchaResponse = await fetch(googleVerifyURL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: process.env.RECAPTCHA_SECRET_KEY,
        response: recaptchaToken,
      }),
    });
    const recaptchaData = await recaptchaResponse.json();

    if (!recaptchaData.success) {
      await logAuthAction({
        userId: null,
        userEmail: email,
        action: "login_failed",
        description: `reCAPTCHA verification failed for ${email}`,
        metadata: { reason: "recaptcha_failed", recaptchaData },
        req,
        status: "failure",
      });
      return res.status(400).json({
        error: "Failed reCAPTCHA verification",
        details: recaptchaData,
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      await logAuthAction({
        userId: null,
        userEmail: email,
        action: "login_failed",
        description: `Invalid credentials for ${email} (user not found)`,
        metadata: { reason: "user_not_found" },
        req,
        status: "failure",
      });
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // --- Check locks and inactivity ---
    if (user.isLockedByAdmin()) {
      const lockInfo = {
        lockedAt: user.lockedByAdminAt,
        lockedBy: user.lockedByAdminName,
        reason: user.lockReason,
        expiresAt: user.lockExpiresAt,
      };
      let errorMessage =
        "Your account has been locked by an administrator.";
      if (user.lockReason) errorMessage += ` Reason: ${user.lockReason}`;
      if (user.lockExpiresAt)
        errorMessage += ` Lock expires: ${new Date(
          user.lockExpiresAt
        ).toLocaleString()}`;
      else errorMessage += " Please contact support to unlock your account.";

      await logAuthAction({
        userId: user._id,
        userEmail: email,
        action: "login_failed",
        description: `Account locked by admin for ${email}`,
        metadata: { reason: "admin_locked", ...lockInfo },
        req,
        status: "failure",
      });

      return res.status(403).json({
        error: errorMessage,
        code: "ACCOUNT_LOCKED_BY_ADMIN",
        lockInfo,
      });
    }

    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
      const remainingTime = Math.ceil(
        (user.accountLockedUntil - new Date()) / 60000
      );
      await logAuthAction({
        userId: user._id,
        userEmail: email,
        action: "login_failed",
        description: `Account auto-locked for ${email}`,
        metadata: {
          reason: "auto_locked",
          lockedUntil: user.accountLockedUntil,
          failedAttempts: user.failedLoginAttempts,
          remainingMinutes: remainingTime,
        },
        req,
        status: "failure",
      });
      return res.status(403).json({
        error: `Account is temporarily locked due to too many failed attempts. Please try again in ${remainingTime} minute(s) or reset your password.`,
        code: "ACCOUNT_AUTO_LOCKED",
      });
    }

    if (!user.isActive) {
      await logAuthAction({
        userId: user._id,
        userEmail: email,
        action: "login_failed",
        description: `Account inactive for ${email}`,
        metadata: { reason: "account_inactive" },
        req,
        status: "failure",
      });
      return res.status(403).json({
        error: "Your account has been deactivated. Please contact support.",
        code: "ACCOUNT_INACTIVE",
      });
    }

    // --- Verify password ---
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

      if (user.failedLoginAttempts >= 5) {
        user.accountLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        await logAuthAction({
          userId: user._id,
          userEmail: email,
          action: "account_auto_locked",
          description: "Account auto-locked due to too many failed attempts",
          metadata: {
            failedAttempts: user.failedLoginAttempts,
            lockedUntil: user.accountLockedUntil,
          },
          req,
          status: "warning",
        });
      }

      await user.save();

      const attemptsRemaining = Math.max(0, 5 - user.failedLoginAttempts);
      await logAuthAction({
        userId: user._id,
        userEmail: email,
        action: "login_failed",
        description: `Invalid password for ${email}`,
        metadata: {
          reason: "invalid_password",
          failedAttempts: user.failedLoginAttempts,
          attemptsRemaining,
          accountLocked: user.failedLoginAttempts >= 5,
        },
        req,
        status: "failure",
      });

      return res.status(400).json({
        error:
          attemptsRemaining > 0
            ? `Invalid credentials. ${attemptsRemaining} attempt(s) remaining before account lock.`
            : "Invalid credentials. Your account has been temporarily locked.",
        attemptsRemaining,
      });
    }

    // --- Successful login ---
    user.failedLoginAttempts = 0;
    user.accountLockedUntil = null;
    user.lastLogin = new Date();
    user.lastActive = new Date();
    user.loginCount = (user.loginCount || 0) + 1;

    const userAgent = req.headers["user-agent"] || "";
    const deviceId = req.headers["device-id"] || crypto.randomUUID();
    const ipAddress =
      req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;

    const existingDeviceIndex = user.devices.findIndex(
      (d) => d.deviceId === deviceId
    );
    if (existingDeviceIndex > -1) {
      user.devices[existingDeviceIndex].lastUsed = new Date();
      user.devices[existingDeviceIndex].userAgent = userAgent;
      user.devices[existingDeviceIndex].ipAddress = ipAddress;
    } else {
      user.devices.push({
        deviceId,
        userAgent,
        ipAddress,
        lastUsed: new Date(),
        isBlocked: false,
      });
    }

    await user.save();

    const token = generateToken(user);

    await logAuthAction({
      userId: user._id,
      userEmail: email,
      action: "login_success",
      description: "User logged in successfully",
      metadata: {
        authProvider: user.authProvider,
        loginCount: user.loginCount,
        lastLogin: user.lastLogin,
        deviceId,
        userAgent: userAgent.substring(0, 100),
      },
      req,
    });

    return res.status(200).json({
      success: true,
      token,
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        authProvider: user.authProvider,
        avatar: user.avatar,
        lastActive: user.lastActive,
        loginCount: user.loginCount,
        signupDate: user.signupDate,
      },
    });
  } catch (err) {
    console.error(err);
    await logAuthAction({
      userId: null,
      userEmail: req.body.email,
      action: "login_error",
      description: `Login error: ${err.message}`,
      metadata: { error: err.message, stack: err.stack },
      req,
      status: "error",
    });
    return res.status(500).json({ error: "Login failed" });
  }
};

// ----------------- GOOGLE LOGIN -----------------
export const googleLogin = async (req, res) => {
  try {
    const { token: googleToken } = req.body;
    if (!googleToken)
      return res.status(400).json({ error: "Token is required" });

    // Get Google user info
    const googleRes = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: `Bearer ${googleToken}` } }
    );
    const profile = await googleRes.json();

    if (!profile.email)
      return res.status(400).json({ error: "Invalid Google token" });

    const { email, given_name, family_name, picture } = profile;

    // Check if user already exists
    let user = await User.findOne({ email });

    if (user) {
      // Upgrade local users to Google auth if needed
      if (user.authProvider === "local") {
        user.authProvider = "google";
        user.avatar = picture;
        await user.save();
      }
    } else {
      // Create new Google user
      user = await User.create({
        firstName: given_name,
        lastName: family_name,
        email,
        avatar: picture,
        role: "user",
        authProvider: "google",
      });
    }

    // Generate JWT
    const token = generateToken(user);

    console.log(
      "🔑 Generated JWT token for Google login:",
      email,
      "Length:",
      token.length
    );

    return res.status(200).json({
      success: true,
      token,
      user,
    });
  } catch (err) {
    console.error("Google login error:", err);
    return res.status(500).json({ error: "Google login failed" });
  }
};

// ---------------- TOKEN VERIFICATION ----------------
export const verifyToken = async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ valid: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'fallback-secret-key-change-in-production'
    );
    
    // Check if user still exists
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ valid: false, message: 'User no longer exists' });
    }

    res.json({ 
      valid: true, 
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        avatar: user.avatar
      }
    });

  } catch (err) {
    console.error('Token verification error:', err);
    res.status(401).json({ valid: false, message: 'Invalid or expired token' });
  }
};

// ----------------- UPDATE PROFILE -----------------
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const updates = req.body;
    
    console.log('🔄 Updating profile for user:', userId);
    console.log('📝 Updates:', updates);
    
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    
    // Handle notification settings if provided
    if (updates.notificationSettings) {
      user.notificationSettings = {
        emailNotifications: updates.notificationSettings.emailNotifications !== undefined 
          ? updates.notificationSettings.emailNotifications 
          : user.notificationSettings?.emailNotifications ?? true,
        projectUpdates: updates.notificationSettings.projectUpdates !== undefined 
          ? updates.notificationSettings.projectUpdates 
          : user.notificationSettings?.projectUpdates ?? true,
        updatedAt: new Date()
      };
    }
    
    // Handle other updates (avatar, name, etc.)
    if (updates.firstName) user.firstName = updates.firstName;
    if (updates.lastName) user.lastName = updates.lastName;
    if (updates.email) user.email = updates.email;
    if (updates.avatar) user.avatar = updates.avatar;
    
    await user.save();
    
    // Return updated user (excluding password)
    const updatedUser = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      notificationSettings: user.notificationSettings,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
    
    console.log('✅ Profile updated successfully');
    res.json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser
    });
    
  } catch (error) {
    console.error('💥 Profile update error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message
    });
  }
};

export default router;
