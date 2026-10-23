import { apiRequest } from './client';
import { getMarkdown, listPages, putMarkdown, type MarkdownBody } from './pages';

export type UserCryptoBundle = {
  publicKey: string;
  wrappedPrivateKey: string;
  kdfSalt: string;
  kdfIterations: number;
};

export type WorkspaceCryptoView = {
  encrypted: boolean;
  wrappedDek: string | null;
  members: Array<{ userId: string; publicKey: string | null; hasDek: boolean }>;
};

export async function getMyCrypto(accessToken: string): Promise<UserCryptoBundle | null> {
  const data = await apiRequest<{ crypto: UserCryptoBundle | null }>('/api/auth/crypto', { accessToken });
  return data.crypto;
}

export async function putMyCrypto(accessToken: string, bundle: UserCryptoBundle): Promise<void> {
  await apiRequest('/api/auth/crypto', {
    method: 'PUT',
    accessToken,
    body: JSON.stringify(bundle),
  });
}

export async function getWorkspaceCrypto(
  accessToken: string,
  workspaceId: string
): Promise<WorkspaceCryptoView> {
  const data = await apiRequest<{ crypto: WorkspaceCryptoView }>(
    `/api/workspaces/${workspaceId}/crypto`,
    { accessToken }
  );
  return data.crypto;
}

export async function enableWorkspaceCrypto(
  accessToken: string,
  workspaceId: string,
  wrappedDek: string
): Promise<void> {
  await apiRequest(`/api/workspaces/${workspaceId}/crypto/enable`, {
    method: 'POST',
    accessToken,
    body: JSON.stringify({ wrappedDek }),
  });
}

export async function putMemberDek(
  accessToken: string,
  workspaceId: string,
  userId: string,
  wrappedDek: string
): Promise<void> {
  await apiRequest(`/api/workspaces/${workspaceId}/crypto/keys`, {
    method: 'PUT',
    accessToken,
    body: JSON.stringify({ userId, wrappedDek }),
  });
}

export async function listMarkdownBodies(
  accessToken: string,
  workspaceId: string
): Promise<MarkdownBody[]> {
  const live = await listPages(accessToken, workspaceId);
  const trashed = await listPages(accessToken, workspaceId, { trashed: true });
  const pages = [...live, ...trashed].filter((page) => page.kind === 'markdown');
  const bodies: MarkdownBody[] = [];
  for (const page of pages) {
    bodies.push(await getMarkdown(accessToken, page.id));
  }
  return bodies;
}

export async function writeMarkdownBody(
  accessToken: string,
  pageId: string,
  content: string,
  hash: string
): Promise<void> {
  await putMarkdown(accessToken, pageId, content, hash);
}
