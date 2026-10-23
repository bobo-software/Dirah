export const ENCRYPTED_PAGE_NOTICE =
  'This page was end-to-end encrypted and could not be converted to markdown. The original ciphertext is no longer available.\n';

type YTextLike = { toString: () => string };
type YArrayLike = { toArray?: () => unknown[]; length?: number; get?: (i: number) => unknown };
type YMapLike = {
  get: (key: string) => unknown;
  forEach?: (fn: (val: unknown, key: string) => void) => void;
};

type YDocLike = {
  getMap: (name: string) => { forEach: (fn: (val: unknown, key: string) => void) => void };
};

function asText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'toString' in value) {
    return String((value as YTextLike).toString());
  }
  return '';
}

function asMap(value: unknown): YMapLike | null {
  if (!value || typeof value !== 'object' || !('get' in value)) return null;
  return value as YMapLike;
}

function childrenIds(block: YMapLike): string[] {
  const kids = block.get('sys:children');
  if (!kids) return [];
  if (typeof kids === 'object' && kids !== null && 'toArray' in kids) {
    return ((kids as YArrayLike).toArray?.() ?? []).map(String);
  }
  if (Array.isArray(kids)) return kids.map(String);
  return [];
}

function flavourOf(block: YMapLike): string {
  return String(block.get('sys:flavour') ?? '');
}

function prop(block: YMapLike, name: string): unknown {
  return block.get(`prop:${name}`);
}

function jsonProp<T>(block: YMapLike, name: string): T | undefined {
  const value = prop(block, name);
  if (value == null) return undefined;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  if (typeof value === 'object' && value !== null && 'toJSON' in value) {
    return (value as { toJSON: () => T }).toJSON();
  }
  return value as T;
}

type Column = {
  id: string;
  name?: string;
  type?: string;
  data?: { options?: { id: string; value?: string }[] };
};

function cellToText(
  value: unknown,
  column?: { data?: { options?: { id: string; value?: string }[] } }
): string {
  if (value == null || value === '') return '';
  const options = column?.data?.options;
  if (typeof value === 'string' && options?.length) {
    const match = options.find((option) => option.id === value);
    if (match?.value) return match.value.replace(/\|/g, '\\|');
  }
  if (Array.isArray(value)) {
    return value.map((item) => cellToText(item, column)).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).replace(/\|/g, '\\|');
}

function walk(
  id: string,
  blocks: Map<string, YMapLike>,
  indent: number,
  lines: string[],
  workspaceId: string
): void {
  const block = blocks.get(id);
  if (!block) return;
  const flavour = flavourOf(block);
  const pad = '  '.repeat(indent);
  const body = asText(prop(block, 'text')) || asText(prop(block, 'title'));
  const kids = childrenIds(block);

  switch (flavour) {
    case 'affine:page':
    case 'affine:note':
      for (const child of kids) {
        walk(child, blocks, indent, lines, workspaceId);
      }
      return;
    case 'affine:surface':
    case 'affine:surface-ref':
    case 'affine:frame':
      return;
    case 'affine:paragraph': {
      const type = String(prop(block, 'type') ?? 'text');
      if (type === 'h1') lines.push(`# ${body}`);
      else if (type === 'h2') lines.push(`## ${body}`);
      else if (type === 'h3') lines.push(`### ${body}`);
      else if (type === 'h4') lines.push(`#### ${body}`);
      else if (type === 'h5') lines.push(`##### ${body}`);
      else if (type === 'h6') lines.push(`###### ${body}`);
      else if (type === 'quote') lines.push(`> ${body}`);
      else lines.push(body);
      lines.push('');
      break;
    }
    case 'affine:list': {
      const type = String(prop(block, 'type') ?? 'bulleted');
      let marker = '- ';
      if (type === 'numbered') marker = '1. ';
      else if (type === 'todo') marker = prop(block, 'checked') ? '- [x] ' : '- [ ] ';
      lines.push(`${pad}${marker}${body}`);
      for (const child of kids) {
        walk(child, blocks, indent + 1, lines, workspaceId);
      }
      return;
    }
    case 'affine:code': {
      const lang = String(prop(block, 'language') ?? '');
      lines.push(`\`\`\`${lang}`, body, '```', '');
      break;
    }
    case 'affine:divider':
      lines.push('---', '');
      break;
    case 'affine:image': {
      const sourceId = asText(prop(block, 'sourceId')) || String(prop(block, 'sourceId') ?? '');
      const caption = asText(prop(block, 'caption'));
      if (sourceId) {
        const href = workspaceId
          ? `/api/workspaces/${workspaceId}/blobs/${sourceId}`
          : `/api/blobs/${sourceId}`;
        lines.push(`![${caption}](${href})`, '');
      }
      break;
    }
    case 'affine:database': {
      const title = body || 'Table';
      const columns = jsonProp<Column[]>(block, 'columns') ?? [];
      const cells = jsonProp<Record<string, Record<string, { value?: unknown }>>>(block, 'cells') ?? {};
      const headers = columns.length > 0 ? columns.map((column) => column.name || 'Column') : ['Title'];
      lines.push(`### ${title}`, '');
      lines.push(`| ${headers.join(' | ')} |`);
      lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
      for (const rowId of kids) {
        const row = blocks.get(rowId);
        const rowTitle = row ? asText(prop(row, 'text')) || asText(prop(row, 'title')) : '';
        const rowCells = cells[rowId] ?? {};
        const values =
          columns.length > 0
            ? columns.map((column) =>
                column.type === 'title' || column.name === 'Title'
                  ? rowTitle
                  : cellToText(rowCells[column.id]?.value, column)
              )
            : [rowTitle];
        lines.push(`| ${values.join(' | ')} |`);
      }
      lines.push('');
      return;
    }
    default:
      if (body) {
        lines.push(body, '');
      }
      break;
  }
  for (const child of kids) {
    walk(child, blocks, indent, lines, workspaceId);
  }
}

export function yDocToMarkdown(
  doc: YDocLike,
  options: { fallbackTitle?: string; workspaceId?: string } = {}
): string {
  const blocks = new Map<string, YMapLike>();
  doc.getMap('blocks').forEach((value, key) => {
    const mapped = asMap(value);
    if (mapped) blocks.set(key, mapped);
  });

  const lines: string[] = [];
  let rootId: string | undefined;
  for (const [id, block] of blocks) {
    if (flavourOf(block) === 'affine:page') {
      rootId = id;
      break;
    }
  }

  const root = rootId ? blocks.get(rootId) : undefined;
  const title = (root ? asText(prop(root, 'title')) || asText(prop(root, 'text')) : '') || options.fallbackTitle;
  if (title) {
    lines.push(`# ${title}`, '');
  }

  if (root) {
    for (const childId of childrenIds(root)) {
      const child = blocks.get(childId);
      if (child && flavourOf(child) === 'affine:note') {
        walk(childId, blocks, 0, lines, options.workspaceId ?? '');
      }
    }
  } else {
    for (const [id, block] of blocks) {
      if (flavourOf(block) === 'affine:note') {
        walk(id, blocks, 0, lines, options.workspaceId ?? '');
      }
    }
  }

  const rendered = lines.join('\n').trimEnd();
  return rendered ? `${rendered}\n` : '';
}

export function planParentIds(pages: Array<{ id: string; parentId: string | null }>): Set<string> {
  const parents = new Set<string>();
  const ids = new Set(pages.map((page) => page.id));
  for (const page of pages) {
    if (page.parentId && ids.has(page.parentId)) {
      parents.add(page.parentId);
    }
  }
  return parents;
}
