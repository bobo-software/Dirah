# Phase 5m — E2E encryption of updates

Next item on [backlog.md](./backlog.md) when this was written. MinIO blobs are done. Do not pull in blob encryption, passwordless recovery, or public share of ciphertext.

## Decision

**The API never sees page plaintext** once a workspace is encrypted. Clients seal Yjs update (and snapshot) bytes with AES-256-GCM before `/sync` and REST catchup. A **per-workspace data key (DEK)** is generated in the browser. Each member gets that DEK wrapped to their **ECDH P-256** public key (ECIES). The member’s private key is wrapped with a KEK from their password (PBKDF2-SHA-256 + AES-GCM) and stored on the server as opaque blobs.

Unencrypted workspaces stay exactly as today. Encryption is **opt-in, one-way**, owner-only. Default off.

The unwrapped account key is kept in `localStorage` (`dira.accountKey`) so a tab refresh can decrypt without re-typing the password — same class of XSS risk as the refresh token. Logout clears it.

## Goal

Two members of an encrypted workspace still converge live. A Postgres dump of `doc_updates` does not contain the typed words.

## User-visible outcome

- Owner can turn on **Encrypt pages** in the members panel
- After that, typing still appears in another signed-in member tab without reload
- Public **Share** is refused (link viewers have no DEK)
- **History** save/preview and **Ask** are unavailable (server would have to read the doc)
- Workspaces that never enable encryption are unchanged

## Work

- `workspaces.encrypted` (boolean, default false)
- `user_crypto` (public JWK + password-wrapped private key + KDF salt)
- `workspace_member_keys` (per-member wrapped DEK)
- REST: `GET/PUT /api/auth/crypto`, `GET /api/workspaces/:id/crypto`, `PUT …/crypto/keys`, `POST …/crypto/enable`
- On push/catchup: persist and relay **opaque** bytes; skip Yjs merge, search reindex, and history preview when `encrypted`
- Web: seal/open updates on `/sync`; wrap DEK for invitees; Encrypted badge

## Data model

Envelope (updates/snapshots): magic `DR1` + version byte + 12-byte nonce + AES-GCM ciphertext.

Server does not store the DEK.

## Acceptance checks

- Encrypted workspace: two owner tabs, a unique word typed in A appears in B; that word is not in `doc_updates` bytes
- Unencrypted workspace: existing `/sync` tests still pass
- Stranger still 403 on catchup
- `POST /api/pages/:id/share` is 409 when the workspace is encrypted
- Viewer cannot enable encryption (owner only)
- Disk/MinIO blobs unchanged (not encrypted in this slice)

## Not in this slice

- Encrypting file blobs
- Public share of encrypted pages (including key-in-URL-fragment)
- Server-side search / History / Ask / compaction of ciphertext
- Password change rewrap, recovery phrases, hardware keys
- Turning encryption off

## Related

- Sync: [phase-2-sync.md](./phase-2-sync.md)
- Backlog: [backlog.md](./backlog.md)
