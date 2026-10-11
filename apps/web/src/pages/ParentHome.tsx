import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DeleteChildControl, FamilyDataSection } from '../components/DataControls.tsx';
import { Avatar } from '../components/kid-bits.tsx';
import { Choice, LanguageSwitch } from '../components/parent-bits.tsx';
import { useApp } from '../lib/app-state.tsx';
import { catalogLessons } from '../lib/content.ts';
import { alertKey } from '../lib/i18n.ts';
import { israelToday } from '../lib/screen-time.ts';
import { useStepUp } from '../lib/step-up.tsx';
import { POLICY_VERSION, rpc, supabase } from '../lib/supabase.ts';
import type { Child, Lang, Progress, SafetyEvent, TutorMessage } from '../lib/types.ts';

export function ParentHome() {
  const { t, lang, family, children, plan, billing, tutorAvailable, hasTutorConsent } = useApp();
  const freeForAll = billing?.free_family_plan === true;
  const navigate = useNavigate();
  const [progress, setProgress] = useState<Progress[]>([]);
  const [alerts, setAlerts] = useState<SafetyEvent[]>([]);

  const load = useCallback(async () => {
    const [p, a] = await Promise.all([
      supabase.from('progress').select('child_id, lesson_id, status, best_score, completed_at'),
      supabase.from('safety_events')
        .select('id, child_id, kind, severity, created_at, reviewed_at')
        .order('created_at', { ascending: false })
        .limit(30),
    ]);
    setProgress((p.data ?? []) as Progress[]);
    setAlerts((a.data ?? []) as SafetyEvent[]);
  }, []);

  // Live updates: Realtime applies the same RLS, so only this family's rows arrive.
  useEffect(() => {
    if (!family) return;
    void load();
    const channel = supabase
      .channel(`family-${family.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'progress', filter: `family_id=eq.${family.id}` }, () => void load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'safety_events', filter: `family_id=eq.${family.id}` }, (payload) => {
        setAlerts((current) => [payload.new as SafetyEvent, ...current].slice(0, 30));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [family, load]);

  const markReviewed = async (id: number) => {
    await rpc('mark_safety_event_reviewed', { p_event: id });
    setAlerts((current) => current.map((a) => (a.id === id ? { ...a, reviewed_at: new Date().toISOString() } : a)));
  };

  const childName = (id: string) => children.find((c) => c.id === id)?.nickname ?? t('parent.child');

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">{t('parent.title')}</h1>
          <p className="flex flex-wrap gap-x-3 text-ink-soft">
            <span>{t(freeForAll ? 'parent.plan.freeFamily' : plan === 'family' ? 'parent.plan.family' : 'parent.plan.free')}</span>
            <Link to="/parent/plan" className="underline decoration-teal underline-offset-4">{t('plan.link')}</Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LanguageSwitch />
          <button type="button" className="btn-parent btn-parent-quiet" onClick={() => supabase.auth.signOut()}>
            {t('parent.signOut')}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-3">
        <button type="button" className="sticker" onClick={() => navigate('/kids')}>{t('parent.childMode')}</button>
        <Link to="/parent/add-child" className="btn-parent btn-parent-quiet self-center">{t('parent.addChild')}</Link>
      </div>

      {tutorAvailable && !hasTutorConsent && <TutorConsentPanel />}

      <section aria-labelledby="alerts-title" className="space-y-3">
        <h2 id="alerts-title" className="text-xl">{t('parent.alerts')}</h2>
        {alerts.length === 0 ? (
          <p className="panel p-4 text-ink-soft">{t('parent.noAlerts')}</p>
        ) : (
          <ul className="panel divide-y divide-ink/10">
            {alerts.map((alert) => (
              <li key={alert.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={`mt-2 size-2.5 shrink-0 rounded-full ${
                      alert.severity === 'high' ? 'bg-coral' : alert.severity === 'warn' ? 'bg-sun' : 'bg-mist'
                    }`}
                  />
                  <div>
                    <p>
                      <strong className="font-display">{childName(alert.child_id)}</strong>: {t(alertKey(alert.kind))}
                    </p>
                    <p className="text-sm text-ink-soft">
                      {alert.severity === 'high' && <span className="text-coral">{t('parent.attention')} </span>}
                      <time dateTime={alert.created_at}>
                        {new Date(alert.created_at).toLocaleString(lang === 'he' ? 'he-IL' : 'en-IL', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: 'Asia/Jerusalem',
                        })}
                      </time>
                    </p>
                  </div>
                </div>
                {alert.reviewed_at ? (
                  <span className="text-sm text-ink-soft">{t('parent.reviewed')}</span>
                ) : (
                  <button type="button" className="btn-parent btn-parent-quiet text-sm" onClick={() => markReviewed(alert.id)}>
                    {t('parent.markReviewed')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {children.map((child) => (
        <ChildPanel key={child.id} child={child} progress={progress.filter((p) => p.child_id === child.id)} />
      ))}

      <FamilyDataSection />
    </main>
  );
}

function TutorConsentPanel() {
  const { t, refresh } = useApp();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const turnOn = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(false);
    try {
      await rpc('grant_consent', { p_scope: 'tutor', p_policy_version: POLICY_VERSION });
      await refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={turnOn} aria-labelledby="si-title" className="panel space-y-3 p-5">
      <h2 id="si-title" className="text-xl">{t('parent.si.title')}</h2>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 size-5" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>{t('setup.consent.tutor')}</span>
      </label>
      <button type="submit" className="btn-parent" disabled={busy || !agreed}>{t('parent.si.turnOn')}</button>
      {error && <p role="alert" className="text-sm text-coral">{t('common.error')}</p>}
    </form>
  );
}

function ChildPanel({ child, progress }: { child: Child; progress: Progress[] }) {
  const { t, isPaused, tutorAvailable } = useApp();
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [minutesToday, setMinutesToday] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const done = progress.filter((p) => p.status === 'completed').length;

  useEffect(() => {
    if (tutorAvailable) {
      rpc<{ used: number; limit: number }>('tutor_quota', { p_child: child.id }).then(setQuota).catch(() => setQuota(null));
    }
    supabase.from('child_activity').select('seconds').eq('child_id', child.id).eq('day', israelToday()).maybeSingle()
      .then(({ data }) => setMinutesToday(Math.floor(((data?.seconds as number | undefined) ?? 0) / 60)));
  }, [child.id, progress.length, tutorAvailable]);

  return (
    <section className="panel space-y-4 p-5" aria-label={child.nickname}>
      <div className="flex items-center gap-4">
        <Avatar id={child.avatar_id} size={56} />
        <div className="space-y-1">
          <h2 className="text-xl">{child.nickname}</h2>
          {isPaused(child.id) && (
            <p><Link to="/parent/plan" className="rounded-full bg-mist px-3 py-0.5 text-sm">{t('parent.paused')}</Link></p>
          )}
          <p className="text-sm text-ink-soft">{t('parent.lessonsDone', { done, total: catalogLessons.length })}</p>
          {quota && <p className="text-sm text-ink-soft">{t('parent.tutorToday', quota)}</p>}
          <p className="text-sm text-ink-soft">{t('parent.timeToday', { used: minutesToday, limit: child.daily_minutes })}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {tutorAvailable && (
          <button type="button" className="btn-parent btn-parent-quiet text-sm" aria-expanded={showTranscript} onClick={() => setShowTranscript((v) => !v)}>
            {t('parent.transcript')}
          </button>
        )}
        <button type="button" className="btn-parent btn-parent-quiet text-sm" aria-expanded={showSettings} onClick={() => setShowSettings((v) => !v)}>
          {t('parent.settings')}
        </button>
      </div>
      {showTranscript && <Transcript childId={child.id} />}
      {showSettings && (
        <div className="space-y-4">
          <ChildSettings child={child} />
          <DeleteChildControl child={child} />
        </div>
      )}
    </section>
  );
}

function Transcript({ childId }: { childId: string }) {
  const { t } = useApp();
  const [messages, setMessages] = useState<TutorMessage[] | null>(null);

  useEffect(() => {
    supabase.from('tutor_messages')
      .select('id, child_id, role, text_redacted, safety_flags, created_at')
      .eq('child_id', childId)
      .order('created_at', { ascending: true })
      .limit(200)
      .then(({ data }) => setMessages((data ?? []) as TutorMessage[]));
  }, [childId]);

  if (!messages) return <p aria-busy="true">{t('common.loading')}</p>;
  if (messages.length === 0) return <p className="text-ink-soft">{t('parent.noTranscript')}</p>;
  return (
    <ol className="max-h-96 space-y-2 overflow-y-auto rounded-xl bg-paper p-3">
      {messages.map((m) => (
        <li key={m.id} className={m.role === 'tutor' ? 'ps-6' : ''}>
          <span className="font-display">{m.role === 'tutor' ? t('parent.tutorLabel') : t('parent.child')}: </span>
          <span>{m.text_redacted}</span>
          {m.safety_flags.some((f) => f.includes('blocked') || f === 'distress') && (
            <span className="ms-2 text-sm text-coral">({m.safety_flags.join(', ')})</span>
          )}
        </li>
      ))}
    </ol>
  );
}

function ChildSettings({ child }: { child: Child }) {
  const { t, refresh, tutorAvailable } = useApp();
  const { withStepUp } = useStepUp();
  const [minutes, setMinutes] = useState(child.daily_minutes);
  const [tutorOn, setTutorOn] = useState(child.tutor_enabled);
  const [lang, setLang] = useState<Lang>(child.language);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const ok = await withStepUp(async () => {
        await rpc('update_child_settings', {
          p_child: child.id, p_daily_minutes: minutes, p_tutor_enabled: tutorOn, p_language: lang,
        });
        return true;
      });
      if (ok) {
        await refresh();
        setStatus('saved');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <form onSubmit={save} className="space-y-4 rounded-xl bg-paper p-4">
      <label className="flex items-center justify-between gap-4">
        <span>{t('parent.dailyMinutes')}</span>
        <input type="number" min={10} max={180} step={5} className="field w-28" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
      </label>
      {tutorAvailable && (
        <label className="flex items-center justify-between gap-4">
          <span>{t('parent.tutorEnabled')}</span>
          <input type="checkbox" className="size-5" checked={tutorOn} onChange={(e) => setTutorOn(e.target.checked)} />
        </label>
      )}
      <Choice<Lang>
        label={t('setup.child.language')}
        value={lang}
        onChange={setLang}
        options={[{ value: 'he', label: t('lang.he') }, { value: 'en', label: t('lang.en') }]}
      />
      <button type="submit" className="btn-parent">{t('parent.save')}</button>
      {status === 'saved' && <p role="status" className="text-sm text-teal-deep">{t('parent.saved')}</p>}
      {status === 'error' && <p role="alert" className="text-sm text-coral">{t('common.error')}</p>}
    </form>
  );
}
