import config from '../config';

/**
 * Field-to-folder map for Carely AWS S3 uploads.
 * Maps upload field names to their target S3 folder prefixes.
 */
const FIELD_TO_FOLDER: Record<string, string> = {
  profileImage:       'user',            // Profile avatar — all roles
  careRecipientPhoto: 'care-recipients', // Care recipient photos
  governmentId:       'documents',       // Caregiver: govt-issued ID
  nursingCert:        'documents',       // Caregiver: nursing certificate
  criminalRecord:     'documents',       // Caregiver: criminal record check
  insurance:          'documents',       // Caregiver: insurance certificate
  attachment:         'attachments',     // Messaging file attachments
  icon:               'category',        // Service category icons
};

export type IFolderName =
  | 'profileImage'
  | 'careRecipientPhoto'
  | 'governmentId'
  | 'nursingCert'
  | 'criminalRecord'
  | 'insurance'
  | 'attachment'
  | 'icon';

/**
 * Helper to construct the S3 URL from a given S3 key.
 */
const formatS3Url = (key: string): string => {
  if (config.media_server_url) {
    return `${config.media_server_url.replace(/\/+$/, '')}/${key}`;
  }
  const bucket = config.aws.bucketName || process.env.S3_BUCKET_NAME;
  const region = config.aws.region || process.env.AWS_REGION;
  if (bucket && region) {
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }
  return key;
};

/**
 * Returns the AWS S3 URL for a SINGLE uploaded file.
 * Priority: file.location -> formatted S3 URL from file.key/filename.
 * Example return: "https://media.cfhcare.ca/user/profileImage-1712503200000.jpg"
 */
export const getSingleFilePath = (
  files: any,
  fieldName: IFolderName,
): string | undefined => {
  const fileField = files?.[fieldName];
  if (Array.isArray(fileField) && fileField.length > 0) {
    const file = fileField[0];
    if (file?.location) return file.location;

    const folder = FIELD_TO_FOLDER[fieldName] ?? fieldName;
    const key = file?.key || (file?.filename ? `${folder}/${file.filename}` : undefined);
    return key ? formatS3Url(key) : undefined;
  }
  return undefined;
};

/**
 * Returns array of AWS S3 URLs for MULTIPLE uploaded files.
 */
export const getMultipleFilesPath = (
  files: any,
  fieldName: IFolderName,
): string[] | undefined => {
  const fileField = files?.[fieldName];
  if (Array.isArray(fileField) && fileField.length > 0) {
    const folder = FIELD_TO_FOLDER[fieldName] ?? fieldName;
    return fileField
      .map((f: any) => {
        if (f?.location) return f.location;
        const key = f?.key || (f?.filename ? `${folder}/${f.filename}` : undefined);
        return key ? formatS3Url(key) : undefined;
      })
      .filter((p): p is string => Boolean(p));
  }
  return undefined;
};

// ─── Usage Guide ──────────────────────────────────────────────────────────────
// const avatar      = getSingleFilePath(req.files, 'profileImage');
// const govId       = getSingleFilePath(req.files, 'governmentId');
// const nursing     = getSingleFilePath(req.files, 'nursingCert');
// const criminal    = getSingleFilePath(req.files, 'criminalRecord');
// const insurance   = getSingleFilePath(req.files, 'insurance');
// const attachments = getMultipleFilesPath(req.files, 'attachment');
