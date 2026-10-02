import { type PointerEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, useSpring, type Variants } from 'motion/react';

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

const LAST_STEP = 6;
const FIRST_STEP_MS = 1300;
const STEP_MS = 650;

const agentLine: Variants = {
  hidden: { opacity: 0, x: -8 },
  shown: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 380, damping: 30 } },
};

export function AgentDemo() {
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(() => (reduceMotion ? LAST_STEP : 0));
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (step >= LAST_STEP) return;
    const timer = window.setTimeout(() => setStep((current) => current + 1), step === 0 ? FIRST_STEP_MS : STEP_MS);
    return () => window.clearTimeout(timer);
  }, [step, run]);

  const replay = useCallback(() => {
    setStep(reduceMotion ? LAST_STEP : 0);
    setRun((current) => current + 1);
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
          <span className="demo-tool">search_docs</span> &quot;checkout currency&quot;
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
