# Phase 5o — Google / GitHub OAuth

**Shipped.** Email invites are done. Do not pull in SAML, OIDC enterprise SSO, or magic-link-only login.

## Decision

Sign in with **Google** and/or **GitHub** when that provider’s client id and secret are set. Unset credentials (local default) hide the buttons; password register/login still work. Same optional pattern as AI, Redis, MinIO, and SMTP.

Enterprise SSO (SAML / company OIDC) needs an identity-provider decision — see [backlog.md](./backlog.md) “Not without”.

## Goal

A person can create an account or sign in with Google or GitHub and land in a workspace, without a password.

## User-visible outcome

- Login and register: **Continue with Google** / **Continue with GitHub** only when that provider is configured
- First-time OAuth creates the user and “My workspace” (same as register)
- Same email as an existing account links and signs them in (invite-created users included)
- Password-only accounts unchanged
- OAuth-only accounts cannot use the password form until they have a password (out of scope to set one here)
- Encrypted workspaces still need a password-derived account key; OAuth sign-in does not unwrap E2E keys

## Work

- `users.password_hash` nullable
- `oauth_accounts` (user_id, provider, provider_user_id)
- `GET /api/auth/oauth/status` → `{ google, github }`
- `GET /api/auth/oauth/:provider/start` → 302 to the provider
- `GET /api/auth/oauth/:provider/callback` → upsert user, 302 to `{APP_PUBLIC_URL}/oauth#refreshToken=…`
- Env: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`, `API_PUBLIC_URL` (callback origin, default `http://localhost:4006`)
- Web: `/oauth` catch page stores the refresh token and continues like a normal session

## Data model

```text
oauth_accounts
  id, user_id, provider, provider_user_id, created_at
```

Unique `(provider, provider_user_id)`.

## Acceptance checks

- No provider secrets: status both false; start is 503; login page has no OAuth buttons; password register still works
- With a test exchanger: unknown email → 201-equivalent new user + workspace; second login same provider id → same user; existing password account with that email → linked, same user id
- Unverified provider email is rejected
- Callback with a bad state is 400

## Not in this slice

- SAML / enterprise OIDC / SSO
- Apple, Microsoft, or generic OIDC discovery
- Setting a password on an OAuth-only account
- Wrapping E2E keys without a password

## Related

- Invites: [phase-5-invites.md](./phase-5-invites.md)
- E2E: [phase-5-e2e.md](./phase-5-e2e.md)
- Backlog: [backlog.md](./backlog.md)
