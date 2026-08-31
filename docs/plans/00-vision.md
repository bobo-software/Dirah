# 00 — Vision

Dira is a **markdown knowledge workspace**: people write `.md` documents, organize them in folders and workspaces, and reach the same tree from the web app or a docs MCP.

It started as an AFFiNE-inspired clone (BlockSuite + Yjs). The product is now **markdown files and folders only**. Bodies live in Postgres (`markdown_bodies`); MCP paths like `docs/api/auth.md` are virtual slug paths, not a git working tree.

## Product promise

A signed-in user can:

1. Own one or more workspaces
2. Create folders and markdown documents (GFM source + preview)
3. Search titles and body text, nest folders, trash, favorites, collection status
4. Share a markdown document with a public view link
5. Connect a coding agent via the docs MCP

Edits are last-write-wins (content hash / 409). There is no live CRDT merge, presence, whiteboard, or page E2E encryption.

## In scope

- Accounts, sessions, OAuth, invites
- Workspaces as the top-level container
- Folder + markdown catalog (`pages.kind`)
- REST GET/PUT markdown with hash concurrency
- Member roles and public share of markdown
- Full-text search over markdown bodies
- Docs MCP at `/mcp`

## What we are not doing

**Not a pixel clone of AFFiNE.** Chrome is original.

**Not BlockSuite / Yjs.** Those were removed in the markdown-only cutover.

**Not vendoring AFFiNE.**

## Related

- Architecture notes in [01-architecture.md](./01-architecture.md) describe the old Yjs split; treat Phase 7 (markdown-only) as the current product.
- Docs MCP: [phase-6-docs-mcp.md](./phase-6-docs-mcp.md), [HOW_TO_USE_DIRA_DOCS_MCP.md](../HOW_TO_USE_DIRA_DOCS_MCP.md)
