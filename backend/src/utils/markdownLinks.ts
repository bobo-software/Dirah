export interface MarkdownLink {
  text: string;
  target: string;
}

const LINK_RE = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const EXTERNAL_RE = /^(https?:|mailto:|#)/i;

export function extractMarkdownLinks(content: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  let match: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((match = LINK_RE.exec(content)) !== null) {
    const [, text, target] = match;
    if (EXTERNAL_RE.test(target)) continue;
    links.push({ text, target: target.split('#')[0] });
  }
  return links;
}
