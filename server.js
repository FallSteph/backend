import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import localAuthRoutes from "./routes/localAuthRoutes.js";
import googleAuthRoutes from "./routes/googleAuthRoutes.js";
import passwordRoutes from "./routes/passwordRoutes.js";

dotenv.config();
const app = express();

app.use(cors({
  origin: [
    "http://localhost:8080", // local dev
    "https://nexora-fallstephs-projects.vercel.app", // deployed frontend
    "https://nexora-sage.vercel.app" // another link for frontend
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true, // <-- important for cookies / auth
}));
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error(err));

// Routes
app.use("/api/auth", localAuthRoutes);
app.use("/api/auth", googleAuthRoutes);
app.use("/api/auth", passwordRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
