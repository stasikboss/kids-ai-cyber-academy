import type { Session } from '@supabase/supabase-js';
import {
  createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { applyDocumentLanguage, type MessageKey, translate } from './i18n.ts';
import { useScreenTime } from './screen-time.ts';
import { supabase } from './supabase.ts';
import type { Child, Family, Lang, Plan, PlanLimits } from './types.ts';

interface AppState {
  ready: boolean;
  session: Session | null;
  family: Family | null;
  children: Child[];
  plan: Plan;
  limits: PlanLimits | null;
  hasCoreConsent: boolean;
  hasTutorConsent: boolean;
  activeChild: Child | null;
  /** Today's screen time is used up for the active child (child mode only). */
  timeUp: boolean;
  lang: Lang;
  setParentLang: (lang: Lang) => void;
  enterChildMode: (childId: string) => void;
  leaveChildMode: () => void;
  refresh: () => Promise<void>;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const AppContext = createContext<AppState | null>(null);

// Per-device conveniences only; nothing here is a security boundary.
const ACTIVE_CHILD_KEY = 'kca.activeChild';
const PARENT_LANG_KEY = 'kca.parentLang';

function readStorage(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage, key: string, value: string | null): void {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the app still works, it just forgets.
  }
}

export function AppProvider({ children: content }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [kids, setKids] = useState<Child[]>([]);
  const [plan, setPlan] = useState<Plan>('free');
  const [limits, setLimits] = useState<PlanLimits | null>(null);
  const [consents, setConsents] = useState<string[]>([]);
  const [activeChildId, setActiveChildId] = useState<string | null>(() => readStorage(sessionStorage, ACTIVE_CHILD_KEY));
  const [parentLang, setParentLangState] = useState<Lang>(() =>
    readStorage(localStorage, PARENT_LANG_KEY) === 'en' ? 'en' : 'he');

  const load = useCallback(async (current: Session | null) => {
    if (!current) {
      setFamily(null);
      setKids([]);
      setConsents([]);
      return;
    }
    const { data: guardian } = await supabase
      .from('guardians').select('family_id').eq('user_id', current.user.id).maybeSingle();
    if (!guardian) {
      setFamily(null);
      setKids([]);
      setConsents([]);
      return;
    }

    const [familyRes, kidsRes, subRes, consentRes, limitsRes] = await Promise.all([
      supabase.from('families').select('id, locale').eq('id', guardian.family_id).single(),
      supabase.from('children')
        .select('id, family_id, nickname, avatar_id, age_band, language, daily_minutes, tutor_enabled, pin_locked_until, active, created_at')
        .order('created_at'),
      supabase.from('subscriptions').select('plan, status, current_period_end').maybeSingle(),
      supabase.from('consents').select('scope').is('revoked_at', null),
      supabase.from('plan_limits').select('plan, max_children, tutor_daily_messages, ai_security_track'),
    ]);

    const sub = subRes.data;
    const paid = sub?.plan === 'family' && (
      sub.status === 'active' || sub.status === 'grace'
      || (sub.status === 'canceled' && !!sub.current_period_end && new Date(sub.current_period_end) > new Date())
    );
    const currentPlan: Plan = paid ? 'family' : 'free';

    setFamily(familyRes.data as Family | null);
    setKids((kidsRes.data ?? []) as Child[]);
    setPlan(currentPlan);
    setLimits(((limitsRes.data ?? []) as PlanLimits[]).find((l) => l.plan === currentPlan) ?? null);
    setConsents((consentRes.data ?? []).map((c) => c.scope as string));
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      await load(data.session);
      if (!cancelled) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void load(next);
      if (event === 'SIGNED_OUT') {
        setActiveChildId(null);
        writeStorage(sessionStorage, ACTIVE_CHILD_KEY, null);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [load]);

  const activeChild = kids.find((c) => c.id === activeChildId) ?? null;
  const lang: Lang = activeChild?.language ?? parentLang;
  // Lives here, above the routes, so moving between child pages never resets it.
  const { timeUp } = useScreenTime(activeChild?.id ?? null);

  useEffect(() => applyDocumentLanguage(lang), [lang]);

  const value = useMemo<AppState>(() => ({
    ready,
    session,
    family,
    children: kids,
    plan,
    limits,
    hasCoreConsent: consents.includes('core'),
    hasTutorConsent: consents.includes('tutor'),
    activeChild,
    timeUp,
    lang,
    setParentLang: (next) => {
      setParentLangState(next);
      writeStorage(localStorage, PARENT_LANG_KEY, next);
    },
    enterChildMode: (childId) => {
      setActiveChildId(childId);
      writeStorage(sessionStorage, ACTIVE_CHILD_KEY, childId);
    },
    leaveChildMode: () => {
      setActiveChildId(null);
      writeStorage(sessionStorage, ACTIVE_CHILD_KEY, null);
    },
    refresh: () => load(session),
    t: (key, vars) => translate(lang, key, vars),
  }), [ready, session, family, kids, plan, limits, consents, activeChild, timeUp, lang, load]);

  return <AppContext.Provider value={value}>{content}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
