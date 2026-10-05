import { type FormEvent, useState } from 'react';
import { useApp } from '../lib/app-state.tsx';
import { useStepUp } from '../lib/step-up.tsx';
import { rpc, RpcError } from '../lib/supabase.ts';
import type { AgeBand, Lang } from '../lib/types.ts';
import { Avatar, AVATARS, PIN_PICTURES, PinPad } from './kid-bits.tsx';
import { Choice, Field } from './parent-bits.tsx';

/** Adds a child profile through add_child, which needs a fresh parent step-up. */
export function ChildForm({ onDone }: { onDone: () => void }) {
  const { t, lang, refresh, children, limits } = useApp();
  const { withStepUp } = useStepUp();
  const [nickname, setNickname] = useState('');
  const [ageBand, setAgeBand] = useState<AgeBand>('8-9');
  const [childLang, setChildLang] = useState<Lang>(lang);
  const [avatar, setAvatar] = useState(AVATARS[0]!.id);
  const [pin, setPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const atLimit = limits !== null && children.filter((c) => c.active).length >= limits.max_children;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!pin) return;
    setBusy(true);
    setError(null);
    try {
      const id = await withStepUp(() => rpc<string>('add_child', {
        p_nickname: nickname.trim(),
        p_avatar_id: avatar,
        p_age_band: ageBand,
        p_language: childLang,
        p_pin: pin,
      }));
      if (id) {
        await refresh();
        onDone();
      }
    } catch (err) {
      setError(err instanceof RpcError && err.code === 'plan_child_limit' ? t('setup.child.limit') : t('setup.child.error'));
    } finally {
      setBusy(false);
    }
  };

  if (atLimit) return <p className="panel p-4">{t('setup.child.limit')}</p>;

  return (
    <form onSubmit={save} className="space-y-6">
      <Field label={t('setup.child.nickname')} hint={t('setup.child.nicknameHint')} htmlFor="nickname">
        <input
          id="nickname"
          className="field"
          required
          maxLength={24}
          autoComplete="off"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />
      </Field>

      <Field label={t('setup.child.age')}>
        <Choice<AgeBand>
          label={t('setup.child.age')}
          value={ageBand}
          onChange={setAgeBand}
          options={[{ value: '8-9', label: '8–9' }, { value: '10-12', label: '10–12' }]}
        />
      </Field>

      <Field label={t('setup.child.language')}>
        <Choice<Lang>
          label={t('setup.child.language')}
          value={childLang}
          onChange={setChildLang}
          options={[{ value: 'he', label: t('lang.he') }, { value: 'en', label: t('lang.en') }]}
        />
      </Field>

      <Field label={t('setup.child.avatar')}>
        <div role="radiogroup" aria-label={t('setup.child.avatar')} className="flex flex-wrap gap-2">
          {AVATARS.map((a, index) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={avatar === a.id}
              aria-label={`${t('setup.child.avatar')} ${index + 1}`}
              onClick={() => setAvatar(a.id)}
              className={`rounded-2xl border-[2.5px] p-1 ${avatar === a.id ? 'border-ink bg-sun' : 'border-transparent'}`}
            >
              <Avatar id={a.id} size={56} />
            </button>
          ))}
        </div>
      </Field>

      <Field label={t('setup.child.pin')}>
        {pin ? (
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden="true">
              {pin.split('').map((d) => PIN_PICTURES[Number(d)]).join(' ')}
            </span>
            <button type="button" className="btn-parent btn-parent-quiet" onClick={() => setPin(null)}>
              {t('setup.child.pinReset')}
            </button>
          </div>
        ) : (
          <PinPad label={t('setup.child.pin')} onComplete={setPin} />
        )}
      </Field>

      {error && <p role="alert" className="text-coral">{error}</p>}
      <button type="submit" className="btn-parent w-full" disabled={busy || !pin || !nickname.trim()}>
        {t('setup.child.save')}
      </button>
    </form>
  );
}
