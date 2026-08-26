import { Types }             from 'mongoose';
import { StatusCodes }       from 'http-status-codes';
import ApiError              from '../../../errors/ApiErrors';
import { Message }           from './message.model';
import { Conversation }      from '../conversation/conversation.model';
import { QueryBuilder } from '../../buillder/queryBuilder';
import { USER_ROLES }        from '../../../enums/user';
import { emitNewMessage }    from '../../../socket/socketHandlers';
import { getIO }             from '../../../socket/socket';

const SENDER_FIELDS = 'name profileImage';

// Creates a message, updates conversation counters, and emits real-time events
const sendMessage = async (
  conversationId: string,
  senderId:       string,
  senderRole:     string,
  content:        string,
  contentType:    'TEXT' | 'IMAGE' | 'FILE' = 'TEXT',
  attachment:     string | null = null,
) => {
  if (!Types.ObjectId.isValid(conversationId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid conversation ID');
  }

  if (!content.trim() && !attachment) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Message must have content or attachment');
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation || !conversation.isActive) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Conversation not found');
  }

  const isParticipant = conversation.participants.some(
    p => p.toString() === senderId,
  );
  if (!isParticipant) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'You are not a participant of this conversation');
  }

  const message = await Message.create({
    conversation: new Types.ObjectId(conversationId),
    sender:       new Types.ObjectId(senderId),
    content:      content.trim(),
    contentType,
    attachment,
  });

  const unreadIncrement =
    senderRole === USER_ROLES.CLIENT
      ? { $inc: { caregiverUnreadCount: 1 } }
      : { $inc: { clientUnreadCount:   1 } };

  await Conversation.findByIdAndUpdate(conversationId, {
    lastMessage:   message._id,
    lastMessageAt: new Date(),
    ...unreadIncrement,
  });

  const populated = await Message.findById(message._id)
    .populate('sender', SENDER_FIELDS)
    .lean();

  if (!populated) {
    throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'Failed to save message');
  }

  emitNewMessage(conversationId, {
    _id:            (populated._id as Types.ObjectId).toString(),
    conversationId,
    sender:         populated.sender as any,
    content:        populated.content,
    contentType:    populated.contentType,
    attachment:     populated.attachment,
    createdAt:      (populated as any).createdAt.toISOString(),
  });

  try {
    const io           = getIO();
    const updatedConv  = await Conversation.findById(conversationId)
      .populate('participants', 'name email profileImage role')
      .populate('lastMessage',  'content contentType attachment createdAt sender')
      .lean();

    if (updatedConv) {
      updatedConv.participants.forEach((p: any) => {
        io.to(p._id.toString()).emit('conversation:updated', updatedConv);
      });
    }
  } catch {
    // socket errors must never crash the message service
  }

  return populated;
};

// Returns paginated messages for a conversation and marks undelivered ones as delivered
const getMessages = async (
  conversationId: string,
  myId:           string,
  myRole:         string,
  query:          Record<string, unknown>,
) => {
  if (!Types.ObjectId.isValid(conversationId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid conversation ID');
  }

  const conversation = await Conversation.findById(conversationId).lean();
  if (!conversation) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Conversation not found');
  }

  const isParticipant = conversation.participants.some(
    p => p.toString() === myId,
  );
  if (!isParticipant) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'You are not a participant of this conversation');
  }

  const cleanQuery = { ...query, sort: (query.sort as string) || '-createdAt' };

  const qb = new QueryBuilder(
    Message.find({
      conversation: new Types.ObjectId(conversationId),
      isDeleted:    false,
    }).populate('sender', SENDER_FIELDS),
    cleanQuery,
  )
    .sort()
    .paginate();

  const [messages, meta] = await Promise.all([
    qb.modelQuery,
    qb.countTotal(),
  ]);

  // Mark messages as seen
  await markConversationSeen(conversationId, myId, myRole);

  return { messages, meta };
};

// Marks all unread messages in a conversation as read and resets the unread counter
const markConversationSeen = async (
  conversationId: string,
  myId:           string,
  myRole:         string,
) => {
  if (!Types.ObjectId.isValid(conversationId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid conversation ID');
  }

  const conversation = await Conversation.findById(conversationId).lean();
  if (!conversation) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Conversation not found');
  }

  const isParticipant = conversation.participants.some(
    p => p.toString() === myId,
  );
  if (!isParticipant) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'You are not a participant of this conversation');
  }

  const now = new Date();

  const { modifiedCount } = await Message.updateMany(
    {
      conversation: new Types.ObjectId(conversationId),
      sender:       { $ne: new Types.ObjectId(myId) },
      isRead:       false,
      isDeleted:    false,
    },
    { $set: { isRead: true, readAt: now } },
  );

  const unreadReset =
    myRole === USER_ROLES.CLIENT
      ? { clientUnreadCount: 0 }
      : { caregiverUnreadCount: 0 };

  await Conversation.findByIdAndUpdate(conversationId, { $set: unreadReset });

  return { modifiedCount };
};

// Soft deletes a message — only the sender can delete their own message
const softDeleteMessage = async (messageId: string, myId: string) => {
  if (!Types.ObjectId.isValid(messageId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid message ID');
  }

  const message = await Message.findById(messageId);
  if (!message) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Message not found');
  }

  if (message.sender.toString() !== myId) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'You can only delete your own messages');
  }

  if (message.isDeleted) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Message already deleted');
  }

  message.isDeleted  = true;
  message.content    = 'This message was deleted';
  message.attachment = null;
  await message.save();

  return { deleted: true, messageId };
};

export const MessageService = {
  sendMessage,
  getMessages,
  markConversationSeen,
  softDeleteMessage,
};