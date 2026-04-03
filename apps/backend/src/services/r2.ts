import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type { Readable } from 'stream';

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env['R2_ACCESS_KEY_ID']!,
    secretAccessKey: process.env['R2_SECRET_ACCESS_KEY']!,
  },
});

export async function uploadToR2(key: string, body: Buffer, contentType: string): Promise<void> {
  await r2Client.send(new PutObjectCommand({
    Bucket: process.env['R2_BUCKET']!,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
}

export async function getFromR2(key: string): Promise<Buffer> {
  const result = await r2Client.send(new GetObjectCommand({
    Bucket: process.env['R2_BUCKET']!,
    Key: key,
  }));

  if (!result.Body) {
    throw new Error(`R2 object body is empty for key: ${key}`);
  }

  const stream = result.Body as Readable;
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

export async function deleteFromR2(key: string): Promise<void> {
  await r2Client.send(new DeleteObjectCommand({
    Bucket: process.env['R2_BUCKET']!,
    Key: key,
  }));
}
