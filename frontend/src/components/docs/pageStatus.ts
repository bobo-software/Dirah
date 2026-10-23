export const PAGE_STATUSES = ['', 'todo', 'doing', 'done'] as const;
export type PageStatus = (typeof PAGE_STATUSES)[number];

export function parsePageStatus(value: string | null | undefined): PageStatus {
  return PAGE_STATUSES.includes(value as PageStatus) ? (value as PageStatus) : '';
}

export function pageStatusLabel(status: string): string {
  switch (status) {
    case 'todo':
      return 'To do';
    case 'doing':
      return 'Doing';
    case 'done':
      return 'Done';
    default:
      return 'None';
  }
}
