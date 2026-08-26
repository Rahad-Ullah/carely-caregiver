import { Request, Response } from 'express';
import { StatusCodes }       from 'http-status-codes';
import catchAsync            from '../../../shared/catchAsync';
import sendResponse          from '../../../shared/sendResponse';
import { MessageService }    from './message.service';
import { getSingleFilePath } from '../../../shared/getFilePath';
import ApiError              from '../../../errors/ApiErrors';

const getUserId = (req: Request): string => {
  const id = (req.user!.id || (req.user as any)._id)?.toString();
  if (!id) throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid session. Please login again.');
  return id;
};

const sendMessage = catchAsync(async (req: Request, res: Response) => {
  const senderId   = getUserId(req);
  const senderRole = (req.user as any).role as string;

  const { conversationId, content = '', contentType = 'TEXT' } = req.body;

  let attachmentUrl: string | null = null;

  if (contentType === 'IMAGE' || contentType === 'FILE') {
    attachmentUrl = getSingleFilePath(req.files, 'attachment') || null;
    if (!attachmentUrl) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Attachment file is required for this content type');
    }
  }

  const result = await MessageService.sendMessage(
    conversationId,
    senderId,
    senderRole,
    content,
    contentType,
    attachmentUrl,
  );

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success:    true,
    message:    'Message sent successfully',
    data:       result,
  });
});

const getMessages = catchAsync(async (req: Request, res: Response) => {
  const myId   = getUserId(req);
  const result = await MessageService.getMessages(
    req.params.conversationId as string,
    myId,
    req.user.role as string,
    req.query as Record<string, unknown>,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success:    true,
    message:    'Messages fetched successfully',
    data:       result,
  });
});

const markConversationSeen = catchAsync(async (req: Request, res: Response) => {
  const myId    = getUserId(req);
  const myRole  = (req.user as any).role as string;

  const result = await MessageService.markConversationSeen(
    req.params.conversationId as string,
    myId,
    myRole,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success:    true,
    message:    `${result.modifiedCount} messages marked as read`,
    data:       result,
  });
});

const softDeleteMessage = catchAsync(async (req: Request, res: Response) => {
  const myId   = getUserId(req);
  const result = await MessageService.softDeleteMessage(req.params.messageId as string, myId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success:    true,
    message:    'Message deleted successfully',
    data:       result,
  });
});

export const MessageController = {
  sendMessage,
  getMessages,
  markConversationSeen,
  softDeleteMessage,
};