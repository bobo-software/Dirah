const MAGIC = new Uint8Array([0x44, 0x52, 0x31, 0x01]);
const NONCE_LEN = 12;

export function isEncryptedEnvelope(bytes: Uint8Array): boolean {
  if (bytes.length < MAGIC.length + NONCE_LEN + 16) return false;
  return MAGIC.every((value, i) => bytes[i] === value);
}

export async function sealBytes(key: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN));
  const copy = new Uint8Array(plaintext);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, copy)
  );
  const out = new Uint8Array(MAGIC.length + nonce.length + sealed.length);
  out.set(MAGIC, 0);
  out.set(nonce, MAGIC.length);
  out.set(sealed, MAGIC.length + nonce.length);
  return out;
}

export async function openBytes(key: CryptoKey, envelope: Uint8Array): Promise<Uint8Array> {
  if (!isEncryptedEnvelope(envelope)) {
    throw new Error('Not an encrypted update');
  }
  const nonce = envelope.subarray(MAGIC.length, MAGIC.length + NONCE_LEN);
  const ciphertext = envelope.subarray(MAGIC.length + NONCE_LEN);
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext)
  );
}

export async function generateDocKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function toPlainUpdate(key: CryptoKey | null, bytes: Uint8Array): Promise<Uint8Array> {
  if (!isEncryptedEnvelope(bytes)) return bytes;
  if (!key) {
    throw new Error('This page is encrypted. Sign in with your password on this device.');
  }
  return openBytes(key, bytes);
}

export async function toWireUpdate(key: CryptoKey | null, bytes: Uint8Array): Promise<Uint8Array> {
  if (!key) return bytes;
  return sealBytes(key, bytes);
}
