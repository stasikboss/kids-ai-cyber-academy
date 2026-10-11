import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DragonSays } from '../../components/Dragon.tsx';
import { useApp } from '../../lib/app-state.tsx';
import { type LessonState, lessonsInTrack, lessonState, type Track, tracks } from '../../lib/content.ts';
import { badgeLabel } from '../../lib/i18n.ts';
import { supabase } from '../../lib/supabase.ts';
import type { Badge } from '../../lib/types.ts';
import { KidsShell } from './KidsShell.tsx';

const TRACK_COLOR: Record<Track['id'], string> = {
  ai_literacy: 'var(--color-violet)',
  cyber_safety: 'var(--color-teal)',
  ai_security: 'var(--color-coral)',
};

/** The lesson map: one trail of numbered stones per track. */
export function KidHome() {
  const { t, lang, activeChild, plan, tutorAvailable } = useApp();
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [badges, setBadges] = useState<Badge[]>([]);

  useEffect(() => {
    if (!activeChild) return;
    supabase.from('progress').select('lesson_id').eq('child_id', activeChild.id).eq('status', 'completed')
      .then(({ data }) => setCompleted(new Set((data ?? []).map((r) => r.lesson_id as string))));
    supabase.from('badges').select('child_id, badge_id, earned_at').eq('child_id', activeChild.id)
      .then(({ data }) => setBadges((data ?? []) as Badge[]));
  }, [activeChild]);

  if (!activeChild) return null;
  const ctx = { lang, plan, ageBand: activeChild.age_band, completed };

  return (
    <KidsShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <DragonSays>{t('kids.home.hello', { name: activeChild.nickname })}</DragonSays>
        {tutorAvailable && <Link to="/kids/tutor" className="sticker">{t('kids.home.askSi')}</Link>}
      </div>

      {badges.length > 0 && (
        <ul className="mb-8 flex flex-wrap gap-2">
          {badges.map((b) => (
            <li key={b.badge_id} className="rounded-full border-[2.5px] border-ink bg-sun px-4 py-1 font-display">
              {badgeLabel(lang, b.badge_id)}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-8 md:grid-cols-3">
        {tracks.map((track) => (
          <section key={track.id} aria-labelledby={`track-${track.id}`}>
            <h2 id={`track-${track.id}`} className="mb-4 text-2xl">{track.title[lang]}</h2>
            <ol className="relative ms-6 space-y-4 border-s-[3px] border-dashed border-ink/30 ps-6">
              {lessonsInTrack(track.id).map((lesson) => (
                <li key={lesson.id}>
                  <Stone
                    state={lessonState(lesson, ctx)}
                    color={TRACK_COLOR[track.id]}
                    number={lesson.position}
                    title={lesson.title[lang]}
                    to={`/kids/lesson/${lesson.id}`}
                  />
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </KidsShell>
  );
}

function Stone({ state, color, number, title, to }: {
  state: LessonState; color: string; number: number; title: string; to: string;
}) {
  const { t } = useApp();
  const open = state === 'open' || state === 'done';
  const note = {
    open: null,
    done: t('kids.lesson.done'),
    soon: t('kids.lesson.soon'),
    locked_plan: t('kids.lesson.lockedPlan'),
    locked_age: t('kids.lesson.lockedAge'),
  }[state];

  const body = (
    <>
      <span
        className="grid size-12 shrink-0 place-items-center rounded-full border-[2.5px] border-ink font-display text-xl"
        style={{ background: open ? color : 'white' }}
        aria-hidden="true"
      >
        {state === 'done' ? '✓' : number}
      </span>
      <span className="text-start">
        <span className="block leading-tight">{title}</span>
        {note && <span className="block text-sm text-ink-soft">{note}</span>}
      </span>
    </>
  );

  return open ? (
    <Link to={to} className="card-ink -ms-[2.6rem] flex items-center gap-3 p-2 pe-4 shadow-[0_4px_0_var(--color-ink)] active:translate-y-[3px] active:shadow-[0_1px_0_var(--color-ink)]">
      {body}
    </Link>
  ) : (
    <div className="-ms-[2.6rem] flex items-center gap-3 p-2 pe-4 opacity-60">{body}</div>
  );
}
