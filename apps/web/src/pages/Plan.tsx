import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LanguageSwitch } from '../components/parent-bits.tsx';
import { useApp } from '../lib/app-state.tsx';
import type { MessageKey } from '../lib/i18n.ts';
import { useStepUp } from '../lib/step-up.tsx';
import { callFunction, formatDate, formatShekels, FunctionError, rpc, supabase } from '../lib/supabase.ts';
import type { BillingStatus, Invoice, PlanLimits } from '../lib/types.ts';

const KNOWN_ERRORS = ['already_subscribed', 'rate_limited', 'billing_unavailable', 'gateway_error'];
const POLL_MS = 3000;
const POLL_TRIES = 30;

function errorKey(error: unknown): MessageKey {
  return error instanceof FunctionError && KNOWN_ERRORS.includes(error.code)
    ? (`plan.error.${error.code}` as MessageKey)
    : 'common.error';
}

/**
 * Plan and payments. Grow's payment page sends the parent back here with
 * ?checkout=<id>; the page then waits for the server to confirm the payment, since
 * only Grow's verified notification changes the plan.
 */
export function Plan() {
  const { t, lang, billing, children, refresh } = useApp();
  const { withStepUp } = useStepUp();
  const [params, setParams] = useSearchParams();
  const returning = params.has('checkout') && params.get('checkout') !== '';
  const [confirm, setConfirm] = useState<'waiting' | 'confirmed' | 'slow' | null>(returning ? 'waiting' : null);
  const [limits, setLimits] = useState<PlanLimits[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ key: MessageKey; tone: 'ok' | 'error' } | null>(null);

  const loadDetails = useCallback(async () => {
    const [l, i] = await Promise.all([
      supabase.from('plan_limits').select('plan, max_children, tutor_daily_messages, ai_security_track'),
      supabase.from('invoices')
        .select('id, document_id, document_url, amount_agorot, issued_at')
        .order('issued_at', { ascending: false })
        .limit(24),
    ]);
    setLimits((l.data ?? []) as PlanLimits[]);
    setInvoices((i.data ?? []) as Invoice[]);
  }, []);

  useEffect(() => { void loadDetails(); }, [loadDetails]);

  // Back from Grow: poll until the server has the verified payment.
  useEffect(() => {
    if (!returning) return;
    let tries = 0;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      tries += 1;
      const status = await rpc<BillingStatus>('billing_status').catch(() => null);
      if (status?.plan === 'family' && status.renews) {
        setConfirm('confirmed');
        setParams({}, { replace: true });
        await refresh();
        await loadDetails();
        return;
      }
      if (tries === 6) setConfirm('slow');
      if (tries < POLL_TRIES) setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => { stopped = true; };
  }, [returning, refresh, loadDetails, setParams]);

  const upgrade = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const result = await withStepUp(() => callFunction<{ url: string }>('billing-checkout'));
      if (result?.url) window.location.assign(result.url);
    } catch (error) {
      setMessage({ key: errorKey(error), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const result = await withStepUp(() => callFunction<{ canceled: boolean }>('billing-cancel'));
      if (result?.canceled) {
        setCancelOpen(false);
        setMessage({ key: 'plan.canceledNow', tone: 'ok' });
        await refresh();
      }
    } catch (error) {
      setMessage({ key: errorKey(error), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const phase = billing?.phase ?? 'free';
  const price = formatShekels(billing?.price_agorot ?? 0, lang);
  const periodEnd = billing?.current_period_end ? formatDate(billing.current_period_end, lang) : '';
  const free = limits.find((l) => l.plan === 'free');
  const family = limits.find((l) => l.plan === 'family');
  const paused = children.filter((c) => billing?.paused_children.includes(c.id)).map((c) => c.nickname);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl">{t('plan.title')}</h1>
        <div className="flex flex-wrap gap-2">
          <LanguageSwitch />
          <Link to="/parent" className="btn-parent btn-parent-quiet">{t('common.back')}</Link>
        </div>
      </header>

      {confirm && (
        <p role="status" aria-live="polite" className={`panel p-4 ${confirm === 'confirmed' ? 'border-leaf' : ''}`}>
          {t(confirm === 'confirmed' ? 'plan.welcome' : confirm === 'slow' ? 'plan.slow' : 'plan.confirming')}
        </p>
      )}

      <section aria-labelledby="status-title" className="panel space-y-4 p-5">
        <h2 id="status-title" className="text-xl">
          {t(phase === 'free' ? 'parent.plan.free' : 'parent.plan.family')}
        </h2>

        {phase === 'free' && (
          <>
            <p className="text-ink-soft">{t('plan.freeLead')}</p>
            <table className="w-full table-fixed border-collapse text-start">
              <colgroup>
                <col className="w-[34%]" />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr className="border-b border-ink/15">
                  <th scope="col" className="py-2 text-start font-normal text-ink-soft"><span className="sr-only">{t('plan.title')}</span></th>
                  <th scope="col" className="py-2 text-start font-display">{t('plan.compare.free')}</th>
                  <th scope="col" className="py-2 text-start font-display">
                    <span className="rounded-full bg-sun px-3 py-0.5">{t('plan.compare.family')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                <tr>
                  <th scope="row" className="py-2 pe-3 text-start font-normal text-ink-soft">{t('plan.row.children')}</th>
                  <td className="py-2">{free?.max_children ?? 1}</td>
                  <td className="py-2">{family?.max_children ?? 4}</td>
                </tr>
                <tr>
                  <th scope="row" className="py-2 pe-3 text-start font-normal text-ink-soft">{t('plan.row.tutor')}</th>
                  <td className="py-2">{free?.tutor_daily_messages ?? 5}</td>
                  <td className="py-2">{family?.tutor_daily_messages ?? 40}</td>
                </tr>
                <tr>
                  <th scope="row" className="py-2 pe-3 text-start font-normal text-ink-soft">{t('plan.row.tracks')}</th>
                  <td className="py-2">{t('plan.tracks.free')}</td>
                  <td className="py-2">{t('plan.tracks.family')}</td>
                </tr>
              </tbody>
            </table>
            <div className="space-y-2">
              <p className="font-display text-lg">{t('plan.price', { price })}</p>
              <button type="button" className="btn-parent" onClick={upgrade} disabled={busy || confirm === 'waiting'}>
                {t('plan.upgrade')}
              </button>
              <p className="text-sm text-ink-soft">{t('plan.upgradeHint')}</p>
            </div>
          </>
        )}

        {phase === 'active' && <p>{t('plan.active', { date: periodEnd })}</p>}
        {phase === 'past_due' && (
          <p>{t('plan.pastDue', { date: billing?.grace_until ? formatDate(billing.grace_until, lang) : '' })}</p>
        )}

        {phase === 'canceled' && (
          <>
            <p>{t('plan.canceled', { date: periodEnd })}</p>
            <button type="button" className="btn-parent" onClick={upgrade} disabled={busy}>{t('plan.resubscribe')}</button>
            <p className="text-sm text-ink-soft">{t('plan.resubscribeHint')}</p>
          </>
        )}

        {(phase === 'active' || phase === 'past_due') && (
          <div className="space-y-3">
            <button
              type="button"
              className="btn-parent btn-parent-quiet text-coral"
              aria-expanded={cancelOpen}
              onClick={() => setCancelOpen((v) => !v)}
            >
              {t('plan.cancel')}
            </button>
            {cancelOpen && (
              <div className="space-y-3 rounded-xl border-[1.5px] border-coral/60 bg-coral/5 p-4">
                <p>{t('plan.cancelConfirm', { date: periodEnd })}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-parent !bg-coral !text-ink" onClick={cancel} disabled={busy}>
                    {t('plan.cancelYes')}
                  </button>
                  <button type="button" className="btn-parent btn-parent-quiet" onClick={() => setCancelOpen(false)}>
                    {t('plan.cancelNo')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {message && (
          <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-coral' : 'text-teal-deep'}>
            {t(message.key)}
          </p>
        )}
      </section>

      {paused.length > 0 && (
        <p className="panel p-4">{t('plan.paused', { names: paused.join(', ') })}</p>
      )}

      <section aria-labelledby="invoices-title" className="space-y-3">
        <h2 id="invoices-title" className="text-xl">{t('plan.invoices')}</h2>
        {invoices.length === 0 ? (
          <p className="panel p-4 text-ink-soft">{t('plan.noInvoices')}</p>
        ) : (
          <ul className="panel divide-y divide-ink/10">
            {invoices.map((invoice) => (
              <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <span>
                  <time dateTime={invoice.issued_at}>{formatDate(invoice.issued_at, lang)}</time>
                  <span className="ms-3 text-ink-soft">{formatShekels(invoice.amount_agorot, lang)}</span>
                </span>
                {invoice.document_url && (
                  <a className="underline decoration-teal underline-offset-4" href={invoice.document_url} target="_blank" rel="noreferrer noopener">
                    {t('plan.viewInvoice')}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
