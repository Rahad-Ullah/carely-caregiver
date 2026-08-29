import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import ApiError from '../../../errors/ApiErrors';
import { Conversation } from './conversation.model';
import { User } from '../user/user.model';
import { QueryBuilder } from '../../buillder/queryBuilder';
import { USER_ROLES } from '../../../enums/user';

const PARTICIPANT_FIELDS = 'name email profileImage role';
const LAST_MESSAGE_FIELDS = 'content contentType attachment createdAt isDeleted deliveredAt sender isRead readAt';

const getOrCreateConversation = async (myId: string, receiverId: string) => {
  if (!Types.ObjectId.isValid(myId) || !Types.ObjectId.isValid(receiverId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid user ID');
  }

  if (myId === receiverId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'You cannot start a conversation with yourself');
  }

  const receiver = await User.findById(receiverId).select('_id isDeleted isBlocked').lean();
  if (!receiver || receiver.isDeleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }
  if (receiver.isBlocked) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'This user is not available');
  }

  const existing = await Conversation.findOne({
    participants: {
      $all: [new Types.ObjectId(myId), new Types.ObjectId(receiverId)],
    },
    isActive: true,
  })
    .populate('participants', PARTICIPANT_FIELDS)
    .populate('lastMessage', LAST_MESSAGE_FIELDS);

  if (existing) return existing;

  const created = await Conversation.create({
    participants: [new Types.ObjectId(myId), new Types.ObjectId(receiverId)],
  });

  return Conversation.findById(created._id)
    .populate('participants', PARTICIPANT_FIELDS)
    .populate('lastMessage', LAST_MESSAGE_FIELDS);
};

const getMyInbox = async (myId: string, query: Record<string, unknown>) => {
  const searchTerm = (query.searchTerm as string)?.trim();

  let finalFilter: object = {
    participants: new Types.ObjectId(myId),
    isActive: true,
  };

  if (searchTerm) {
    const matchedUsers = await User.find({
      _id: { $ne: new Types.ObjectId(myId) },
      $or: [
        { name: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } },
        { phone: { $regex: searchTerm, $options: 'i' } },
      ],
    })
      .select('_id')
      .lean();

    if (!matchedUsers.length) {
      return {
        conversations: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      };
    }

    finalFilter = {
      $and: [
        { participants: new Types.ObjectId(myId) },
        { participants: { $in: matchedUsers.map(u => u._id) } },
        { isActive: true },
      ],
    };
  }

  const cleanQuery = { ...query, sort: (query.sort as string) || '-lastMessageAt' };

  const qb = new QueryBuilder(
    Conversation.find(finalFilter as any)
      .populate('participants', PARTICIPANT_FIELDS)
      .populate('lastMessage', LAST_MESSAGE_FIELDS),
    cleanQuery,
  )
    .sort()
    .paginate();

  const [conversations, meta] = await Promise.all([
    qb.modelQuery,
    qb.countTotal(),
  ]);

  return { conversations, meta };
};

const getSingleConversation = async (conversationId: string, myId: string) => {
  if (!Types.ObjectId.isValid(conversationId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid conversation ID');
  }

  const conversation = await Conversation.findById(conversationId)
    .populate('participants', PARTICIPANT_FIELDS)
    .populate('lastMessage', LAST_MESSAGE_FIELDS);

  if (!conversation) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Conversation not found');
  }

  const isParticipant = (conversation.participants as any[]).some(
    (p: any) => p._id.toString() === myId,
  );

  if (!isParticipant) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'You are not a participant of this conversation');
  }

  return conversation;
};

const searchUsersToMessage = async (
  myId: string,
  myRole: string,
  query: Record<string, unknown>,
) => {
  const targetRole =
    myRole === USER_ROLES.CLIENT ? USER_ROLES.CAREGIVER : USER_ROLES.CLIENT;

  const baseFilter: object = {
    _id: { $ne: new Types.ObjectId(myId) },
    role: targetRole,
    isDeleted: false,
    isBlocked: false,
  };

  const qb = new QueryBuilder(
    User.find(baseFilter as any).select('name email phone profileImage role'),
    query,
  )
    .search(['name', 'email', 'phone'])
    .sort()
    .paginate();

  const [users, meta] = await Promise.all([
    qb.modelQuery,
    qb.countTotal(),
  ]);

  return { users, meta };
};

export const ConversationService = {
  getOrCreateConversation,
  getMyInbox,
  getSingleConversation,
  searchUsersToMessage,
};