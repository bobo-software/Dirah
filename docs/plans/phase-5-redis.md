# Phase 5k — Redis WebSocket adapter

Next item on [backlog.md](./backlog.md) when this was written. History is done. Do not pull in S3, encryption, or a second protocol.

## Decision

`/sync` stays `ws` on each API process. Rooms stay **in memory on that process**. When `REDIS_URL` is set, each process also publishes document updates and awareness to Redis pub/sub so **other API processes** can fan them out to their own sockets. No Redis means the same single-process behavior as today. The web client does not change.

## Goal

Two API processes sharing one Postgres can keep the same page live: a push (or awareness) on a socket attached to process A appears on sockets attached to process B.

## User-visible outcome

- Unchanged for the usual local run (one API, no `REDIS_URL`)
- Two browser tabs on that single API still converge without reload
- With Redis and two API processes: typing in a tab on process A appears in a tab on process B without reload

## Work

- Optional `REDIS_URL` (`redis://…`). Unset → no Redis client
- In-process rooms move inside `attachDocSync` (one map per HTTP server, not a module singleton)
- Shared bus: local fan-out excluding the sender, then publish; remote messages fan out to every local socket in that doc room
- Awareness, awareness-query, awareness-leave, and Yjs `update` all ride the bus
- If `REDIS_URL` is set but Redis is down: log and keep in-process rooms so one node still works

## Data model

Unchanged. Updates still persist in `doc_updates`. Redis holds **no** document state.

## Acceptance checks

- No `REDIS_URL`: existing `/sync` tests still pass; two tabs on the local API still show each other’s typing
- Two `attachDocSync` servers in one test process, separate room maps, shared in-memory bus: a push on server A arrives on a socket on server B
- Viewer/public `push` authz unchanged (403)

## Not in this slice

- S3 blobs, sticky sessions, a Redis-backed session store
- Requiring Redis for local development
- Changing the `/sync` JSON protocol
- E2E encryption

## Related

- Sync: [phase-2-sync.md](./phase-2-sync.md)
- Awareness: [phase-5-awareness.md](./phase-5-awareness.md)
- Backlog: [backlog.md](./backlog.md)
