import { useEffect, useState } from 'react';
import { API_URL } from '../../api/client';
import { getOAuthStatus, type OAuthStatus } from '../../api/oauth';

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.95 10.7a5.4 5.4 0 0 1 0-3.4V4.97H.95a9 9 0 0 0 0 8.06l3-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.49c-2.23.48-2.7-1.08-2.7-1.08-.36-.93-.89-1.17-.89-1.17-.72-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.71 1.23 1.87.87 2.33.67.07-.52.28-.87.5-1.08-1.78-.2-3.64-.89-3.64-3.96 0-.88.31-1.59.83-2.15-.08-.2-.36-1.02.08-2.13 0 0 .67-.22 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.11.16 1.93.08 2.13.52.56.83 1.27.83 2.15 0 3.08-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z" />
    </svg>
  );
}

/** `invite` joins that workspace during sign-in when the provider email matches it. */
export function OAuthButtons({ invite, onStart }: { invite?: string; onStart?: () => void } = {}) {
  const [status, setStatus] = useState<OAuthStatus>({ google: false, github: false });
  const query = invite ? `?invite=${encodeURIComponent(invite)}` : '';

  useEffect(() => {
    void getOAuthStatus()
      .then(setStatus)
      .catch(() => setStatus({ google: false, github: false }));
  }, []);

  if (!status.google && !status.github) return null;

  return (
    <div className="oauth-buttons">
      {status.google ? (
        <a className="oauth-btn" href={`${API_URL}/api/auth/oauth/google/start${query}`} onClick={onStart}>
          <GoogleIcon />
          Continue with Google
        </a>
      ) : null}
      {status.github ? (
        <a className="oauth-btn" href={`${API_URL}/api/auth/oauth/github/start${query}`} onClick={onStart}>
          <GitHubIcon />
          Continue with GitHub
        </a>
      ) : null}
      <p className="oauth-or muted">or</p>
    </div>
  );
}
