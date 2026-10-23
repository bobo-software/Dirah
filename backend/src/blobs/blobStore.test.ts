import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDiskBlobStore, createBlobStore } from './blobStore';

describe('disk blob store', () => {
  it('puts, gets, and removes bytes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dirah-blobs-'));
    const store = createDiskBlobStore(root);
    await store.put('ws/a', Buffer.from('hello-minio-guide'), 'text/plain');
    expect(await store.get('ws/a')).toEqual(Buffer.from('hello-minio-guide'));
    await store.remove('ws/a');
    await expect(store.get('ws/a')).rejects.toThrow();
  });

  it('uses s3 when MinIO endpoint and keys are set', () => {
    const store = createBlobStore({
      blobDir: '/tmp',
      minio: {
        endpoint: 'https://minio.example',
        accessKey: 'key',
        secretKey: 'secret',
        bucket: 'dirah',
        region: 'us-east-1',
      },
    });
    expect(store.kind).toBe('s3');
  });
});

describe('MinIO blob store', () => {
  it('roundtrips bytes when MINIO_ENDPOINT is configured', async () => {
    const { env } = await import('../config/env');
    const store = createBlobStore(env);
    if (store.kind !== 's3') {
      return;
    }
    const key = `dirah-phase5l/${Date.now()}`;
    const payload = Buffer.from('minio-roundtrip-zymurgy');
    await store.put(key, payload, 'text/plain');
    expect(await store.get(key)).toEqual(payload);
    await store.remove(key);
  });
});
