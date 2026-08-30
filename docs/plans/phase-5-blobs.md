# Phase 5l — S3-compatible blobs (MinIO)

Next item on [backlog.md](./backlog.md) when this was written. Redis fan-out is done. Do not pull in encryption, a public MinIO URL in the browser, or a second blob API.

## Decision

The editor still talks to `/api/workspaces/:id/blobs` and `/api/blobs/:id`. Postgres `blobs` rows stay the catalog (id, hash, mime, `storage_key`). **Bytes** go to MinIO (S3 API) when `MINIO_ENDPOINT` plus access/secret keys are set. Otherwise bytes stay under `BLOB_DIR` on disk. The web client does not change.

## Goal

An image uploaded in the editor is stored in the configured bucket and still loads through the API (members and public share).

## User-visible outcome

- Insert image / file in a page: it appears after reload and in another tab
- Public share still serves those blobs
- Local without MinIO: same as today (`BLOB_DIR`)

## Work

- Read `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` (default `dira`), `MINIO_REGION` (default `us-east-1`)
- `MINIO_SERVER_URL` / `MINIO_BROWSER_REDIRECT_URL` are for the MinIO console; the API uses `MINIO_ENDPOINT`
- Put/get/delete object at `storage_key` (`{workspaceId}/{blobId}`); create the bucket if missing
- Download streams bytes from the store (no `sendFile` of a local path when using MinIO)
- Empty endpoint → disk `BLOB_DIR`

## Data model

`blobs` table unchanged. `storage_key` is the object key (or relative disk path).

## Acceptance checks

- With MinIO configured: POST a small blob, GET returns the same bytes and content-type; stranger is still 403
- Reload a page that contains that image: the image loads
- Without MinIO env: existing disk blob tests still pass

## Not in this slice

- Presigned browser-to-bucket uploads
- Changing BlockSuite blob ids
- E2E encryption, Redis, a second CDN URL

## Related

- Sync blobs: [phase-2-sync.md](./phase-2-sync.md)
- Backlog: [backlog.md](./backlog.md)
