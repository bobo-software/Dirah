import { type KeyboardEvent, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ClientIcon, type ClientIconName } from './ClientIcon';
import { CopyField } from './CopyField';
import { CLAUDE_CODE_COMMAND, CURSOR_CONFIG, CURSOR_INSTALL_URL, MCP_URL } from './mcpConnect';

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

const press = { whileHover: { y: -1 }, whileTap: { scale: 0.97 } };

export type ClientId = 'claude' | 'claude-code' | 'cursor';

export const CLIENTS: { id: ClientId; name: string; where: string; icon: ClientIconName }[] = [
  { id: 'claude', name: 'Claude', where: 'Web and desktop app', icon: 'claude' },
  { id: 'claude-code', name: 'Claude Code', where: 'Terminal', icon: 'claude' },
  { id: 'cursor', name: 'Cursor', where: 'Editor', icon: 'cursor' },
];

export function ClientSetup() {
  const [active, setActive] = useState<ClientId>('claude');
  const tabRefs = useRef<Partial<Record<ClientId, HTMLButtonElement | null>>>({});

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = CLIENTS.findIndex((client) => client.id === active);
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % CLIENTS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + CLIENTS.length) % CLIENTS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = CLIENTS.length - 1;
    else return;
    event.preventDefault();
    const id = CLIENTS[next].id;
    setActive(id);
    tabRefs.current[id]?.focus();
  };

  return (
    <div className="home-clients">
      <div className="home-client-tabs" role="tablist" aria-label="Agent" onKeyDown={onKeyDown}>
        {CLIENTS.map((client) => {
          const selected = client.id === active;
          return (
            <button
              key={client.id}
              ref={(element) => {
                tabRefs.current[client.id] = element;
              }}
              type="button"
              role="tab"
              id={`client-tab-${client.id}`}
              aria-selected={selected}
              aria-controls={`client-panel-${client.id}`}
              tabIndex={selected ? 0 : -1}
              className={`home-client-tab${selected ? ' is-active' : ''}`}
              onClick={() => setActive(client.id)}
            >
              {selected && (
                <motion.span
                  className="home-client-tab-bg"
                  layoutId="home-client-tab-bg"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <ClientIcon name={client.icon} className="home-client-icon" />
              <span className="home-client-text">
                <span className="home-client-name">{client.name}</span>
                <span className="home-client-where">{client.where}</span>
              </span>
            </button>
          );
        })}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={active}
          role="tabpanel"
          id={`client-panel-${active}`}
          aria-labelledby={`client-tab-${active}`}
          className="home-client-panel"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: EASE_OUT }}
        >
          {active === 'claude' && <ClaudeSetup />}
          {active === 'claude-code' && <ClaudeCodeSetup />}
          {active === 'cursor' && <CursorSetup />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ClaudeSetup() {
  return (
    <>
      <ol className="home-client-steps">
        <li>
          In Claude, open <strong>Settings</strong>, then <strong>Connectors</strong>.
        </li>
        <li>
          Choose <strong>Add custom connector</strong>, name it Dirah and paste this address.
        </li>
        <li>Sign in to Dirah when asked, and choose the workspaces Claude can use.</li>
      </ol>
      <CopyField value={MCP_URL} label="Dirah MCP address" />
      <p className="home-client-foot">
        Then ask Claude about your docs, for example &ldquo;What does our checkout spec say about currency?&rdquo;
      </p>
    </>
  );
}

function ClaudeCodeSetup() {
  return (
    <>
      <ol className="home-client-steps">
        <li>Run this in your terminal to add Dirah to Claude Code.</li>
        <li>
          Start Claude Code, run <code>/mcp</code> and choose <strong>dirah</strong> to sign in.
        </li>
        <li>Pick the workspaces Claude Code can read, or read and write.</li>
      </ol>
      <CopyField value={CLAUDE_CODE_COMMAND} label="Claude Code command" />
      <p className="home-client-foot">
        Claude Code can then look up your specs before it writes code, and record decisions as it goes.
      </p>
    </>
  );
}

function CursorSetup() {
  return (
    <>
      <ol className="home-client-steps">
        <li>
          Choose <strong>Add to Cursor</strong> and confirm in Cursor, or add this to <code>.cursor/mcp.json</code>.
        </li>
        <li>Cursor opens your browser to sign in to Dirah.</li>
        <li>Pick the workspaces Cursor&rsquo;s agent can use.</li>
      </ol>
      <motion.a className="home-cursor-install" href={CURSOR_INSTALL_URL} {...press}>
        <ClientIcon name="cursor" />
        Add to Cursor
      </motion.a>
      <CopyField value={CURSOR_CONFIG} label="Cursor MCP config" block />
    </>
  );
}
