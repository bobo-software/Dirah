/** Characters a blob id may use; ids are also path segments and object-store keys. */
const BLOB_ID = '[A-Za-z0-9._~+=-]{1,128}';

const WHOLE_ID = new RegExp(`^${BLOB_ID}$`);
/** A blob reference in markdown, e.g. `![alt](/api/blobs/:id)`. */
const BLOB_URL = new RegExp(`/api/blobs/(${BLOB_ID})`, 'g');

export function isValidBlobId(id: string): boolean {
  return WHOLE_ID.test(id);
}

/** The distinct blob ids that `markdown` links to, in order of first use. */
export function blobIdsInMarkdown(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(BLOB_URL)].map((match) => match[1]))];
}

export interface BlobAttachment {
  blobId: string;
  url: string;
}

/** The distinct blobs linked across several markdown bodies, for MCP read results. */
export function attachmentsIn(...markdowns: string[]): BlobAttachment[] {
  return blobIdsInMarkdown(markdowns.join('\n')).map((blobId) => ({ blobId, url: `/api/blobs/${blobId}` }));
}
