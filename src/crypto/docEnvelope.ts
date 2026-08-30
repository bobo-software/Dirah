import { webcrypto } from 'node:crypto';

const MAGIC = new Uint8Array([0x44, 0x52, 0x31, 0x01]);
const NONCE_LEN = 12;

export function isEncryptedEnvelope(bytes: Uint8Array): boolean {
  if (bytes.length < MAGIC.length + NONCE_LEN + 16) return false;
  return MAGIC.every((value, i) => bytes[i] === value);
}

export async function sealBytes(key: webcrypto.CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> {
  const nonce = webcrypto.getRandomValues(new Uint8Array(NONCE_LEN));
  const copy = new Uint8Array(plaintext);
  const sealed = new Uint8Array(
    await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, copy)
  );
  const out = new Uint8Array(MAGIC.length + nonce.length + sealed.length);
  out.set(MAGIC, 0);
  out.set(nonce, MAGIC.length);
  out.set(sealed, MAGIC.length + nonce.length);
  return out;
}

export async function openBytes(key: webcrypto.CryptoKey, envelope: Uint8Array): Promise<Uint8Array> {
  if (!isEncryptedEnvelope(envelope)) {
    throw new Error('Not an encrypted update');
  }
  const nonce = envelope.slice(MAGIC.length, MAGIC.length + NONCE_LEN);
  const ciphertext = envelope.slice(MAGIC.length + NONCE_LEN);
  return new Uint8Array(
    await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext)
  );
}

export async function generateDocKey(): Promise<webcrypto.CryptoKey> {
  return webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
