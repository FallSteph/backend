import mongoose from "mongoose";
import crypto from "crypto";
import sendEmail from "../utils/sendEmail.js";
import Board from "../models/Board.js";
import Notification from "../models/Notification.js";
import { logBoardAction } from "../utils/log.js";

// ✅ Get all boards
export const getAllBoards = async (req, res) => {
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
    
    // Log the view action
    const loggingUserEmail = req.userForLogging?.email || userEmail;
    const loggingUserId = req.userForLogging?._id;
    
    if (loggingUserEmail || loggingUserId) {
      await logBoardAction({
        userId: loggingUserId,
        userEmail: loggingUserEmail,
        action: 'view_boards',
        description: `User viewed ${boards.length} boards`,
        boardId: null,
        metadata: { 
          count: boards.length, 
          filter: { deleted, userEmail },
          boardIds: boards.map(b => b._id),
          userEmail: loggingUserEmail
        },
        req
      });
    } else {
      console.warn('No user info available for logging board view');
    }
    
    res.json(boards);
  } catch (err) {
    console.error(err);

    const loggingUserEmail = req.userForLogging?.email || req.query?.userEmail;
    const loggingUserId = req.userForLogging?._id;
    
    if (loggingUserEmail || loggingUserId) {
      await logBoardAction({
        userId: loggingUserId,
        userEmail: loggingUserEmail,
        action: 'view_boards_error',
        description: `Error fetching boards: ${err.message}`,
        boardId: null,
        metadata: { 
          error: err.message,
          userEmail: loggingUserEmail
        },
        req
      });
    }
    
    res.status(500).json({ message: "Failed to fetch boards" });
  }
};

// ✅ Reorder lists
export const reorderLists = async (req, res) => {
  try {
    const { id } = req.params;
    const { lists, listOrder } = req.body;

    console.log('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥');
    console.log('🔥 BACKEND REORDER LISTS - START');
    console.log('🔥 Request body:', JSON.stringify(req.body, null, 2));
    console.log('🔥 Board ID from params:', id);
    console.log('🔥 Has listOrder?', !!listOrder, 'Type:', typeof listOrder);
    console.log('🔥 Has lists?', !!lists, 'Type:', typeof lists);

    if (listOrder) {
      console.log('🔥 listOrder value:', listOrder);
      console.log('🔥 listOrder is array?', Array.isArray(listOrder));
      console.log('🔥 listOrder length:', Array.isArray(listOrder) ? listOrder.length : 'N/A');
      if (Array.isArray(listOrder)) {
        listOrder.forEach((item, idx) => {
          console.log(`🔥 listOrder[${idx}]:`, item, 'Type:', typeof item);
          if (item && typeof item === 'object') {
            console.log(`🔥   Object keys:`, Object.keys(item));
          }
        });
      }
    }

    // Validate board ID format
    if (!id) {
      console.log('❌ ERROR: No board ID provided');
      return res.status(400).json({ message: "Board ID required" });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.log('❌ ERROR: Invalid board ID format:', id);
      return res.status(400).json({ message: "Invalid board ID format" });
    }

    // Try to find the board
    console.log('🔥 Searching for board with ID:', id);
    const board = await Board.findById(id);
    
    if (!board) {
      console.log('❌ ERROR: Board not found in database');
      console.log('🔥 Searched for ID:', id);
      console.log('🔥 Board IDs in database:', (await Board.find({}, '_id')).map(b => b._id));
      return res.status(404).json({ message: "Board not found" });
    }

    console.log('✅ Board found:', board.title);
    console.log('🔥 Board has lists:', board.lists.length);
    board.lists.forEach((list, idx) => {
      console.log(`🔥 List ${idx}:`, {
        _id: list._id,
        _idString: list._id ? list._id.toString() : 'null',
        title: list.title,
        cards: list.cards.length
      });
    });

    // Process listOrder
    let raw = null;
    
    if (Array.isArray(listOrder)) {
      raw = listOrder;
      console.log('🔥 Using listOrder array');
    } else if (Array.isArray(lists)) {
      raw = lists;
      console.log('🔥 Using lists array');
    } else {
      console.log('❌ ERROR: No valid array found in request');
      return res.status(400).json({ message: "listOrder (array) required" });
    }

    if (!raw || raw.length === 0) {
      console.log('❌ ERROR: Empty array');
      return res.status(400).json({ message: "listOrder array cannot be empty" });
    }

    console.log('🔥 Raw data to process:', raw);
    console.log('🔥 Raw data type:', typeof raw[0]);

    // Extract list IDs
    const listIds = raw.map((item, idx) => {
      let extractedId = null;
      
      if (typeof item === 'string') {
        extractedId = item;
        console.log(`🔥 [${idx}] String:`, extractedId);
      } else if (item && typeof item === 'object') {
        extractedId = item.listId || item._id || item.id;
        console.log(`🔥 [${idx}] Object:`, {
          item,
          listId: item.listId,
          _id: item._id,
          id: item.id,
          extracted: extractedId
        });
      } else {
        console.log(`🔥 [${idx}] Unknown type:`, typeof item, 'value:', item);
      }
      
      return extractedId;
    }).filter(Boolean);

    console.log('🔥 Extracted list IDs:', listIds);

    if (listIds.length === 0) {
      console.log('❌ ERROR: No valid IDs extracted');
      return res.status(400).json({ message: "listOrder must contain valid list ids" });
    }

    // Validate each list ID
    const invalidIds = listIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      console.log('❌ ERROR: Invalid MongoDB IDs found:', invalidIds);
      return res.status(400).json({ 
        message: "Invalid list ID format", 
        invalidIds: invalidIds 
      });
    }

    // Check if all list IDs exist in the board
    const existingListIds = board.lists.map(list => list._id.toString());
    console.log('🔥 Existing list IDs in board:', existingListIds);
    
    const missingIds = listIds.filter(id => !existingListIds.includes(id));
    if (missingIds.length > 0) {
      console.log('❌ ERROR: Some list IDs not found in board:', missingIds);
      console.log('🔥 Comparing:');
      listIds.forEach(id => {
        const found = existingListIds.includes(id);
        console.log(`🔥   ${id}: ${found ? '✓ FOUND' : '✗ NOT FOUND'}`);
      });
      return res.status(400).json({ 
        message: "Some list IDs not found in board",
        missingIds: missingIds 
      });
    }

    console.log('✅ All list IDs validated successfully');

    // Create order map
    const orderMap = new Map(listIds.map((lid, idx) => [String(lid), idx]));
    console.log('🔥 Order map:', Array.from(orderMap.entries()));

    // Sort lists
    board.lists.sort((a, b) => {
      const aId = a._id ? a._id.toString() : a.id;
      const bId = b._id ? b._id.toString() : b.id;
      
      const aIdx = orderMap.get(aId);
      const bIdx = orderMap.get(bId);
      
      console.log(`🔥 Sorting: ${a.title} (${aId}) = ${aIdx}, ${b.title} (${bId}) = ${bIdx}`);
      
      return (aIdx ?? Number.MAX_SAFE_INTEGER) - (bIdx ?? Number.MAX_SAFE_INTEGER);
    });

    console.log('🔥 After sorting:');
    board.lists.forEach((list, idx) => {
      console.log(`🔥   ${idx}: ${list.title} (${list._id})`);
    });

    await board.save();
    
    console.log('✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅');
    console.log('✅ SUCCESS: List order saved');
    console.log('🔥 Saved board ID:', board._id);
    console.log('🔥 Number of lists:', board.lists.length);
    
    return res.json({
      success: true,
      message: "Lists reordered successfully",
      board: {
        _id: board._id,
        title: board.title,
        lists: board.lists.map((list, idx) => ({
          position: idx,
          _id: list._id,
          title: list.title,
          cards: list.cards.length
        }))
      }
    });
    
  } catch (err) {
    console.error('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥');
    console.error('🔥 FATAL ERROR in reorderLists:', err.message);
    console.error('🔥 Error stack:', err.stack);
    console.error('🔥 Full error object:', err);
    return res.status(500).json({ 
      message: "Failed to reorder lists", 
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};


// ✅ Log board activity
export const logBoardActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, details, performedBy, performedByName } = req.body;

    if (!action) {
      return res.status(400).json({ message: "Action is required" });
    }

    const board = await Board.findById(id);
    if (!board) {
      return res.status(404).json({ message: "Board not found" });
    }

    // Initialize activities array if it doesn't exist
    if (!board.activities) {
      board.activities = [];
    }

    const activity = {
      _id: new mongoose.Types.ObjectId(),
      action,
      details,
      performedBy,
      performedByName,
      timestamp: new Date()
    };

    board.activities.push(activity);
    
    // Keep only last 100 activities to prevent bloating
    if (board.activities.length > 100) {
      board.activities = board.activities.slice(-100);
    }
    
    await board.save();

    res.status(201).json({ 
      success: true, 
      message: "Activity logged", 
      activity 
    });
  } catch (err) {
    console.error("🔥 Error logging activity:", err);
    res.status(500).json({ message: "Failed to log activity" });
  }
};

// ✅ Get board activities
export const getBoardActivities = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;

    const board = await Board.findById(id);
    if (!board) {
      return res.status(404).json({ message: "Board not found" });
    }

    const activities = (board.activities || [])
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, parseInt(limit));

    res.json(activities);
  } catch (err) {
    console.error("🔥 Error fetching activities:", err);
    res.status(500).json({ message: "Failed to fetch activities" });
  }
};

// ✅ Get single board
export const getSingleBoard = async (req, res) => {
  try {
    const { id } = req.params;
    const board = await Board.findById(id);
    
    if (!board) {
      // Log board not found
      if (req.userForLogging) {
        await logBoardAction({
          userId: req.userForLogging._id,
          userEmail: req.userForLogging.email,
          action: 'view_board_failed',
          description: `Board not found: ${id}`,
          boardId: id,
          metadata: { reason: 'not_found' },
          req
        });
      }
      return res.status(404).json({ message: "Board not found" });
    }
    
    // Log successful view
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'view_board',
        description: `Viewed board: ${board.title}`,
        boardId: id,
        metadata: { 
          boardTitle: board.title,
          memberCount: board.members?.length || 0,
          listCount: board.lists?.length || 0 
        },
        req
      });
    }
    
    res.json(board);
  } catch (err) {
    console.error(err);
    
    // Log error
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'view_board_error',
        description: `Error viewing board: ${err.message}`,
        boardId: req.params.id,
        metadata: { error: err.message },
        req
      });
    }
    
    res.status(500).json({ message: "Failed to fetch board" });
  }
};

// ✅ Create a board
export const createBoard = async (req, res) => {
  try {
    const { title, description, userEmail } = req.body;
    if (!title || !userEmail) {
      // Log validation error
      if (req.userForLogging) {
        await logBoardAction({
          userId: req.userForLogging._id,
          userEmail: userEmail || req.userForLogging.email,
          action: 'create_board_failed',
          description: `Missing required fields for board creation`,
          boardId: null,
          metadata: { reason: 'validation', missing: !title ? 'title' : 'userEmail' },
          req
        });
      }
      return res.status(400).json({ message: "Missing required fields" });
    }

    const newBoard = await Board.create({ title, description, userEmail });
    
    // Log successful creation
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: userEmail,
        action: 'create_board',
        description: `Created new board: ${title}`,
        boardId: newBoard._id,
        metadata: { 
          boardTitle: title,
          description,
          members: newBoard.members?.length || 0
        },
        req
      });
    }
    
    res.status(201).json(newBoard);
  } catch (err) {
    console.error(err);
    
    // Log error
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.body.userEmail || req.userForLogging.email,
        action: 'create_board_error',
        description: `Error creating board: ${err.message}`,
        boardId: null,
        metadata: { error: err.message, boardData: req.body },
        req
      });
    }
    
    res.status(500).json({ message: "Failed to create board" });
  }
};

// ✅ Update board
export const updateBoard = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    
    // ✅ Handle board-level due date properly
    if (updateData.dueDate !== undefined) {
      updateData.dueDate = updateData.dueDate ? new Date(updateData.dueDate) : null;
    }
    
    // Get old board data for comparison
    const oldBoard = await Board.findById(id);
    if (!oldBoard) {
      // Log board not found
      if (req.userForLogging) {
        await logBoardAction({
          userId: req.userForLogging._id,
          userEmail: req.userForLogging.email,
          action: 'update_board_failed',
          description: `Board not found for update: ${id}`,
          boardId: id,
          metadata: { reason: 'not_found' },
          req
        });
      }
      return res.status(404).json({ message: "Board not found" });
    }
    
    const updated = await Board.findByIdAndUpdate(id, updateData, { new: true });
    
    // Log update action
    if (req.userForLogging) {
      const changedFields = [];
      if (oldBoard.title !== updated.title) changedFields.push('title');
      if (oldBoard.description !== updated.description) changedFields.push('description');
      if (oldBoard.dueDate?.toString() !== updated.dueDate?.toString()) changedFields.push('dueDate');
      if (oldBoard.color !== updated.color) changedFields.push('color');
      
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'update_board',
        description: `Updated board: ${updated.title}`,
        boardId: id,
        metadata: { 
          boardTitle: updated.title,
          changedFields,
          oldData: {
            title: oldBoard.title,
            description: oldBoard.description,
            dueDate: oldBoard.dueDate,
            color: oldBoard.color
          },
          newData: {
            title: updated.title,
            description: updated.description,
            dueDate: updated.dueDate,
            color: updated.color
          }
        },
        req
      });
    }
    
    res.json(updated);
  } catch (err) {
    console.error(err);
    
    // Log error
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'update_board_error',
        description: `Error updating board: ${err.message}`,
        boardId: req.params.id,
        metadata: { error: err.message, updateData: req.body },
        req
      });
    }
    
    res.status(500).json({ message: "Failed to update board" });
  }
};

// ✅ Soft delete (move to Recycle Bin)
export const softDeleteBoard = async (req, res) => {
  try {
    const { id } = req.params;
    const board = await Board.findById(id);
    
    if (!board) {
      // Log board not found
      if (req.userForLogging) {
        await logBoardAction({
          userId: req.userForLogging._id,
          userEmail: req.userForLogging.email,
          action: 'soft_delete_board_failed',
          description: `Board not found for deletion: ${id}`,
          boardId: id,
          metadata: { reason: 'not_found' },
          req
        });
      }
      return res.status(404).json({ message: "Board not found" });
    }

    board.deleted = true;
    board.deletedAt = new Date();
    await board.save();

    // Log soft delete
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'soft_delete_board',
        description: `Moved board to Recycle Bin: ${board.title}`,
        boardId: id,
        metadata: { 
          boardTitle: board.title,
          deletedAt: board.deletedAt,
          hadLists: board.lists?.length || 0,
          hadMembers: board.members?.length || 0 
        },
        req
      });
    }

    res.json({ message: "Board moved to Recycle Bin", board });
  } catch (err) {
    console.error(err);
    
    // Log error
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'soft_delete_board_error',
        description: `Error moving board to Recycle Bin: ${err.message}`,
        boardId: req.params.id,
        metadata: { error: err.message },
        req
      });
    }
    
    res.status(500).json({ message: "Failed to move board to Recycle Bin" });
  }
};

// ✅ Permanently delete board
export const permanentlyDeleteBoard = async (req, res) => {
  try {
    const { id } = req.params;

    const board = await Board.findById(id);
    if (!board) {
      // Log board not found
      if (req.userForLogging) {
        await logBoardAction({
          userId: req.userForLogging._id,
          userEmail: req.userForLogging.email,
          action: 'permanent_delete_board_failed',
          description: `Board not found for permanent deletion: ${id}`,
          boardId: id,
          metadata: { reason: 'not_found' },
          req
        });
      }
      return res.status(404).json({ message: "Board not found" });
    }

    // Log before deletion
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'permanent_delete_board',
        description: `Permanently deleted board: ${board.title}`,
        boardId: id,
        metadata: { 
          boardTitle: board.title,
          listsCount: board.lists?.length || 0,
          cardsCount: board.lists?.reduce((acc, list) => acc + (list.cards?.length || 0), 0) || 0,
          membersCount: board.members?.length || 0,
          wasSoftDeleted: board.deleted || false
        },
        req
      });
    }

    const deletedBoard = await Board.findByIdAndDelete(id);

    res.json({ message: "Board permanently deleted", board: deletedBoard });
  } catch (err) {
    console.error(err);
    
    // Log error
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'permanent_delete_board_error',
        description: `Error permanently deleting board: ${err.message}`,
        boardId: req.params.id,
        metadata: { error: err.message },
        req
      });
    }
    
    res.status(500).json({ message: "Failed to permanently delete board" });
  }
};

// ✅ Restore board from Recycle Bin
export const restoreBoard = async (req, res) => {
  try {
    const { id } = req.params;
    const board = await Board.findById(id);
    
    if (!board) {
      // Log board not found
      if (req.userForLogging) {
        await logBoardAction({
          userId: req.userForLogging._id,
          userEmail: req.userForLogging.email,
          action: 'restore_board_failed',
          description: `Board not found for restoration: ${id}`,
          boardId: id,
          metadata: { reason: 'not_found' },
          req
        });
      }
      return res.status(404).json({ message: "Board not found" });
    }

    const deletedAt = board.deletedAt;

    board.deleted = false;
    board.deletedAt = null;
    await board.save();

    // Log restoration
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'restore_board',
        description: `Restored board from Recycle Bin: ${board.title}`,
        boardId: id,
        metadata: { 
          boardTitle: board.title,
          wasDeletedFor: deletedAt ? Math.floor((Date.now() - deletedAt) / (1000 * 60 * 60 * 24)) + ' days' : 'unknown'
        },
        req
      });
    }

    res.json({ message: "Board restored successfully", board });
  } catch (err) {
    console.error(err);
    
    // Log error
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'restore_board_error',
        description: `Error restoring board: ${err.message}`,
        boardId: req.params.id,
        metadata: { error: err.message },
        req
      });
    }
    
    res.status(500).json({ message: "Failed to restore board" });
  }
};

// ✅ Cleanup old soft-deleted boards
export const cleanupExpiredBoards = async (req, res) => {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const boardsToDelete = await Board.find({
      deleted: true,
      deletedAt: { $lte: oneWeekAgo },
    });

    // Log each board being deleted
    if (req.userForLogging && boardsToDelete.length > 0) {
      for (const board of boardsToDelete) {
        await logBoardAction({
          userId: req.userForLogging._id,
          userEmail: req.userForLogging.email,
          action: 'auto_delete_expired_board',
          description: `Auto-deleted expired board: ${board.title}`,
          boardId: board._id,
          metadata: { 
            boardTitle: board.title,
            deletedAt: board.deletedAt,
            ageInDays: Math.floor((Date.now() - board.deletedAt) / (1000 * 60 * 60 * 24))
          },
          req
        });
      }
    }

    const result = await Board.deleteMany({
      deleted: true,
      deletedAt: { $lte: oneWeekAgo },
    });

    // Log cleanup summary
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'cleanup_boards',
        description: `Cleaned up ${result.deletedCount} expired boards`,
        boardId: null,
        metadata: { 
          deletedCount: result.deletedCount,
          cutoffDate: oneWeekAgo,
          deletedBoardIds: boardsToDelete.map(b => b._id)
        },
        req
      });
    }

    res.json({ message: "Old deleted boards permanently removed", result });
  } catch (err) {
    console.error(err);

    // Log error
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'cleanup_boards_error',
        description: `Error cleaning up boards: ${err.message}`,
        boardId: null,
        metadata: { error: err.message },
        req
      });
    }

    res.status(500).json({ message: "Failed to clean up boards" });
  }
};

// ✅ Add a list to a board
export const addListToBoard = async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid board ID" });
    }

    if (!title) {
      // Log validation error
      if (req.userForLogging) {
        await logBoardAction({
          userId: req.userForLogging._id,
          userEmail: req.userForLogging.email,
          action: 'create_list_failed',
          description: `Missing list title`,
          boardId: id,
          metadata: { reason: 'validation', missing: 'title' },
          req
        });
      }
      return res.status(400).json({ message: "List title required" });
    }

    const board = await Board.findById(id);
    if (!board) {
      // Log board not found
      if (req.userForLogging) {
        await logBoardAction({
          userId: req.userForLogging._id,
          userEmail: req.userForLogging.email,
          action: 'create_list_failed',
          description: `Board not found for list creation: ${id}`,
          boardId: id,
          metadata: { reason: 'not_found' },
          req
        });
      }
      return res.status(404).json({ message: "Board not found" });
    }

    const newList = {
      _id: new mongoose.Types.ObjectId(),
      title,
      cards: [],
    };

    board.lists = board.lists || [];
    board.lists.push(newList);
    await board.save();

    // Log list creation
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'create_list',
        description: `Created new list: ${title}`,
        boardId: id,
        metadata: { 
          boardTitle: board.title,
          listTitle: title,
          listId: newList._id,
          totalLists: board.lists.length
        },
        req
      });
    }

    res.status(201).json(board);
  } catch (err) {
    console.error("🔥 Error adding list:", err);

    // Log error
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'create_list_error',
        description: `Error creating list: ${err.message}`,
        boardId: req.params.id,
        metadata: { error: err.message, listData: req.body },
        req
      });
    }

    res.status(500).json({ message: "Internal server error", error: err.message });
  }
};

// ✅ Add a card to a list
// ✅ Add a card to a list
export const addCardToList = async (req, res) => {
  try {
    const { boardId, listId } = req.params;
    const { title, description, dueDate, assignedMembers, attachments, comments } = req.body; // ✅ Added attachments and comments

    // 🔍 Validate IDs
    if (!mongoose.Types.ObjectId.isValid(boardId) || !mongoose.Types.ObjectId.isValid(listId)) {
      return res.status(400).json({ message: "Invalid board or list ID" });
    }

    const board = await Board.findById(boardId);
    if (!board) {
      if (req.userForLogging) {
        await logBoardAction({
          userId: req.userForLogging._id,
          userEmail: req.userForLogging.email,
          action: 'create_card_failed',
          description: `Board not found for card creation: ${boardId}`,
          boardId: boardId,
          metadata: { reason: 'not_found' },
          req
        });
      }
      return res.status(404).json({ message: "Board not found" });
    }

    const list = board.lists.id(listId) || board.lists.find(l => l._id.toString() === listId);
    if (!list) {
      if (req.userForLogging) {
        await logBoardAction({
          userId: req.userForLogging._id,
          userEmail: req.userForLogging.email,
          action: 'create_card_failed',
          description: `List not found for card creation: ${listId}`,
          boardId: boardId,
          metadata: { reason: 'list_not_found' },
          req
        });
      }
      return res.status(404).json({ message: "List not found" });
    }

    // ✅ FIX: Properly handle attachments and comments
    let processedAttachments = [];
    if (attachments && Array.isArray(attachments)) {
      processedAttachments = attachments.map(att => {
        if (typeof att === 'string') {
          return {
            id: crypto.randomUUID(),
            name: att,
            url: '',
            webViewLink: '',
            uploadedBy: board.userEmail || 'unknown',
            uploadedAt: new Date()
          };
        }
        // Handle object attachments
        return {
          id: att.id || att.driveId || crypto.randomUUID(),
          name: att.name || 'unknown',
          url: att.url || '',
          webViewLink: att.webViewLink || '',
          uploadedBy: att.uploadedBy || board.userEmail || 'unknown',
          uploadedAt: att.uploadedAt || new Date()
        };
      });
    }

    const newCard = {
      _id: new mongoose.Types.ObjectId(),
      title,
      description: description || "",
      dueDate: dueDate ? new Date(dueDate) : null,
      labels: [],
      assignedMembers: assignedMembers || [],
      attachments: processedAttachments, // ✅ Now includes attachments
      comments: comments || [], // ✅ Now includes comments
    };

    list.cards.push(newCard);
    await board.save();

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'create_card',
        description: `Created new card: ${title}`,
        boardId: boardId,
        metadata: { 
          boardTitle: board.title,
          listTitle: list.title,
          cardTitle: title,
          cardId: newCard._id,
          hasDueDate: !!dueDate,
          assignedCount: newCard.assignedMembers?.length || 0,
          attachmentCount: newCard.attachments?.length || 0,
          commentCount: newCard.comments?.length || 0,
          listCardsCount: list.cards.length
        },
        req
      });
    }

    // ✅ Create notifications for assigned members
    if (newCard.assignedMembers && newCard.assignedMembers.length > 0) {
      for (const member of newCard.assignedMembers) {
        // Handle both string array and object array
        const memberEmail = typeof member === 'string' ? member : member.email;
        
        if (memberEmail) {
          await Notification.create({
            userEmail: memberEmail,
            title: "New Card Assigned",
            message: `You were assigned to "${newCard.title}"${
              newCard.dueDate ? " with a deadline on " + new Date(newCard.dueDate).toLocaleDateString() : ""
            }.`,
            read: false,
            createdAt: new Date(),
          });

          const subject = `You've been assigned to a new card: ${newCard.title}`;
          const bodyText = `You were assigned to "${newCard.title}"${
            newCard.dueDate ? " with a deadline on " + new Date(newCard.dueDate).toLocaleDateString() : ""
          }.`;
          const bodyHTML = `
            <h3>New Card Assigned</h3>
            <p>You've been assigned to <strong>${newCard.title}</strong>${
              newCard.dueDate ? ` with a deadline on <strong>${new Date(newCard.dueDate).toLocaleDateString()}</strong>` : ""
            }.</p>
            <p>Check your board in Nexora for more details.</p>
          `;

          try {
            await sendEmail(memberEmail, subject, bodyText, bodyHTML);

            if (req.userForLogging) {
              await logBoardAction({
                userId: req.userForLogging._id,
                userEmail: req.userForLogging.email,
                action: 'send_assignment_notification',
                description: `Sent assignment notification for card: ${title}`,
                boardId: boardId,
                metadata: { cardTitle: title, recipient: memberEmail, notificationType: 'email' },
                req
              });
            }
          } catch (err) {
            console.error(`❌ Failed to send email to ${memberEmail}:`, err.message);
            if (req.userForLogging) {
              await logBoardAction({
                userId: req.userForLogging._id,
                userEmail: req.userForLogging.email,
                action: 'notification_send_failed',
                description: `Failed to send assignment notification for card: ${title}`,
                boardId: boardId,
                metadata: { cardTitle: title, recipient: memberEmail, error: err.message },
                req
              });
            }
          }
        }
      }
    }

    res.status(201).json(board);
  } catch (err) {
    console.error("🔥 Error adding card:", err);
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'create_card_error',
        description: `Error creating card: ${err.message}`,
        boardId: req.params.boardId,
        metadata: { error: err.message, cardData: req.body },
        req
      });
    }
    res.status(500).json({ message: "Failed to add card", error: err.message });
  }
};

// ✅ Update list title
export const updateListTitle = async (req, res) => {
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

    const oldTitle = list.title;
    list.title = title;
    await board.save();

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'update_list',
        description: `Updated list title from "${oldTitle}" to "${title}"`,
        boardId: boardId,
        metadata: { 
          boardTitle: board.title,
          listId: listId,
          oldTitle,
          newTitle: title
        },
        req
      });
    }

    res.json(board);
  } catch (err) {
    console.error("🔥 Error updating list:", err);
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'update_list_error',
        description: `Error updating list: ${err.message}`,
        boardId: req.params.boardId,
        metadata: { error: err.message, updateData: req.body },
        req
      });
    }
    res.status(500).json({ message: "Failed to update list" });
  }
};

// ✅ Delete list
export const deleteList = async (req, res) => {
  try {
    const { boardId, listId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(boardId) || !mongoose.Types.ObjectId.isValid(listId)) {
      return res.status(400).json({ message: "Invalid board or list ID" });
    }

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const listToDelete = board.lists.find(l => l._id.toString() === listId);
    if (!listToDelete) return res.status(404).json({ message: "List not found" });

    const cardsCount = listToDelete.cards?.length || 0;
    
    board.lists = board.lists.filter(l => l._id.toString() !== listId);
    await board.save();

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'delete_list',
        description: `Deleted list: ${listToDelete.title} with ${cardsCount} cards`,
        boardId: boardId,
        metadata: { 
          boardTitle: board.title,
          listTitle: listToDelete.title,
          listId: listId,
          cardsDeleted: cardsCount,
          remainingLists: board.lists.length
        },
        req
      });
    }

    res.json(board);
  } catch (err) {
    console.error("🔥 Error deleting list:", err);
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'delete_list_error',
        description: `Error deleting list: ${err.message}`,
        boardId: req.params.boardId,
        metadata: { error: err.message },
        req
      });
    }
    res.status(500).json({ message: "Failed to delete list" });
  }
};

const findCardInBoard = (board, cardId) => {
  for (const list of board.lists || []) {
    const card =
      list.cards?.id?.(cardId) || list.cards?.find?.((c) => c._id?.toString() === cardId);
    if (card) return { list, card };
  }
  return null;
};

// ✅ GET attachments by cardId (no listId in URL)
export const getCardAttachments = async (req, res) => {
  try {
    const { boardId, cardId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(boardId) || !mongoose.Types.ObjectId.isValid(cardId)) {
      return res.status(400).json({ message: "Invalid IDs" });
    }

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const hit = findCardInBoard(board, cardId);
    if (!hit) return res.status(404).json({ message: "Card not found" });

    return res.json(hit.card.attachments || []);
  } catch (err) {
    console.error("🔥 Error fetching attachments:", err);
    return res.status(500).json({ message: "Failed to fetch attachments" });
  }
};

// ✅ POST attachment by cardId (no listId in URL)
export const addCardAttachmentByCardId = async (req, res) => {
  try {
    const { boardId, cardId } = req.params;
    const attachment = req.body;

    if (!mongoose.Types.ObjectId.isValid(boardId) || !mongoose.Types.ObjectId.isValid(cardId)) {
      return res.status(400).json({ message: "Invalid IDs" });
    }

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const hit = findCardInBoard(board, cardId);
    if (!hit) return res.status(404).json({ message: "Card not found" });

    const newAttachment = {
      id: crypto.randomUUID(),
      name: attachment.name,
      // keep URL even if client sends driveUrl
      url: attachment.url || attachment.driveUrl || "",
      webViewLink: attachment.webViewLink || attachment.url || attachment.driveUrl || "",
      driveId: attachment.driveId || attachment.id,
      driveUrl: attachment.driveUrl || attachment.url,
      size: attachment.size,
      type: attachment.type,
      uploadedBy: req.userForLogging?.email || "unknown",
      uploadedAt: new Date(),
    };

    hit.card.attachments = hit.card.attachments || [];
    hit.card.attachments.push(newAttachment);
    await board.save();

    return res.status(201).json(board);
  } catch (err) {
    console.error("🔥 Error adding attachment:", err);
    return res.status(500).json({ message: "Failed to add attachment" });
  }
};

// ✅ DELETE attachment by cardId (no listId in URL)
export const deleteCardAttachmentByCardId = async (req, res) => {
  try {
    const { boardId, cardId, attachmentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(boardId) || !mongoose.Types.ObjectId.isValid(cardId)) {
      return res.status(400).json({ message: "Invalid IDs" });
    }

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const hit = findCardInBoard(board, cardId);
    if (!hit) return res.status(404).json({ message: "Card not found" });

    hit.card.attachments = (hit.card.attachments || []).filter((a) => a.id !== attachmentId);
    await board.save();

    return res.json(board);
  } catch (err) {
    console.error("🔥 Error deleting attachment:", err);
    return res.status(500).json({ message: "Failed to delete attachment" });
  }
};


// ✅ Update card
export const updateCard = async (req, res) => {
  try {
    const { boardId, listId, cardId } = req.params;
    const updates = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(boardId) ||
      !mongoose.Types.ObjectId.isValid(listId) ||
      !mongoose.Types.ObjectId.isValid(cardId)
    ) {
      return res.status(400).json({ message: "Invalid IDs" });
    }

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const list = board.lists.id(listId) || board.lists.find(l => l._id.toString() === listId);
    if (!list) return res.status(404).json({ message: "List not found" });

    const card = list.cards.id(cardId) || list.cards.find(c => c._id.toString() === cardId);
    if (!card) return res.status(404).json({ message: "Card not found" });

    

    // Store old card data for comparison
    const oldCardData = {
      title: card.title,
      description: card.description,
      dueDate: card.dueDate,
      status: card.status,
      labels: [...(card.labels || [])],
      assignedMembers: [...(card.assignedMembers || [])]
    };


    

    // ✅ Validate and transform attachments before assignment
if (updates.attachments !== undefined) {
  if (typeof updates.attachments === 'string') {
    updates.attachments = [{
      id: crypto.randomUUID(),
      name: updates.attachments,
      url: '',
      webViewLink: '',
      uploadedBy: board.userEmail || 'unknown',
      uploadedAt: new Date()
    }];
  } else if (Array.isArray(updates.attachments)) {
    // Handle both string array and object array
    updates.attachments = updates.attachments.map(att => {
      if (typeof att === 'string') {
        return {
          id: crypto.randomUUID(),
          name: att,
          url: '',
          webViewLink: '',
          uploadedBy: board.userEmail || 'unknown',
          uploadedAt: new Date()
        };
      }
      return {
        id: att.id || crypto.randomUUID(),
        name: att.name || 'unknown',
        url: att.url || '',
        webViewLink: att.webViewLink || '',
        uploadedBy: att.uploadedBy || board.userEmail || 'unknown',
        uploadedAt: att.uploadedAt || new Date()
      };
    });
  }
}

    // ✅ Update card fields with proper validation
    Object.assign(card, updates);
    if (updates.dueDate !== undefined) card.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
    if (updates.memberDeadlines) card.memberDeadlines = updates.memberDeadlines;
    if (updates.memberEventIds) card.memberEventIds = updates.memberEventIds;

    await board.save();
    
    // Log card update
    if (req.userForLogging) {
      const changedFields = [];
      if (oldCardData.title !== card.title) changedFields.push('title');
      if (oldCardData.description !== card.description) changedFields.push('description');
      if (oldCardData.dueDate?.toString() !== card.dueDate?.toString()) changedFields.push('dueDate');
      if (oldCardData.status !== card.status) changedFields.push('status');
      if (JSON.stringify(oldCardData.labels) !== JSON.stringify(card.labels)) changedFields.push('labels');
      if (JSON.stringify(oldCardData.assignedMembers) !== JSON.stringify(card.assignedMembers)) changedFields.push('assignedMembers');
      
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'update_card',
        description: `Updated card: ${card.title}`,
        boardId: boardId,
        metadata: { 
          boardTitle: board.title,
          listTitle: list.title,
          cardTitle: card.title,
          cardId: cardId,
          changedFields,
          oldData: oldCardData,
          newData: {
            title: card.title,
            description: card.description,
            dueDate: card.dueDate,
            status: card.status,
            labels: card.labels,
            assignedMembers: card.assignedMembers
          }
        },
        req
      });
    }
    
    res.json(board);
  } catch (err) {
    console.error("🔥 Error updating card:", err);
    
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'update_card_error',
        description: `Error updating card: ${err.message}`,
        boardId: req.params.boardId,
        metadata: { error: err.message, updateData: req.body },
        req
      });
    }
    
    res.status(500).json({ message: "Failed to update card" });
  }
};

// ✅ Delete card
export const deleteCard = async (req, res) => {
  try {
    const { boardId, listId, cardId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(boardId) || 
        !mongoose.Types.ObjectId.isValid(listId) || 
        !mongoose.Types.ObjectId.isValid(cardId)) {
      return res.status(400).json({ message: "Invalid IDs" });
    }

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const list = board.lists.id(listId) || board.lists.find(l => l._id.toString() === listId);
    if (!list) return res.status(404).json({ message: "List not found" });

    const cardToDelete = list.cards.find(c => c._id.toString() === cardId);
    if (!cardToDelete) return res.status(404).json({ message: "Card not found" });

    list.cards = list.cards.filter(c => c._id.toString() !== cardId);
    await board.save();

    // Log card deletion
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'delete_card',
        description: `Deleted card: ${cardToDelete.title}`,
        boardId: boardId,
        metadata: { 
          boardTitle: board.title,
          listTitle: list.title,
          cardTitle: cardToDelete.title,
          cardId: cardId,
          hadAttachments: cardToDelete.attachments?.length || 0,
          hadComments: cardToDelete.comments?.length || 0,
          remainingCards: list.cards.length
        },
        req
      });
    }

    res.json(board);
  } catch (err) {
    console.error("🔥 Error deleting card:", err);

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'delete_card_error',
        description: `Error deleting card: ${err.message}`,
        boardId: req.params.boardId,
        metadata: { error: err.message },
        req
      });
    }

    res.status(500).json({ message: "Failed to delete card" });
  }
};

// ✅ Move card (drag and drop)
export const moveCard = async (req, res) => {
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

    const cardIndex = fromList.cards.findIndex(c => c._id.toString() === cardId);
    if (cardIndex === -1) return res.status(404).json({ message: "Card not found" });

    const [card] = fromList.cards.splice(cardIndex, 1);
    toList.cards.splice(newIndex, 0, card);

    await board.save();

    // Log card movement
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'move_card',
        description: `Moved card: ${card.title} from "${fromList.title}" to "${toList.title}"`,
        boardId: boardId,
        metadata: { 
          boardTitle: board.title,
          cardTitle: card.title,
          cardId: cardId,
          fromList: fromList.title,
          toList: toList.title,
          newIndex,
          oldIndex: cardIndex
        },
        req
      });
    }

    res.json(board);
  } catch (err) {
    console.error("🔥 Error moving card:", err);

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'move_card_error',
        description: `Error moving card: ${err.message}`,
        boardId: req.params.boardId,
        metadata: { error: err.message, moveData: req.body },
        req
      });
    }

    res.status(500).json({ message: "Failed to move card" });
  }
};

// ✅ Update board members
export const updateBoardMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const { members } = req.body;

    const board = await Board.findById(id);
    if (!board) {
      if (req.userForLogging) {
        await logBoardAction({
          userId: req.userForLogging._id,
          userEmail: req.userForLogging.email,
          action: 'update_members_failed',
          description: `Board not found for member update: ${id}`,
          boardId: id,
          metadata: { reason: 'not_found' },
          req
        });
      }
      return res.status(404).json({ message: "Board not found" });
    }

    const oldMembers = [...board.members];
    board.members = members;
    await board.save();

    // Log changes
    if (req.userForLogging) {
      const addedMembers = members.filter(m => !oldMembers.some(om => om.email === m.email));
      const removedMembers = oldMembers.filter(om => !members.some(m => m.email === om.email));

      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'update_members',
        description: `Updated board members: ${addedMembers.length} added, ${removedMembers.length} removed`,
        boardId: id,
        metadata: {
          boardTitle: board.title,
          oldMemberCount: oldMembers.length,
          newMemberCount: members.length,
          addedMembers: addedMembers.map(m => ({ email: m.email, role: m.role })),
          removedMembers: removedMembers.map(m => ({ email: m.email, role: m.role }))
        },
        req
      });
    }

    res.status(200).json({ board, message: "Members updated successfully" });
  } catch (error) {
    console.error("❌ Error updating board members:", error);

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'update_members_error',
        description: `Error updating members: ${error.message}`,
        boardId: req.params.id,
        metadata: { error: error.message, membersData: req.body },
        req
      });
    }

    res.status(500).json({ message: "Server error updating members" });
  }
};

// ✅ Add card comment
export const addCardComment = async (req, res) => {
  try {
    const { boardId, listId, cardId } = req.params;
    const { user, text } = req.body;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(boardId) ||
        !mongoose.Types.ObjectId.isValid(listId) ||
        !mongoose.Types.ObjectId.isValid(cardId)) {
      return res.status(400).json({ message: "Invalid IDs" });
    }

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const list = board.lists.id(listId) || board.lists.find(l => l._id.toString() === listId);
    if (!list) return res.status(404).json({ message: "List not found" });

    const card = list.cards.id(cardId) || list.cards.find(c => c._id.toString() === cardId);
    if (!card) return res.status(404).json({ message: "Card not found" });

    const newComment = {
      _id: new mongoose.Types.ObjectId(),
      user,
      text,
      timestamp: new Date(),
    };

    card.comments = card.comments || [];
    card.comments.push(newComment);
    await board.save();

    // Log comment addition
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'add_comment',
        description: `Added comment to card: ${card.title}`,
        boardId: boardId,
        metadata: {
          boardTitle: board.title,
          listTitle: list.title,
          cardTitle: card.title,
          cardId: cardId,
          commentId: newComment._id,
          commentUser: user,
          commentPreview: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
          totalComments: card.comments.length
        },
        req
      });
    }

    res.status(201).json(board);
  } catch (err) {
    console.error("🔥 Error adding comment:", err);

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'add_comment_error',
        description: `Error adding comment: ${err.message}`,
        boardId: req.params.boardId,
        metadata: { error: err.message, commentData: req.body },
        req
      });
    }

    res.status(500).json({ message: "Failed to add comment" });
  }
};

// ✅ Add attachment to card
export const addCardAttachment = async (req, res) => {
  try {
    const { boardId, listId, cardId } = req.params;
    const attachment = req.body;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(boardId) || 
        !mongoose.Types.ObjectId.isValid(listId) || 
        !mongoose.Types.ObjectId.isValid(cardId)) {
      return res.status(400).json({ message: "Invalid IDs" });
    }

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const list = board.lists.id(listId) || board.lists.find(l => l._id.toString() === listId);
    if (!list) return res.status(404).json({ message: "List not found" });

    const card = list.cards.id(cardId) || list.cards.find(c => c._id.toString() === cardId);
    if (!card) return res.status(404).json({ message: "Card not found" });

    const newAttachment = {
      id: crypto.randomUUID(),
      name: attachment.name,
      url: attachment.url,
      webViewLink: attachment.webViewLink || '',
      uploadedBy: req.userForLogging?.email || 'unknown',
      uploadedAt: new Date()
    };

    card.attachments = card.attachments || [];
    card.attachments.push(newAttachment);
    await board.save();

    // Log attachment addition
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'add_attachment',
        description: `Added attachment to card: ${attachment.name}`,
        boardId: boardId,
        metadata: { 
          boardTitle: board.title,
          listTitle: list.title,
          cardTitle: card.title,
          cardId: cardId,
          attachmentName: attachment.name,
          attachmentType: attachment.name.split('.').pop().toLowerCase(),
          attachmentSize: attachment.size || 'unknown',
          totalAttachments: card.attachments.length
        },
        req
      });
    }

    res.status(201).json(board);
  } catch (err) {
    console.error("🔥 Error adding attachment:", err);

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'add_attachment_error',
        description: `Error adding attachment: ${err.message}`,
        boardId: req.params.boardId,
        metadata: { error: err.message, attachmentData: req.body },
        req
      });
    }

    res.status(500).json({ message: "Failed to add attachment" });
  }
};

// ✅ Delete attachment
export const deleteCardAttachment = async (req, res) => {
  try {
    const { boardId, listId, cardId, attachmentId } = req.params;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(boardId) || 
        !mongoose.Types.ObjectId.isValid(listId) || 
        !mongoose.Types.ObjectId.isValid(cardId)) {
      return res.status(400).json({ message: "Invalid IDs" });
    }

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const list = board.lists.id(listId) || board.lists.find(l => l._id.toString() === listId);
    if (!list) return res.status(404).json({ message: "List not found" });

    const card = list.cards.id(cardId) || list.cards.find(c => c._id.toString() === cardId);
    if (!card) return res.status(404).json({ message: "Card not found" });

    const attachment = card.attachments?.find(a => a.id === attachmentId);
    if (!attachment) return res.status(404).json({ message: "Attachment not found" });

    // Remove the attachment
    card.attachments = card.attachments.filter(a => a.id !== attachmentId);
    await board.save();

    // Log attachment deletion
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'delete_attachment',
        description: `Deleted attachment: ${attachment.name}`,
        boardId: boardId,
        metadata: { 
          boardTitle: board.title,
          listTitle: list.title,
          cardTitle: card.title,
          cardId: cardId,
          attachmentName: attachment.name,
          attachmentId: attachmentId,
          remainingAttachments: card.attachments?.length || 0
        },
        req
      });
    }

    res.json(board);
  } catch (err) {
    console.error("🔥 Error deleting attachment:", err);

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'delete_attachment_error',
        description: `Error deleting attachment: ${err.message}`,
        boardId: req.params.boardId,
        metadata: { error: err.message },
        req
      });
    }

    res.status(500).json({ message: "Failed to delete attachment" });
  }
};

// ✅ Add label to card
export const addCardLabel = async (req, res) => {
  try {
    const { boardId, listId, cardId } = req.params;
    const { label } = req.body;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(boardId) || 
        !mongoose.Types.ObjectId.isValid(listId) || 
        !mongoose.Types.ObjectId.isValid(cardId)) {
      return res.status(400).json({ message: "Invalid IDs" });
    }

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const list = board.lists.id(listId) || board.lists.find(l => l._id.toString() === listId);
    if (!list) return res.status(404).json({ message: "List not found" });

    const card = list.cards.id(cardId) || list.cards.find(c => c._id.toString() === cardId);
    if (!card) return res.status(404).json({ message: "Card not found" });

    card.labels = card.labels || [];

    if (!card.labels.includes(label)) {
      card.labels.push(label);
      await board.save();

      // Log label addition
      if (req.userForLogging) {
        await logBoardAction({
          userId: req.userForLogging._id,
          userEmail: req.userForLogging.email,
          action: 'add_label',
          description: `Added label "${label}" to card: ${card.title}`,
          boardId: boardId,
          metadata: { 
            boardTitle: board.title,
            listTitle: list.title,
            cardTitle: card.title,
            cardId: cardId,
            label,
            totalLabels: card.labels.length
          },
          req
        });
      }
    }

    res.json(board);
  } catch (err) {
    console.error("🔥 Error adding label:", err);

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'add_label_error',
        description: `Error adding label: ${err.message}`,
        boardId: req.params.boardId,
        metadata: { error: err.message, labelData: req.body },
        req
      });
    }

    res.status(500).json({ message: "Failed to add label" });
  }
};

// ✅ Remove label from card
export const removeCardLabel = async (req, res) => {
  try {
    const { boardId, listId, cardId, label } = req.params;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(boardId) || 
        !mongoose.Types.ObjectId.isValid(listId) || 
        !mongoose.Types.ObjectId.isValid(cardId)) {
      return res.status(400).json({ message: "Invalid IDs" });
    }

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const list = board.lists.id(listId) || board.lists.find(l => l._id.toString() === listId);
    if (!list) return res.status(404).json({ message: "List not found" });

    const card = list.cards.id(cardId) || list.cards.find(c => c._id.toString() === cardId);
    if (!card) return res.status(404).json({ message: "Card not found" });

    // Remove label
    card.labels = card.labels?.filter(l => l !== label) || [];
    await board.save();

    // Log label removal
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'remove_label',
        description: `Removed label "${label}" from card: ${card.title}`,
        boardId: boardId,
        metadata: { 
          boardTitle: board.title,
          listTitle: list.title,
          cardTitle: card.title,
          cardId: cardId,
          label,
          remainingLabels: card.labels.length
        },
        req
      });
    }

    res.json(board);
  } catch (err) {
    console.error("🔥 Error removing label:", err);

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'remove_label_error',
        description: `Error removing label: ${err.message}`,
        boardId: req.params.boardId,
        metadata: { error: err.message },
        req
      });
    }

    res.status(500).json({ message: "Failed to remove label" });
  }
};

// ✅ Update comment
export const updateCardComment = async (req, res) => {
  try {
    const { boardId, listId, cardId, commentId } = req.params;
    const { text } = req.body;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(boardId) || 
        !mongoose.Types.ObjectId.isValid(listId) || 
        !mongoose.Types.ObjectId.isValid(cardId) ||
        !mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ message: "Invalid IDs" });
    }

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const list = board.lists.id(listId) || board.lists.find(l => l._id.toString() === listId);
    if (!list) return res.status(404).json({ message: "List not found" });

    const card = list.cards.id(cardId) || list.cards.find(c => c._id.toString() === cardId);
    if (!card) return res.status(404).json({ message: "Card not found" });

    const comment = card.comments?.find(c => c._id.toString() === commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const oldText = comment.text;
    comment.text = text;
    comment.updatedAt = new Date();

    await board.save();

    // Log comment update
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'update_comment',
        description: `Updated comment on card: ${card.title}`,
        boardId: boardId,
        metadata: { 
          boardTitle: board.title,
          listTitle: list.title,
          cardTitle: card.title,
          cardId: cardId,
          commentId: commentId,
          commentUser: comment.user,
          oldTextPreview: oldText.substring(0, 100) + (oldText.length > 100 ? '...' : ''),
          newTextPreview: text.substring(0, 100) + (text.length > 100 ? '...' : '')
        },
        req
      });
    }

    res.json(board);
  } catch (err) {
    console.error("🔥 Error updating comment:", err);
    
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'update_comment_error',
        description: `Error updating comment: ${err.message}`,
        boardId: req.params.boardId,
        metadata: { error: err.message, commentData: req.body },
        req
      });
    }

    res.status(500).json({ message: "Failed to update comment" });
  }
};

// ✅ Delete comment
export const deleteComment = async (req, res) => {
  try {
    const { boardId, listId, cardId, commentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(boardId) || 
        !mongoose.Types.ObjectId.isValid(listId) || 
        !mongoose.Types.ObjectId.isValid(cardId) ||
        !mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ message: "Invalid IDs" });
    }

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const list = board.lists.id(listId) || board.lists.find(l => l._id.toString() === listId);
    if (!list) return res.status(404).json({ message: "List not found" });

    const card = list.cards.id(cardId) || list.cards.find(c => c._id.toString() === cardId);
    if (!card) return res.status(404).json({ message: "Card not found" });

    const comment = card.comments?.find(c => c._id.toString() === commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    card.comments = card.comments.filter(c => c._id.toString() !== commentId);
    await board.save();

    // Log comment deletion
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'delete_comment',
        description: `Deleted comment from card: ${card.title}`,
        boardId,
        metadata: { 
          boardTitle: board.title,
          listTitle: list.title,
          cardTitle: card.title,
          cardId,
          commentId,
          commentUser: comment.user,
          commentPreview: comment.text.substring(0, 100) + (comment.text.length > 100 ? '...' : ''),
          remainingComments: card.comments.length
        },
        req
      });
    }

    res.json(board);
  } catch (err) {
    console.error("🔥 Error deleting comment:", err);

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'delete_comment_error',
        description: `Error deleting comment: ${err.message}`,
        boardId: req.params.boardId,
        metadata: { error: err.message },
        req
      });
    }

    res.status(500).json({ message: "Failed to delete comment" });
  }
};

// ✅ Archive all cards in list
export const archiveListCards = async (req, res) => {
  try {
    const { boardId, listId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(boardId) || !mongoose.Types.ObjectId.isValid(listId)) {
      return res.status(400).json({ message: "Invalid board or list ID" });
    }

    const board = await Board.findById(boardId);
    if (!board) return res.status(404).json({ message: "Board not found" });

    const list = board.lists.id(listId) || board.lists.find(l => l._id.toString() === listId);
    if (!list) return res.status(404).json({ message: "List not found" });

    const cardsCount = list.cards?.length || 0;
    list.cards = [];
    await board.save();

    // Log archive operation
    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'archive_list_cards',
        description: `Archived ${cardsCount} cards from list: ${list.title}`,
        boardId,
        metadata: { 
          boardTitle: board.title,
          listTitle: list.title,
          listId,
          cardsArchived: cardsCount,
          cardsDetails: list.cards?.map(c => ({ title: c.title, id: c._id })).slice(0, 10)
        },
        req
      });
    }

    res.json({ message: `${cardsCount} cards archived`, board });
  } catch (err) {
    console.error("🔥 Error archiving list cards:", err);

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'archive_list_cards_error',
        description: `Error archiving list cards: ${err.message}`,
        boardId: req.params.boardId,
        metadata: { error: err.message },
        req
      });
    }

    res.status(500).json({ message: "Failed to archive cards" });
  }
};

// ✅ Search within board
export const searchBoard = async (req, res) => {
  try {
    const { id } = req.params;
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ message: "Search query required" });
    }

    const board = await Board.findById(id);
    if (!board) {
      if (req.userForLogging) {
        await logBoardAction({
          userId: req.userForLogging._id,
          userEmail: req.userForLogging.email,
          action: 'search_board_failed',
          description: `Board not found for search: ${id}`,
          boardId: id,
          metadata: { reason: 'not_found' },
          req
        });
      }
      return res.status(404).json({ message: "Board not found" });
    }

    const searchResults = {
      cards: [],
      lists: [],
      comments: []
    };

    if (board.lists) {
      board.lists.forEach(list => {
        if (list.title.toLowerCase().includes(query.toLowerCase())) {
          searchResults.lists.push({
            listId: list._id,
            title: list.title
          });
        }

        if (list.cards) {
          list.cards.forEach(card => {
            if (card.title.toLowerCase().includes(query.toLowerCase()) ||
                card.description?.toLowerCase().includes(query.toLowerCase())) {
              searchResults.cards.push({
                cardId: card._id,
                listId: list._id,
                listTitle: list.title,
                title: card.title,
                description: card.description
              });
            }

            if (card.comments) {
              card.comments.forEach(comment => {
                if (comment.text.toLowerCase().includes(query.toLowerCase())) {
                  searchResults.comments.push({
                    commentId: comment._id,
                    cardId: card._id,
                    cardTitle: card.title,
                    listId: list._id,
                    listTitle: list.title,
                    user: comment.user,
                    text: comment.text
                  });
                }
              });
            }
          });
        }
      });
    }

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'search_board',
        description: `Searched in board: "${query}"`,
        boardId: id,
        metadata: { 
          boardTitle: board.title,
          searchQuery: query,
          results: {
            cardsFound: searchResults.cards.length,
            listsFound: searchResults.lists.length,
            commentsFound: searchResults.comments.length
          }
        },
        req
      });
    }

    res.json({
      query,
      totalResults: searchResults.cards.length + searchResults.lists.length + searchResults.comments.length,
      ...searchResults
    });
  } catch (err) {
    console.error("🔥 Error searching board:", err);

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'search_board_error',
        description: `Error searching board: ${err.message}`,
        boardId: req.params.id,
        metadata: { error: err.message, searchQuery: req.query.query },
        req
      });
    }

    res.status(500).json({ message: "Failed to search board" });
  }
};

// ✅ Duplicate board
export const duplicateBoard = async (req, res) => {
  try {
    const { id } = req.params;
    const { newTitle } = req.body;

    const board = await Board.findById(id);
    if (!board) {
      if (req.userForLogging) {
        await logBoardAction({
          userId: req.userForLogging._id,
          userEmail: req.userForLogging.email,
          action: 'duplicate_board_failed',
          description: `Board not found for duplication: ${id}`,
          boardId: id,
          metadata: { reason: 'not_found' },
          req
        });
      }
      return res.status(404).json({ message: "Board not found" });
    }

    // Create duplicate
    const duplicateBoard = new Board({
      title: newTitle || `${board.title} (Copy)`,
      description: board.description,
      userEmail: board.userEmail,
      color: board.color,
      members: board.members,
      lists: board.lists,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await duplicateBoard.save();

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'duplicate_board',
        description: `Duplicated board: ${board.title} to ${duplicateBoard.title}`,
        boardId: id,
        metadata: { 
          originalBoardTitle: board.title,
          newBoardTitle: duplicateBoard.title,
          listsCount: board.lists?.length || 0,
          cardsCount: board.lists?.reduce((acc, list) => acc + (list.cards?.length || 0), 0) || 0,
          membersCount: board.members?.length || 0
        },
        req
      });
    }

    res.status(201).json(duplicateBoard);
  } catch (err) {
    console.error("🔥 Error duplicating board:", err);

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'duplicate_board_error',
        description: `Error duplicating board: ${err.message}`,
        boardId: req.params.id,
        metadata: { error: err.message, duplicateData: req.body },
        req
      });
    }

    res.status(500).json({ message: "Failed to duplicate board" });
  }
};

// ✅ Get board statistics
export const getBoardStats = async (req, res) => {
  try {
    const { id } = req.params;

    const board = await Board.findById(id);
    if (!board) {
      if (req.userForLogging) {
        await logBoardAction({
          userId: req.userForLogging._id,
          userEmail: req.userForLogging.email,
          action: 'view_board_stats_failed',
          description: `Board not found for stats: ${id}`,
          boardId: id,
          metadata: { reason: 'not_found' },
          req
        });
      }
      return res.status(404).json({ message: "Board not found" });
    }

    // Calculate statistics
    let totalCards = 0;
    let completedCards = 0;
    let cardsWithDueDates = 0;
    let overdueCards = 0;
    let totalAttachments = 0;
    let totalComments = 0;

    if (board.lists) {
      board.lists.forEach(list => {
        totalCards += list.cards?.length || 0;

        if (list.cards) {
          list.cards.forEach(card => {
            if (card.status === 'done' || card.status === 'completed') {
              completedCards++;
            }

            if (card.dueDate) {
              cardsWithDueDates++;
              if (new Date(card.dueDate) < new Date()) {
                overdueCards++;
              }
            }

            totalAttachments += card.attachments?.length || 0;
            totalComments += card.comments?.length || 0;
          });
        }
      });
    }

    const stats = {
      boardId: id,
      boardTitle: board.title,
      listsCount: board.lists?.length || 0,
      totalCards,
      completedCards,
      completionRate: totalCards > 0 ? Math.round((completedCards / totalCards) * 100) : 0,
      cardsWithDueDates,
      overdueCards,
      membersCount: board.members?.length || 0,
      totalAttachments,
      totalComments,
      createdDate: board.createdAt,
      lastUpdated: board.updatedAt,
      isArchived: board.deleted || false
    };

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'view_board_stats',
        description: `Viewed board statistics: ${board.title}`,
        boardId: id,
        metadata: stats,
        req
      });
    }

    res.json(stats);
  } catch (err) {
    console.error("🔥 Error fetching board stats:", err);

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'view_board_stats_error',
        description: `Error fetching board stats: ${err.message}`,
        boardId: req.params.id,
        metadata: { error: err.message },
        req
      });
    }

    res.status(500).json({ message: "Failed to fetch board statistics" });
  }
};

// ✅ Export board data
export const exportBoardData = async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'json' } = req.query;

    const board = await Board.findById(id);
    if (!board) {
      if (req.userForLogging) {
        await logBoardAction({
          userId: req.userForLogging._id,
          userEmail: req.userForLogging.email,
          action: 'export_board_failed',
          description: `Board not found for export: ${id}`,
          boardId: id,
          metadata: { reason: 'not_found' },
          req
        });
      }
      return res.status(404).json({ message: "Board not found" });
    }

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'export_board',
        description: `Exported board data: ${board.title}`,
        boardId: id,
        metadata: { 
          boardTitle: board.title,
          exportFormat: format,
          listsCount: board.lists?.length || 0,
          cardsCount: board.lists?.reduce((acc, list) => acc + (list.cards?.length || 0), 0) || 0
        },
        req
      });
    }

    if (format === 'csv') {
      let csvContent = "Board Title,List,Card Title,Description,Due Date,Status,Assigned Members\n";
      
      if (board.lists) {
        board.lists.forEach(list => {
          if (list.cards) {
            list.cards.forEach(card => {
              const assignedMembers = card.assignedMembers?.map(m => m.email).join('; ') || '';
              csvContent += `"${board.title}","${list.title}","${card.title}","${card.description || ''}","${card.dueDate || ''}","${card.status || ''}","${assignedMembers}"\n`;
            });
          }
        });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${board.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_export.csv"`);
      return res.send(csvContent);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${board.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_export.json"`);
      return res.json(board);
    }
  } catch (err) {
    console.error("🔥 Error exporting board:", err);

    if (req.userForLogging) {
      await logBoardAction({
        userId: req.userForLogging._id,
        userEmail: req.userForLogging.email,
        action: 'export_board_error',
        description: `Error exporting board: ${err.message}`,
        boardId: req.params.id,
        metadata: { error: err.message, exportFormat: req.query.format },
        req
      });
    }

    res.status(500).json({ message: "Failed to export board" });
  }
};
