/* A small, fixed palette of hues so folders and doc cards get a stable,
   varied color without storing or picking one — same id always maps to
   the same hue. */
const HUES = [262, 330, 200, 150, 28, 45, 280, 8, 190, 100];

export function categoryHue(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return HUES[hash % HUES.length];
}
