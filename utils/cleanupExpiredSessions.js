import EditSession from "../models/EditSession.js";

export const cleanupExpiredSessions = async (userId) => {
  const now = new Date();

  await EditSession.deleteMany({
    userId,
    expiresAt: { $lte: now }
  });
};
