import { S3Client } from '@aws-sdk/client-s3';
import config from './index';

// configure AWS S3
const s3Client = new S3Client({
  region: config.aws.region || process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: (config.aws.accessKeyId || process.env.AWS_ACCESS_KEY_ID || '')!,
    secretAccessKey: (config.aws.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || '')!,
  },
});

export default s3Client;

