export interface MarkdownListItem {
  text: string;
  checked: boolean;
}

const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[( |x|X)\]\s*)?(.*)$/;
const FENCE_RE = /^\s*(```|~~~)/;

/** Drops inline markdown so a list line reads as plain text on a card. */
function plainText(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!~|>])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Every bullet, numbered and task-list line in a markdown document, in order,
 * flattened across nesting. `- [x]` items come back checked. Lines inside
 * fenced code blocks are ignored.
 */
export function markdownListItems(markdown: string): MarkdownListItem[] {
  const items: MarkdownListItem[] = [];
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = LIST_ITEM_RE.exec(line);
    if (!match) continue;
    const text = plainText(match[2]);
    if (text) items.push({ text, checked: match[1] === 'x' || match[1] === 'X' });
  }
  return items;
}
