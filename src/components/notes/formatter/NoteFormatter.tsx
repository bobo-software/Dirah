import type { ReactNode } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { Button } from '../../buttons/Button';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';
const alt = isMac ? '⌥' : 'Alt';

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const icons = {
  bold: (
    <Svg>
      <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />
    </Svg>
  ),
  italic: (
    <Svg>
      <path d="M14 5h-4M14 19h-4M14.5 5l-5 14" />
    </Svg>
  ),
  strike: (
    <Svg>
      <path d="M4.5 12h15M16 7.5c-.6-1.6-2.2-2.5-4-2.5-2.3 0-4 1.2-4 3 0 1.3.9 2.2 2.6 2.8M8 16.5c.6 1.6 2.2 2.5 4.2 2.5 2.4 0 4-1.2 4-3.1 0-.7-.2-1.3-.7-1.8" />
    </Svg>
  ),
  code: (
    <Svg>
      <path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5" />
    </Svg>
  ),
  link: (
    <Svg>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </Svg>
  ),
  bullet: (
    <Svg>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="4.5" cy="6.5" r="0.9" fill="currentColor" />
      <circle cx="4.5" cy="12" r="0.9" fill="currentColor" />
      <circle cx="4.5" cy="17.5" r="0.9" fill="currentColor" />
    </Svg>
  ),
  ordered: (
    <Svg>
      <path d="M10 6.5h10M10 12h10M10 17.5h10M4 5.5h1.2V9M3.8 9h2.6M3.8 14.5c.3-.6 2.6-.9 2.6.5 0 1-2.6 1.8-2.6 3h2.7" />
    </Svg>
  ),
  task: (
    <Svg>
      <rect x="3.5" y="4.5" width="6" height="6" rx="1.3" />
      <path d="M5 7.6l1.2 1.2 2-2.2M13 7.5h7.5M13 16.5h7.5" />
      <rect x="3.5" y="13.5" width="6" height="6" rx="1.3" />
    </Svg>
  ),
  quote: (
    <Svg>
      <path d="M5 7.5h5v5H7.5c0 2 .8 3.3 2.5 4M14 7.5h5v5h-2.5c0 2 .8 3.3 2.5 4" />
    </Svg>
  ),
  codeBlock: (
    <Svg>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9.5 10l-2 2 2 2M14.5 10l2 2-2 2" />
    </Svg>
  ),
  divider: (
    <Svg>
      <path d="M3.5 12h17M7 7.5h10M7 16.5h10" opacity="0.9" />
    </Svg>
  ),
  table: (
    <Svg>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10M14.5 9.5v10" />
    </Svg>
  ),
  undo: (
    <Svg>
      <path d="M9 7.5L4.5 12 9 16.5" />
      <path d="M4.5 12H15a4.5 4.5 0 0 1 0 9h-2" />
    </Svg>
  ),
  redo: (
    <Svg>
      <path d="M15 7.5l4.5 4.5-4.5 4.5" />
      <path d="M19.5 12H9a4.5 4.5 0 0 0 0 9h2" />
    </Svg>
  ),
};

function ToolButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button variant="plain"
      type="button"
      className={active ? 'editor-tool-btn note-tool on' : 'editor-tool-btn note-tool'}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      // Keep the editor's selection while clicking.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function Divider() {
  return <span className="note-toolbar-divider" aria-hidden="true" />;
}

export function NoteFormatter({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      paragraph: current.isActive('paragraph') && !current.isActive('taskItem') && !current.isActive('listItem'),
      h1: current.isActive('heading', { level: 1 }),
      h2: current.isActive('heading', { level: 2 }),
      h3: current.isActive('heading', { level: 3 }),
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      strike: current.isActive('strike'),
      code: current.isActive('code'),
      link: current.isActive('link'),
      bullet: current.isActive('bulletList'),
      ordered: current.isActive('orderedList'),
      task: current.isActive('taskList'),
      quote: current.isActive('blockquote'),
      codeBlock: current.isActive('codeBlock'),
      table: current.isActive('table'),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  function onLink() {
    if (state.link) {
      chain().extendMarkRange('link').unsetLink().run();
      return;
    }
    const previous = editor.getAttributes('link').href as string | undefined;
    const href = window.prompt('Link URL', previous ?? 'https://');
    if (!href || href === 'https://') return;
    chain().extendMarkRange('link').setLink({ href }).run();
  }

  return (
    <div className="note-toolbar" role="toolbar" aria-label="Formatting">
      <div className="note-toolbar-group">
        <ToolButton label="Text" active={state.paragraph} onClick={() => chain().setParagraph().run()}>
          <span className="note-tool-text">Text</span>
        </ToolButton>
        <ToolButton label="Heading 1" shortcut={`${mod}+${alt}+1`} active={state.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}>
          <span className="note-tool-text">H1</span>
        </ToolButton>
        <ToolButton label="Heading 2" shortcut={`${mod}+${alt}+2`} active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
          <span className="note-tool-text">H2</span>
        </ToolButton>
        <ToolButton label="Heading 3" shortcut={`${mod}+${alt}+3`} active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
          <span className="note-tool-text">H3</span>
        </ToolButton>
      </div>
      <Divider />
      <div className="note-toolbar-group">
        <ToolButton label="Bold" shortcut={`${mod}+B`} active={state.bold} onClick={() => chain().toggleBold().run()}>
          {icons.bold}
        </ToolButton>
        <ToolButton label="Italic" shortcut={`${mod}+I`} active={state.italic} onClick={() => chain().toggleItalic().run()}>
          {icons.italic}
        </ToolButton>
        <ToolButton label="Strikethrough" shortcut={`${mod}+Shift+S`} active={state.strike} onClick={() => chain().toggleStrike().run()}>
          {icons.strike}
        </ToolButton>
        <ToolButton label="Inline code" shortcut={`${mod}+E`} active={state.code} onClick={() => chain().toggleCode().run()}>
          {icons.code}
        </ToolButton>
        <ToolButton label={state.link ? 'Remove link' : 'Link'} active={state.link} onClick={onLink}>
          {icons.link}
        </ToolButton>
      </div>
      <Divider />
      <div className="note-toolbar-group">
        <ToolButton label="Checklist" shortcut={`${mod}+Shift+9`} active={state.task} onClick={() => chain().toggleTaskList().run()}>
          {icons.task}
        </ToolButton>
        <ToolButton label="Bullet list" shortcut={`${mod}+Shift+8`} active={state.bullet} onClick={() => chain().toggleBulletList().run()}>
          {icons.bullet}
        </ToolButton>
        <ToolButton label="Numbered list" shortcut={`${mod}+Shift+7`} active={state.ordered} onClick={() => chain().toggleOrderedList().run()}>
          {icons.ordered}
        </ToolButton>
        <ToolButton label="Quote" shortcut={`${mod}+Shift+B`} active={state.quote} onClick={() => chain().toggleBlockquote().run()}>
          {icons.quote}
        </ToolButton>
        <ToolButton label="Code block" shortcut={`${mod}+${alt}+C`} active={state.codeBlock} onClick={() => chain().toggleCodeBlock().run()}>
          {icons.codeBlock}
        </ToolButton>
        <ToolButton label="Divider" onClick={() => chain().setHorizontalRule().run()}>
          {icons.divider}
        </ToolButton>
        <ToolButton
          label="Table"
          active={state.table}
          disabled={state.table}
          onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          {icons.table}
        </ToolButton>
      </div>
      <Divider />
      <div className="note-toolbar-group">
        <ToolButton label="Undo" shortcut={`${mod}+Z`} disabled={!state.canUndo} onClick={() => chain().undo().run()}>
          {icons.undo}
        </ToolButton>
        <ToolButton label="Redo" shortcut={`${mod}+Shift+Z`} disabled={!state.canRedo} onClick={() => chain().redo().run()}>
          {icons.redo}
        </ToolButton>
      </div>
    </div>
  );
}
