/** True when a drag carries files from the desktop rather than a tree row. */
export function dragHasFiles(data: DataTransfer): boolean {
  return Array.from(data.types).includes('Files');
}
