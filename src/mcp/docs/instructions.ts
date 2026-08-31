import type { DocsGuide } from '../../services/DocsMcpService';

export const DIRA_DOCS_INSTRUCTIONS = `Dira is the team's markdown knowledge base (Postgres-backed virtual paths, not a git working tree).

- Prefer search_docs before inventing APIs, runbooks, or architecture.
- Prefer path (e.g. docs/api/auth.md) over UUIDs.
- Omit workspace / workspaceId when this token has exactly one allowlisted workspace. Otherwise pass workspace as a slug or name from list_workspaces.
- Pass hash from read_file on edit_file / write_file to avoid clobbering (409 HASH_MISMATCH).
- Use list_tree prefix/depth instead of dumping the whole tree. Use read_file startLine/maxLines for large notes.`;

export function buildDynamicInstructions(guide: DocsGuide): string {
  if (!guide.workspaces.length) {
    return `${DIRA_DOCS_INSTRUCTIONS}\n\nNo workspaces are allowlisted for this token yet — ask an owner to grant access in Dira settings.`;
  }
  const lines = guide.workspaces.map((ws) => {
    const marker = ws.default ? ' (default)' : '';
    const startAt = ws.startAt ? ` — start at ${ws.startAt}` : '';
    return `- ${ws.slug}${marker}${startAt}`;
  });
  return `${DIRA_DOCS_INSTRUCTIONS}\n\nWorkspaces allowlisted for this token:\n${lines.join('\n')}`;
}
