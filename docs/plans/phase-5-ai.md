# Phase 5d — Optional copilot

Fourth later slice of [phase-5-later.md](./phase-5-later.md). Awareness is done. Do not pull in desktop, embeddings, or “ask the workspace.”

## Decision

A signed-in member can **ask about this page** (or the current selection). The server calls an OpenAI-compatible chat API **only if** `AI_API_KEY` is set. Editing, sync, and sharing work with the key unset. Context is whatever the client already has (markdown / selection) — no pgvector, no new tables.

## Goal

Ask a question, get an answer in a panel. Editors may insert the answer as paragraphs. If AI is off, the message is clear and the editor is unchanged.

## User-visible outcome

- Toolbar **Ask** (members on a signed-in page; not public `/s/:token`)
- Prompt box; context is the browser selection if any, otherwise the page markdown
- Reply in the panel
- **Insert** for owners/editors only
- Unconfigured server: Ask still opens; submit explains that AI is off

## Backend work

- `GET /api/ai/status` → `{ enabled }`
- `POST /api/ai/pages/:id` `{ prompt, context? }` — `requireMemberPage`, then provider
- Env: `AI_API_KEY` (required to enable), `AI_BASE_URL` (default `https://api.openai.com/v1`), `AI_MODEL` (default `gpt-4o-mini`)
- No key → **503** `AI_UNAVAILABLE`
- Non-member → 403; no auth → 401

## Web work

- Ask panel on the page editor
- `insertText` on the mounted editor (paragraphs under the first note)

## Data model

Unchanged. Do not store chats.

## Acceptance checks

- No `AI_API_KEY`: Ask submit returns a clear “not configured” error; typing in the page still works
- With a mock/provider: member gets a reply; stranger is 403
- Viewer can Ask, cannot Insert
- Insert adds visible paragraphs that survive a refresh (same Y.Doc sync as any other block)

## Not in this slice

- Workspace-wide RAG / embeddings / pgvector
- Streaming tokens, chat history, AFFiNE AI widgets
- Electron, provider keys in the browser

## Related

- Backlog: [phase-5-later.md](./phase-5-later.md)
- Export: [phase-4-workspace-ux.md](./phase-4-workspace-ux.md)
