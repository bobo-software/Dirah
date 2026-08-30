import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyAccessToken } from '../utils/jwt';
import { HttpError } from '../utils/HttpError';
import type { DocSyncService } from '../services/DocSyncService';
import type { SyncBus, SyncPayload } from './syncBus';

interface ClientMessage {
  type: string;
  token?: string;
  share?: string;
  workspaceId?: string;
  docId?: string;
  clock?: number;
  update?: string;
  clientId?: number;
}

interface SocketState {
  userId?: string;
  shareToken?: string;
  docId?: string;
  canPush: boolean;
  awarenessClientId?: number;
}

export type AttachDocSyncOptions = {
  bus?: SyncBus;
};

export function attachDocSync(
  server: HttpServer,
  sync: DocSyncService,
  options: AttachDocSyncOptions = {}
): WebSocketServer {
  const rooms = new Map<string, Set<WebSocket>>();
  const bus = options.bus;
  const wss = new WebSocketServer({ server, path: '/sync' });

  const fanout = (docId: string, skip: WebSocket | null, payload: SyncPayload): void => {
    const room = rooms.get(docId);
    if (!room) return;
    const data = JSON.stringify(payload);
    for (const peer of room) {
      if (peer !== skip && peer.readyState === WebSocket.OPEN) {
        peer.send(data);
      }
    }
  };

  const broadcast = (docId: string, sender: WebSocket, payload: SyncPayload): void => {
    fanout(docId, sender, payload);
    bus?.publish(docId, payload);
  };

  const stopRemote = bus?.onRemote((docId, payload) => {
    fanout(docId, null, payload);
  });

  wss.on('connection', (socket, request) => {
    const state: SocketState = { canPush: false };
    const query = tokensFromRequest(request);
    if (query.token) {
      try {
        state.userId = verifyAccessToken(query.token).userId;
        send(socket, { type: 'ready' });
      } catch {
        send(socket, { type: 'error', code: 'UNAUTHORIZED', message: 'Unauthorized' });
        socket.close(4401, 'Unauthorized');
        return;
      }
    } else if (query.share) {
      state.shareToken = query.share;
      send(socket, { type: 'ready' });
    }

    socket.on('message', (raw) => {
      void handleMessage(socket, state, sync, raw.toString(), rooms, broadcast).catch(
        (error: unknown) => {
          if (error instanceof HttpError) {
            send(socket, { type: 'error', code: error.code ?? 'ERROR', message: error.message });
            if (error.status === 401) socket.close(4401, error.message);
            if (error.status === 403 && !state.docId) socket.close(4403, error.message);
            return;
          }
          send(socket, { type: 'error', code: 'INTERNAL', message: 'Internal error' });
        }
      );
    });

    socket.on('close', () => {
      leaveAwareness(socket, state, broadcast);
      leaveRoom(rooms, socket, state.docId);
    });
  });

  wss.on('close', () => {
    stopRemote?.();
  });
  server.on('close', () => {
    stopRemote?.();
  });

  return wss;
}

async function handleMessage(
  socket: WebSocket,
  state: SocketState,
  sync: DocSyncService,
  raw: string,
  rooms: Map<string, Set<WebSocket>>,
  broadcast: (docId: string, sender: WebSocket, payload: SyncPayload) => void
): Promise<void> {
  let message: ClientMessage;
  try {
    message = JSON.parse(raw) as ClientMessage;
  } catch {
    send(socket, { type: 'error', code: 'BAD_MESSAGE', message: 'Invalid JSON' });
    return;
  }

  if (message.type === 'auth') {
    if (message.share) {
      state.shareToken = message.share;
      state.userId = undefined;
      send(socket, { type: 'ready' });
      return;
    }
    if (!message.token) {
      throw new HttpError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    try {
      state.userId = verifyAccessToken(message.token).userId;
      state.shareToken = undefined;
    } catch {
      throw new HttpError('Unauthorized', 401, 'UNAUTHORIZED');
    }
    send(socket, { type: 'ready' });
    return;
  }

  if (!state.userId && !state.shareToken) {
    throw new HttpError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  if (message.type === 'join') {
    if (!message.docId || !message.workspaceId) {
      send(socket, { type: 'error', code: 'BAD_JOIN', message: 'workspaceId and docId required' });
      return;
    }
    let catchup;
    if (state.shareToken) {
      await sync.requireShareView(state.shareToken, message.docId, message.workspaceId);
      state.canPush = false;
      catchup = await sync.catchupShare(state.shareToken, message.docId, message.clock ?? 0);
    } else {
      const access = await sync.requireView(state.userId!, message.docId, message.workspaceId);
      state.canPush = access.canPush;
      catchup = await sync.catchup(state.userId!, message.docId, message.clock ?? 0);
    }
    leaveAwareness(socket, state, broadcast);
    leaveRoom(rooms, socket, state.docId);
    state.docId = message.docId;
    state.awarenessClientId = undefined;
    joinRoom(rooms, socket, message.docId);
    send(socket, {
      type: 'init',
      docId: message.docId,
      clock: catchup.clock,
      snapshot: catchup.snapshot ? catchup.snapshot.toString('base64') : null,
      updates: catchup.updates.map((row) => ({
        id: row.id,
        update: row.update.toString('base64'),
      })),
    });
    broadcast(message.docId, socket, { type: 'awareness-query', docId: message.docId });
    return;
  }

  if (message.type === 'awareness' || message.type === 'awareness-query') {
    if (!message.docId || !state.docId || state.docId !== message.docId) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN');
    }
    if (message.type === 'awareness-query') {
      broadcast(message.docId, socket, { type: 'awareness-query', docId: message.docId });
      return;
    }
    if (!message.update || typeof message.clientId !== 'number') {
      send(socket, { type: 'error', code: 'BAD_AWARENESS', message: 'clientId and update required' });
      return;
    }
    state.awarenessClientId = message.clientId;
    broadcast(message.docId, socket, {
      type: 'awareness',
      docId: message.docId,
      clientId: message.clientId,
      update: message.update,
    });
    return;
  }

  if (message.type === 'push') {
    if (!message.docId || !message.update) {
      send(socket, { type: 'error', code: 'BAD_PUSH', message: 'docId and update required' });
      return;
    }
    if (state.shareToken || !state.canPush || !state.userId) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN');
    }
    if (state.docId && state.docId !== message.docId) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN');
    }
    const buffer = Buffer.from(message.update, 'base64');
    const row = await sync.push(state.userId, message.docId, buffer);
    broadcast(message.docId, socket, {
      type: 'update',
      docId: message.docId,
      id: row.id,
      update: row.update.toString('base64'),
    });
    return;
  }
}

function tokensFromRequest(request: IncomingMessage): { token: string | null; share: string | null } {
  const host = request.headers.host ?? 'localhost';
  const url = new URL(request.url ?? '/sync', `http://${host}`);
  return {
    token: url.searchParams.get('token') ?? url.searchParams.get('access_token'),
    share: url.searchParams.get('share'),
  };
}

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function joinRoom(rooms: Map<string, Set<WebSocket>>, socket: WebSocket, docId: string): void {
  let room = rooms.get(docId);
  if (!room) {
    room = new Set();
    rooms.set(docId, room);
  }
  room.add(socket);
}

function leaveAwareness(
  socket: WebSocket,
  state: SocketState,
  broadcast: (docId: string, sender: WebSocket, payload: SyncPayload) => void
): void {
  if (state.docId == null || state.awarenessClientId == null) return;
  broadcast(state.docId, socket, {
    type: 'awareness-leave',
    docId: state.docId,
    clientId: state.awarenessClientId,
  });
  state.awarenessClientId = undefined;
}

function leaveRoom(
  rooms: Map<string, Set<WebSocket>>,
  socket: WebSocket,
  docId: string | undefined
): void {
  if (!docId) return;
  const room = rooms.get(docId);
  if (!room) return;
  room.delete(socket);
  if (room.size === 0) rooms.delete(docId);
}
