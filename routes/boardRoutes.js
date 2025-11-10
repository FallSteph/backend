import express from "express";
import mongoose from "mongoose";
import Board from "../models/Board.js";

const router = express.Router();

// ✅ Get all boards
router.get("/", async (req, res) => {
  try {
    const { userEmail, deleted } = req.query;
    const query = {};

    if (deleted !== undefined) query.deleted = deleted === "true";

    if (userEmail) {
      query.$or = [
        { userEmail },
        { "members.email": userEmail },
      ];
    }

    const boards = await Board.find(query);
    res.json(boards);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch boards" });
  }
});



// ✅ Create a board
router.post("/", async (req, res) => {
  try {
    const { title, description, userEmail } = req.body;
    if (!title || !userEmail)
      return res.status(400).json({ message: "Missing required fields" });

    const newBoard = await Board.create({ title, description, userEmail });
    res.status(201).json(newBoard);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create board" });
  }
});

// ✅ Update board
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    
    // ✅ Handle board-level due date properly
    if (updateData.dueDate !== undefined) {
      updateData.dueDate = updateData.dueDate ? new Date(updateData.dueDate) : null;
    }
    
    const updated = await Board.findByIdAndUpdate(id, updateData, { new: true });
    if (!updated) return res.status(404).json({ message: "Board not found" });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update board" });
  }
});

// ✅ Soft delete (move to Recycle Bin)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const board = await Board.findById(id);
    if (!board) return res.status(404).json({ message: "Board not found" });

    board.deleted = true;
    board.deletedAt = new Date();
    await board.save();

    res.json({ message: "Board moved to Recycle Bin", board });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to move board to Recycle Bin" });
  }
});

// ✅ Permanently delete board
router.delete("/permanent/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const board = await Board.findByIdAndDelete(id);
    if (!board) return res.status(404).json({ message: "Board not found" });

    res.json({ message: "Board permanently deleted", board });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to permanently delete board" });
  }
});

// ✅ Cleanup old soft-deleted boards
router.delete("/cleanup/expired", async (req, res) => {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await Board.deleteMany({
      deleted: true,
      deletedAt: { $lte: oneWeekAgo },
    });
    res.json({ message: "Old deleted boards permanently removed", result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to clean up boards" });
  }
});

// ✅ Add a list to a board
router.post("/:id/lists", async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid board ID" });
    }

    if (!title) {
      return res.status(400).json({ message: "List title required" });
    }

    const board = await Board.findById(id);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const newList = {
      _id: new mongoose.Types.ObjectId(),
      title,
      cards: [],
    };

    board.lists = board.lists || [];
    board.lists.push(newList);
    await board.save();

    res.status(201).json(board);
  } catch (err) {
    console.error("🔥 Error adding list:", err);
    res.status(500).json({ message: "Internal server error", error: err.message });
  }
});

// ✅ Add a card to a list
router.post("/:boardId/lists/:listId/cards", async (req, res) => {
  try {
    const { boardId, listId } = req.params;
    const { title, description, dueDate } = req.body;

    // 🔍 Validate IDs
    if (!mongoose.Types.ObjectId.isValid(boardId) || !mongoose.Types.ObjectId.isValid(listId)) {
      return res.status(400).json({ message: "Invalid board or list ID" });
    }

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const list = board.lists.id(listId) || board.lists.find(l => l._id.toString() === listId);
    if (!list) return res.status(404).json({ message: "List not found" });

    // ✅ Use a real ObjectId instead of a string
    const newCard = {
      _id: new mongoose.Types.ObjectId(),
      title,
      description: description || "",
      dueDate: dueDate ? new Date(dueDate) : null,
      labels: [],
      assignedMembers: [],
      attachments: [],
      comments: [],
    };

    list.cards.push(newCard);
    await board.save();

    res.status(201).json(board);
  } catch (err) {
    console.error("🔥 Error adding card:", err);
    res.status(500).json({ message: "Failed to add card", error: err.message });
  }
});

// ✅ Update list title
router.put("/:boardId/lists/:listId", async (req, res) => {
  try {
    const { boardId, listId } = req.params;
    const { title } = req.body;

    if (!mongoose.Types.ObjectId.isValid(boardId) || !mongoose.Types.ObjectId.isValid(listId)) {
      return res.status(400).json({ message: "Invalid board or list ID" });
    }

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const list = board.lists.id(listId) || board.lists.find(l => l._id.toString() === listId);
    if (!list) return res.status(404).json({ message: "List not found" });

    list.title = title;
    await board.save();

    res.json(board);
  } catch (err) {
    console.error("🔥 Error updating list:", err);
    res.status(500).json({ message: "Failed to update list" });
  }
});

// ✅ Delete list
router.delete("/:boardId/lists/:listId", async (req, res) => {
  try {
    const { boardId, listId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(boardId) || !mongoose.Types.ObjectId.isValid(listId)) {
      return res.status(400).json({ message: "Invalid board or list ID" });
    }

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    board.lists = board.lists.filter(l => l._id.toString() !== listId);
    await board.save();

    res.json(board);
  } catch (err) {
    console.error("🔥 Error deleting list:", err);
    res.status(500).json({ message: "Failed to delete list" });
  }
});

// ✅ Update card
router.put("/:boardId/lists/:listId/cards/:cardId", async (req, res) => {
  try {
    const { boardId, listId, cardId } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(boardId) || !mongoose.Types.ObjectId.isValid(listId) || !mongoose.Types.ObjectId.isValid(cardId)) {
      return res.status(400).json({ message: "Invalid IDs" });
    }

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const list = board.lists.id(listId) || board.lists.find(l => l._id.toString() === listId);
    if (!list) return res.status(404).json({ message: "List not found" });

    const card = list.cards.id(cardId) || list.cards.find(c => c._id.toString() === cardId);
    if (!card) return res.status(404).json({ message: "Card not found" });

    // Update card fields with proper date handling
    Object.assign(card, updates);
    
    // ✅ Handle card due date properly
    if (updates.dueDate !== undefined) {
      card.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
    }
    
    if (updates.memberDeadlines) {
      card.memberDeadlines = updates.memberDeadlines;
    }
    if (updates.memberEventIds) {
      card.memberEventIds = updates.memberEventIds;
    }
    await board.save();

    res.json(board);
  } catch (err) {
    console.error("🔥 Error updating card:", err);
    res.status(500).json({ message: "Failed to update card" });
  }
});


// ✅ Delete card
router.delete("/:boardId/lists/:listId/cards/:cardId", async (req, res) => {
  try {
    const { boardId, listId, cardId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(boardId) || !mongoose.Types.ObjectId.isValid(listId) || !mongoose.Types.ObjectId.isValid(cardId)) {
      return res.status(400).json({ message: "Invalid IDs" });
    }

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const list = board.lists.id(listId) || board.lists.find(l => l._id.toString() === listId);
    if (!list) return res.status(404).json({ message: "List not found" });

    list.cards = list.cards.filter(c => c._id.toString() !== cardId);
    await board.save();

    res.json(board);
  } catch (err) {
    console.error("🔥 Error deleting card:", err);
    res.status(500).json({ message: "Failed to delete card" });
  }
});

// ✅ Move card (drag and drop)
router.put("/:boardId/lists/:fromListId/cards/:cardId/move", async (req, res) => {
  try {
    const { boardId, fromListId, cardId } = req.params;
    const { toListId, newIndex } = req.body;

    if (!mongoose.Types.ObjectId.isValid(boardId) || 
        !mongoose.Types.ObjectId.isValid(fromListId) || 
        !mongoose.Types.ObjectId.isValid(cardId) ||
        !mongoose.Types.ObjectId.isValid(toListId)) {
      return res.status(400).json({ message: "Invalid IDs" });
    }

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const fromList = board.lists.id(fromListId) || board.lists.find(l => l._id.toString() === fromListId);
    const toList = board.lists.id(toListId) || board.lists.find(l => l._id.toString() === toListId);

    if (!fromList || !toList) {
      return res.status(404).json({ message: "List not found" });
    }

    // Find and remove the card from the source list
    const cardIndex = fromList.cards.findIndex(c => c._id.toString() === cardId);
    if (cardIndex === -1) {
      return res.status(404).json({ message: "Card not found" });
    }

    const [card] = fromList.cards.splice(cardIndex, 1);

    // Add the card to the destination list at the specified index
    toList.cards.splice(newIndex, 0, card);

    await board.save();
    res.json(board);
  } catch (err) {
    console.error("🔥 Error moving card:", err);
    res.status(500).json({ message: "Failed to move card" });
  }
});


// ✅ Update board members
router.put("/:id/members", async (req, res) => {
  try {
    const { members } = req.body;
    const board = await Board.findById(req.params.id);
    
    if (!board) return res.status(404).json({ message: "Board not found" });
    
    board.members = members;
    await board.save();
    
    // ✅ FIXED: Return board wrapped in object to match frontend expectations
    res.status(200).json({ board, message: "Members updated successfully" });
  } catch (error) {
    console.error("❌ Error updating board members:", error);
    res.status(500).json({ message: "Server error updating members" });
  }
});


export default router;
