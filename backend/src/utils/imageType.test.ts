import { describe, expect, it } from 'vitest';
import { sniffImageMime } from './imageType';

const bytes = (...values: number[]) => Buffer.from(values);
const text = (value: string) => Buffer.from(value, 'latin1');

describe('sniffImageMime', () => {
  it('recognises supported images by their leading bytes', () => {
    expect(sniffImageMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png');
    expect(sniffImageMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImageMime(text('GIF89a...'))).toBe('image/gif');
    expect(sniffImageMime(text('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffImageMime(text('\0\0\0\x18ftypheic\0\0\0\0'))).toBe('image/heic');
  });

  it('rejects anything else, whatever it claims to be', () => {
    expect(sniffImageMime(text('hello, this is not a png'))).toBeNull();
    expect(sniffImageMime(text('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageMime(text('\0\0\0\x18ftypmp42\0\0\0\0'))).toBeNull();
    expect(sniffImageMime(Buffer.alloc(0))).toBeNull();
  });
});
