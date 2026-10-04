import type { DocsGuide } from '../../services/DocsMcpService';

export const DIRA_DOCS_INSTRUCTIONS = `Dirah is the team's markdown knowledge base (Postgres-backed virtual paths, not a git working tree).

- Prefer search_docs before inventing APIs, runbooks, or architecture. Hyphens and spaces in ticket ids fold together (PP-B4 matches "PP - B4"). Snippets are plain text (safe to copy into oldString).
- Notes are not pages. Use search_notes, list_notes, and read_note for notes. search_docs, list_tree, and read_file never return notes.
- A note is visible when you wrote it, or when its visibility is workspace. Only the author can edit. Pass hash from read_note on edit_note and write_note. Notes have no file path; use noteId.
- Link notes with [[Label|noteId]] in note content; every note row includes a ready-made link field. [[Title]] also works but breaks on rename. read_note returns backlinks: notes that link to it.
- For a list with a note per item ("list books, each with a note to write in"), call create_linked_notes once instead of write_note per item.
- Prefer path (e.g. docs/api/auth.md) over UUIDs for pages.
- Omit workspace / workspaceId when this token has exactly one allowlisted workspace. Otherwise pass workspace as a slug or name from list_workspaces.
- Pass hash from read_file on edit_file / write_file to avoid clobbering (409 HASH_MISMATCH). Use edit_file patches or append for several changes on one hash; the response hash is enough for the next call — do not re-read unless a patch failed.
- Prefer one ## Status block per plan/progress note. After shipping, update that block; do not maintain a second "Shipped behaviour" list unless it is the same section.
- write_file may warn when a new path is not linked from the workspace index (startAt). Add a link yourself; the tool does not edit the index.
- Use list_tree prefix/depth instead of dumping the whole tree. Use read_file startLine/maxLines for large notes.`;

export function buildDynamicInstructions(guide: DocsGuide): string {
  if (!guide.workspaces.length) {
    return `${DIRA_DOCS_INSTRUCTIONS}\n\nNo workspaces are allowlisted for this token yet — ask an owner to grant access in Dirah settings.`;
  }
  const lines = guide.workspaces.map((ws) => {
    const marker = ws.default ? ' (default)' : '';
    const startAt = ws.startAt ? ` — start at ${ws.startAt}` : '';
    return `- ${ws.slug}${marker}${startAt}`;
  });
  return `${DIRA_DOCS_INSTRUCTIONS}\n\nWorkspaces allowlisted for this token:\n${lines.join('\n')}`;
}
