# Product backlog

Remaining product work after the core clone (phases 0–4) and the later slices that already shipped (5a–5o). **This file is the ordered list of what to build next.** Technical leftovers stay in [../debt/](../debt/).

When you pull an item into a session, give it a phase file (same shape as [phase-5-history.md](./phase-5-history.md)), ship only that slice, then check it off here.

Shipped later slices: [phase-5-edgeless.md](./phase-5-edgeless.md), [phase-5-database.md](./phase-5-database.md), [phase-5-awareness.md](./phase-5-awareness.md), [phase-5-ai.md](./phase-5-ai.md), [phase-5-mobile.md](./phase-5-mobile.md), [phase-5-search.md](./phase-5-search.md), [phase-5-follow.md](./phase-5-follow.md), [phase-5-collection.md](./phase-5-collection.md), [phase-5-history.md](./phase-5-history.md), [phase-5-redis.md](./phase-5-redis.md), [phase-5-blobs.md](./phase-5-blobs.md), [phase-5-e2e.md](./phase-5-e2e.md), [phase-5-invites.md](./phase-5-invites.md), [phase-5-oauth.md](./phase-5-oauth.md). [phase-5-desktop.md](./phase-5-desktop.md) shipped then was removed (web only). Historical “why we skipped this for the core clone”: [phase-5-later.md](./phase-5-later.md).

## Now

_(none — pick the next numbered item when you continue.)_

## Next (in order)

1. **Native iOS / Android** — true mobile apps. The web reader ([phase-5-mobile.md](./phase-5-mobile.md)) is not this.
2. **Ask the workspace** — leftover from [phase-5-ai.md](./phase-5-ai.md): embeddings / pgvector over the corpus. **After full-text search.**
3. **Templates, graph / backlinks, multi-select move** — called out as not-in-phase in workspace UX. Product polish, not platform.

## Not without an explicit decision

- Enterprise SAML / company OIDC — leftover from [phase-5-oauth.md](./phase-5-oauth.md). Google / GitHub already shipped.
- Rewrite the API in Nest / GraphQL / Prisma to “match AFFiNE”
- Vendor AFFiNE frontend packages or pixel-clone their chrome
- Payments / public-cloud billing
- Desktop wrapper (Electron / Tauri) or embedding the API in a native shell

## How this relates to other docs

| File | Role |
|------|------|
| [PROGRESS.md](../PROGRESS.md) | What is true *this session* (Now / Done / Next) |
| This backlog | Ordered remaining *product* work |
| [../debt/](../debt/) | Engineering leftovers (ports, drizzle-kit, tests) |
| [phase-5-later.md](./phase-5-later.md) | Original later-surface essay; points here for what is left |
