export type SyncStatus = 'offline' | 'syncing' | 'live';

export type PresencePeer = {
  clientId: number;
  name: string;
  color?: string;
  idle: boolean;
  self: boolean;
};

export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'auth'; share: string }
  | { type: 'join'; workspaceId: string; docId: string; clock: number }
  | { type: 'push'; docId: string; update: string }
  | { type: 'awareness'; docId: string; clientId: number; update: string }
  | { type: 'awareness-query'; docId: string };

export type ServerMessage =
  | { type: 'ready' }
  | {
      type: 'init';
      docId: string;
      clock: number;
      snapshot: string | null;
      updates: Array<{ id: number; update: string }>;
    }
  | { type: 'update'; docId: string; id: number; update: string }
  | { type: 'awareness'; docId: string; clientId: number; update: string }
  | { type: 'awareness-query'; docId: string }
  | { type: 'awareness-leave'; docId: string; clientId: number }
  | { type: 'error'; code: string; message: string };

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function syncUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/sync';
  url.search = '';
  url.hash = '';
  return url.toString();
}
