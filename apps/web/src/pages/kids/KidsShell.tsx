import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../lib/app-state.tsx';
import { useStepUp } from '../../lib/step-up.tsx';

/** Child-mode frame. Leaving it always needs the parent's TOTP code. */
export function KidsShell({ children, back }: { children: ReactNode; back?: string }) {
  const { t, leaveChildMode } = useApp();
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
        {back ? (
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
      {children}
    </div>
  );
}
