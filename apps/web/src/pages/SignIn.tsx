import { type FormEvent, useState } from 'react';
import { NOTICE_KEY } from '../components/DataControls.tsx';
import { Dragon } from '../components/Dragon.tsx';
import { LanguageSwitch } from '../components/parent-bits.tsx';
import { useApp } from '../lib/app-state.tsx';
import { supabase } from '../lib/supabase.ts';

export function SignIn() {
  const { t } = useApp();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [deleted] = useState(() => {
    try {
      const notice = sessionStorage.getItem(NOTICE_KEY);
      sessionStorage.removeItem(NOTICE_KEY);
      return notice === 'family_deleted';
    } catch {
      return false;
    }
  });

  const redirectTo = `${window.location.origin}/`;

  const google = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) setStatus('error');
  };

  const sendLink = async (event: FormEvent) => {
    event.preventDefault();
    setStatus('sending');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    });
    setStatus(error ? 'error' : 'sent');
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <Dragon size={72} title="SI" />
        <LanguageSwitch />
      </div>
      {deleted && <p role="status" className="panel p-4">{t('data.deleted')}</p>}
      <h1 className="text-3xl">{t('signIn.title')}</h1>
      <p className="text-ink-soft">{t('signIn.lead')}</p>

      <button type="button" className="btn-parent w-full" onClick={google}>
        {t('signIn.google')}
      </button>

      <form onSubmit={sendLink} className="panel space-y-3 p-4">
        <label htmlFor="email" className="block text-sm text-ink-soft">{t('signIn.emailLabel')}</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          className="field"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="btn-parent btn-parent-quiet w-full" disabled={status === 'sending'}>
          {t('signIn.send')}
        </button>
        {status === 'sent' && <p role="status" className="text-sm text-teal-deep">{t('signIn.sent')}</p>}
        {status === 'error' && <p role="alert" className="text-sm text-coral">{t('signIn.error')}</p>}
      </form>
    </main>
  );
}
