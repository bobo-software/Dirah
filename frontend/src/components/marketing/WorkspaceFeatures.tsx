import { useRef } from 'react';
import { motion, useInView, useReducedMotion, type Variants } from 'motion/react';

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

const group: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.08 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_OUT } },
};

const inView = { initial: 'hidden', whileInView: 'shown', viewport: { once: true, amount: 0.25 } } as const;

export function WorkspaceFeatures() {
  const reduceMotion = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const seen = useInView(stageRef, { once: true, amount: 0.55 });
  const shown = Boolean(reduceMotion || seen);
  const settle = reduceMotion ? { duration: 0 } : undefined;

  return (
    <section id="features" className="home-features" aria-labelledby="home-features-title">
      <motion.div className="home-features-head" variants={item} {...inView}>
        <h2 id="home-features-title" className="home-section-title">
          Docs, notes and tasks
        </h2>
        <p>Pages your agents can read, notes you keep for yourself, and lists you run through one item at a time.</p>
      </motion.div>
      <motion.div ref={stageRef} className="home-features-list" variants={group} {...inView}>
        <motion.article variants={item}>
          <div className="home-feature-stage home-feature-doc" aria-hidden="true">
            <p className="home-feature-path">
              <span>Product</span>
              <span>/</span>
              <span>Checkout spec</span>
            </p>
            <h3>Checkout spec</h3>
            <p>Guests can check out without an account.</p>
            <ul>
              <li>Card and instant EFT at launch.</li>
              <li>Show the delivery date before payment.</li>
            </ul>
            <motion.p
              className="home-feature-added"
              initial={false}
              animate={shown ? { opacity: 1, clipPath: 'inset(0 0% 0 0)' } : { opacity: 0, clipPath: 'inset(0 100% 0 0)' }}
              transition={settle ?? { duration: 0.9, ease: EASE_OUT, delay: 0.2 }}
            >
              Decided: prices show in rand.
            </motion.p>
          </div>
          <h3>Docs</h3>
          <p>Specs, policies and decisions. Your team edits them in the browser, and connected agents search, read and update the same pages.</p>
        </motion.article>

        <motion.article variants={item}>
          <div className="home-feature-stage home-feature-note" aria-hidden="true">
            <div className="home-feature-note-head">
              <h3>Trip notes</h3>
              <span>Private</span>
            </div>
            <p>Flights land at 14:10. The car desk closes at 18:00.</p>
            <div className="home-feature-board">
              <div>
                <span>Now</span>
                <motion.p
                  initial={false}
                  animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                  transition={settle ?? { type: 'spring', stiffness: 380, damping: 22, delay: 0.45 }}
                >
                  Book the car
                </motion.p>
              </div>
              <div>
                <span>Next</span>
                <p>Pack</p>
              </div>
            </div>
          </div>
          <h3>Notes</h3>
          <p>Private unless you share them. Nest notes, turn one into a kanban board, or send it to a task list when the writing turns into work.</p>
        </motion.article>

        <motion.article variants={item}>
          <div className="home-feature-stage home-feature-task" aria-hidden="true">
            <div className="home-feature-note-head">
              <h3>Packing list</h3>
              <span>{shown ? '1 of 3' : '0 of 3'}</span>
            </div>
            <ul>
              <li className={shown ? 'is-done' : undefined}>
                <span className="home-feature-check">
                  <svg viewBox="0 0 8 8" aria-hidden="true">
                    <motion.path
                      d="M1.2 4.1 3.1 6.1 6.8 1.8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={false}
                      animate={{ pathLength: shown ? 1 : 0 }}
                      transition={settle ?? { duration: 0.45, ease: EASE_OUT, delay: 0.7 }}
                    />
                  </svg>
                </span>
                Passport
              </li>
              <li>
                <span className="home-feature-check" />
                Chargers
              </li>
              <li>
                <span className="home-feature-check" />
                Adapter
              </li>
            </ul>
            <div className="home-feature-progress" aria-hidden="true">
              <motion.span
                initial={false}
                animate={{ scaleX: shown ? 1 / 3 : 0 }}
                transition={settle ?? { duration: 0.55, ease: EASE_OUT, delay: 0.85 }}
              />
            </div>
            <motion.p
              className="home-feature-got"
              initial={false}
              animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
              transition={settle ?? { type: 'spring', stiffness: 420, damping: 24, delay: 1.05 }}
            >
              Got it
            </motion.p>
          </div>
          <h3>Tasks</h3>
          <p>Checklists for a packing run, a launch, or a weekly review. Keep a list private or share it, then run it one item at a time.</p>
        </motion.article>
      </motion.div>
    </section>
  );
}
