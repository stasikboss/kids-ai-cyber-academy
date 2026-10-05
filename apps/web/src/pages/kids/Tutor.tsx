import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Dragon } from '../../components/Dragon.tsx';
import { useApp } from '../../lib/app-state.tsx';
import { rpc } from '../../lib/supabase.ts';
import { askTutor, type TutorEvent } from '../../lib/tutor.ts';
import { KidsShell } from './KidsShell.tsx';

interface Bubble {
  id: number;
  from: 'child' | 'si';
  text: string;
  /** Fixed replies (personal info, support, refusals) get their own look. */
  notice?: string;
}

const MAX_LENGTH = 500;

export function Tutor() {
  const { t, lang, activeChild } = useApp();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const nextId = useRef(1);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeChild) return;
    rpc<{ used: number; limit: number }>('tutor_quota', { p_child: activeChild.id })
      .then((q) => setLeft(Math.max(q.limit - q.used, 0)))
      .catch(() => setLeft(null));
    return () => abort.current?.abort();
  }, [activeChild]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [bubbles]);

  if (!activeChild) return null;

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || busy) return;
    setDraft('');
    setBusy(true);

    const answerId = nextId.current + 1;
    nextId.current += 2;
    setBubbles((b) => [...b, { id: answerId - 1, from: 'child', text: message }, { id: answerId, from: 'si', text: '' }]);

    const update = (fn: (bubble: Bubble) => Bubble) =>
      setBubbles((b) => b.map((bubble) => (bubble.id === answerId ? fn(bubble) : bubble)));

    abort.current = new AbortController();
    try {
      await askTutor({ childId: activeChild.id, message, lang, signal: abort.current.signal }, (e: TutorEvent) => {
        if (e.type === 'sentence') update((bubble) => ({ ...bubble, text: bubble.text ? `${bubble.text} ${e.text}` : e.text }));
        if (e.type === 'replace') update((bubble) => ({ ...bubble, text: e.text }));
        if (e.type === 'notice') update((bubble) => ({ ...bubble, text: e.text, notice: e.kind }));
        if (e.type === 'done' && e.used !== null && e.limit !== null) setLeft(Math.max(e.limit - e.used, 0));
      });
    } catch {
      update((bubble) => ({ ...bubble, text: t('tutor.error'), notice: 'error' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KidsShell back="/kids/home">
      <header className="mb-4 flex items-center gap-4">
        <Dragon size={72} title="SI" />
        <div>
          <h1 className="text-3xl">{t('tutor.title')}</h1>
          <p className="text-ink-soft">{t('tutor.disclosure')}</p>
        </div>
      </header>

      <div className="card-ink min-h-[50dvh] space-y-3 p-4" aria-live="polite">
        {bubbles.length === 0 && <p className="text-lg text-ink-soft">{t('tutor.empty')}</p>}
        {bubbles.map((bubble) => (
          <div key={bubble.id} className={`flex ${bubble.from === 'child' ? 'justify-end' : 'justify-start'}`}>
            <p
              className={`max-w-[85%] rounded-2xl border-[2.5px] border-ink px-4 py-2 text-lg ${
                bubble.from === 'child'
                  ? 'bg-sun'
                  : bubble.notice === 'support'
                    ? 'bg-violet/15'
                    : bubble.notice
                      ? 'bg-mist'
                      : 'bg-white'
              }`}
            >
              {bubble.text || <span className="text-ink-soft">{t('tutor.thinking')}…</span>}
            </p>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="mt-4 flex flex-wrap gap-3">
        <label htmlFor="ask" className="sr-only">{t('tutor.placeholder')}</label>
        <input
          id="ask"
          className="field min-h-12 flex-1 rounded-2xl border-[2.5px] border-ink text-lg"
          placeholder={t('tutor.placeholder')}
          value={draft}
          maxLength={MAX_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          autoComplete="off"
          disabled={left === 0}
        />
        <button type="submit" className="sticker" disabled={busy || !draft.trim() || left === 0}>
          {t('tutor.send')}
        </button>
      </form>
      {left !== null && <p className="mt-2 text-ink-soft">{t('tutor.left', { left })}</p>}
    </KidsShell>
  );
}
