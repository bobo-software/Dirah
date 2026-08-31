/** Copy into a definite ArrayBuffer so WebCrypto accepts it under TypeScript 6 DOM types. */
export function cryptoSource(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
