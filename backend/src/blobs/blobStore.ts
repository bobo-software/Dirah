import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export type BlobStoreKind = 'disk' | 's3';

export type BlobStore = {
  kind: BlobStoreKind;
  put(key: string, body: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** Writes a stream without holding it in memory (multipart on S3). */
  putStream(key: string, body: Readable, mime: string): Promise<void>;
  /** Reads all of an object, or the inclusive byte range given, as a stream. */
  getStream(key: string, range?: ByteRange): Promise<Readable>;
  remove(key: string): Promise<void>;
};

/** Inclusive byte range, as in an HTTP Range header. */
export type ByteRange = { start: number; end: number };

export type S3BlobConfig = {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
};

type S3ClientInstance = {
  send: (command: unknown) => Promise<{ Body?: { transformToByteArray: () => Promise<Uint8Array> } & Partial<Readable> }>;
};

type AwsUpload = {
  Upload: new (input: { client: unknown; params: Record<string, unknown>; queueSize?: number; partSize?: number }) => {
    done: () => Promise<unknown>;
  };
};

function loadAwsUpload(): AwsUpload {
  const require = createRequire(__filename);
  return require('@aws-sdk/lib-storage') as AwsUpload;
}

type AwsS3 = {
  S3Client: new (config: Record<string, unknown>) => S3ClientInstance;
  PutObjectCommand: new (input: Record<string, unknown>) => unknown;
  GetObjectCommand: new (input: Record<string, unknown>) => unknown;
  DeleteObjectCommand: new (input: Record<string, unknown>) => unknown;
  HeadBucketCommand: new (input: Record<string, unknown>) => unknown;
  CreateBucketCommand: new (input: Record<string, unknown>) => unknown;
};

function loadAwsS3(): AwsS3 {
  const require = createRequire(__filename);
  return require('@aws-sdk/client-s3') as AwsS3;
}

export function createDiskBlobStore(rootDir: string): BlobStore {
  return {
    kind: 'disk',
    async put(key, body) {
      const abs = path.join(rootDir, key);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, body);
    },
    async get(key) {
      return fs.readFile(path.join(rootDir, key));
    },
    async putStream(key, body) {
      const abs = path.join(rootDir, key);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      const partial = `${abs}.partial`;
      try {
        await pipeline(body, createWriteStream(partial));
        await fs.rename(partial, abs);
      } catch (error) {
        await fs.unlink(partial).catch(() => undefined);
        throw error;
      }
    },
    async getStream(key, range) {
      const abs = path.join(rootDir, key);
      await fs.access(abs);
      return createReadStream(abs, range ? { start: range.start, end: range.end } : undefined);
    },
    async remove(key) {
      await fs.unlink(path.join(rootDir, key)).catch(() => undefined);
    },
  };
}

export function createS3BlobStore(config: S3BlobConfig): BlobStore {
  const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadBucketCommand,
    CreateBucketCommand,
  } = loadAwsS3();
  const bucket = config.bucket;
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint.replace(/\/$/, ''),
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  let bucketReady = false;

  async function ensureBucket(): Promise<void> {
    if (bucketReady) return;
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    }
    bucketReady = true;
  }

  return {
    kind: 's3',
    async put(key, body, mime) {
      await ensureBucket();
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: mime,
          ContentLength: body.length,
        })
      );
    },
    async get(key) {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await out.Body?.transformToByteArray();
      if (!bytes) {
        throw new Error('empty object');
      }
      return Buffer.from(bytes);
    },
    async putStream(key, body, mime) {
      await ensureBucket();
      const { Upload } = loadAwsUpload();
      await new Upload({
        client,
        params: { Bucket: bucket, Key: key, Body: body, ContentType: mime },
        queueSize: 4,
        partSize: 8 * 1024 * 1024,
      }).done();
    },
    async getStream(key, range) {
      const out = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
        })
      );
      if (!out.Body || typeof (out.Body as Readable).pipe !== 'function') {
        throw new Error('empty object');
      }
      return out.Body as unknown as Readable;
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
    },
  };
}

export function createBlobStore(input: {
  blobDir: string;
  minio: S3BlobConfig;
}): BlobStore {
  const endpoint = input.minio.endpoint.trim();
  const accessKey = input.minio.accessKey.trim();
  const secretKey = input.minio.secretKey.trim();
  if (endpoint && accessKey && secretKey) {
    return createS3BlobStore({
      ...input.minio,
      endpoint,
      accessKey,
      secretKey,
      bucket: input.minio.bucket.trim() || 'dirah',
      region: input.minio.region.trim() || 'us-east-1',
    });
  }
  return createDiskBlobStore(input.blobDir);
}
