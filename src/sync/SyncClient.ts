import * as Y from 'yjs';
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
  type Awareness,
} from 'y-protocols/awareness';
import {
  base64ToBytes,
  bytesToBase64,
  type ClientMessage,
  type PresencePeer,
  type ServerMessage,
  type SyncStatus,
} from './protocol';
import { toPlainUpdate, toWireUpdate } from '../crypto/envelope';

const REMOTE = 'remote';

type AwarenessState = {
  user?: { name?: string };
  color?: string;
  idle?: boolean;
};

export type BindTarget = {
  workspaceId: string;
  docId: string;
  skipOrigins: unknown[];
  canPush?: boolean;
  awareness?: Awareness;
  docKey?: CryptoKey | null;
};

export class SyncClient {
  private socket: WebSocket | null = null;
  private status: SyncStatus = 'offline';
  private readonly listeners = new Set<(status: SyncStatus) => void>();
  private readonly presenceListeners = new Set<(peers: PresencePeer[]) => void>();
  private bound: { doc: Y.Doc; target: BindTarget; clock: number } | null = null;
  private updateListener: ((update: Uint8Array, origin: unknown) => void) | null = null;
  private awarenessListener: ((changes: unknown, origin: unknown) => void) | null = null;
  private stopped = true;
  private backoffMs = 500;
  private authed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private io: Promise<void> = Promise.resolve();
  private readonly options: {
    url: string;
    getToken: () => string | null;
    getShare?: () => string | null;
  };

  constructor(options: {
    url: string;
    getToken: () => string | null;
    getShare?: () => string | null;
  }) {
    this.options = options;
  }

  get currentStatus(): SyncStatus {
    return this.status;
  }

  onStatus(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onPresence(listener: (peers: PresencePeer[]) => void): () => void {
    this.presenceListeners.add(listener);
    listener(this.readPresence());
    return () => {
      this.presenceListeners.delete(listener);
    };
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.authed = false;
    this.setStatus('offline');
    this.emitPresence();
  }

  bind(doc: Y.Doc, target: BindTarget): () => void {
    this.unbind();
    this.bound = { doc, target, clock: 0 };
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE) return;
      if (target.skipOrigins.includes(origin)) return;
      if (target.canPush === false) return;
      this.enqueue(async () => {
        if (!this.bound || this.bound.doc !== doc) return;
        const wire = await toWireUpdate(target.docKey ?? null, update);
        this.send({ type: 'push', docId: target.docId, update: bytesToBase64(wire) });
      });
    };
    this.updateListener = onUpdate;
    doc.on('update', onUpdate);
    if (target.awareness) {
      const onAwareness = (_changes: unknown, origin: unknown) => {
        if (origin === REMOTE) return;
        this.sendLocalAwareness();
        this.emitPresence();
      };
      this.awarenessListener = onAwareness;
      target.awareness.on('update', onAwareness);
    }
    this.emitPresence();
    this.joinIfReady();
    return () => {
      if (this.bound?.doc === doc) {
        this.unbind();
      }
    };
  }

  private unbind(): void {
    if (!this.bound) return;
    if (this.updateListener) {
      this.bound.doc.off('update', this.updateListener);
    }
    const awareness = this.bound.target.awareness;
    if (awareness && this.awarenessListener) {
      removeAwarenessStates(awareness, [awareness.clientID], 'local');
      awareness.off('update', this.awarenessListener);
    }
    this.updateListener = null;
    this.awarenessListener = null;
    this.bound = null;
    this.emitPresence();
  }

  private setStatus(status: SyncStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.listeners.forEach((listener) => listener(status));
  }

  private connect(): void {
    if (this.stopped) return;
    const token = this.options.getToken();
    const share = this.options.getShare?.() ?? null;
    if (!token && !share) {
      this.setStatus('offline');
      return;
    }
    this.setStatus('syncing');
    const socket = new WebSocket(this.options.url);
    this.socket = socket;
    this.authed = false;

    socket.addEventListener('open', () => {
      if (share) {
        this.send({ type: 'auth', share });
      } else if (token) {
        this.send({ type: 'auth', token });
      }
    });

    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      this.onMessage(JSON.parse(event.data) as ServerMessage);
    });

    socket.addEventListener('close', () => {
      this.authed = false;
      if (this.socket === socket) this.socket = null;
      if (this.stopped) {
        this.setStatus('offline');
        return;
      }
      this.setStatus('offline');
      this.reconnectTimer = setTimeout(() => {
        this.backoffMs = Math.min(this.backoffMs * 2, 15000);
        this.connect();
      }, this.backoffMs);
    });
  }

  private onMessage(message: ServerMessage): void {
    if (message.type === 'ready') {
      this.authed = true;
      this.backoffMs = 500;
      if (this.bound) {
        this.joinIfReady();
      } else {
        this.setStatus('live');
      }
      return;
    }
    if (message.type === 'error') {
      this.setStatus('offline');
      return;
    }
    if (!this.bound) return;
    if (message.type === 'init' && message.docId === this.bound.target.docId) {
      this.enqueue(async () => {
        if (!this.bound || message.docId !== this.bound.target.docId) return;
        await this.applyCatchup(this.bound.doc, message, this.bound.target.docKey ?? null);
        this.bound.clock = message.clock;
        if (this.bound.target.canPush !== false) {
          const wire = await toWireUpdate(
            this.bound.target.docKey ?? null,
            Y.encodeStateAsUpdate(this.bound.doc)
          );
          this.send({
            type: 'push',
            docId: this.bound.target.docId,
            update: bytesToBase64(wire),
          });
        }
        this.sendLocalAwareness();
        this.setStatus('live');
      });
      return;
    }
    if (message.type === 'update' && message.docId === this.bound.target.docId) {
      this.enqueue(async () => {
        if (!this.bound || message.docId !== this.bound.target.docId) return;
        const plain = await toPlainUpdate(this.bound.target.docKey ?? null, base64ToBytes(message.update));
        Y.applyUpdate(this.bound.doc, plain, REMOTE);
        this.bound.clock = message.id;
      });
      return;
    }
    if (message.type === 'awareness-query' && message.docId === this.bound.target.docId) {
      this.sendLocalAwareness();
      return;
    }
    if (message.type === 'awareness' && message.docId === this.bound.target.docId) {
      const awareness = this.bound.target.awareness;
      if (!awareness) return;
      applyAwarenessUpdate(awareness, base64ToBytes(message.update), REMOTE);
      this.emitPresence();
      return;
    }
    if (message.type === 'awareness-leave' && message.docId === this.bound.target.docId) {
      const awareness = this.bound.target.awareness;
      if (!awareness || message.clientId === awareness.clientID) return;
      removeAwarenessStates(awareness, [message.clientId], REMOTE);
      this.emitPresence();
    }
  }

  private async applyCatchup(
    doc: Y.Doc,
    message: Extract<ServerMessage, { type: 'init' }>,
    docKey: CryptoKey | null
  ): Promise<void> {
    if (message.snapshot) {
      Y.applyUpdate(doc, await toPlainUpdate(docKey, base64ToBytes(message.snapshot)), REMOTE);
    }
    for (const row of message.updates) {
      Y.applyUpdate(doc, await toPlainUpdate(docKey, base64ToBytes(row.update)), REMOTE);
    }
  }

  private enqueue(work: () => Promise<void>): void {
    this.io = this.io.then(work).catch((error: unknown) => {
      console.error('sync crypto', error);
      this.setStatus('offline');
    });
  }

  private joinIfReady(): void {
    if (!this.authed || !this.bound || this.socket?.readyState !== WebSocket.OPEN) return;
    this.setStatus('syncing');
    this.send({
      type: 'join',
      workspaceId: this.bound.target.workspaceId,
      docId: this.bound.target.docId,
      clock: this.bound.clock,
    });
  }

  private sendLocalAwareness(): void {
    const awareness = this.bound?.target.awareness;
    if (!awareness || !this.bound) return;
    const update = encodeAwarenessUpdate(awareness, [awareness.clientID]);
    this.send({
      type: 'awareness',
      docId: this.bound.target.docId,
      clientId: awareness.clientID,
      update: bytesToBase64(update),
    });
  }

  private readPresence(): PresencePeer[] {
    const awareness = this.bound?.target.awareness;
    if (!awareness) return [];
    const peers: PresencePeer[] = [];
    awareness.getStates().forEach((raw, clientId) => {
      const state = raw as AwarenessState;
      peers.push({
        clientId,
        name: state.user?.name?.trim() || 'Anonymous',
        color: state.color,
        idle: Boolean(state.idle),
        self: clientId === awareness.clientID,
      });
    });
    return peers.sort((a, b) => Number(b.self) - Number(a.self) || a.name.localeCompare(b.name));
  }

  private emitPresence(): void {
    const peers = this.readPresence();
    this.presenceListeners.forEach((listener) => listener(peers));
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }
}
