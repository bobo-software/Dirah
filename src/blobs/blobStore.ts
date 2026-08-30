import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

export type BlobStoreKind = 'disk' | 's3';

export type BlobStore = {
  kind: BlobStoreKind;
  put(key: string, body: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
};

export type S3BlobConfig = {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
};

type S3ClientInstance = {
  send: (command: unknown) => Promise<{ Body?: { transformToByteArray: () => Promise<Uint8Array> } }>;
};

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
      bucket: input.minio.bucket.trim() || 'dira',
      region: input.minio.region.trim() || 'us-east-1',
    });
  }
  return createDiskBlobStore(input.blobDir);
}
