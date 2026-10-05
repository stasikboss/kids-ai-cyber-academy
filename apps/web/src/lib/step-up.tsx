import { createContext, type FormEvent, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { useApp } from './app-state.tsx';
import { RpcError, supabase } from './supabase.ts';

/**
 * Parent step-up. The database refuses sensitive changes unless the session holds a
 * TOTP verification from the last 10 minutes (app.recent_step_up). The client checks
 * the same thing a little early, so a code is asked for before a request fails.
 */

const CLIENT_WINDOW_SECONDS = 9 * 60;

export async function hasRecentStepUp(): Promise<boolean> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel !== 'aal2') return false;
  const now = Date.now() / 1000;
  // String entries (RFC 8176 format from a custom access-token hook) carry no
  // timestamp, so they never count as recent: fail closed and ask for a code.
  const methods: unknown[] = data.currentAuthenticationMethods ?? [];
  return methods.some((m) =>
    typeof m === 'object' && m !== null
    && (m as { method?: string }).method === 'totp'
    && now - Number((m as { timestamp?: number }).timestamp) < CLIENT_WINDOW_SECONDS);
}

export async function verifyTotp(code: string): Promise<boolean> {
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === 'verified');
  if (!factor) return false;
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  return !error;
}

interface StepUpApi {
  /** Resolves true once the parent has a fresh step-up, false if they cancel. */
  requireStepUp: () => Promise<boolean>;
  /** Runs fn, asking for a code first if needed and once more if the server insists. */
  withStepUp: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
}

const StepUpContext = createContext<StepUpApi | null>(null);

export function StepUpProvider({ children }: { children: ReactNode }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback(() => new Promise<boolean>((resolve) => {
    resolver.current = resolve;
    setCode('');
    setError(false);
    setOpen(true);
  }), []);

  const requireStepUp = useCallback(async () => (await hasRecentStepUp()) || ask(), [ask]);

  const withStepUp = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (!(await requireStepUp())) return undefined;
    try {
      return await fn();
    } catch (err) {
      if (err instanceof RpcError && err.code === 'step_up_required' && (await ask())) return fn();
      throw err;
    }
  }, [ask, requireStepUp]);

  const close = (ok: boolean) => {
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const ok = await verifyTotp(code.replace(/\s/g, ''));
    setBusy(false);
    if (ok) close(true);
    else setError(true);
  };

  return (
    <StepUpContext.Provider value={{ requireStepUp, withStepUp }}>
      {children}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" role="presentation">
          <form
            onSubmit={submit}
            role="dialog"
            aria-modal="true"
            aria-labelledby="step-up-title"
            className="panel w-full max-w-sm space-y-4 p-6"
          >
            <h2 id="step-up-title" className="text-xl">{t('stepUp.title')}</h2>
            <p className="text-ink-soft">{t('stepUp.lead')}</p>
            <input
              className="field text-center text-2xl tracking-[0.3em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-label={t('setup.mfa.code')}
              aria-invalid={error}
              autoFocus
              dir="ltr"
            />
            {error && <p role="alert" className="text-sm text-coral">{t('setup.mfa.error')}</p>}
            <div className="flex gap-2">
              <button type="submit" className="btn-parent flex-1" disabled={busy || code.replace(/\s/g, '').length !== 6}>
                {t('stepUp.verify')}
              </button>
              <button type="button" className="btn-parent btn-parent-quiet" onClick={() => close(false)}>
                {t('stepUp.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}
    </StepUpContext.Provider>
  );
}

export function useStepUp(): StepUpApi {
  const ctx = useContext(StepUpContext);
  if (!ctx) throw new Error('useStepUp must be used inside StepUpProvider');
  return ctx;
}
