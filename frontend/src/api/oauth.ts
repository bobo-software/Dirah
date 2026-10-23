import { apiRequest } from './client';

export type OAuthStatus = {
  google: boolean;
  github: boolean;
};

export async function getOAuthStatus(): Promise<OAuthStatus> {
  const data = await apiRequest<{ oauth: OAuthStatus }>('/api/auth/oauth/status');
  return data.oauth;
}
