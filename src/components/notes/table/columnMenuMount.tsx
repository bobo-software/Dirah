import { createRoot } from 'react-dom/client';
import { ColumnTypeButton, ColumnTypeSelector } from './ColumnTypeSelector';
import { SelectValueMenu } from './SelectValueMenu';
import type { ColumnType, SelectColor, SelectOption } from './columnTypes';

export function mountColumnTypeMenu(host: HTMLElement) {
  const root = createRoot(host);
  return {
    update: (props: {
      anchor: HTMLElement;
      type: ColumnType;
      options: SelectOption[];
      editable: boolean;
      onTypeChange: (type: ColumnType) => void;
      onOptionsChange: (options: SelectOption[]) => void;
      onClose: () => void;
    }) => {
      root.render(<ColumnTypeSelector {...props} />);
    },
    unmount: () => root.unmount(),
  };
}

export function mountColumnTypeButton(
  host: HTMLElement,
  props: { type: ColumnType; colPos: number; onClick: (button: HTMLButtonElement) => void },
) {
  const root = createRoot(host);
  root.render(<ColumnTypeButton {...props} />);
  return () => root.unmount();
}

export function mountSelectValueMenu(host: HTMLElement) {
  const root = createRoot(host);
  return {
    update: (props: {
      anchor: HTMLElement;
      value: string;
      options: SelectOption[];
      editable: boolean;
      onSelect: (value: string) => void;
      onClear: () => void;
      onCreate: (name: string) => void;
      onRecolor: (name: string, color: SelectColor) => void;
      onClose: () => void;
    }) => {
      root.render(<SelectValueMenu {...props} />);
    },
    unmount: () => root.unmount(),
  };
}
