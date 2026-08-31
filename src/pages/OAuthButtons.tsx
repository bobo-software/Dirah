import { useEffect, useState } from 'react';
import { API_URL } from '../api/client';
import { getOAuthStatus, type OAuthStatus } from '../api/oauth';

export function OAuthButtons() {
  const [status, setStatus] = useState<OAuthStatus>({ google: false, github: false });

  useEffect(() => {
    void getOAuthStatus()
      .then(setStatus)
      .catch(() => setStatus({ google: false, github: false }));
  }, []);

  if (!status.google && !status.github) return null;

  return (
    <div className="oauth-buttons">
      {status.google ? (
        <a className="oauth-btn" href={`${API_URL}/api/auth/oauth/google/start`}>
          Continue with Google
        </a>
      ) : null}
      {status.github ? (
        <a className="oauth-btn" href={`${API_URL}/api/auth/oauth/github/start`}>
          Continue with GitHub
        </a>
      ) : null}
      <p className="oauth-or muted">or</p>
    </div>
  );
}
