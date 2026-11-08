import type { ClientIconName } from './ClientIcon';

export type ClientId = 'claude' | 'claude-code' | 'cursor';

export const CLIENTS: { id: ClientId; name: string; where: string; icon: ClientIconName }[] = [
  { id: 'claude', name: 'Claude', where: 'Web and desktop app', icon: 'claude' },
  { id: 'claude-code', name: 'Claude Code', where: 'Terminal', icon: 'claude' },
  { id: 'cursor', name: 'Cursor', where: 'Editor', icon: 'cursor' },
];
