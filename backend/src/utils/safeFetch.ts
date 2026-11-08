import dns from 'node:dns';
import https from 'node:https';
import type { IncomingMessage } from 'node:http';
import net from 'node:net';
import { HttpError } from './HttpError';

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const value = ipv4ToInt(ip);
    return BLOCKED_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (value & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (lower === '::' || lower === '::1') return true;
    const first = parseInt(lower.split(':')[0] || '0', 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
    if ((first & 0xff00) === 0xff00) return true; // multicast
    if (lower.startsWith('64:ff9b:') || lower.startsWith('2001:db8')) return true;
    return false;
  }
  return true;
}

/** dns.lookup that refuses non-public addresses, used at connect time so a rebinding DNS answer cannot slip through. */
const publicLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 0);
    const list = addresses as dns.LookupAddress[];
    const allowed = list.find((entry) => !isPrivateAddress(entry.address));
    if (!allowed || list.some((entry) => isPrivateAddress(entry.address))) {
      return callback(
        Object.assign(new Error(`Refusing to fetch from a private address (${hostname})`), { code: 'PRIVATE_ADDRESS' }),
        '',
        0
      );
    }
    if ((options as dns.LookupOptions).all) {
      return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, [allowed]);
    }
    return callback(null, allowed.address, allowed.family);
  });
};

export interface SafeFetchResult {
  response: IncomingMessage;
  finalUrl: string;
  contentLength: number | null;
  /** File name from Content-Disposition or the URL path, when there is one. */
  filename: string | null;
}

function filenameFrom(response: IncomingMessage, url: URL): string | null {
  const disposition = response.headers['content-disposition'] ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  if (match) {
    try {
      return decodeURIComponent(match[1]).slice(0, 200);
    } catch {
      return match[1].slice(0, 200);
    }
  }
  const last = url.pathname.split('/').filter(Boolean).pop();
  if (!last) return null;
  try {
    return decodeURIComponent(last).slice(0, 200);
  } catch {
    return last.slice(0, 200);
  }
}

/**
 * GETs a public https URL for import. Refuses private and loopback addresses
 * (checked on every connection, including redirects), follows at most
 * `maxRedirects`, and refuses a declared Content-Length over `maxBytes`. The
 * caller still enforces the size while reading, since the header can lie.
 */
export async function safeFetch(
  rawUrl: string,
  options: { maxBytes: number; maxRedirects?: number; timeoutMs?: number }
): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? 3;
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new HttpError('Invalid URL', 400, 'INVALID_URL');
  }
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (current.protocol !== 'https:') {
      throw new HttpError('Only https:// URLs can be imported', 400, 'INVALID_URL');
    }
    if (current.username || current.password) {
      throw new HttpError('URLs with credentials cannot be imported', 400, 'INVALID_URL');
    }
    if (net.isIP(current.hostname.replace(/^\[|\]$/g, '')) && isPrivateAddress(current.hostname.replace(/^\[|\]$/g, ''))) {
      throw new HttpError('Refusing to fetch from a private address', 400, 'PRIVATE_ADDRESS');
    }
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      const request = https.get(
        current,
        {
          lookup: publicLookup,
          timeout: options.timeoutMs ?? 30_000,
          headers: { 'User-Agent': 'Dirah-Media-Import/1.0', Accept: 'image/*,video/*,audio/*,*/*;q=0.5' },
        },
        resolve
      );
      request.on('timeout', () => request.destroy(new Error('timed out')));
      request.on('error', reject);
    }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'PRIVATE_ADDRESS') {
        throw new HttpError('Refusing to fetch from a private address', 400, 'PRIVATE_ADDRESS');
      }
      throw new HttpError(`Could not fetch the URL: ${error.message}`, 502, 'FETCH_FAILED');
    });

    const status = response.statusCode ?? 0;
    if (status >= 300 && status < 400 && response.headers.location) {
      response.resume();
      current = new URL(response.headers.location, current);
      continue;
    }
    if (status < 200 || status >= 300) {
      response.resume();
      throw new HttpError(`The URL answered with HTTP ${status}`, 502, 'FETCH_FAILED');
    }
    const declared = Number(response.headers['content-length']);
    const contentLength = Number.isFinite(declared) && declared >= 0 ? declared : null;
    if (contentLength !== null && contentLength > options.maxBytes) {
      response.destroy();
      throw new HttpError(
        `File is larger than ${Math.round(options.maxBytes / (1024 * 1024))} MB`,
        413,
        'BLOB_TOO_LARGE'
      );
    }
    return { response, finalUrl: current.toString(), contentLength, filename: filenameFrom(response, current) };
  }
  throw new HttpError('Too many redirects', 502, 'FETCH_FAILED');
}
