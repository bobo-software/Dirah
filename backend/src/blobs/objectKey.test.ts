import { describe, expect, it } from 'vitest';
import { blobKindFolder, blobObjectKey } from './objectKey';

const userId = '11111111-1111-1111-1111-111111111111';
const workspaceId = '22222222-2222-2222-2222-222222222222';
const blobId = 'blob-1';

describe('blobKindFolder', () => {
  it('maps content types to a folder that names what is inside', () => {
    expect(blobKindFolder('image/png')).toBe('images');
    expect(blobKindFolder('IMAGE/JPEG; charset=binary')).toBe('images');
    expect(blobKindFolder('video/mp4')).toBe('videos');
    expect(blobKindFolder('audio/mpeg')).toBe('audio');
    expect(blobKindFolder('text/plain')).toBe('documents');
    expect(blobKindFolder('text/markdown; charset=utf-8')).toBe('documents');
    expect(blobKindFolder('application/pdf')).toBe('documents');
    expect(blobKindFolder('application/msword')).toBe('documents');
    expect(blobKindFolder('application/vnd.ms-excel')).toBe('documents');
    expect(blobKindFolder('application/vnd.ms-powerpoint')).toBe('documents');
    expect(blobKindFolder('application/rtf')).toBe('documents');
    expect(
      blobKindFolder('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    ).toBe('documents');
    expect(blobKindFolder('application/vnd.oasis.opendocument.text')).toBe('documents');
    expect(blobKindFolder('application/zip')).toBe('archives');
    expect(blobKindFolder('application/x-zip-compressed')).toBe('archives');
    expect(blobKindFolder('application/gzip')).toBe('archives');
    expect(blobKindFolder('application/x-gzip')).toBe('archives');
    expect(blobKindFolder('application/x-tar')).toBe('archives');
    expect(blobKindFolder('application/x-7z-compressed')).toBe('archives');
    expect(blobKindFolder('application/octet-stream')).toBe('files');
    expect(blobKindFolder('application/json')).toBe('files');
    expect(blobKindFolder('')).toBe('files');
  });
});

describe('blobObjectKey', () => {
  it('places the object under the user, workspace, and kind', () => {
    expect(
      blobObjectKey({
        userId,
        workspaceId,
        mime: 'image/png',
        blobId,
      })
    ).toBe(`${userId}/${workspaceId}/images/${blobId}`);
  });

  it('rejects a segment that contains a slash or ..', () => {
    expect(() =>
      blobObjectKey({ userId: `../${userId}`, workspaceId, mime: 'text/plain', blobId })
    ).toThrow(/user id/);
    expect(() =>
      blobObjectKey({ userId, workspaceId: `${workspaceId}/other`, mime: 'text/plain', blobId })
    ).toThrow(/workspace id/);
    expect(() =>
      blobObjectKey({ userId, workspaceId, mime: 'text/plain', blobId: '..' })
    ).toThrow(/blob id/);
    expect(() =>
      blobObjectKey({ userId: '', workspaceId, mime: 'text/plain', blobId })
    ).toThrow(/user id/);
  });
});
