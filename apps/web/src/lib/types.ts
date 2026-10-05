export type Lang = 'he' | 'en';
export type AgeBand = '8-9' | '10-12';
export type Plan = 'free' | 'family';

export interface Child {
  id: string;
  family_id: string;
  nickname: string;
  avatar_id: string;
  age_band: AgeBand;
  language: Lang;
  daily_minutes: number;
  tutor_enabled: boolean;
  pin_locked_until: string | null;
  active: boolean;
  created_at: string;
}

export interface Progress {
  child_id: string;
  lesson_id: string;
  status: 'started' | 'completed';
  best_score: number | null;
  completed_at: string | null;
}

export interface Badge {
  child_id: string;
  badge_id: string;
  earned_at: string;
}

export type SafetyKind =
  | 'pii_blocked' | 'output_blocked' | 'distress' | 'unsafe_request' | 'manipulation' | 'quota_reached';

export interface SafetyEvent {
  id: number;
  child_id: string;
  kind: SafetyKind;
  severity: 'info' | 'warn' | 'high';
  created_at: string;
  reviewed_at: string | null;
}

export interface TutorMessage {
  id: number;
  child_id: string;
  role: 'child' | 'tutor';
  text_redacted: string;
  safety_flags: string[];
  created_at: string;
}

export interface PlanLimits {
  plan: Plan;
  max_children: number;
  tutor_daily_messages: number;
  ai_security_track: boolean;
}

export interface Family {
  id: string;
  locale: Lang;
}
