import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
  type Variants,
} from 'motion/react';
import type { TaskItem } from '../../../api/tasks';
import { useTaskStore } from '../../../stores/StoresIndex';
import { taskMode, type TaskModeConfig } from './modes';

type Phase = 'start' | 'run' | 'done';
type Answer = { itemId: string; checked: boolean; previous: boolean };

const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 600;

function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration is a nicety; some browsers throw outside a user gesture.
  }
}

/**
 * Full-screen "one item at a time" runner. Each answer is saved as it is
 * given, so leaving mid-run keeps the progress made so far.
 */
export function TaskRunner({ listId, onExit }: { listId: string; onExit: () => void }) {
  const view = useTaskStore((state) => state.views[listId]);
  const setChecked = useTaskStore((state) => state.setChecked);
  const resetList = useTaskStore((state) => state.resetList);
  const [phase, setPhase] = useState<Phase>('start');
  const [queue, setQueue] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [direction, setDirection] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = view?.items;
  const byId = useMemo(() => new Map((items ?? []).map((item) => [item.id, item])), [items]);
  const mode = taskMode(view?.list.mode ?? 'checklist');
  const index = answers.length;
  const current = phase === 'run' ? byId.get(queue[index]) : undefined;

  let streak = 0;
  for (let i = answers.length - 1; i >= 0 && answers[i].checked; i -= 1) streak += 1;

  function begin(ids: string[]) {
    setQueue(ids);
    setAnswers([]);
    setError(null);
    setDirection(1);
    setPhase(ids.length > 0 ? 'run' : 'done');
  }

  async function startFresh() {
    setBusy(true);
    setError(null);
    try {
      const fresh = await resetList(listId);
      begin(fresh.items.map((item) => item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the list');
    } finally {
      setBusy(false);
    }
  }

  function answer(checked: boolean) {
    if (phase !== 'run') return;
    const itemId = queue[index];
    const item = byId.get(itemId);
    setDirection(checked ? 1 : -1);
    setAnswers((list) => [...list, { itemId, checked, previous: item?.checked ?? false }]);
    buzz(checked ? 12 : [8, 40, 8]);
    if (index + 1 >= queue.length) {
      setPhase('done');
      buzz([15, 60, 15, 60, 30]);
    }
    if (item && item.checked !== checked) {
      setChecked(listId, itemId, checked).catch(() =>
        setError(`Couldn’t save “${item.text}”. Check your connection and try again.`)
      );
    }
  }

  function undo() {
    const last = answers.at(-1);
    if (!last) return;
    setDirection(-2);
    setAnswers((list) => list.slice(0, -1));
    setPhase('run');
    if (last.checked !== last.previous) {
      setChecked(listId, last.itemId, last.previous).catch(() => setError('Couldn’t undo that answer.'));
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onExit();
        return;
      }
      if (phase !== 'run' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'ArrowRight' || event.key === 'y') answer(true);
      else if (event.key === 'ArrowLeft' || event.key === 'n') answer(false);
      else if (event.key === 'Backspace' || event.key === 'z') undo();
      else return;
      event.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (!view) return null;
  const total = view.items.length;
  const checkedCount = view.list.checkedCount;
  const progress = queue.length ? index / queue.length : 0;

  return createPortal(
    <MotionConfig reducedMotion="user">
      <div className="task-runner" role="dialog" aria-modal="true" aria-label={`${mode.runLabel}: ${view.list.title}`}>
        <header className="task-run-head">
          <button type="button" className="task-plain task-run-icon" onClick={onExit} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
          {phase === 'run' ? (
            <>
              <div
                className="task-run-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={queue.length}
                aria-valuenow={index}
              >
                <motion.span animate={{ scaleX: progress }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} />
              </div>
              <span className="task-run-count">
                {Math.min(index + 1, queue.length)} / {queue.length}
              </span>
            </>
          ) : (
            <p className="task-run-title">{view.list.title}</p>
          )}
          <button
            type="button"
            className="task-plain task-run-icon"
            onClick={undo}
            disabled={answers.length === 0}
            aria-label="Undo last answer"
            title="Undo (Z)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </svg>
          </button>
        </header>

        <AnimatePresence mode="wait" initial={false}>
          {phase === 'start' ? (
            <StartScreen
              key="start"
              title={view.list.title}
              mode={mode}
              total={total}
              checkedCount={checkedCount}
              busy={busy}
              onRemaining={() => begin(view.items.filter((item) => !item.checked).map((item) => item.id))}
              onFresh={() => void startFresh()}
              onExit={onExit}
            />
          ) : phase === 'run' ? (
            <motion.main
              key="run"
              className="task-run-stage"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="task-run-deck">
                <AnimatePresence custom={direction} initial={false}>
                  {current ? (
                    <SwipeCard
                      key={`${current.id}-${index}`}
                      item={current}
                      mode={mode}
                      direction={direction}
                      onAnswer={answer}
                    />
                  ) : null}
                </AnimatePresence>
              </div>
              <div className="task-run-streak" aria-live="polite">
                <AnimatePresence>
                  {streak >= 3 ? (
                    <motion.span
                      key={streak}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      {streak} in a row
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </div>
              <div className="task-run-actions">
                <motion.button
                  type="button"
                  className="task-plain task-run-answer no"
                  whileTap={{ scale: 0.9 }}
                  onClick={() => answer(false)}
                  aria-label={mode.no.label}
                >
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
                  </svg>
                  <span>{mode.no.label}</span>
                </motion.button>
                <motion.button
                  type="button"
                  className="task-plain task-run-answer yes"
                  whileTap={{ scale: 0.9 }}
                  onClick={() => answer(true)}
                  aria-label={mode.yes.label}
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                  <span>{mode.yes.label}</span>
                </motion.button>
              </div>
              <p className="task-run-hint">Swipe right for “{mode.yes.label}”, left for “{mode.no.label}”</p>
            </motion.main>
          ) : (
            <DoneScreen
              key="done"
              mode={mode}
              answers={answers}
              byId={byId}
              listChecked={checkedCount}
              listTotal={total}
              onAgain={(ids) => begin(ids)}
              onExit={onExit}
            />
          )}
        </AnimatePresence>

        {error ? (
          <p className="task-run-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </MotionConfig>,
    document.body
  );
}

const cardVariants: Variants = {
  enter: (direction: number) =>
    direction === -2 ? { x: -320, rotate: -10, opacity: 0 } : { scale: 0.9, y: 28, opacity: 0 },
  center: { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, transition: { type: 'spring', stiffness: 320, damping: 28 } },
  exit: (direction: number) =>
    direction === -2
      ? { scale: 0.9, y: 28, opacity: 0, transition: { duration: 0.18 } }
      : { x: direction * 560, rotate: direction * 18, opacity: 0, transition: { duration: 0.3, ease: 'easeIn' } },
};

function SwipeCard({
  item,
  mode,
  direction,
  onAnswer,
}: {
  item: TaskItem;
  mode: TaskModeConfig;
  direction: number;
  onAnswer: (checked: boolean) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-14, 14]);
  const yesOpacity = useTransform(x, [24, SWIPE_DISTANCE], [0, 1]);
  const noOpacity = useTransform(x, [-SWIPE_DISTANCE, -24], [1, 0]);

  function onDragEnd(_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY) onAnswer(true);
    else if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY) onAnswer(false);
  }

  return (
    <motion.article
      className="task-card"
      style={{ x, rotate }}
      custom={direction}
      variants={cardVariants}
      initial="enter"
      animate="center"
      exit="exit"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.85}
      onDragEnd={onDragEnd}
      whileDrag={{ cursor: 'grabbing', scale: 1.02 }}
    >
      <motion.span className="task-card-stamp yes" style={{ opacity: yesOpacity }} aria-hidden="true">
        {mode.yes.stamp}
      </motion.span>
      <motion.span className="task-card-stamp no" style={{ opacity: noOpacity }} aria-hidden="true">
        {mode.no.stamp}
      </motion.span>
      <p className="task-card-prompt">{mode.prompt}</p>
      <h2 className="task-card-text">{item.text}</h2>
      {item.checked ? <p className="task-card-was">Checked last time</p> : null}
    </motion.article>
  );
}

function StartScreen({
  title,
  mode,
  total,
  checkedCount,
  busy,
  onRemaining,
  onFresh,
  onExit,
}: {
  title: string;
  mode: TaskModeConfig;
  total: number;
  checkedCount: number;
  busy: boolean;
  onRemaining: () => void;
  onFresh: () => void;
  onExit: () => void;
}) {
  const remaining = total - checkedCount;
  return (
    <motion.main
      className="task-run-screen"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
    >
      <p className="task-run-kicker">{mode.name}</p>
      <h1 className="task-run-heading">{title}</h1>
      {total === 0 ? (
        <>
          <p className="task-run-sub">Nothing to run yet. Add a few items first.</p>
          <div className="task-run-buttons">
            <button type="button" onClick={onExit}>
              Back to list
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="task-run-sub">
            {total} item{total === 1 ? '' : 's'}
            {checkedCount > 0 ? ` · ${checkedCount} already checked` : ''}
          </p>
          <div className="task-run-buttons">
            {remaining > 0 ? (
              <button type="button" onClick={onRemaining} disabled={busy} autoFocus>
                {checkedCount > 0 ? `Check the ${remaining} left` : 'Start'}
              </button>
            ) : (
              <p className="task-run-sub">Everything is already checked.</p>
            )}
            {checkedCount > 0 ? (
              <button type="button" className="task-plain task-run-secondary" onClick={onFresh} disabled={busy}>
                {busy ? 'Resetting…' : `Start fresh with all ${total}`}
              </button>
            ) : null}
          </div>
        </>
      )}
    </motion.main>
  );
}

function DoneScreen({
  mode,
  answers,
  byId,
  listChecked,
  listTotal,
  onAgain,
  onExit,
}: {
  mode: TaskModeConfig;
  answers: Answer[];
  byId: Map<string, TaskItem>;
  listChecked: number;
  listTotal: number;
  onAgain: (ids: string[]) => void;
  onExit: () => void;
}) {
  const missed = answers.filter((entry) => !entry.checked).map((entry) => entry.itemId);
  const got = answers.length - missed.length;
  const allDone = listTotal > 0 && listChecked === listTotal;

  return (
    <motion.main
      className="task-run-screen"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
    >
      {allDone ? <Confetti /> : null}
      <ScoreRing value={listChecked} total={listTotal} />
      <h1 className="task-run-heading">{allDone ? 'All done!' : 'Run finished'}</h1>
      <p className="task-run-sub">
        {allDone
          ? mode.doneAll
          : answers.length > 0
            ? `${got} ${mode.yes.label.toLowerCase()} · ${missed.length} ${mode.no.label.toLowerCase()}`
            : 'Nothing left to check.'}
      </p>
      {missed.length > 0 ? (
        <section className="task-run-missed" aria-label={mode.doneSome}>
          <p className="task-run-kicker">{mode.doneSome}</p>
          <ul>
            {missed.map((id) => (
              <li key={id}>{byId.get(id)?.text ?? 'Removed item'}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="task-run-buttons">
        {missed.length > 0 ? (
          <button type="button" onClick={() => onAgain(missed)} autoFocus>
            Go through the {missed.length} again
          </button>
        ) : null}
        <button
          type="button"
          className={missed.length > 0 ? 'task-plain task-run-secondary' : undefined}
          onClick={onExit}
          autoFocus={missed.length === 0}
        >
          Back to list
        </button>
      </div>
    </motion.main>
  );
}

function ScoreRing({ value, total }: { value: number; total: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const ratio = total ? value / total : 0;
  return (
    <div className="task-score">
      <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden="true">
        <circle cx="56" cy="56" r={radius} className="task-score-track" />
        <motion.circle
          cx="56"
          cy="56"
          r={radius}
          className="task-score-fill"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - ratio) }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 }}
        />
      </svg>
      <span className="task-score-label">
        <strong>{value}</strong>/{total}
      </span>
    </div>
  );
}

const CONFETTI_HUES = [152, 38, 205, 340, 268, 12];

function Confetti() {
  // Deterministic spread, so renders stay pure; it only plays once per mount.
  const pieces = Array.from({ length: 30 }, (_, i) => {
    const angle = (i / 30) * Math.PI * 2 + (i % 3) * 0.4;
    const reach = 120 + ((i * 47) % 110);
    return {
      x: Math.cos(angle) * reach,
      y: Math.sin(angle) * reach * 0.7 - 90,
      rotate: ((i * 73) % 360) - 180,
      hue: CONFETTI_HUES[i % CONFETTI_HUES.length],
      delay: (i % 6) * 0.03,
    };
  });
  return (
    <div className="task-confetti" aria-hidden="true">
      {pieces.map((piece, i) => (
        <motion.span
          key={i}
          style={{ background: `hsl(${piece.hue} 75% 58%)` }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 0.6 }}
          animate={{ x: piece.x, y: [0, piece.y, piece.y + 260], rotate: piece.rotate * 3, opacity: [1, 1, 0], scale: 1 }}
          transition={{ duration: 1.7, ease: 'easeOut', delay: piece.delay }}
        />
      ))}
    </div>
  );
}
