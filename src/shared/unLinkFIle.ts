import fs from 'fs';
import path from 'path';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import s3Client from '../config/aws-s3.config';
import config from '../config';

// ── Single file delete ───────────────────────────────────────────────────────
// filePath example:  "/user/profile-1741158600123.jpg"
//                    "user/profile-1741158600123.jpg"   (both work)
// resolves to S3 key or /project-root/uploads/... for legacy local files
const unlinkFile = (filePath: string): void => {
  if (!filePath) return;

  // Strip leading slash if present
  let cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

  // If full URL was passed, parse key from URL
  if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
    try {
      const url = new URL(cleanPath);
      cleanPath = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
    } catch {
      // ignore
    }
  }

  // 1. Delete from local disk if it exists (legacy local uploads)
  const fullPath = path.join(process.cwd(), 'uploads', cleanPath);
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch {
      // ignore
    }
  }

  // 2. Delete from AWS S3 bucket
  const bucket = config.aws.bucketName || process.env.S3_BUCKET_NAME;
  if (bucket) {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: cleanPath,
    });
    s3Client.send(command).catch(() => {
      // ignore error if file was already removed or does not exist
    });
  }
};

// ── Multiple files delete ────────────────────────────────────────────────────
// Messaging attachments, multiple insurance cards, etc.
export const unlinkMultipleFiles = (filePaths: string[]): void => {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return;
  filePaths.forEach((filePath) => unlinkFile(filePath));
};

export default unlinkFile;

