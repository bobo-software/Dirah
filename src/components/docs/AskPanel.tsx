import { type FormEvent, useState } from 'react';
import { askPage } from '../../api/ai';

export function AskPanel({
  pageId,
  accessToken,
  editable,
  getContext,
  onInsert,
}: {
  pageId: string;
  accessToken: string;
  editable: boolean;
  getContext: () => string;
  onInsert: (text: string) => boolean;
}) {
  const [prompt, setPrompt] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const question = prompt.trim();
    if (!question) return;
    setBusy(true);
    setMessage(null);
    setReply(null);
    try {
      const text = await askPage(accessToken, pageId, question, getContext());
      setReply(text);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not ask');
    } finally {
      setBusy(false);
    }
  }

  function insertReply() {
    if (!reply) return;
    if (!onInsert(reply)) {
      setMessage('Could not insert. Try again after the editor loads.');
      return;
    }
    setMessage(null);
  }

  return (
    <section className="ask-panel">
      <form onSubmit={(event) => void onSubmit(event)}>
        <label className="visually-hidden" htmlFor="ask-prompt">
          Ask about this page
        </label>
        <textarea
          id="ask-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask about this page or the current selection"
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Asking…' : 'Ask'}
        </button>
      </form>
      {reply ? (
        <>
          <p className="ask-reply">{reply}</p>
          {editable ? (
            <button type="button" className="linkish" onClick={insertReply}>
              Insert
            </button>
          ) : null}
        </>
      ) : null}
      {message ? (
        <p className="error" role="alert">
          {message}
        </p>
      ) : null}
    </section>
  );
}
