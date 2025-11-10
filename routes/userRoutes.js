import express from "express";
import User from "../models/User.js";
import sendEmail from "../utils/sendEmail.js";
import multer from "multer";
import bcrypt from "bcrypt";


const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const users = await User.find().select("firstName lastName email role");
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Change Password
router.put("/change-password", async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;

    // Validate password strength
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    if (!strongPasswordRegex.test(newPassword)) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long, include a lowercase letter, a number, and a special character."
      });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: "Your current password is incorrect." });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: "Password updated successfully ✅" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
});



// Add user
router.post("/", async (req, res) => {
  try {
    const { firstName, lastName, email, password, role } = req.body;

    // Check if user exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // ✅ Encrypt password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword, // <= store hashed password
      role,
    });

    // ✅ Send original password to user (not hashed)
    try {
      const subject = "Welcome to Nexora!";
      const html = `
        <h2>Welcome to Nexora, ${firstName}!</h2>
        <p>Your account has been successfully created. 🎉</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Password:</b> ${password}</p>
        <p>You can now log in and start using Nexora.</p>
        <br/>
        <p>— The Nexora Team 💡</p>
      `;

      // ✅ Make sure sendEmail supports HTML (we already fixed earlier)
      await sendEmail(email, subject, "", html);

    } catch (emailError) {
      console.error("Email sending failed:", emailError.message);
      // Still allow success
    }

    // ✅ Return user but DO NOT include password
    res.status(201).json({
      success: true,
      user: {
        _id: newUser._id,
        firstName,
        lastName,
        email,
        role,
      }
    });

  } catch (error) {
    console.error("Error adding user:", error.message);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Update user role only
router.put("/:id/role", async (req, res) => {
  try {
    const { role } = req.body;
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      success: true,
      user: {
        _id: updatedUser._id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        role: updatedUser.role,
      }
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Setup storage for avatar upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/avatars/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

router.put("/update-profile/:id", upload.single("avatar"), async (req, res) => {
  try {
    const { firstName, lastName, email } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Update text fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email && user.authProvider === "local") user.email = email;

    // Update avatar if uploaded
    if (req.file) {
      user.avatar = `/uploads/avatars/${req.file.filename}`;
    }

    await user.save();
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


// Update user
router.put("/:id", async (req, res) => {
  try {
    const updated = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete user
router.delete("/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});



export default router;
