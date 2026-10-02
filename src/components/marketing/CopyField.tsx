import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function CopyField({ value, label, block = false }: { value: string; label: string; block?: boolean }) {
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
