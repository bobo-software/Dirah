# Phase 6 — Public docs MCP and first-class markdown

**Shipped.** Remaining product work is on [backlog.md](./backlog.md) (Ask the workspace is next). Native iOS/Android is parked.

## Decision

Markdown documents and folders are the catalog. Coding agents reach them through a **per-user** Streamable HTTP MCP at `/mcp` (personal access tokens now, OAuth 2.1 Connect as well). The developer Postgres MCP stays at `/mcp/protocol`.

## User-visible outcome

- Unified sidebar: folders and markdown files
- Markdown editor (source + GFM preview), folder landing, import/download `.md`
- Settings: MCP tokens, workspace allowlist, owner kill switch
- Cursor / Claude Code connect with a Bearer PAT or OAuth

## Not in this slice

- BlockSuite / Yjs pages (removed in Phase 7; leftover pages convert to markdown)
- Git sync / webhooks
- Collaborative CRDT on markdown
