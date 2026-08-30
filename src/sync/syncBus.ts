import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';

export type SyncPayload = Record<string, unknown>;

export interface SyncBus {
  readonly origin: string;
  publish(docId: string, payload: SyncPayload): void;
  onRemote(handler: (docId: string, payload: SyncPayload) => void): () => void;
  close(): Promise<void>;
}

type HubListener = (origin: string, docId: string, payload: SyncPayload) => void;

/** In-process stand-in for Redis: each `connect()` is one API node. */
export function createMemoryHub(): { connect: () => SyncBus } {
  const listeners = new Set<HubListener>();
  return {
    connect(): SyncBus {
      const origin = randomUUID();
      return {
        origin,
        publish(docId, payload) {
          for (const listener of listeners) {
            listener(origin, docId, payload);
          }
        },
        onRemote(handler) {
          const listener: HubListener = (from, docId, payload) => {
            if (from === origin) return;
            handler(docId, payload);
          };
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        async close() {
          /* no sockets */
        },
      };
    },
  };
}

const REDIS_CHANNEL = 'dira:sync';

export async function createRedisBus(url: string): Promise<SyncBus> {
  const origin = randomUUID();
  const publisher = createClient({ url });
  const subscriber = createClient({ url });
  publisher.on('error', (error: unknown) => {
    console.error('redis publisher', error);
  });
  subscriber.on('error', (error: unknown) => {
    console.error('redis subscriber', error);
  });
  await publisher.connect();
  await subscriber.connect();

  const remotes = new Set<(docId: string, payload: SyncPayload) => void>();
  await subscriber.subscribe(REDIS_CHANNEL, (raw: string) => {
    let parsed: { origin?: string; docId?: string; payload?: SyncPayload };
    try {
      parsed = JSON.parse(raw) as { origin?: string; docId?: string; payload?: SyncPayload };
    } catch {
      return;
    }
    if (!parsed.docId || !parsed.payload || parsed.origin === origin) return;
    for (const handler of remotes) {
      handler(parsed.docId, parsed.payload);
    }
  });

  return {
    origin,
    publish(docId, payload) {
      void publisher.publish(REDIS_CHANNEL, JSON.stringify({ origin, docId, payload }));
    },
    onRemote(handler) {
      remotes.add(handler);
      return () => {
        remotes.delete(handler);
      };
    },
    async close() {
      remotes.clear();
      await subscriber.unsubscribe(REDIS_CHANNEL).catch(() => undefined);
      await subscriber.quit().catch(() => undefined);
      await publisher.quit().catch(() => undefined);
    },
  };
}

export async function createSyncBus(redisUrl: string): Promise<SyncBus | undefined> {
  const url = redisUrl.trim();
  if (!url) return undefined;
  try {
    return await createRedisBus(url);
  } catch (error) {
    console.error('Redis sync bus unavailable; staying in-process', error);
    return undefined;
  }
}
