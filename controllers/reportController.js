import Board from '../models/Board.js';
import User from '../models/User.js';

// Get analytics data
export const getAnalytics = async (req, res) => {
  try {
    const { scope } = req.query;

    let boards = [];
    let users = [];

    if (scope === 'projectOnly' || scope === 'all') {
      boards = await Board.find({ deleted: { $ne: true } })
        .populate('members')
        .lean();
    }

    if (scope === 'allUsers' || scope === 'all') {
      users = await User.find().select('email firstName lastName role').lean();
    }

    const normalizedBoards = boards.map(board => ({
      id: board._id.toString(),
      _id: board._id.toString(),
      title: board.title,
      description: board.description,
      userEmail: board.userEmail,
      members: board.members || [],
      lists: (board.lists || []).map(list => ({
        id: list._id?.toString() || list.id,
        _id: list._id?.toString() || list.id,
        title: list.title,
        cards: (list.cards || []).map(card => ({
          id: card._id?.toString() || card.id,
          _id: card._id?.toString() || card.id,
          title: card.title,
          description: card.description,
          assignedMembers: card.assignedMembers || [],
          labels: card.labels || [],
          dueDate: card.dueDate,
          comments: card.comments || [],
          attachments: card.attachments || []
        }))
      })),
      createdAt: board.createdAt,
      dueDate: board.dueDate,
      status: board.status,
      color: board.color
    }));

    const normalizedUsers = users.map(user => ({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role
    }));

    res.json({ boards: normalizedBoards, users: normalizedUsers });

  } catch (error) {
    console.error('Error fetching analytics data:', error);
    res.status(500).json({ message: 'Failed to fetch analytics data', error: error.message });
  }
};
