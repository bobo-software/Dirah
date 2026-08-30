import { describe, expect, it } from 'vitest';
import { generateDocKey, isEncryptedEnvelope, openBytes, sealBytes } from './docEnvelope';

describe('doc envelope', () => {
  it('roundtrips bytes and is not plaintext', async () => {
    const key = await generateDocKey();
    const secret = new TextEncoder().encode('e2e-zymurgy-plaintext');
    const sealed = await sealBytes(key, secret);
    expect(isEncryptedEnvelope(sealed)).toBe(true);
    expect(new TextDecoder().decode(sealed).includes('e2e-zymurgy-plaintext')).toBe(false);
    expect(await openBytes(key, sealed)).toEqual(secret);
  });
});
