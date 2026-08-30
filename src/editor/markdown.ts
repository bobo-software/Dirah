type MarkdownBlock = {
  flavour: string;
  id?: string;
  children: MarkdownBlock[];
  text?: { toString: () => string };
  type?: string;
  checked?: boolean;
  language?: string;
  columns?: {
    id: string;
    name?: string;
    type?: string;
    data?: { options?: { id: string; value?: string }[] };
  }[];
  cells?: Record<string, Record<string, { value?: unknown }>>;
};

function textOf(block: MarkdownBlock): string {
  return block.text?.toString() ?? '';
}

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
  if (Array.isArray(value)) return value.map((item) => cellToText(item, column)).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).replace(/\|/g, '\\|');
}

function walk(block: MarkdownBlock, indent: number, lines: string[]): void {
  const pad = '  '.repeat(indent);
  switch (block.flavour) {
    case 'affine:page':
    case 'affine:note':
      for (const child of block.children) {
        walk(child, indent, lines);
      }
      return;
    case 'affine:surface':
      return;
    case 'affine:paragraph': {
      const body = textOf(block);
      const type = block.type ?? 'text';
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
      const body = textOf(block);
      const type = block.type ?? 'bulleted';
      let marker = '- ';
      if (type === 'numbered') marker = '1. ';
      else if (type === 'todo') marker = block.checked ? '- [x] ' : '- [ ] ';
      lines.push(`${pad}${marker}${body}`);
      for (const child of block.children) {
        walk(child, indent + 1, lines);
      }
      return;
    }
    case 'affine:code': {
      const lang = block.language ?? '';
      lines.push(`\`\`\`${lang}`, textOf(block), '```', '');
      break;
    }
    case 'affine:divider':
      lines.push('---', '');
      break;
    case 'affine:database': {
      const title = textOf(block) || 'Table';
      const columns = block.columns ?? [];
      const headers = columns.length > 0 ? columns.map((column) => column.name || 'Column') : ['Title'];
      lines.push(`### ${title}`, '');
      lines.push(`| ${headers.join(' | ')} |`);
      lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
      for (const row of block.children) {
        const cells = (row.id ? block.cells?.[row.id] : undefined) ?? {};
        const values =
          columns.length > 0
            ? columns.map((column) =>
                column.type === 'title' || column.name === 'Title'
                  ? textOf(row)
                  : cellToText(cells[column.id]?.value, column)
              )
            : [textOf(row)];
        lines.push(`| ${values.join(' | ')} |`);
      }
      lines.push('');
      return;
    }
    default:
      if (textOf(block)) {
        lines.push(textOf(block), '');
      }
      break;
  }
  for (const child of block.children) {
    walk(child, indent, lines);
  }
}

export function pageToMarkdown(root: unknown, fallbackTitle?: string): string {
  const page = asBlock(root);
  const lines: string[] = [];
  const title = (page ? textOf(page) : '') || fallbackTitle;
  if (title) {
    lines.push(`# ${title}`, '');
  }
  if (page) {
    for (const child of page.children) {
      if (child.flavour === 'affine:note') {
        walk(child, 0, lines);
      }
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function asBlock(value: unknown): MarkdownBlock | null {
  if (!value || typeof value !== 'object' || !('flavour' in value)) return null;
  return value as MarkdownBlock;
}
