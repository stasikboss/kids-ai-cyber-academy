import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DragonSays } from '../../components/Dragon.tsx';
import { useApp } from '../../lib/app-state.tsx';
import { useStepUp } from '../../lib/step-up.tsx';

/**
 * Child-mode frame. Leaving it always needs the parent's TOTP code. When today's
 * screen time is used up it shows a goodbye screen instead of the page, except for a
 * lesson that was already under way (finishOpenLesson).
 */
export function KidsShell({ children, back, finishOpenLesson = false }: {
  children: ReactNode;
  back?: string;
  finishOpenLesson?: boolean;
}) {
  const { t, leaveChildMode, timeUp: limitReached } = useApp();
  const timeUp = limitReached && !finishOpenLesson;
  const { requireStepUp } = useStepUp();
  const navigate = useNavigate();

  const exit = async () => {
    if (await requireStepUp()) {
      leaveChildMode();
      navigate('/parent');
    }
  };

  return (
    <div className="mx-auto min-h-dvh max-w-4xl px-4 pb-16 pt-5">
      <nav className="mb-6 flex items-center justify-between gap-3">
        {back && !timeUp ? (
          <Link to={back} className="sticker sticker-quiet">{t('common.back')}</Link>
        ) : <span />}
        <button type="button" onClick={exit} className="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-ink-soft underline-offset-4 hover:underline">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3" y="7" width="10" height="7" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          {t('kids.home.exit')}
        </button>
      </nav>
      {timeUp ? (
        <section className="mx-auto max-w-md space-y-4 pt-10 text-center" role="status">
          <h1 className="text-4xl">{t('kids.timeUp.title')}</h1>
          <DragonSays size={120}>{t('kids.timeUp.lead')}</DragonSays>
        </section>
      ) : (
        children
      )}
    </div>
  );
}
