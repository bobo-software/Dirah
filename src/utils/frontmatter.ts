export interface Frontmatter {
  topics?: string[];
  repos?: string[];
  when?: string;
  [key: string]: string | string[] | undefined;
}

export interface ParsedFrontmatter {
  data: Frontmatter;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function parseValue(raw: string): string | string[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  return trimmed.replace(/^["']|["']$/g, '');
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) {
    return { data: {}, body: content };
  }
  const block = match[1];
  const body = content.slice(match[0].length);
  const data: Frontmatter = {};
  for (const line of block.split(/\r?\n/)) {
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    if (!key) continue;
    const value = parseValue(line.slice(sep + 1));
    data[key] = value;
  }
  return { data, body };
}
