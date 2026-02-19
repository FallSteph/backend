import mongoose from "mongoose";

const boardSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    userEmail: { type: String, required: true },
    dueDate: { type: Date, default: null },
    status: { type: String, enum: ["ongoing", "done"], default: "ongoing" }, // ✅ FROM FILE 2

    lists: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
        title: String,
        cards: [
          {
            _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
            title: String,
            description: String,
            labels: [String],
            assignedMembers: [String],
            dueDate: Date, // ✅ Card-level due date
            status: { type: String, enum: ["ongoing", "done"], default: "ongoing" }, // ✅ FROM FILE 2
            attachments: [
              {
                id: String,        // Google Drive file ID
                name: String,      // Original file name
                url: String,       // Direct view link
                webViewLink: String, // Google Drive view link
                uploadedBy: String, // User email/ID
                uploadedAt: { type: Date, default: Date.now }
              }
            ], // ✅ ENHANCED FROM FILE 2
            comments: [
              {
                _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
                user: String,
                text: String,
                timestamp: Date,
              },
            ],
          },
        ],
      },
    ],

    members: [
      {
        email: String,
        name: String,
        role: { type: String, enum: ["member", "manager", "instructor"], default: "member" }
      },
    ],

    // 🎨 Board color customization
    color: { 
      type: String, 
      default: 'gradient-purple-blue' 
    },

    // 🗑️ Soft delete support
    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Board", boardSchema);