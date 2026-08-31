# Phase 5n — Email invites (no existing account)

Next item on [backlog.md](./backlog.md) when this was written. E2E encryption is done. Do not pull in OAuth, OIDC, or SSO.

## Decision

Invite still happens from the members panel. If that email **already has a Dira account**, they join immediately (unchanged). If they **do not**, the owner creates a pending invite. The invitee opens `/invite/:token`, sets a password, and lands in that workspace.

Mail is optional: `SMTP_URL` sends the link; if it is unset the API returns `inviteUrl` so the owner can copy it (local/dev). Google / GitHub OAuth shipped in [phase-5-oauth.md](./phase-5-oauth.md); enterprise SAML / company OIDC stays off this slice.

## Goal

An owner can add someone who has never registered. That person sets a password from the invite link and becomes a member.

## User-visible outcome

- Invite an unknown email: pending row + copyable link (or an email if SMTP is set)
- `/invite/:token`: email shown, password, join the workspace
- Existing-account invite still adds them immediately
- Unencrypted workspaces: invitee can edit/view per role after accept
- Encrypted workspaces: invitee is a member; the owner’s members panel wraps a DEK once they have a public key

## Work

- `workspace_invites` (workspace, email, role, token, expiry, accepted_at)
- `POST /api/workspaces/:id/members` creates a pending invite when the user is missing (no more 404)
- `GET /api/invites/:token` (public) preview; `POST /api/invites/:token/accept` `{ password }`
- List pending invites with members; owner can revoke a pending invite
- Optional `SMTP_URL` + `APP_PUBLIC_URL` (default the CORS origin when it is a single URL)
- Web: pending list, copy link, `/invite/:token` accept page

## Data model

```text
workspace_invites
  id, workspace_id, email, role, token, invited_by, expires_at, accepted_at, created_at
```

Token is random `base64url`. Expiry 7 days. Re-inviting the same pending email rotates the token.

## Acceptance checks

- Unknown email: 201 pending with `inviteUrl`; GET preview shows workspace name + role; accept with password → member of that workspace; stranger 403 on the workspace before accept
- Existing email invite still 201 member (sharing tests)
- Expired or used token: 404
- Viewer cannot invite
- No `SMTP_URL`: invite still works via the returned link

## Not in this slice

- OAuth / Google / GitHub (later: [phase-5-oauth.md](./phase-5-oauth.md)) / OIDC / SAML
- Magic-link login without a password
- Inviting to an encrypted workspace auto-wrapping the DEK before the invitee has keys (owner panel backfills)

## Related

- Sharing: [phase-3-sharing.md](./phase-3-sharing.md)
- Backlog: [backlog.md](./backlog.md)
