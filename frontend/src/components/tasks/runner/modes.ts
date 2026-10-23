import type { TaskListMode } from '../../../api/tasks';

/**
 * How a list "runs". The runner reads its wording from here, so a new mode
 * (flashcards, stock count, …) is one entry plus the backend's mode CHECK.
 */
export type TaskModeConfig = {
  name: string;
  runLabel: string;
  prompt: string;
  yes: { label: string; stamp: string };
  no: { label: string; stamp: string };
  doneAll: string;
  doneSome: string;
};

export const TASK_MODES: Record<TaskListMode, TaskModeConfig> = {
  checklist: {
    name: 'Checklist',
    runLabel: 'Run checklist',
    prompt: 'Got this one?',
    yes: { label: 'Got it', stamp: 'Got it' },
    no: { label: 'Not yet', stamp: 'Not yet' },
    doneAll: 'Everything’s checked off.',
    doneSome: 'Still to sort out',
  },
};

export function taskMode(mode: TaskListMode): TaskModeConfig {
  return TASK_MODES[mode] ?? TASK_MODES.checklist;
}
