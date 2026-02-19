import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import boardRoutes from "./routes/boardRoutes.js";
import forgotPasswordRoutes from './routes/forgotPasswordRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import reportRoutes from "./routes/reportRoutes.js";
import path from "path";
import { fileURLToPath } from "url";



dotenv.config();
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


app.use(cors({
  origin: [
    "http://localhost:8080", // local dev
    "https://nexora-fallstephs-projects.vercel.app", // deployed frontend
    "https://nexora-sage.vercel.app" // another link for frontend
  ],
  methods: ["GET","PATCH","POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true, // <-- important for cookies / auth
}));

// Handle preflight explicitly
app.options(/.*/, cors({
  origin: "*",
  methods: ["GET","PATCH","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
  credentials: true
}));

app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error(err));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes); 
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

//for project board Routes
app.use("/api/boards", boardRoutes);
app.use("/api/auth/forgot", forgotPasswordRoutes);
app.use('/api/notifications', notificationRoutes);

// report
app.use("/api/report", reportRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
