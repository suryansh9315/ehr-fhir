import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { createLogger } from '../logger';

const logger = createLogger('minio');

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? 'minio',
        secretAccessKey: process.env.S3_SECRET_KEY ?? 'minio_local',
      },
      forcePathStyle: true, // required for MinIO
    });
  }
  return s3Client;
}

const BUCKET = process.env.S3_BUCKET ?? 'ehr-documents';

export async function ensureBucket(): Promise<void> {
  const client = getS3Client();
  try {
    await client.send(new HeadBucketCommand({ Bucket: BUCKET }));
    logger.info('S3 bucket exists', { bucket: BUCKET });
  } catch {
    logger.info('Creating S3 bucket', { bucket: BUCKET });
    await client.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }
}

export async function uploadDocument(
  key: string,
  body: string | Buffer,
  contentType = 'application/json'
): Promise<void> {
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  logger.debug('Document uploaded to S3', { key });
}

export async function getDocument(key: string): Promise<string> {
  const client = getS3Client();
  const response = await client.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  );

  const stream = response.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
