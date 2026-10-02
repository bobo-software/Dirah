import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MotionConfig, motion, type Variants } from 'motion/react';
import {
  AgentDemo,
  AppFrame,
  BrandLink,
  CLIENTS,
  ClientIcon,
  ClientSetup,
  CopyField,
  HomeRedirect,
  MCP_URL,
  PricingPlans,
  SiteFooter,
  ThemeToggle,
} from '../components/ComponentsIndex';
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
