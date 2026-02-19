import express from "express";
import { trackBoardActivity } from "../middleware/activity.js";
import { 
  getAllBoards, getSingleBoard, createBoard, updateBoard, softDeleteBoard, permanentlyDeleteBoard, 
  restoreBoard, cleanupExpiredBoards, addListToBoard, addCardToList, updateListTitle, deleteList,
  updateCard, deleteCard, moveCard, updateBoardMembers, addCardComment, addCardAttachment, deleteCardAttachment,
  addCardLabel, removeCardLabel, updateCardComment, deleteComment, archiveListCards, searchBoard,
  duplicateBoard, getBoardStats, exportBoardData, reorderLists, logBoardActivity, getBoardActivities,
  getCardAttachments, addCardAttachmentByCardId, deleteCardAttachmentByCardId 
} from "../controllers/boardController.js";

const router = express.Router();

// ============================================
// STATIC ROUTES (no dynamic parameters)
// ============================================
router.get("/", trackBoardActivity('view_boards'), getAllBoards);
router.delete("/cleanup/expired", trackBoardActivity('cleanup_boards'), cleanupExpiredBoards);
router.post("/", trackBoardActivity('create_board'), createBoard);

// ============================================
// SPECIFIC BOARD ROUTES (must come before generic :id)
// ============================================

// ✅ REORDER LISTS - THIS WAS MISSING!
router.put("/:id/lists/reorder", trackBoardActivity('reorder_lists'), reorderLists);

// Other specific board routes
router.post("/:id/restore", trackBoardActivity('restore_board'), restoreBoard);
router.delete("/permanent/:id", trackBoardActivity('permanent_delete_board'), permanentlyDeleteBoard);
router.get("/:id/search", trackBoardActivity('search_board'), searchBoard);
router.post("/:id/duplicate", trackBoardActivity('duplicate_board'), duplicateBoard);
router.get("/:id/stats", trackBoardActivity('view_board_stats'), getBoardStats);
router.get("/:id/export", trackBoardActivity('export_board'), exportBoardData);
router.put("/:id/members", trackBoardActivity('update_members'), updateBoardMembers);
router.post("/:id/activity", logBoardActivity);
router.get("/:id/activity", getBoardActivities);

// ============================================
// BOARD LIST ROUTES
// ============================================
router.post("/:id/lists", trackBoardActivity('create_list'), addListToBoard);

// ============================================
// GENERIC BOARD ROUTES (must come LAST)
// ============================================
router.get("/:id", trackBoardActivity('view_board'), getSingleBoard);
router.put("/:id", trackBoardActivity('update_board'), updateBoard);
router.delete("/:id", trackBoardActivity('soft_delete_board'), softDeleteBoard);

// ============================================
// SPECIFIC LIST ROUTES (boardId + listId)
// ============================================
router.put("/:boardId/lists/:listId", trackBoardActivity('update_list'), updateListTitle);
router.delete("/:boardId/lists/:listId", trackBoardActivity('delete_list'), deleteList);
router.post("/:boardId/lists/:listId/archive", trackBoardActivity('archive_list_cards'), archiveListCards);

// ============================================
// CARD ROUTES (boardId + listId + cardId)
// ============================================
router.post("/:boardId/lists/:listId/cards", trackBoardActivity('create_card'), addCardToList);
router.put("/:boardId/lists/:listId/cards/:cardId", trackBoardActivity('update_card'), updateCard);
router.delete("/:boardId/lists/:listId/cards/:cardId", trackBoardActivity('delete_card'), deleteCard);
router.put("/:boardId/lists/:fromListId/cards/:cardId/move", trackBoardActivity('move_card'), moveCard);

// ============================================
// CARD SUB-RESOURCE ROUTES
// ============================================

// Comments
router.post("/:boardId/lists/:listId/cards/:cardId/comments", trackBoardActivity('add_comment'), addCardComment);
router.put("/:boardId/lists/:listId/cards/:cardId/comments/:commentId", trackBoardActivity('update_comment'), updateCardComment);
router.delete("/:boardId/lists/:listId/cards/:cardId/comments/:commentId", trackBoardActivity('delete_comment'), deleteComment);

// Attachments (with listId)
router.post("/:boardId/lists/:listId/cards/:cardId/attachments", trackBoardActivity('add_attachment'), addCardAttachment);
router.delete("/:boardId/lists/:listId/cards/:cardId/attachments/:attachmentId", trackBoardActivity('delete_attachment'), deleteCardAttachment);

// Labels
router.post("/:boardId/lists/:listId/cards/:cardId/labels", trackBoardActivity('add_label'), addCardLabel);
router.delete("/:boardId/lists/:listId/cards/:cardId/labels/:label", trackBoardActivity('remove_label'), removeCardLabel);

// ============================================
// CARD ATTACHMENTS (without listId)
// ============================================
router.get("/:boardId/cards/:cardId/attachments", trackBoardActivity("view_attachments"), getCardAttachments);
router.post("/:boardId/cards/:cardId/attachments", trackBoardActivity("add_attachment"), addCardAttachmentByCardId);
router.delete("/:boardId/cards/:cardId/attachments/:attachmentId", trackBoardActivity("delete_attachment"), deleteCardAttachmentByCardId);

export default router;