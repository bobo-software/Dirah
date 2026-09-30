import { env } from '../config/env';

export type OAuthProvider = 'google' | 'github';

export type OAuthProfile = {
  email: string;
  providerUserId: string;
};

export type OAuthExchanger = (input: {
  provider: OAuthProvider;
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}) => Promise<OAuthProfile>;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function oauthConfigFromEnv(): {
  google: { clientId: string; clientSecret: string };
  github: { clientId: string; clientSecret: string };
  apiPublicUrl: string;
} {
  return {
    google: {
      clientId: (process.env.GOOGLE_CLIENT_ID ?? '').trim(),
      clientSecret: (process.env.GOOGLE_CLIENT_SECRET ?? '').trim(),
    },
    github: {
      clientId: (process.env.GITHUB_CLIENT_ID ?? '').trim(),
      clientSecret: (process.env.GITHUB_CLIENT_SECRET ?? '').trim(),
    },
    apiPublicUrl: env.apiPublicUrl,
  };
}

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === 'google' || value === 'github';
}

async function googleProfile(code: string, redirectUri: string, clientId: string, clientSecret: string): Promise<OAuthProfile> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tokenBody = asRecord(await tokenRes.json());
  const access = str(tokenBody.access_token);
  if (!tokenRes.ok || !access) {
    throw new Error('Google token exchange failed');
  }
  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${access}` },
  });
  const user = asRecord(await userRes.json());
  if (!userRes.ok) {
    throw new Error('Google profile failed');
  }
  if (user.verified_email !== true) {
    const err = new Error('Email is not verified with Google') as Error & { code?: string };
    err.code = 'OAUTH_EMAIL_UNVERIFIED';
    throw err;
  }
  const email = str(user.email).trim().toLowerCase();
  const providerUserId = str(user.id);
  if (!email || !email.includes('@') || !providerUserId) {
    throw new Error('Google profile missing email');
  }
  return { email, providerUserId };
}

async function githubProfile(code: string, redirectUri: string, clientId: string, clientSecret: string): Promise<OAuthProfile> {
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const tokenBody = asRecord(await tokenRes.json());
  const access = str(tokenBody.access_token);
  if (!tokenRes.ok || !access) {
    throw new Error('GitHub token exchange failed');
  }
  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${access}`, Accept: 'application/json', 'User-Agent': 'dirah' },
  });
  const user = asRecord(await userRes.json());
  if (!userRes.ok) {
    throw new Error('GitHub profile failed');
  }
  const providerUserId = String(user.id ?? '');
  let email = str(user.email).trim().toLowerCase();
  if (!email || !email.includes('@')) {
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${access}`, Accept: 'application/json', 'User-Agent': 'dirah' },
    });
    const emails = (await emailsRes.json()) as Array<Record<string, unknown>>;
    const primary = emails.find((row) => row.primary === true && row.verified === true) ??
      emails.find((row) => row.verified === true);
    email = str(primary?.email).trim().toLowerCase();
  }
  if (!email || !email.includes('@') || !providerUserId) {
    const err = new Error('Email is not verified with GitHub') as Error & { code?: string };
    err.code = 'OAUTH_EMAIL_UNVERIFIED';
    throw err;
  }
  return { email, providerUserId };
}

export const defaultOAuthExchanger: OAuthExchanger = async ({
  provider,
  code,
  redirectUri,
  clientId,
  clientSecret,
}) => {
  if (provider === 'google') {
    return googleProfile(code, redirectUri, clientId, clientSecret);
  }
  return githubProfile(code, redirectUri, clientId, clientSecret);
};
