import {
  enableWorkspaceEncryption,
  getAuthCrypto,
  getWorkspaceCrypto,
  putAuthCrypto,
  putWorkspaceMemberDek,
} from '../api/crypto';
import { generateDocKey } from './envelope';
import {
  exportPrivateJwk,
  exportPublicJwk,
  generateAccountPair,
  importAccountPrivate,
  unwrapDek,
  unwrapPrivateKey,
  wrapDekForPublicJwk,
  wrapPrivateKey,
} from './keys';

const ACCOUNT_KEY = 'dira.accountKey';

type StoredAccount = {
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
};

let privateKey: CryptoKey | null = null;
const dekCache = new Map<string, CryptoKey>();

function persist(publicJwk: JsonWebKey, privateJwk: JsonWebKey): void {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ publicJwk, privateJwk } satisfies StoredAccount));
}

export function clearAccountKeys(): void {
  privateKey = null;
  dekCache.clear();
  localStorage.removeItem(ACCOUNT_KEY);
}

export async function restoreAccountKeys(): Promise<boolean> {
  const raw = localStorage.getItem(ACCOUNT_KEY);
  if (!raw) return false;
  try {
    const stored = JSON.parse(raw) as StoredAccount;
    privateKey = await importAccountPrivate(stored.privateJwk);
    return true;
  } catch {
    localStorage.removeItem(ACCOUNT_KEY);
    privateKey = null;
    return false;
  }
}

export async function bootstrapAccountKeys(password: string, accessToken: string): Promise<void> {
  const existing = await getAuthCrypto(accessToken);
  if (existing) {
    privateKey = await unwrapPrivateKey(
      password,
      existing.wrappedPrivateKey,
      existing.kdfSalt,
      existing.kdfIterations
    );
    const publicJwk = JSON.parse(existing.publicKey) as JsonWebKey;
    persist(publicJwk, await exportPrivateJwk(privateKey));
    return;
  }
  const pair = await generateAccountPair();
  const publicJwk = await exportPublicJwk(pair.publicKey);
  const wrapped = await wrapPrivateKey(password, pair.privateKey);
  await putAuthCrypto(accessToken, {
    publicKey: JSON.stringify(publicJwk),
    ...wrapped,
  });
  privateKey = pair.privateKey;
  persist(publicJwk, await exportPrivateJwk(pair.privateKey));
}

export async function workspaceDocKey(
  accessToken: string,
  workspaceId: string
): Promise<CryptoKey | null> {
  const cached = dekCache.get(workspaceId);
  if (cached) return cached;
  const view = await getWorkspaceCrypto(accessToken, workspaceId);
  if (!view.encrypted) return null;
  if (!privateKey) {
    throw new Error('This workspace is encrypted. Sign in with your password on this device.');
  }
  if (!view.wrappedDek) {
    throw new Error('You do not have a key for this encrypted workspace yet. Ask an owner to re-invite you.');
  }
  const dek = await unwrapDek(privateKey, view.wrappedDek);
  dekCache.set(workspaceId, dek);
  return dek;
}

export async function enableEncryption(accessToken: string, workspaceId: string): Promise<void> {
  if (!privateKey) {
    throw new Error('Sign in with your password on this device before turning on encryption.');
  }
  const view = await getWorkspaceCrypto(accessToken, workspaceId);
  const dek = await generateDocKey();
  for (const member of view.members) {
    if (!member.publicKey) continue;
    const publicJwk = JSON.parse(member.publicKey) as JsonWebKey;
    const wrapped = await wrapDekForPublicJwk(publicJwk, dek);
    await putWorkspaceMemberDek(accessToken, workspaceId, member.userId, wrapped);
  }
  await enableWorkspaceEncryption(accessToken, workspaceId);
  dekCache.set(workspaceId, dek);
}

export async function shareDekWithMember(
  accessToken: string,
  workspaceId: string,
  userId: string
): Promise<void> {
  const dek = dekCache.get(workspaceId) ?? (await workspaceDocKey(accessToken, workspaceId));
  if (!dek) return;
  const view = await getWorkspaceCrypto(accessToken, workspaceId);
  const member = view.members.find((row) => row.userId === userId);
  if (!member?.publicKey) return;
  const wrapped = await wrapDekForPublicJwk(JSON.parse(member.publicKey) as JsonWebKey, dek);
  await putWorkspaceMemberDek(accessToken, workspaceId, userId, wrapped);
}

export async function wrapMissingMemberKeys(
  accessToken: string,
  workspaceId: string
): Promise<void> {
  const view = await getWorkspaceCrypto(accessToken, workspaceId);
  if (!view.encrypted) return;
  const dek = dekCache.get(workspaceId) ?? (await workspaceDocKey(accessToken, workspaceId).catch(() => null));
  if (!dek) return;
  for (const member of view.members) {
    if (!member.publicKey || member.hasDek) continue;
    const wrapped = await wrapDekForPublicJwk(JSON.parse(member.publicKey) as JsonWebKey, dek);
    await putWorkspaceMemberDek(accessToken, workspaceId, member.userId, wrapped);
  }
}
