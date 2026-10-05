import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Dragon, DragonSays } from '../../components/Dragon.tsx';
import { useApp } from '../../lib/app-state.tsx';
import { catalogLessons, type LessonBody, lessonBody, lessonState } from '../../lib/content.ts';
import { badgeLabel } from '../../lib/i18n.ts';
import { rpc, RpcError } from '../../lib/supabase.ts';
import { KidsShell } from './KidsShell.tsx';

type Phase = { name: 'intro'; card: number } | { name: 'game' } | { name: 'quiz'; question: number } | { name: 'finish' };

/** Intro cards → sorting game → three check questions → result saved to the database. */
export function Lesson() {
  const { id = '' } = useParams();
  const { lang, activeChild, plan, timeUp } = useApp();
  // Decided once, on entry: a lesson opened before the limit may finish after it.
  const [openedInTime] = useState(!timeUp);
  const catalogEntry = catalogLessons.find((l) => l.id === id);
  const body = lessonBody(id, lang);

  if (!activeChild || !catalogEntry || !body || !openedInTime) return <Navigate to="/kids/home" replace />;
  const state = lessonState(catalogEntry, { lang, plan, ageBand: activeChild.age_band, completed: new Set() });
  if (state !== 'open') return <Navigate to="/kids/home" replace />;

  return <LessonPlayer key={id} lesson={body} childId={activeChild.id} />;
}

function LessonPlayer({ lesson, childId }: { lesson: LessonBody; childId: string }) {
  const { t } = useApp();
  const [phase, setPhase] = useState<Phase>({ name: 'intro', card: 0 });
  const [firstTry, setFirstTry] = useState<boolean[]>([]);
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    // The database has the final say on the time limit (the app's first heartbeat may
    // not have returned yet when a lesson opens).
    rpc('record_lesson_start', { p_child: childId, p_lesson: lesson.id }).catch((error: unknown) => {
      if (error instanceof RpcError && (error.code === 'time_up' || error.code === 'lesson_not_available')) {
        setRefused(true);
      }
    });
  }, [childId, lesson.id]);

  const progressLabel = useMemo(() => {
    if (phase.name === 'quiz') return t('lesson.quiz.counter', { n: phase.question + 1 });
    return null;
  }, [phase, t]);

  if (refused) return <Navigate to="/kids/home" replace />;

  return (
    <KidsShell back="/kids/home" finishOpenLesson>
      <h1 className="mb-6 text-3xl">{lesson.title}</h1>

      {phase.name === 'intro' && (
        <div className="space-y-6">
          <DragonSays>{lesson.intro[phase.card]}</DragonSays>
          <button
            type="button"
            className="sticker"
            autoFocus
            onClick={() => setPhase(phase.card + 1 < lesson.intro.length
              ? { name: 'intro', card: phase.card + 1 }
              : { name: 'game' })}
          >
            {phase.card === 0 ? t('lesson.start') : t('lesson.next')}
          </button>
        </div>
      )}

      {phase.name === 'game' && <SortGame lesson={lesson} onDone={() => setPhase({ name: 'quiz', question: 0 })} />}

      {phase.name === 'quiz' && (
        <QuizQuestion
          key={phase.question}
          question={lesson.quiz[phase.question]!}
          counter={progressLabel ?? ''}
          onDone={(correctFirstTime) => {
            const next = [...firstTry, correctFirstTime];
            setFirstTry(next);
            setPhase(phase.question + 1 < lesson.quiz.length ? { name: 'quiz', question: phase.question + 1 } : { name: 'finish' });
          }}
        />
      )}

      {phase.name === 'finish' && (
        <Finish lesson={lesson} childId={childId} score={firstTry.filter(Boolean).length} />
      )}
    </KidsShell>
  );
}

/** Bins that mean "careful" get the warning colour, so the colour agrees with the label. */
const WARNING_BINS = new Set(['suspicious', 'scam', 'trick', 'never', 'weak']);

function binColor(binId: string, index: number): string {
  if (WARNING_BINS.has(binId)) return 'var(--color-coral)';
  return index === 0 ? 'var(--color-teal)' : 'var(--color-violet)';
}

function SortGame({ lesson, onDone }: { lesson: LessonBody; onDone: () => void }) {
  const { t } = useApp();
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ right: boolean; text: string } | null>(null);
  const remaining = lesson.game.items.filter((i) => !placed[i.id]);

  const drop = (binId: string) => {
    const item = lesson.game.items.find((i) => i.id === selected);
    if (!item) return;
    const right = item.bin === binId;
    setFeedback({ right, text: item.explain });
    if (right) {
      setPlaced((p) => ({ ...p, [item.id]: binId }));
      setSelected(null);
    }
  };

  return (
    <div className="space-y-6">
      {lesson.game.practiceNotice && (
        <p className="rounded-2xl border-[2.5px] border-dashed border-ink bg-mist px-4 py-3">{lesson.game.practiceNotice}</p>
      )}
      <p className="text-lg">{lesson.game.prompt} {t('lesson.game.pick')}</p>

      {remaining.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label={lesson.game.prompt}>
          {remaining.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={selected === item.id}
                onClick={() => { setSelected(item.id); setFeedback(null); }}
                className={`card-ink w-full p-4 text-start text-lg ${selected === item.id ? 'bg-sun' : ''}`}
              >
                {item.text}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Pinned to the bottom of the screen: feedback and bins stay one glance and one tap away. */}
      <div className="sticky bottom-0 z-10 -mx-4 space-y-3 bg-paper/95 px-4 py-3 backdrop-blur">
        {feedback && (
          <p role="status" className={`card-ink p-3 ${feedback.right ? 'bg-leaf/20' : 'bg-coral/15'}`}>
            <strong className="font-display">{feedback.right ? t('lesson.game.right') : t('lesson.game.wrong')}</strong>{' '}
            {feedback.text}
          </p>
        )}
        {remaining.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {lesson.game.bins.map((bin, index) => (
              <button
                key={bin.id}
                type="button"
                className="sticker w-full"
                style={{ background: binColor(bin.id, index) }}
                disabled={!selected}
                onClick={() => drop(bin.id)}
              >
                {bin.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {lesson.game.bins.map((bin) => (
          <section key={bin.id} aria-label={bin.label}>
            <h3 className="mb-1 font-display">{bin.label}</h3>
            <ul className="space-y-1 text-sm text-ink-soft">
              {lesson.game.items.filter((i) => placed[i.id] === bin.id).map((i) => <li key={i.id}>✓ {i.text}</li>)}
            </ul>
          </section>
        ))}
      </div>

      {remaining.length === 0 && (
        <button type="button" className="sticker" onClick={onDone} autoFocus>{t('lesson.next')}</button>
      )}
    </div>
  );
}

function QuizQuestion({ question, counter, onDone }: {
  question: LessonBody['quiz'][number];
  counter: string;
  onDone: (correctFirstTime: boolean) => void;
}) {
  const { t } = useApp();
  const [missed, setMissed] = useState(false);
  const [answered, setAnswered] = useState<number | null>(null);
  const correct = answered === question.answer;

  return (
    <fieldset className="space-y-5">
      <legend className="sr-only">{t('lesson.quiz.title')}</legend>
      <p className="text-ink-soft">{t('lesson.quiz.title')}: {counter}</p>
      <p className="font-display text-2xl">{question.question}</p>
      <div className="grid gap-3">
        {question.options.map((option, index) => (
          <button
            key={option}
            type="button"
            className={`sticker sticker-quiet justify-start text-start ${answered === index ? (correct ? '!bg-leaf' : '!bg-coral') : ''}`}
            disabled={correct}
            onClick={() => {
              setAnswered(index);
              if (index !== question.answer) setMissed(true);
            }}
          >
            {option}
          </button>
        ))}
      </div>
      {answered !== null && (
        <p role="status" className="card-ink p-4">
          <strong className="font-display">{correct ? t('lesson.game.right') : t('lesson.game.wrong')}</strong>{' '}
          {correct ? question.explain : ''}
        </p>
      )}
      {correct && (
        <button type="button" className="sticker" autoFocus onClick={() => onDone(!missed)}>{t('lesson.next')}</button>
      )}
    </fieldset>
  );
}

function Finish({ lesson, childId, score }: { lesson: LessonBody; childId: string; score: number }) {
  const { t, lang } = useApp();
  const [state, setState] = useState<'saving' | 'saved' | 'error'>('saving');
  const [badges, setBadges] = useState<string[]>([]);

  const save = useCallback(async () => {
    setState('saving');
    try {
      const result = await rpc<{ new_badges: string[] }>('record_lesson_result', {
        p_child: childId, p_lesson: lesson.id, p_score: score,
      });
      setBadges(result.new_badges);
      setState('saved');
    } catch {
      setState('error');
    }
  }, [childId, lesson.id, score]);

  useEffect(() => { void save(); }, [save]);

  return (
    <div className="space-y-6 text-center">
      <Dragon size={140} title="SI" />
      <h2 className="text-4xl">{t('lesson.finish.title')}</h2>
      <p className="text-xl">{t('lesson.finish.score', { score })}</p>
      <p className="mx-auto max-w-prose text-lg">{lesson.summary}</p>
      {badges.map((b) => (
        <p key={b} className="mx-auto w-fit rounded-full border-[2.5px] border-ink bg-sun px-5 py-2 font-display text-lg">
          {t('lesson.finish.badge', { badge: badgeLabel(lang, b) })}
        </p>
      ))}
      {state === 'error' && (
        <div className="space-y-3">
          <p role="alert">{t('lesson.saveError')}</p>
          <button type="button" className="sticker sticker-quiet" onClick={save}>{t('lesson.retrySave')}</button>
        </div>
      )}
      <Link to="/kids/home" className="sticker">{t('lesson.finish.back')}</Link>
    </div>
  );
}
