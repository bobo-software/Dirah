# Phase 3 — Sharing

Workspaces become multi-user. Permissions apply to REST and sync.

## Goal

An owner can invite people as editor or viewer, and can mint a link that lets outsiders **read** a page (or workspace) without an account — product choice: **page-level public link** first (simpler).

## User-visible outcome

- Workspace settings: member list, invite by email (user must already have an account in v1), change role, remove member
- Editor: live sync between owner and editor (phase 2 path + membership)
- Viewer: can open pages, cannot type (editor read-only / BlockSuite readonly)
- “Copy share link” on a page: logged-out visitor sees a read-only editor (or a stripped reader) without the full app chrome

## Backend work

- `workspace_members.role`: `owner` | `editor` | `viewer`
- Invite: `POST /api/workspaces/:id/members` `{ email, role }` — 404 if no user with that email (no invite-email sending in v1 unless cheap)
- `DELETE /api/workspaces/:id/members/:userId`
- Cannot remove the last owner
- `share_links` + `POST /api/pages/:id/share` `{ permission: "view" }`
- Public read: `GET /api/public/pages/:token` metadata + WS or REST updates with **view** capability only
- Enforce on every `join` / `push` / blob GET:
  - `push` requires owner or editor
  - public token cannot push
- Existing owner-only checks become role helpers (`canEdit`, `canAdminMembers`)

## Web work

- Members panel
- Readonly editor when `viewer` or public
- Share dialog: create/revoke link, copy URL `/s/:token`
- Public route does not show other workspace pages

## Data model

```text
workspace_members.role  -- check constraint owner|editor|viewer

share_links
  token         text unique
  page_id       uuid
  workspace_id  uuid
  permission    text  -- view only in v1
  created_by    uuid
  expires_at    timestamptz null
  revoked_at    timestamptz null
  created_at    timestamptz
```

No change to Y.Doc format. Authz is entirely outside the CRDT.

## Acceptance checks

- Editor member: edits sync to owner
- Viewer member: REST PATCH page title fails; WS push ignored or rejected; UI not editable
- Public link: anonymous read of that page; 404 after revoke
- Public link cannot list sibling pages
- Non-member 403 on workspace GET
- Last owner cannot be demoted/removed
- Invite unknown email: clear error (not a hang)

## Not in this phase

- Email invite sending / magic links
- Guest editor via public link
- Per-page ACL beyond one public view link
- Teams, groups, SSO
- Comments
- Awareness avatars (still phase 5 polish)

## Related

- Previous: [phase-2-sync.md](./phase-2-sync.md)
- Next: [phase-4-workspace-ux.md](./phase-4-workspace-ux.md)
