import { apiRequest, type PublicUser } from './client';
import type { UserCryptoBundle } from './crypto';

export async function updateProfile(
  accessToken: string,
  input: { name?: string | null; role?: string | null; about?: string | null; email?: string; currentPassword?: string }
): Promise<PublicUser> {
  const data = await apiRequest<{ user: PublicUser }>('/api/auth/me', {
    method: 'PATCH',
    accessToken,
    body: JSON.stringify(input),
  });
  return data.user;
}

export async function changePassword(
  accessToken: string,
  input: { currentPassword?: string; newPassword: string; crypto?: UserCryptoBundle }
): Promise<PublicUser> {
  const data = await apiRequest<{ user: PublicUser }>('/api/auth/password', {
    method: 'POST',
    accessToken,
    body: JSON.stringify(input),
  });
  return data.user;
}
