const MAX_CHARS = 200_000;

type Ctor = new (...args: never[]) => object;

type Yns = {
  Text: Ctor;
  Map: Ctor;
  Array: Ctor;
  XmlText: Ctor;
  XmlElement: Ctor;
  XmlFragment: Ctor;
};

type YDocLike = { getMap: (name: string) => unknown };

type YCollection = {
  forEach: (fn: (item: unknown, key?: string) => void) => void;
  toString: () => string;
};

/**
 * Walk BlockSuite's `blocks` Y.Map and concatenate Y.Text (and similar) values.
 * Skips `sys:*` keys so flavours and ids do not pollute the index.
 */
export function extractPlainText(Y: Yns, doc: YDocLike): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();

  const take = (value: unknown, key?: string): void => {
    if (value == null || seen.has(value)) return;
    if (typeof key === 'string' && key.startsWith('sys:')) return;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) parts.push(trimmed);
      return;
    }
    if (typeof value !== 'object') return;
    seen.add(value);

    if (value instanceof Y.Text || value instanceof Y.XmlText) {
      const text = (value as YCollection).toString().trim();
      if (text) parts.push(text);
      return;
    }
    if (value instanceof Y.Array) {
      (value as YCollection).forEach((item) => take(item));
      return;
    }
    if (value instanceof Y.Map) {
      (value as YCollection).forEach((item, childKey) => take(item, childKey));
      return;
    }
    if (value instanceof Y.XmlElement || value instanceof Y.XmlFragment) {
      const text = (value as YCollection)
        .toString()
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) parts.push(text);
    }
  };

  take(doc.getMap('blocks'));
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
}
