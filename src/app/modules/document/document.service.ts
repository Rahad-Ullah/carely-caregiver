import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import ApiError from '../../../errors/ApiErrors';
import { CaregiverDocument } from './document.model';
import { DOCUMENT_TYPE, DOCUMENT_STATUS } from '../../../enums/document';
import { NOTIFICATION_TYPE, REFERENCE_MODEL } from '../../../enums/notification';
import { Notification } from '../notification/notification.model';
import { CaregiverProfile } from '../caregiver-profile/caregiver-profile.model';
import { User } from '../user/user.model';
import { emailHelper } from '../../../helpers/emailHelper';
import { emailTemplate } from '../../../shared/emailTemplate';
import { getSingleFilePath, IFolderName } from "../../../shared/getFilePath"
import unlinkFile from '../../../shared/unLinkFIle';
import { StripeService } from '../stripe/stripe.service';

const DOCUMENT_FIELD_MAP: Record<DOCUMENT_TYPE, IFolderName> = {
  [DOCUMENT_TYPE.GOVERNMENT_ID]: 'governmentId',
  [DOCUMENT_TYPE.NURSING_CERT]: 'nursingCert',
  [DOCUMENT_TYPE.CRIMINAL_RECORD]: 'criminalRecord',
  [DOCUMENT_TYPE.INSURANCE]: 'insurance',
};

const uploadDocument = async (
  caregiverUserId: string,
  documentType: DOCUMENT_TYPE,
  files: any,
) => {
  const caregiver = await CaregiverProfile.findOne({ user: new Types.ObjectId(caregiverUserId) }).select('verificationAmountPaid');
  if (!caregiver) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Caregiver not found');
  }

  // Uploads or re-uploads a caregiver document. Replaces if PENDING or REJECTED. Blocks if APPROVED.
  const fieldName = DOCUMENT_FIELD_MAP[documentType];
  const filePath = getSingleFilePath(files, fieldName);

  if (!filePath) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      `File is required. Send the file in the "${fieldName}" field for documentType ${documentType}`,
    );
  }

  const fileName = (files as any)[fieldName][0].originalname as string;

  const existing = await CaregiverDocument.findOne({
    caregiver: new Types.ObjectId(caregiverUserId),
    documentType,
  });

  if (existing) {
    if (existing.status === DOCUMENT_STATUS.APPROVED) {
      unlinkFile(filePath);
      throw new ApiError(
        StatusCodes.CONFLICT,
        'This document is already approved and cannot be replaced.',
      );
    }
    unlinkFile(existing.fileUrl);
    existing.fileUrl = filePath;
    existing.fileName = fileName;
    existing.status = DOCUMENT_STATUS.PENDING;
    existing.rejectionReason = null;
    existing.verifiedAt = null;
    existing.verifiedBy = null;
    await existing.save();
    return existing;
  }

  const document = await CaregiverDocument.create({
    caregiver: new Types.ObjectId(caregiverUserId),
    documentType,
    fileUrl: filePath,
    fileName,
  });

  // initiate stripe payment
  if (!caregiver.verificationAmountPaid) {
    return await StripeService.createCheckoutSessionForVerification(caregiverUserId, caregiver._id.toString())
  }

  return document;
};

const getMyDocuments = async (caregiverId: string) => {
  // Returns all documents for the requesting caregiver with their statuses. verifiedBy is excluded from response.
  return CaregiverDocument.find({ caregiver: new Types.ObjectId(caregiverId) })
    .select('-verifiedBy')
    .sort({ createdAt: -1 })
    .lean();
};

const deleteDocument = async (documentId: string, caregiverId: string) => {
  // Deletes a document only when its status is PENDING. Removes the physical file from disk.
  const document = await CaregiverDocument.findOne({
    _id: new Types.ObjectId(documentId),
    caregiver: new Types.ObjectId(caregiverId),
  });

  if (!document) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Document not found');
  }

  if (document.status !== DOCUMENT_STATUS.PENDING) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      `Only PENDING documents can be deleted. Current status: ${document.status}`,
    );
  }

  unlinkFile(document.fileUrl);
  await CaregiverDocument.deleteOne({ _id: document._id });

  return { deleted: true, documentId };
};

const getAllDocuments = async (query: {
  status?: DOCUMENT_STATUS;
  documentType?: DOCUMENT_TYPE;
  caregiverId?: string;
  page?: number;
  limit?: number;
}) => {
  // Admin: returns all caregiver documents with optional filters and pagination
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter: Record<string, any> = {};
  if (query.status) filter.status = query.status;
  if (query.documentType) filter.documentType = query.documentType;
  if (query.caregiverId && Types.ObjectId.isValid(query.caregiverId)) {
    filter.caregiver = new Types.ObjectId(query.caregiverId);
  }

  const [documents, total] = await Promise.all([
    CaregiverDocument.find(filter)
      .populate('caregiver', 'name email profileImage')
      .populate('verifiedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CaregiverDocument.countDocuments(filter),
  ]);

  return {
    documents,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  };
};

const approveDocument = async (documentId: string, adminId: string) => {
  // Approves a document, sets verifiedAt and verifiedBy. If all 4 types approved, enables caregiver for booking.
  const document = await CaregiverDocument.findById(new Types.ObjectId(documentId));

  if (!document) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Document not found');
  }

  if (document.status === DOCUMENT_STATUS.APPROVED) {
    throw new ApiError(StatusCodes.CONFLICT, 'Document is already approved');
  }

  document.status = DOCUMENT_STATUS.APPROVED;
  document.verifiedAt = new Date();
  document.verifiedBy = new Types.ObjectId(adminId);
  document.rejectionReason = null;
  await document.save();

  const approvedTypes = await CaregiverDocument.distinct('documentType', {
    caregiver: document.caregiver,
    status: DOCUMENT_STATUS.APPROVED,
  });

  if (approvedTypes.length === Object.values(DOCUMENT_TYPE).length) {
    await CaregiverProfile.findOneAndUpdate(
      { user: document.caregiver },
      { isAvailableForBooking: true, isVerified: true },
    );
  }

  await Notification.create({
    recipient: document.caregiver,
    type: NOTIFICATION_TYPE.DOCUMENT_APPROVED,
    title: 'Document Approved',
    body: `Your ${document.documentType.replace(/_/g, ' ')} has been approved.`,
    referenceId: document._id,
    referenceModel: REFERENCE_MODEL.CAREGIVER_DOCUMENT,
  });

  const user = await User.findById(document.caregiver);
  if (user) {
    emailHelper.sendEmail(emailTemplate.documentVerified({
      name: user.name,
      email: user.email,
      documentType: document.documentType.replace(/_/g, ' '),
    }));
  }

  return document;
};

const rejectDocument = async (documentId: string, rejectionReason: string) => {
  // Rejects a document with a reason. Clears verifiedAt and verifiedBy. Notifies the caregiver.
  const document = await CaregiverDocument.findById(new Types.ObjectId(documentId));

  if (!document) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Document not found');
  }

  if (document.status === DOCUMENT_STATUS.REJECTED) {
    throw new ApiError(StatusCodes.CONFLICT, 'Document is already rejected');
  }

  document.status = DOCUMENT_STATUS.REJECTED;
  document.rejectionReason = rejectionReason;
  document.verifiedAt = null;
  document.verifiedBy = null;
  await document.save();

  await Notification.create({
    recipient: document.caregiver,
    type: NOTIFICATION_TYPE.DOCUMENT_REJECTED,
    title: 'Document Rejected',
    body: `Your ${document.documentType.replace(/_/g, ' ')} was rejected. Reason: ${rejectionReason}`,
    referenceId: document._id,
    referenceModel: REFERENCE_MODEL.CAREGIVER_DOCUMENT,
  });

  const user = await User.findById(document.caregiver);
  if (user) {
    emailHelper.sendEmail(emailTemplate.documentRejected({
      name: user.name,
      email: user.email,
      documentType: document.documentType.replace(/_/g, ' '),
      reason: rejectionReason,
    }));
  }

  return document;
};

export const DocumentService = {
  uploadDocument,
  getMyDocuments,
  deleteDocument,
  getAllDocuments,
  approveDocument,
  rejectDocument,
};