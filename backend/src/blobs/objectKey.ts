export type BlobObjectKeyInput = {
  userId: string;
  workspaceId: string;
  mime: string;
  blobId: string;
};

const DOCUMENT_MIMES = new Set([
  'application/pdf',
  'application/rtf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
]);

const ARCHIVE_MIMES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/gzip',
  'application/x-gzip',
  'application/x-tar',
  'application/x-7z-compressed',
]);

function mediaType(mime: string): string {
  return mime.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

/** Folder name that describes the object: images, videos, audio, documents, archives, or files. */
export function blobKindFolder(mime: string): string {
  const type = mediaType(mime);
  if (type.startsWith('image/')) return 'images';
  if (type.startsWith('video/')) return 'videos';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('text/')) return 'documents';
  if (DOCUMENT_MIMES.has(type) || type.startsWith('application/vnd.openxmlformats-officedocument.')) {
    return 'documents';
  }
  if (type.startsWith('application/vnd.oasis.opendocument.')) return 'documents';
  if (ARCHIVE_MIMES.has(type)) return 'archives';
  return 'files';
}

function assertSegment(value: string, label: string): void {
  if (!value || value.includes('/') || value.includes('..')) {
    throw new Error(`Invalid blob storage ${label}`);
  }
}

export function blobObjectKey(input: BlobObjectKeyInput): string {
  const userId = input.userId.trim();
  const workspaceId = input.workspaceId.trim();
  const blobId = input.blobId.trim();
  assertSegment(userId, 'user id');
  assertSegment(workspaceId, 'workspace id');
  assertSegment(blobId, 'blob id');
  const kind = blobKindFolder(input.mime);
  return `${userId}/${workspaceId}/${kind}/${blobId}`;
}
