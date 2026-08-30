import http from 'node:http';
import { createApp, getDocSync } from './app';
import { attachDocSync } from './sync/attachDocSync';
import { createSyncBus } from './sync/syncBus';
import { env } from './config/env';

async function main(): Promise<void> {
  const app = await createApp();
  const server = http.createServer(app);
  const bus = await createSyncBus(env.redisUrl);
  attachDocSync(server, getDocSync(app), { bus });

  server.listen(env.port, () => {
    console.log(`Dira API listening on http://localhost:${env.port}`);
    console.log(`MCP protocol at http://localhost:${env.port}/mcp/protocol`);
    console.log(`Sync websocket at ws://localhost:${env.port}/sync`);
    console.log(bus ? 'Sync fan-out via Redis' : 'Sync fan-out in-process');
    const minioReady =
      Boolean(env.minio.endpoint.trim()) &&
      Boolean(env.minio.accessKey.trim()) &&
      Boolean(env.minio.secretKey.trim());
    console.log(minioReady ? `Blobs: MinIO bucket ${env.minio.bucket}` : `Blobs: disk ${env.blobDir}`);
    console.log(
      env.smtpUrl.trim()
        ? `Invites: SMTP (${env.appPublicUrl})`
        : `Invites: copy-link (${env.appPublicUrl})`
    );
  });
}

main().catch((error) => {
  console.error('Failed to start Dira API:', error);
  process.exit(1);
});
