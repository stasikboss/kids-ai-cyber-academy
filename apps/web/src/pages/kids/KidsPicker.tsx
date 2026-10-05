import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, PinPad } from '../../components/kid-bits.tsx';
import { useApp } from '../../lib/app-state.tsx';
import { rpc } from '../../lib/supabase.ts';
import type { Child } from '../../lib/types.ts';
import { KidsShell } from './KidsShell.tsx';

interface PinResult {
  ok: boolean;
  attempts_left?: number;
  locked_until?: string | null;
}

export function KidsPicker() {
  const { t, children, enterChildMode } = useApp();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Child | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async (pin: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await rpc<PinResult>('verify_child_pin', { p_child: selected.id, p_pin: pin });
      if (result.ok) {
        enterChildMode(selected.id);
        navigate('/kids/home');
      } else if (result.locked_until) {
        setMessage(t('kids.pin.locked'));
      } else {
        setMessage(t('kids.pin.wrong', { left: result.attempts_left ?? 0 }));
      }
    } catch {
      setMessage(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KidsShell>
      {!selected ? (
        <section className="space-y-6">
          <h1 className="text-center text-4xl">{t('kids.pick.title')}</h1>
          <ul className="flex flex-wrap justify-center gap-5">
            {children.filter((c) => c.active).map((child) => (
              <li key={child.id}>
                <button
                  type="button"
                  className="card-ink flex w-40 flex-col items-center gap-2 p-4 shadow-[0_4px_0_var(--color-ink)] active:translate-y-[3px] active:shadow-[0_1px_0_var(--color-ink)]"
                  onClick={() => { setSelected(child); setMessage(null); }}
                >
                  <Avatar id={child.avatar_id} size={88} />
                  <span lang={child.language} className="font-display text-xl">{child.nickname}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="mx-auto max-w-sm space-y-6 text-center" lang={selected.language}>
          <Avatar id={selected.avatar_id} size={96} />
          <h1 className="text-3xl">{t('kids.pin.title')}</h1>
          <PinPad label={t('kids.pin.title')} onComplete={check} disabled={busy} />
          {message && <p role="alert" className="text-lg">{message}</p>}
          <button type="button" className="sticker sticker-quiet" onClick={() => setSelected(null)}>
            {t('common.back')}
          </button>
        </section>
      )}
    </KidsShell>
  );
}
