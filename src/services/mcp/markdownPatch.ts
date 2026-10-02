import { HttpError } from '../../utils/HttpError';

export type EditPatch = { oldString: string; newString: string; replaceAll?: boolean };

export type MarkdownEditInput = {
  oldString?: string;
  newString?: string;
  replaceAll?: boolean;
  patches?: EditPatch[];
  append?: string;
};

function nearbySnippet(content: string, oldString: string): string {
  const lines = content.split('\n');
  const needle = oldString.split('\n').find((line) => line.trim().length > 0) ?? oldString;
  let idx = needle ? lines.findIndex((line) => line.includes(needle)) : -1;
  if (idx < 0 && needle.length > 8) {
    const prefix = needle.slice(0, Math.min(24, needle.length));
    idx = lines.findIndex((line) => line.includes(prefix));
  }
  const start = idx < 0 ? 0 : Math.max(0, idx - 2);
  const end = idx < 0 ? Math.min(lines.length, 8) : Math.min(lines.length, idx + 4);
  return lines.slice(start, end).join('\n').slice(0, 400);
}

export function applyOnePatch(content: string, patch: EditPatch, label: string, hash: string): string {
  const occurrences = content.split(patch.oldString).length - 1;
  const details = {
    currentHash: hash,
    path: label,
    nearbySnippet: nearbySnippet(content, patch.oldString),
    hint: 'Retry with this currentHash; re-read only if nearbySnippet is not enough to craft oldString.',
  };
  if (occurrences === 0) {
    throw new HttpError('oldString was not found', 400, 'PATCH_NOT_FOUND', details);
  }
  if (occurrences > 1 && !patch.replaceAll) {
    throw new HttpError(
      `oldString occurs ${occurrences} times — pass replaceAll: true or narrow oldString to a unique match`,
      400,
      'PATCH_AMBIGUOUS',
      { ...details, occurrences }
    );
  }
  return patch.replaceAll
    ? content.split(patch.oldString).join(patch.newString)
    : content.replace(patch.oldString, patch.newString);
}

export function appendToMarkdown(content: string, addition: string): string {
  if (!addition) return content;
  if (!content) return addition;
  return content.endsWith('\n') ? content + addition : `${content}\n${addition}`;
}

/** Apply one edit mode. `label` is the path or note id included in patch errors. */
export function applyMarkdownEdit(
  content: string,
  input: MarkdownEditInput,
  label: string,
  hash: string
): string {
  const hasSingle = Boolean(input.oldString);
  const hasPatches = Boolean(input.patches?.length);
  const hasAppend = typeof input.append === 'string' && input.append.length > 0;
  const modes = [hasSingle, hasPatches, hasAppend].filter(Boolean).length;
  if (modes !== 1) {
    throw new HttpError(
      'Provide exactly one of oldString/newString, patches, or append',
      400,
      'INVALID_PATCH'
    );
  }
  if (hasAppend) {
    return appendToMarkdown(content, input.append!);
  }
  const patches: EditPatch[] = hasPatches
    ? input.patches!
    : [{ oldString: input.oldString!, newString: input.newString ?? '', replaceAll: input.replaceAll }];
  let next = content;
  for (const patch of patches) {
    if (!patch.oldString) {
      throw new HttpError('oldString is required', 400, 'INVALID_PATCH');
    }
    next = applyOnePatch(next, patch, label, hash);
  }
  return next;
}
