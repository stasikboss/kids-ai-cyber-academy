import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChildForm } from '../components/ChildForm.tsx';
import { Dragon } from '../components/Dragon.tsx';
import { Field, LanguageSwitch } from '../components/parent-bits.tsx';
import { useApp } from '../lib/app-state.tsx';
import { CREATE_FAMILY_URL, POLICY_VERSION, rpc, supabase } from '../lib/supabase.ts';

type Step = 'family' | 'mfa' | 'consent' | 'child';

/**
 * First-run flow, in the order the database requires it:
 * family (geo-gated) → TOTP for the parent area → consent → first child.
 */
export function Setup() {
  const app = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!app.family) return setStep('family');
      const { data } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (!data?.totp.some((f) => f.status === 'verified')) return setStep('mfa');
      if (!app.hasCoreConsent) return setStep('consent');
      if (app.children.length === 0) return setStep('child');
      navigate('/parent', { replace: true });
    })();
    return () => { cancelled = true; };
  }, [app.family, app.hasCoreConsent, app.children.length, navigate]);

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <Dragon size={64} title="SI" />
        <LanguageSwitch />
      </div>
      {step === 'family' && <FamilyStep />}
      {step === 'mfa' && <MfaStep onDone={() => setStep(app.hasCoreConsent ? 'child' : 'consent')} />}
      {step === 'consent' && <ConsentStep />}
      {step === 'child' && (
        <section className="space-y-4">
          <h1 className="text-3xl">{app.t('setup.child.title')}</h1>
          <ChildForm onDone={() => navigate('/parent', { replace: true })} />
        </section>
      )}
    </main>
  );
}

function FamilyStep() {
  const { t, lang, refresh, session } = useApp();
  const [status, setStatus] = useState<'idle' | 'busy' | 'blocked' | 'error'>('idle');

  const create = async () => {
    setStatus('busy');
    try {
      // Same-origin route on the geo-gate Worker; it forwards only Israeli requests.
      const response = await fetch(CREATE_FAMILY_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${session?.access_token ?? ''}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ locale: lang }),
      });
      if (response.status === 451) return setStatus('blocked');
      if (!response.ok) return setStatus('error');
      await refresh();
    } catch {
      setStatus('error');
    }
  };

  return (
    <section className="space-y-4">
      <h1 className="text-3xl">{t('setup.family.title')}</h1>
      <p className="text-ink-soft">{t('setup.family.lead')}</p>
      <button type="button" className="btn-parent w-full" onClick={create} disabled={status === 'busy'}>
        {t('setup.family.button')}
      </button>
      {status === 'blocked' && <p role="alert" className="text-coral">{t('setup.family.blocked')}</p>}
      {status === 'error' && <p role="alert" className="text-coral">{t('setup.family.error')}</p>}
    </section>
  );
}

function MfaStep({ onDone }: { onDone: () => void }) {
  const { t } = useApp();
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Clear half-finished enrolments from earlier attempts, then start a fresh one.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const f of existing?.all ?? []) {
        if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `SI parent ${new Date().toISOString().slice(0, 10)}`,
      });
      if (!cancelled && data && !enrollError) {
        setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (!factor) return;
    setBusy(true);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: code.replace(/\s/g, ''),
    });
    setBusy(false);
    if (verifyError) setError(true);
    else onDone();
  };

  return (
    <form onSubmit={verify} className="space-y-4">
      <h1 className="text-3xl">{t('setup.mfa.title')}</h1>
      <p className="text-ink-soft">{t('setup.mfa.lead')}</p>
      {factor ? (
        <>
          <img src={factor.qr} alt="" width={200} height={200} className="panel mx-auto p-2" />
          <p className="text-sm text-ink-soft">
            {t('setup.mfa.secret')} <code dir="ltr" className="break-all">{factor.secret}</code>
          </p>
        </>
      ) : (
        <p aria-busy="true">{t('common.loading')}</p>
      )}
      <Field label={t('setup.mfa.code')} htmlFor="totp">
        <input
          id="totp"
          className="field text-center text-2xl tracking-[0.3em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          dir="ltr"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={error}
        />
      </Field>
      {error && <p role="alert" className="text-coral">{t('setup.mfa.error')}</p>}
      <button type="submit" className="btn-parent w-full" disabled={busy || !factor || code.replace(/\s/g, '').length !== 6}>
        {t('setup.mfa.verify')}
      </button>
    </form>
  );
}

function ConsentStep() {
  const { t, refresh, tutorAvailable } = useApp();
  const [core, setCore] = useState(false);
  const [tutor, setTutor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(false);
    try {
      await rpc('grant_consent', { p_scope: 'core', p_policy_version: POLICY_VERSION });
      if (tutor) await rpc('grant_consent', { p_scope: 'tutor', p_policy_version: POLICY_VERSION });
      await refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-3xl">{t('setup.consent.title')}</h1>
      <p className="text-ink-soft">{t('setup.consent.lead')}</p>
      <label className="panel flex items-start gap-3 p-4">
        <input type="checkbox" className="mt-1 size-5" checked={core} onChange={(e) => setCore(e.target.checked)} required />
        <span>{t('setup.consent.core')}</span>
      </label>
      {tutorAvailable && (
        <label className="panel flex items-start gap-3 p-4">
          <input type="checkbox" className="mt-1 size-5" checked={tutor} onChange={(e) => setTutor(e.target.checked)} />
          <span>{t('setup.consent.tutor')}</span>
        </label>
      )}
      {error && <p role="alert" className="text-coral">{t('common.error')}</p>}
      <button type="submit" className="btn-parent w-full" disabled={busy || !core}>
        {t('setup.consent.continue')}
      </button>
    </form>
  );
}
