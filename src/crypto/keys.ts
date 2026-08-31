import { cryptoSource } from './bytes';

const KDF_ITERATIONS = 210_000;
const WRAP_MAGIC = new Uint8Array([0x44, 0x57, 0x31, 0x01]);
const NONCE_LEN = 12;
const P256_RAW_LEN = 65;

function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function b64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    cryptoSource(new TextEncoder().encode(password)),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: cryptoSource(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function hkdfAes(shared: ArrayBuffer): Promise<CryptoKey> {
  const hkdf = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: cryptoSource(new Uint8Array(0)),
      info: cryptoSource(new TextEncoder().encode('dira-workspace-dek')),
    },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function generateAccountPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
}

export async function exportPublicJwk(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}

export async function exportPrivateJwk(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}

export async function importAccountPrivate(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
}

export async function importAccountPublic(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
}

export async function wrapPrivateKey(
  password: string,
  privateKey: CryptoKey
): Promise<{ wrappedPrivateKey: string; kdfSalt: string; kdfIterations: number }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await pbkdf2(password, salt, KDF_ITERATIONS);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: cryptoSource(nonce) }, kek, cryptoSource(pkcs8)));
  const blob = new Uint8Array(nonce.length + ct.length);
  blob.set(nonce, 0);
  blob.set(ct, nonce.length);
  return {
    wrappedPrivateKey: bytesToB64(blob),
    kdfSalt: bytesToB64(salt),
    kdfIterations: KDF_ITERATIONS,
  };
}

export async function unwrapPrivateKey(
  password: string,
  wrappedPrivateKey: string,
  kdfSalt: string,
  kdfIterations: number
): Promise<CryptoKey> {
  const kek = await pbkdf2(password, b64ToBytes(kdfSalt), kdfIterations);
  const blob = b64ToBytes(wrappedPrivateKey);
  const nonce = blob.subarray(0, NONCE_LEN);
  const ct = blob.subarray(NONCE_LEN);
  const pkcs8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: cryptoSource(nonce) }, kek, cryptoSource(ct));
  return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
}

export async function wrapDekForPublicJwk(publicJwk: JsonWebKey, dek: CryptoKey): Promise<string> {
  const memberPub = await crypto.subtle.importKey(
    'jwk',
    publicJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: memberPub }, ephemeral.privateKey, 256);
  const wrapKey = await hkdfAes(shared);
  const rawDek = new Uint8Array(await crypto.subtle.exportKey('raw', dek));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: cryptoSource(nonce) }, wrapKey, cryptoSource(rawDek)));
  const ephPub = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));
  const out = new Uint8Array(WRAP_MAGIC.length + ephPub.length + nonce.length + ct.length);
  out.set(WRAP_MAGIC, 0);
  out.set(ephPub, WRAP_MAGIC.length);
  out.set(nonce, WRAP_MAGIC.length + ephPub.length);
  out.set(ct, WRAP_MAGIC.length + ephPub.length + nonce.length);
  return bytesToB64(out);
}

export async function unwrapDek(privateKey: CryptoKey, wrappedDek: string): Promise<CryptoKey> {
  const blob = b64ToBytes(wrappedDek);
  if (blob.length < WRAP_MAGIC.length + P256_RAW_LEN + NONCE_LEN + 16) {
    throw new Error('Invalid wrapped workspace key');
  }
  if (!WRAP_MAGIC.every((value, i) => blob[i] === value)) {
    throw new Error('Invalid wrapped workspace key');
  }
  const ephRaw = blob.subarray(WRAP_MAGIC.length, WRAP_MAGIC.length + P256_RAW_LEN);
  const nonce = blob.subarray(WRAP_MAGIC.length + P256_RAW_LEN, WRAP_MAGIC.length + P256_RAW_LEN + NONCE_LEN);
  const ct = blob.subarray(WRAP_MAGIC.length + P256_RAW_LEN + NONCE_LEN);
  const ephPub = await crypto.subtle.importKey(
    'raw',
    cryptoSource(ephRaw),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: ephPub }, privateKey, 256);
  const wrapKey = await hkdfAes(shared);
  const rawDek = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: cryptoSource(nonce) }, wrapKey, cryptoSource(ct));
  return crypto.subtle.importKey('raw', rawDek, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}
