# Phase 6 — Public docs MCP and first-class markdown

**Shipped.** Native iOS/Android remains next on the product backlog.

## Decision

Markdown documents and folders are a first-class catalog kind beside BlockSuite pages. Coding agents reach them through a **per-user** Streamable HTTP MCP at `/mcp` (personal access tokens now, OAuth 2.1 Connect as well). The developer Postgres MCP stays at `/mcp/protocol`.

## User-visible outcome

- Unified sidebar: folders, markdown files, and block pages as siblings
- Markdown editor (source + GFM preview), folder landing, import/download `.md`
- Settings: MCP tokens, workspace allowlist, owner kill switch
- Cursor / Claude Code connect with a Bearer PAT or OAuth

## Not in this slice

- Writing BlockSuite pages as markdown
- Git sync / webhooks
- Collaborative CRDT on markdown
