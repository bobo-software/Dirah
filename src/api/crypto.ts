import { apiRequest } from './client';

export type UserCryptoBundle = {
  publicKey: string;
  wrappedPrivateKey: string;
  kdfSalt: string;
  kdfIterations: number;
};

export type WorkspaceCryptoMember = {
  userId: string;
  publicKey: string | null;
  hasDek: boolean;
};

export type WorkspaceCryptoView = {
  encrypted: boolean;
  wrappedDek: string | null;
  members: WorkspaceCryptoMember[];
};

export async function getAuthCrypto(accessToken: string): Promise<UserCryptoBundle | null> {
  const data = await apiRequest<{ crypto: UserCryptoBundle | null }>('/api/auth/crypto', {
    accessToken,
  });
  return data.crypto;
}

export async function putAuthCrypto(accessToken: string, bundle: UserCryptoBundle): Promise<void> {
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

export async function putWorkspaceMemberDek(
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

export async function enableWorkspaceEncryption(
  accessToken: string,
  workspaceId: string
): Promise<void> {
  await apiRequest(`/api/workspaces/${workspaceId}/crypto/enable`, {
    method: 'POST',
    accessToken,
  });
}
