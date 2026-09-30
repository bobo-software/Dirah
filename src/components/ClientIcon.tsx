import claudeSvg from '../assets/icons/claude.svg?raw';
import cursorSvg from '../assets/icons/cursor.svg?raw';

/* Brand marks from Simple Icons (CC0). They are inlined so CSS can colour
   them: Claude keeps its brand orange, Cursor follows the text colour. */
const SVGS = {
  claude: claudeSvg,
  cursor: cursorSvg,
} as const;

export type ClientIconName = keyof typeof SVGS;

export function ClientIcon({ name, className = '' }: { name: ClientIconName; className?: string }) {
  return (
    <span
      className={`client-icon client-icon-${name} ${className}`.trim()}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: SVGS[name] }}
    />
  );
}
