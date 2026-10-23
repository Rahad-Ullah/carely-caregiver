import { Request } from 'express';
import { StatusCodes } from 'http-status-codes';
import multer, { FileFilterCallback, StorageEngine } from 'multer';
import path from 'path';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import ApiError from '../../errors/ApiErrors';
import s3Client from '../../config/aws-s3.config';
import config from '../../config';

// ── Field → folder map (must match shared/getFilePath.ts) 
const FIELD_FOLDER_MAP: Record<string, string> = {
  profileImage:   'user',
  careRecipientPhoto:  'care-recipients', 
  governmentId:   'documents',
  nursingCert:    'documents',
  criminalRecord: 'documents',
  insurance:      'documents',
  attachment:     'attachments',
  icon:           'category',
};

// ── Per-field size limits (bytes) 
const FIELD_SIZE_LIMIT: Record<string, number> = {
  profileImage:   2  * 1024 * 1024,  // 2 MB
   careRecipientPhoto:  2  * 1024 * 1024,
  governmentId:   10 * 1024 * 1024,  // 10 MB
  nursingCert:    10 * 1024 * 1024,  // 10 MB
  criminalRecord: 10 * 1024 * 1024,  // 10 MB
  insurance:      10 * 1024 * 1024,  // 10 MB
  attachment:     20 * 1024 * 1024,  // 20 MB
  icon:           2  * 1024 * 1024,  // 2 MB
};

// ── Allowed MIME types per field 
const IMAGE_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const DOC_MIMES   = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const ALL_ATTACH  = [...IMAGE_MIMES, 'application/pdf', 'video/mp4', 'video/quicktime'];

const FIELD_MIME_MAP: Record<string, string[]> = {
  profileImage:   IMAGE_MIMES,
   careRecipientPhoto:  IMAGE_MIMES,
  governmentId:   DOC_MIMES,
  nursingCert:    DOC_MIMES,
  criminalRecord: DOC_MIMES,
  insurance:      DOC_MIMES,
  attachment:     ALL_ATTACH,
  icon:           IMAGE_MIMES,
};

class S3Storage implements StorageEngine {
  _handleFile(
    _req: Request,
    file: Express.Multer.File,
    cb: (error?: any, info?: Partial<Express.Multer.File>) => void,
  ): void {
    const folder = FIELD_FOLDER_MAP[file.fieldname] ?? 'misc';
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${file.fieldname}-${Date.now()}${ext}`;
    const key = `${folder}/${filename}`;

    const chunks: Buffer[] = [];

    file.stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    file.stream.on('error', (err) => {
      cb(err);
    });

    file.stream.on('end', async () => {
      try {
        if ((file.stream as any).truncated) {
          return cb(new multer.MulterError('LIMIT_FILE_SIZE', file.fieldname));
        }

        const buffer = Buffer.concat(chunks);
        const maxSize = FIELD_SIZE_LIMIT[file.fieldname] ?? 10 * 1024 * 1024;
        if (buffer.length > maxSize) {
          return cb(
            new ApiError(
              StatusCodes.BAD_REQUEST,
              `File size for "${file.fieldname}" exceeds allowed limit of ${maxSize / (1024 * 1024)} MB`,
            ),
          );
        }

        const bucket = config.aws.bucketName || process.env.S3_BUCKET_NAME;
        if (!bucket) {
          return cb(
            new ApiError(
              StatusCodes.INTERNAL_SERVER_ERROR,
              'AWS S3 bucket name is not configured',
            ),
          );
        }

        const command = new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: file.mimetype,
        });

        await s3Client.send(command);

        const region = config.aws.region || process.env.AWS_REGION;
        const location = config.media_server_url
          ? `${config.media_server_url.replace(/\/+$/, '')}/${key}`
          : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

        cb(null, {
          fieldname: file.fieldname,
          originalname: file.originalname,
          encoding: file.encoding,
          mimetype: file.mimetype,
          size: buffer.length,
          filename,
          destination: folder,
          path: key,
          // S3 specific metadata
          bucket,
          key,
          location,
        } as any);
      } catch (uploadError) {
        cb(uploadError);
      }
    });
  }

  _removeFile(
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null) => void,
  ): void {
    const folder = FIELD_FOLDER_MAP[file.fieldname] ?? 'misc';
    const key =
      (file as any).key ||
      (file.filename ? `${folder}/${file.filename}` : undefined);
    const bucket =
      (file as any).bucket ||
      config.aws.bucketName ||
      process.env.S3_BUCKET_NAME;

    if (!key || !bucket) {
      return cb(null);
    }

    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    s3Client
      .send(command)
      .then(() => cb(null))
      .catch((err) => cb(err));
  }
}

const fileUploadHandler = (() => {
  const storage = new S3Storage();

  const fileFilter = (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback,
  ) => {
    const allowed = FIELD_MIME_MAP[file.fieldname];
    if (!allowed) {
      return cb(new ApiError(StatusCodes.BAD_REQUEST, `Unknown upload field: ${file.fieldname}`));
    }
    if (!allowed.includes(file.mimetype)) {
      return cb(
        new ApiError(
          StatusCodes.BAD_REQUEST,
          `Invalid file type for "${file.fieldname}". Allowed: ${allowed.join(', ')}`,
        ),
      );
    }
    // Per-field size check (multer limits is a global cap — this is field-level)
    const maxSize = FIELD_SIZE_LIMIT[file.fieldname] ?? 10 * 1024 * 1024;
    (file as any).sizeLimit = maxSize;
    cb(null, true);
  };

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: 20 * 1024 * 1024 }, 
  }).fields([
    { name: 'profileImage',   maxCount: 1 },
    { name: 'careRecipientPhoto', maxCount: 1 },
    { name: 'governmentId',   maxCount: 1 },
    { name: 'nursingCert',    maxCount: 1 },
    { name: 'criminalRecord', maxCount: 1 },
    { name: 'insurance',      maxCount: 1 },
    { name: 'attachment',     maxCount: 5 },
    { name: 'icon',           maxCount: 1 },
  ]);
})();

export default fileUploadHandler;