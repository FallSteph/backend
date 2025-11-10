import mongoose from "mongoose";

const boardSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    userEmail: { type: String, required: true },
    dueDate: { type: Date, default: null },

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
            attachments: [String],
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
        name:String,
        role: { type: String, enum: ["member", "manager"], default: "member" },
      },
    ],

    // 🗑️ Soft delete support
    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Board", boardSchema);
