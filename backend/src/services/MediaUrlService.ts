import crypto from 'node:crypto';
import { isValidBlobId } from '../utils/blobRefs';

export interface SignedMediaUrl {
  url: string;
  expiresAt: string;
}

export interface MediaUrlOptions {
  /** Origin the links are served from, e.g. https://api.dirah.co.za. */
  publicOrigin: string;
  /** HMAC key. An empty value derives one from `fallbackSecret`. */
  secret: string;
  fallbackSecret: string;
  defaultTtlSeconds: number;
  maxTtlSeconds: number;
  now?: () => number;
}

/**
 * Temporary, unauthenticated links to one blob: `/api/media/<blobId>?exp=&sig=`.
 * An external video generator can fetch them without a Dirah login. The
 * signature covers the blob id and expiry, so a link cannot be pointed at
 * another blob or extended.
 */
export class MediaUrlService {
  private readonly key: Buffer;
  private readonly origin: string;
  private readonly now: () => number;

  constructor(private readonly options: MediaUrlOptions) {
    const secret = options.secret || options.fallbackSecret;
    this.key = options.secret
      ? Buffer.from(secret)
      : crypto.createHmac('sha256', secret).update('dirah-media-url-v1').digest();
    this.origin = options.publicOrigin.replace(/\/$/, '');
    this.now = options.now ?? Date.now;
  }

  /** The TTL to use: the default when unset, never more than the maximum, at least a minute. */
  clampTtl(ttlSeconds?: number): number {
    const ttl = ttlSeconds && Number.isFinite(ttlSeconds) ? Math.floor(ttlSeconds) : this.options.defaultTtlSeconds;
    return Math.min(this.options.maxTtlSeconds, Math.max(60, ttl));
  }

  sign(blobId: string, ttlSeconds?: number): SignedMediaUrl {
    const exp = Math.floor(this.now() / 1000) + this.clampTtl(ttlSeconds);
    const sig = this.signature(blobId, exp);
    return {
      url: `${this.origin}/api/media/${encodeURIComponent(blobId)}?exp=${exp}&sig=${sig}`,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  /** Seconds the link has left when the signature is valid and unexpired; null otherwise. */
  verify(blobId: string, expRaw: unknown, sigRaw: unknown): number | null {
    if (!isValidBlobId(blobId) || typeof expRaw !== 'string' || typeof sigRaw !== 'string') return null;
    if (!/^\d{1,12}$/.test(expRaw)) return null;
    const exp = Number(expRaw);
    const remaining = exp - Math.floor(this.now() / 1000);
    if (remaining <= 0) return null;
    const expected = Buffer.from(this.signature(blobId, exp));
    const given = Buffer.from(sigRaw);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    return remaining;
  }

  private signature(blobId: string, exp: number): string {
    return crypto.createHmac('sha256', this.key).update(`${blobId}.${exp}`).digest('base64url');
  }
}
