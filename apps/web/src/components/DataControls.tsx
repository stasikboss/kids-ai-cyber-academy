import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/app-state.tsx';
import { useStepUp } from '../lib/step-up.tsx';
import { callFunction, FunctionError, rpc, supabase } from '../lib/supabase.ts';
import type { Child } from '../lib/types.ts';

/** Shown once on the sign-in page after a family deletes its space. */
export const NOTICE_KEY = 'kca.notice';

function download(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Typed confirmation for anything that cannot be undone. */
function ConfirmDelete({ warning, label, onConfirm, busy }: {
  warning: string;
  label: string;
  onConfirm: () => void;
  busy: boolean;
}) {
  const { t } = useApp();
  const word = t('data.confirmWord');
  const [typed, setTyped] = useState('');
  return (
    <div className="space-y-3 rounded-xl border-[1.5px] border-coral/60 bg-coral/5 p-4">
      <p>{warning}</p>
      <label className="block space-y-1.5">
        <span className="text-sm">{t('data.typeToConfirm', { word })}</span>
        <input className="field" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </label>
      <button
        type="button"
        className="btn-parent !bg-coral !text-ink"
        disabled={busy || typed.trim() !== word}
        onClick={onConfirm}
      >
        {label}
      </button>
    </div>
  );
}

export function DeleteChildControl({ child }: { child: Child }) {
  const { t, refresh } = useApp();
  const { withStepUp } = useStepUp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const remove = async () => {
    setBusy(true);
    setError(false);
    try {
      const done = await withStepUp(async () => {
        await rpc('delete_child', { p_child: child.id });
        return true;
      });
      if (done) await refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <button type="button" className="btn-parent btn-parent-quiet text-sm text-coral" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {t('data.deleteChild', { name: child.nickname })}
      </button>
      {open && (
        <ConfirmDelete
          warning={t('data.deleteChildConfirm', { name: child.nickname })}
          label={t('data.confirmDelete')}
          onConfirm={remove}
          busy={busy}
        />
      )}
      {error && <p role="alert" className="text-sm text-coral">{t('common.error')}</p>}
    </div>
  );
}

export function FamilyDataSection() {
  const { t } = useApp();
  const { withStepUp, requireStepUp } = useStepUp();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cancelFirst, setCancelFirst] = useState(false);

  const exportData = async () => {
    setMessage(null);
    try {
      const data = await withStepUp(() => rpc<unknown>('export_family_data'));
      if (data) download(`kids-ai-cyber-academy-export-${new Date().toISOString().slice(0, 10)}.json`, data);
    } catch {
      setMessage(t('common.error'));
    }
  };

  const deleteFamily = async () => {
    setBusy(true);
    setMessage(null);
    setCancelFirst(false);
    try {
      if (!(await requireStepUp())) return;
      await callFunction('delete-family', { confirm: 'delete-family' });
      try {
        sessionStorage.setItem(NOTICE_KEY, 'family_deleted');
      } catch {
        // The notice is a courtesy; deletion already happened.
      }
      await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
      const code = error instanceof FunctionError ? error.code : '';
      if (code === 'cancel_subscription_first') setCancelFirst(true);
      else setMessage(code === 'owner_only' ? t('data.ownerOnly') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="data-title" className="panel space-y-4 p-5">
      <h2 id="data-title" className="text-xl">{t('data.title')}</h2>
      <div className="space-y-1">
        <button type="button" className="btn-parent btn-parent-quiet" onClick={exportData}>{t('data.export')}</button>
        <p className="text-sm text-ink-soft">{t('data.exportHint')}</p>
      </div>
      <div className="space-y-3">
        <button
          type="button"
          className="btn-parent btn-parent-quiet text-coral"
          aria-expanded={deleteOpen}
          onClick={() => setDeleteOpen((v) => !v)}
        >
          {t('data.deleteFamily')}
        </button>
        {deleteOpen && (
          <ConfirmDelete
            warning={t('data.deleteFamilyHint')}
            label={t('data.confirmDelete')}
            onConfirm={deleteFamily}
            busy={busy}
          />
        )}
      </div>
      {message && <p role="alert" className="text-sm text-coral">{message}</p>}
      {cancelFirst && (
        <p role="alert" className="text-sm text-coral">
          {t('data.cancelFirst')} <Link to="/parent/plan" className="underline underline-offset-4">{t('plan.link')}</Link>
        </p>
      )}
    </section>
  );
}
