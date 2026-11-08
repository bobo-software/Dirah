import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { HttpError } from './HttpError';

export interface MeteredStream {
  /** The first bytes of the source, for sniffing its type. */
  head: Buffer;
  /** The whole source (head included), counted and hashed as it is read. */
  stream: Readable;
  /** Valid once `stream` has been read to the end. */
  result(): { byteSize: number; contentHash: string };
}

/**
 * Reads the first `headBytes` of `source`, then hands back a stream of the
 * whole source that hashes and counts bytes as they pass and fails with 413
 * once more than `maxBytes` have been read. Nothing is buffered beyond the head.
 */
export async function meterStream(
  source: AsyncIterable<Buffer | Uint8Array | string>,
  options: { headBytes: number; maxBytes: number }
): Promise<MeteredStream> {
  const iterator = source[Symbol.asyncIterator]();
  const first: Buffer[] = [];
  let firstLength = 0;
  while (firstLength < options.headBytes) {
    const next = await iterator.next();
    if (next.done) break;
    const chunk = Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value);
    first.push(chunk);
    firstLength += chunk.length;
  }
  const head = Buffer.concat(first);
  const hash = crypto.createHash('sha256');
  let byteSize = 0;
  let finished = false;

  const take = (chunk: Buffer): Buffer => {
    byteSize += chunk.length;
    if (byteSize > options.maxBytes) {
      throw new HttpError(
        `File is larger than ${Math.round(options.maxBytes / (1024 * 1024))} MB`,
        413,
        'BLOB_TOO_LARGE'
      );
    }
    hash.update(chunk);
    return chunk;
  };

  async function* all(): AsyncGenerator<Buffer> {
    if (head.length) yield take(head);
    for (;;) {
      const next = await iterator.next();
      if (next.done) break;
      yield take(Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value));
    }
    finished = true;
  }

  let digest: string | null = null;
  return {
    head: head.subarray(0, options.headBytes),
    stream: Readable.from(all(), { objectMode: false }),
    result() {
      if (!finished) throw new Error('stream not fully read');
      digest ??= hash.digest('hex');
      return { byteSize, contentHash: digest };
    },
  };
}

/**
 * Parses a single-range `Range: bytes=` header against a file of `size` bytes.
 * Returns null for no (or an ignorable) header, 'unsatisfiable' for a range past
 * the end, or the inclusive range to send.
 */
export function parseRangeHeader(
  header: string | undefined,
  size: number
): { start: number; end: number } | 'unsatisfiable' | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null; // multi-range or malformed: send the whole file
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;
  if (size === 0) return 'unsatisfiable';
  let start: number;
  let end: number;
  if (!rawStart) {
    const suffix = Number(rawEnd);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}
