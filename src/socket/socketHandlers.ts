import { Server, Socket } from 'socket.io';
import { getIO } from './socket';
import { Message } from '../app/modules/message/message.model';

// registerHandlers — called once per connection from socket.ts
// Handles: messaging, typing, message status, notifications, booking events
export const registerHandlers = (io: Server, socket: Socket): void => {
  const userId = socket.userId!; // guaranteed by JWT middleware

  // Join personal room — direct notifications + booking events target this room
  socket.join(userId);

  // Messaging — join/leave conversation rooms
  socket.on('conversation:join', (conversationId: string) => {
    if (conversationId) socket.join(conversationId);
  });

  socket.on('conversation:leave', (conversationId: string) => {
    if (conversationId) socket.leave(conversationId);
  });

  // Typing indicators — forwarded to everyone else in the conversation room
  socket.on('typing:start', ({ conversationId }: { conversationId: string }) => {
    socket.to(conversationId).emit('typing:start', { userId, conversationId });
  });

  socket.on('typing:stop', ({ conversationId }: { conversationId: string }) => {
    socket.to(conversationId).emit('typing:stop', { userId, conversationId });
  });

  // Message delivered — client emits this when it receives message:new
  // Server notifies the original sender that their message was delivered
  socket.on('message:delivered', async ({
    messageId,
    senderId,
    conversationId,
  }: {
    messageId: string;
    senderId: string;
    conversationId: string;
  }) => {
    // Notify sender — their message reached the recipient's device
    io.to(senderId).emit('message:delivered', {
      messageId,
      conversationId,
      deliveredAt: new Date().toISOString(),
    });

    // db update (deliveredAt)
    await Message.updateMany(
      { conversation: conversationId, sender: senderId },
      { $set: { deliveredAt: new Date() } }
    );
  });

  // Message seen — client emits when user opens/reads a conversation
  // DB update happens via REST PATCH /messages/:conversationId/seen
  // Socket here just broadcasts the real-time seen status to the sender
  socket.on('message:seen', async ({
    conversationId,
    senderId,
  }: {
    conversationId: string;
    senderId: string;
  }) => {
    io.to(senderId).emit('message:seen', {
      conversationId,
      seenBy: userId,
      seenAt: new Date().toISOString(),
    });
    // db update
    await Message.updateMany(
      { conversation: conversationId, sender: senderId },
      { $set: { isRead: true, readAt: new Date() } }
    );
  });

  // Notification delivery ACK — client confirms it received the notification
  socket.on('notification:ack', ({ notificationId }: { notificationId: string }) => {
    // Reserved for analytics / delivery tracking — extend as needed
    console.log(`[Socket] notification:ack | user: ${userId} | id: ${notificationId}`);
  });

  // Note: disconnect is handled in socket.ts — NOT duplicated here
};

// Booking event emitter — import and call from booking.service.ts
// Emits to personal userId rooms — safe if user is offline (silently skips)
export interface IBookingSocketPayload {
  bookingId: string;
  status: string;
  message: string;
  updatedAt: string; // UTC ISO string
  [key: string]: unknown;
}

export const emitBookingEvent = (
  event: string,
  userIds: string[],
  payload: IBookingSocketPayload,
): void => {
  try {
    const io = getIO();
    userIds.forEach((uid) => io.to(uid).emit(event, payload));
  } catch {
    // Socket errors must never crash the booking service
  }
};

// Message:new emitter — import and call from message.service.ts after creating a message
// Emits to conversation room — all online participants in that conversation receive it
export interface IMessageSocketPayload {
  _id: string;
  conversationId: string;
  sender: { _id: string; name: string; profileImage?: string };
  content: string;
  contentType: string;
  attachment?: string | null;
  createdAt: string; // UTC ISO string
}

export const emitNewMessage = (
  conversationId: string,
  payload: IMessageSocketPayload,
): void => {
  try {
    const io = getIO();
    io.to(conversationId).emit('message:new', payload);
    // emit to participants personal room to update their conversation list
    
  } catch {
    // never crash message service
  }
};