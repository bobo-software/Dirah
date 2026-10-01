import { create } from 'zustand';
import {
  enableWorkspaceCrypto,
  getMyCrypto,
  getWorkspaceCrypto,
  listMarkdownBodies,
  putMemberDek,
  putMyCrypto,
  writeMarkdownBody,
  type UserCryptoBundle,
} from '../api/crypto';

const TEXT_PREFIX = 'DR1.';
const VERSION = 1;
const KDF_ITERATIONS = 210_000;

type SessionKeys = {
  privateKey: CryptoKey;
  publicKeySpki: string;
};

type EncryptionState = {
  unlocked: boolean;
  lockingWorkspaceId: string | null;
};

let session: SessionKeys | null = null;
const dekByWorkspace = new Map<string, CryptoKey>();

export const useEncryptionStore = create<EncryptionState>(() => ({
  unlocked: false,
  lockingWorkspaceId: null,
}));

export function isUnlocked(): boolean {
  return session !== null;
}

export function clearCryptoSession(): void {
  session = null;
  dekByWorkspace.clear();
  useEncryptionStore.setState({ unlocked: false, lockingWorkspaceId: null });
}

export function isSealedMarkdown(content: string): boolean {
  return content.startsWith(TEXT_PREFIX);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bufferOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function pbkdf2Key(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', bufferOf(new TextEncoder().encode(password)), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: bufferOf(salt), iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function importPrivateKey(pkcs8: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', bufferOf(pkcs8), { name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveBits',
  ]);
}

async function publicKeyFromSpki(spki: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    bufferOf(base64ToBytes(spki)),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
}

async function createBundle(password: string): Promise<{ bundle: UserCryptoBundle; privateKey: CryptoKey; publicKeySpki: string }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicSpki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const kek = await pbkdf2Key(password, salt);
  const wrapped = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bufferOf(nonce) }, kek, bufferOf(pkcs8))
  );
  const privateKey = await importPrivateKey(pkcs8);
  const publicKeySpki = bytesToBase64(publicSpki);
  return {
    privateKey,
    publicKeySpki,
    bundle: {
      publicKey: publicKeySpki,
      wrappedPrivateKey: bytesToBase64(concat([nonce, wrapped])),
      kdfSalt: bytesToBase64(salt),
      kdfIterations: KDF_ITERATIONS,
    },
  };
}

async function decryptPkcs8(password: string, bundle: UserCryptoBundle): Promise<Uint8Array> {
  if (bundle.kdfIterations !== KDF_ITERATIONS) {
    throw new Error('Unsupported key derivation');
  }
  const packed = base64ToBytes(bundle.wrappedPrivateKey);
  const nonce = packed.slice(0, 12);
  const wrapped = packed.slice(12);
  const kek = await pbkdf2Key(password, base64ToBytes(bundle.kdfSalt));
  try {
    const pkcs8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bufferOf(nonce) }, kek, bufferOf(wrapped));
    return new Uint8Array(pkcs8);
  } catch {
    throw new Error('Wrong password for encrypted pages');
  }
}

async function openBundle(password: string, bundle: UserCryptoBundle): Promise<SessionKeys> {
  const pkcs8 = await decryptPkcs8(password, bundle);
  const privateKey = await importPrivateKey(pkcs8);
  return { privateKey, publicKeySpki: bundle.publicKey };
}

/** Re-wrap the existing account key with a new password. The key pair stays the same. */
export async function rewrapAccountKey(
  currentPassword: string,
  newPassword: string,
  bundle: UserCryptoBundle
): Promise<UserCryptoBundle> {
  const pkcs8 = await decryptPkcs8(currentPassword, bundle);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const kek = await pbkdf2Key(newPassword, salt);
  const wrapped = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bufferOf(nonce) }, kek, bufferOf(pkcs8))
  );
  return {
    publicKey: bundle.publicKey,
    wrappedPrivateKey: bytesToBase64(concat([nonce, wrapped])),
    kdfSalt: bytesToBase64(salt),
    kdfIterations: KDF_ITERATIONS,
  };
}

function remember(keys: SessionKeys): void {
  session = keys;
  dekByWorkspace.clear();
  useEncryptionStore.setState({ unlocked: true });
}

export async function provisionAccount(accessToken: string, password: string): Promise<void> {
  const existing = await getMyCrypto(accessToken);
  if (existing) {
    remember(await openBundle(password, existing));
    return;
  }
  const created = await createBundle(password);
  await putMyCrypto(accessToken, created.bundle);
  remember({ privateKey: created.privateKey, publicKeySpki: created.publicKeySpki });
}

async function ecdhAes(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  return crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function wrapDek(dekRaw: Uint8Array, recipientSpki: string): Promise<string> {
  const recipient = await publicKeyFromSpki(recipientSpki);
  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const ephemeralPublic = new Uint8Array(await crypto.subtle.exportKey('spki', ephemeral.publicKey));
  const aes = await ecdhAes(ephemeral.privateKey, recipient);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bufferOf(nonce) }, aes, bufferOf(dekRaw))
  );
  const length = new Uint8Array(2);
  length[0] = ephemeralPublic.length >> 8;
  length[1] = ephemeralPublic.length & 0xff;
  return bytesToBase64(concat([length, ephemeralPublic, nonce, ciphertext]));
}

async function unwrapDek(wrappedDek: string, privateKey: CryptoKey): Promise<Uint8Array> {
  const packed = base64ToBytes(wrappedDek);
  const publicLength = (packed[0] << 8) | packed[1];
  const ephemeralPublic = packed.slice(2, 2 + publicLength);
  const nonce = packed.slice(2 + publicLength, 2 + publicLength + 12);
  const ciphertext = packed.slice(2 + publicLength + 12);
  const recipient = await crypto.subtle.importKey(
    'spki',
    bufferOf(ephemeralPublic),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const aes = await ecdhAes(privateKey, recipient);
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bufferOf(nonce) }, aes, bufferOf(ciphertext));
  return new Uint8Array(raw);
}

async function importDek(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bufferOf(raw), 'AES-GCM', true, ['encrypt', 'decrypt']);
}

async function ensureDek(accessToken: string, workspaceId: string): Promise<CryptoKey> {
  const cached = dekByWorkspace.get(workspaceId);
  if (cached) return cached;
  if (!session) throw new Error('Unlock this workspace to read encrypted pages');
  const view = await getWorkspaceCrypto(accessToken, workspaceId);
  if (!view.wrappedDek) throw new Error('No encryption key for this workspace yet');
  const raw = await unwrapDek(view.wrappedDek, session.privateKey);
  const dek = await importDek(raw);
  dekByWorkspace.set(workspaceId, dek);
  return dek;
}

export async function sealMarkdown(accessToken: string, workspaceId: string, plaintext: string): Promise<string> {
  if (!plaintext) return '';
  const dek = await ensureDek(accessToken, workspaceId);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: bufferOf(nonce) },
      dek,
      bufferOf(new TextEncoder().encode(plaintext))
    )
  );
  const version = new Uint8Array([VERSION]);
  return TEXT_PREFIX + bytesToBase64(concat([version, nonce, ciphertext]));
}

export async function openMarkdown(accessToken: string, workspaceId: string, sealed: string): Promise<string> {
  if (!sealed) return '';
  if (!isSealedMarkdown(sealed)) return sealed;
  const dek = await ensureDek(accessToken, workspaceId);
  const packed = base64ToBytes(sealed.slice(TEXT_PREFIX.length));
  if (packed[0] !== VERSION) throw new Error('Unsupported encrypted page');
  const nonce = packed.slice(1, 13);
  const ciphertext = packed.slice(13);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bufferOf(nonce) },
      dek,
      bufferOf(ciphertext)
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error('Could not decrypt this page');
  }
}

async function grantMissingKeys(accessToken: string, workspaceId: string): Promise<void> {
  const dek = dekByWorkspace.get(workspaceId);
  if (!dek || !session) return;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', dek));
  const view = await getWorkspaceCrypto(accessToken, workspaceId);
  for (const member of view.members) {
    if (!member.publicKey || member.hasDek) continue;
    const wrapped = await wrapDek(raw, member.publicKey);
    await putMemberDek(accessToken, workspaceId, member.userId, wrapped);
  }
}

export async function encryptWorkspace(accessToken: string, workspaceId: string): Promise<void> {
  if (!session) throw new Error('Unlock this workspace to read encrypted pages');
  useEncryptionStore.setState({ lockingWorkspaceId: workspaceId });
  try {
    const view = await getWorkspaceCrypto(accessToken, workspaceId);
    if (!view.encrypted) {
      const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', dek));
      const wrapped = await wrapDek(raw, session.publicKeySpki);
      await enableWorkspaceCrypto(accessToken, workspaceId, wrapped);
      dekByWorkspace.set(workspaceId, dek);
    } else {
      await ensureDek(accessToken, workspaceId);
    }
    const bodies = await listMarkdownBodies(accessToken, workspaceId);
    for (const body of bodies) {
      if (isSealedMarkdown(body.content)) continue;
      const sealed = await sealMarkdown(accessToken, workspaceId, body.content);
      await writeMarkdownBody(accessToken, body.page.id, sealed, body.hash);
    }
    await grantMissingKeys(accessToken, workspaceId);
  } finally {
    useEncryptionStore.setState({ lockingWorkspaceId: null });
  }
}

export async function syncMemberKeys(accessToken: string, workspaceId: string): Promise<void> {
  if (!session) return;
  const view = await getWorkspaceCrypto(accessToken, workspaceId);
  if (!view.encrypted) return;
  await ensureDek(accessToken, workspaceId);
  await grantMissingKeys(accessToken, workspaceId);
}
