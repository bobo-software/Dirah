import { type KeyboardEvent, type PointerEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion, useReducedMotion, useSpring, type Variants } from 'motion/react';
import { API_URL } from '../api/client';
import { AppFrame } from '../layout/AppFrame';
import { BrandLink } from '../components/Logo';
import { ClientIcon, type ClientIconName } from '../components/ClientIcon';
import { SiteFooter } from '../components/SiteFooter';
import { PricingPlans } from '../components/PricingPlans';
import { HomeRedirect } from '../components/ComponentsIndex';
import ThemeToggle from '../components/ThemeToggle';
import { useAuthStore } from '../stores/StoresIndex';
import { trackSpotlight } from '../utils/spotlight';

export function HomeGate() {
  const user = useAuthStore((state) => state.user);
  const ready = useAuthStore((state) => state.ready);

  if (!ready) return <p className="muted">Loading…</p>;
  if (user) {
    return (
      <AppFrame>
        <HomeRedirect />
      </AppFrame>
    );
  }
  return <HomePage />;
}

const MCP_URL = `${API_URL.replace(/\/$/, '')}/mcp`;

const CLAUDE_CODE_COMMAND = `claude mcp add --transport http dirah ${MCP_URL}`;

const CURSOR_CONFIG = JSON.stringify({ mcpServers: { dirah: { url: MCP_URL } } }, null, 2);

/* Cursor's install link takes the server's config as base64 JSON. */
const CURSOR_INSTALL_URL = `cursor://anysphere.cursor-deeplink/mcp/install?name=dirah&config=${encodeURIComponent(
  btoa(JSON.stringify({ url: MCP_URL })),
)}`;

const MotionLink = motion.create(Link);

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/* Hero entrance: the intro copy settles in line by line, then the demo
   panels arrive and start playing. This is the page's one load sequence. */
const heroIntro: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

const heroItem: Variants = {
  hidden: { opacity: 0, y: 18, filter: 'blur(6px)' },
  shown: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.7, ease: EASE_OUT } },
};

/* Later sections reveal once as they scroll into view. */
const revealGroup: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.08 } },
};

const revealItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_OUT } },
};

const stepNumeral: Variants = {
  hidden: { opacity: 0, scale: 0.6, rotate: -8 },
  shown: { opacity: 1, scale: 1, rotate: 0, y: 0, transition: { type: 'spring', stiffness: 260, damping: 16 } },
  hover: { scale: 1.14, rotate: -7, y: -3, transition: { type: 'spring', stiffness: 420, damping: 12 } },
};

const inView = { initial: 'hidden', whileInView: 'shown', viewport: { once: true, amount: 0.25 } } as const;

const press = { whileHover: { y: -1 }, whileTap: { scale: 0.97 } };

function HomePage() {
  const { hash } = useLocation();

  // Links such as the footer's "/#connect" arrive from other pages; the router
  // does not scroll to hashes itself.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="home">
        <header className="home-bar">
          <BrandLink size="sm" />
          <div className="home-bar-actions">
            <a className="home-bar-link" href="#pricing">
              Pricing
            </a>
            <ThemeToggle />
            <Link className="home-bar-signin" to="/login">
              Sign in
            </Link>
          </div>
        </header>
        <main className="home-main">
          <section className="home-hero">
            <motion.div className="home-intro" variants={heroIntro} initial="hidden" animate="shown">
              <motion.h1 className="home-lead" variants={heroItem}>
                A context bank for your AI agents.
              </motion.h1>
              <motion.p className="home-copy" variants={heroItem}>
                Dirah is a hosted workspace for your team&rsquo;s specs, policies and decisions. Connect Claude, Cursor
                or any MCP client, and your agents search, read and update the same pages your team does.
              </motion.p>
              <motion.div className="home-actions" variants={heroItem}>
                <MotionLink className="home-primary" to="/register" {...press}>
                  Create your workspace
                </MotionLink>
                <MotionLink className="home-secondary" to="/login" {...press}>
                  Sign in
                </MotionLink>
              </motion.div>
              <motion.p className="home-note" variants={heroItem}>
                Nothing to install or host.
              </motion.p>
              <motion.p className="home-works" variants={heroItem}>
                <span>Works with</span>
                {CLIENTS.map((client) => (
                  <a key={client.id} className="home-works-client" href="#connect">
                    <ClientIcon name={client.icon} />
                    {client.name}
                  </a>
                ))}
              </motion.p>
            </motion.div>
            <AgentDemo />
          </section>

          <section className="home-steps" aria-labelledby="home-steps-title">
            <motion.h2 id="home-steps-title" className="home-section-title" variants={revealItem} {...inView}>
              Connected in a few minutes
            </motion.h2>
            <motion.ol className="home-steps-list" variants={revealGroup} {...inView}>
              <motion.li variants={revealItem} whileHover="hover">
                <motion.span className="home-step-num" variants={stepNumeral} aria-hidden="true">
                  1
                </motion.span>
                <h3>Create a workspace</h3>
                <p>Write pages in the editor, or import the markdown files you already have. Folders keep them organised.</p>
              </motion.li>
              <motion.li variants={revealItem} whileHover="hover">
                <motion.span className="home-step-num" variants={stepNumeral} aria-hidden="true">
                  2
                </motion.span>
                <h3>Add Dirah to your agent</h3>
                <p>Paste this address into your MCP client, then approve the connection in your browser.</p>
                <CopyField value={MCP_URL} label="Dirah MCP address" />
              </motion.li>
              <motion.li variants={revealItem} whileHover="hover">
                <motion.span className="home-step-num" variants={stepNumeral} aria-hidden="true">
                  3
                </motion.span>
                <h3>Choose what it can change</h3>
                <p>Give each connection read, or read and write, access to only the workspaces you pick. Revoke it any time.</p>
              </motion.li>
            </motion.ol>
          </section>

          <section id="connect" className="home-connect" aria-labelledby="home-connect-title">
            <motion.div className="home-connect-head" variants={revealItem} {...inView}>
              <h2 id="home-connect-title" className="home-section-title">
                Set up your agent
              </h2>
              <p>Pick the tool you use. Each one signs in to Dirah in your browser, so there are no keys to paste.</p>
            </motion.div>
            <motion.div variants={revealItem} {...inView}>
              <ClientSetup />
            </motion.div>
          </section>

          <section className="home-points"aria-labelledby="home-points-title">
            <motion.h2 id="home-points-title" className="home-section-title" variants={revealItem} {...inView}>
              Made for teams that work with agents
            </motion.h2>
            <motion.dl className="home-points-list" variants={revealGroup} {...inView}>
              <motion.div variants={revealItem}>
                <dt>One source of truth</dt>
                <dd>People edit in the browser, agents edit over MCP. Everyone reads the same version of every page.</dd>
              </motion.div>
              <motion.div variants={revealItem}>
                <dt>Edits that don&rsquo;t clobber</dt>
                <dd>An agent editing an outdated copy of a page is stopped before it overwrites your team&rsquo;s newer work.</dd>
              </motion.div>
              <motion.div variants={revealItem}>
                <dt>Your whole team</dt>
                <dd>Invite teammates to a workspace, or publish a single page to a public link for anyone outside it.</dd>
              </motion.div>
              <motion.div variants={revealItem}>
                <dt>Ask any page</dt>
                <dd>Ask a question while you&rsquo;re reading and get an answer drawn from the page in front of you.</dd>
              </motion.div>
            </motion.dl>
          </section>

          <PricingPlans />

          <motion.section
            className="home-close has-spotlight"
            onPointerMove={trackSpotlight}
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
          >
            <h2 className="home-close-title">Give your agents the context they&rsquo;re missing.</h2>
            <MotionLink className="home-primary" to="/register" {...press}>
              Create your workspace
            </MotionLink>
          </motion.section>
        </main>
        <SiteFooter />
      </div>
    </MotionConfig>
  );
}

function CopyField({ value, label, block = false }: { value: string; label: string; block?: boolean }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      /* Clipboard can be blocked; the text stays selectable. */
    }
  }, [value]);

  return (
    <div className={`home-mcp${block ? ' is-block' : ''}`}>
      {block ? <pre>{value}</pre> : <code>{value}</code>}
      <motion.button
        type="button"
        className="home-copy-btn"
        onClick={() => void copy()}
        whileTap={{ scale: 0.94 }}
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={copied ? 'copied' : 'copy'}
            className="home-copy-label"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
            {copied ? 'Copied' : 'Copy'}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </div>
  );
}

type ClientId = 'claude' | 'claude-code' | 'cursor';

const CLIENTS: { id: ClientId; name: string; where: string; icon: ClientIconName }[] = [
  { id: 'claude', name: 'Claude', where: 'Web and desktop app', icon: 'claude' },
  { id: 'claude-code', name: 'Claude Code', where: 'Terminal', icon: 'claude' },
  { id: 'cursor', name: 'Cursor', where: 'Editor', icon: 'cursor' },
];

function ClientSetup() {
  const [active, setActive] = useState<ClientId>('claude');
  const tabRefs = useRef<Partial<Record<ClientId, HTMLButtonElement | null>>>({});

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = CLIENTS.findIndex((c) => c.id === active);
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
              ref={(el) => {
                tabRefs.current[client.id] = el;
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

/* The demo plays once after the hero settles: each step reveals one line of
   the agent's MCP session, and the final step writes the edit into the page. */
const LAST_STEP = 6;
const FIRST_STEP_MS = 1300;
const STEP_MS = 650;

const agentLine: Variants = {
  hidden: { opacity: 0, x: -8 },
  shown: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 380, damping: 30 } },
};

function AgentDemo() {
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(() => (reduceMotion ? LAST_STEP : 0));
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (step >= LAST_STEP) return;
    const timer = window.setTimeout(() => setStep((s) => s + 1), step === 0 ? FIRST_STEP_MS : STEP_MS);
    return () => window.clearTimeout(timer);
  }, [step, run]);

  const replay = useCallback(() => {
    setStep(reduceMotion ? LAST_STEP : 0);
    setRun((r) => r + 1);
  }, [reduceMotion]);

  const state = (n: number) => (step >= n ? 'shown' : 'hidden');
  const done = step >= LAST_STEP;

  /* Hovering the demo tilts it toward the pointer, a few degrees at most, and
     the page's glare follows the same point. Mouse only; off for reduced motion. */
  const tiltX = useSpring(0, { stiffness: 160, damping: 18 });
  const tiltY = useSpring(0, { stiffness: 160, damping: 18 });

  const onTilt = (event: PointerEvent<HTMLElement>) => {
    if (reduceMotion || event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    tiltY.set(px * 9);
    tiltX.set(py * -7);
    event.currentTarget.style.setProperty('--glare-x', `${(px + 0.5) * 100}%`);
    event.currentTarget.style.setProperty('--glare-y', `${(py + 0.5) * 100}%`);
  };

  const endTilt = () => {
    tiltX.set(0);
    tiltY.set(0);
  };

  return (
    <motion.figure
      className="home-demo"
      aria-label="Example: an agent checks a spec and records a decision in it"
      onPointerMove={onTilt}
      onPointerLeave={endTilt}
      style={{ rotateX: tiltX, rotateY: tiltY, transformPerspective: 1100 }}
    >
      <motion.div
        className="demo-page"
        initial={{ opacity: 0, y: 24, rotate: -1.5 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 120, damping: 18, delay: 0.35 }}
      >
        <p className="demo-path">
          <span>Product</span>
          <span aria-hidden="true">/</span>
          <span>Checkout spec</span>
        </p>
        <h3>Checkout spec</h3>
        <p>Guests can check out without an account. We ask for an email only.</p>
        <ul>
          <li>Card and instant EFT at launch.</li>
          <li>Show the delivery date before payment.</li>
          <li>Save the cart for 7 days.</li>
        </ul>
        <motion.p
          key={run}
          className="demo-added"
          initial={false}
          animate={done ? 'shown' : 'hidden'}
          variants={{
            hidden: { opacity: 0, clipPath: 'inset(0 100% 0 0)' },
            shown: {
              opacity: 1,
              clipPath: 'inset(0 0% 0 0)',
              transition: { duration: 0.9, ease: EASE_OUT },
            },
          }}
        >
          <motion.span
            className="demo-added-flash"
            aria-hidden="true"
            initial={false}
            animate={done ? { opacity: [0, 1, 0] } : { opacity: 0 }}
            transition={{ duration: 1.8, times: [0, 0.25, 1], delay: 0.3 }}
          />
          Decided: prices show in rand for South African cards.
        </motion.p>
      </motion.div>
      <motion.div
        className="demo-agent"
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 110, damping: 18, delay: 0.55 }}
      >
        <DemoLine state={state(1)} className="demo-call" cursor={!done && step === 1}>
          <span className="demo-tool">search_docs</span> "checkout currency"
        </DemoLine>
        <DemoLine state={state(2)} className="demo-result" cursor={!done && step === 2}>
          product/checkout-spec.md
        </DemoLine>
        <DemoLine state={state(3)} className="demo-call" cursor={!done && step === 3}>
          <span className="demo-tool">read_file</span> product/checkout-spec.md
        </DemoLine>
        <DemoLine state={state(4)} className="demo-result" cursor={!done && step === 4}>
          5 lines
        </DemoLine>
        <DemoLine state={state(5)} className="demo-call" cursor={!done && step === 5}>
          <span className="demo-tool">edit_file</span> product/checkout-spec.md
        </DemoLine>
        <DemoLine state={state(LAST_STEP)} className="demo-result demo-insert" cursor={false}>
          + Decided: prices show in rand…
        </DemoLine>
        <AnimatePresence>
          {done && (
            <motion.button
              type="button"
              className="demo-replay"
              onClick={replay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.6 } }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              whileTap={{ scale: 0.94 }}
            >
              Replay
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.figure>
  );
}

/* A caret sits after the most recent line while the agent is "working",
   so the pause between steps reads as the agent waiting on a response. */
function DemoLine({
  state,
  className,
  cursor,
  children,
}: {
  state: 'hidden' | 'shown';
  className: string;
  cursor: boolean;
  children: ReactNode;
}) {
  return (
    <motion.p className={className} variants={agentLine} initial={false} animate={state}>
      {children}
      {cursor && state === 'shown' && <span className="demo-caret" aria-hidden="true" />}
    </motion.p>
  );
}
