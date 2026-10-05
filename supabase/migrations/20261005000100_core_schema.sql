-- Kids AI & Cyber Safety Academy: core schema.
--
-- Rules this file enforces:
--   * Every row traces to one family. Clients read through RLS and never write tables
--     directly; all writes go through validated RPCs (next migration).
--   * Only adults (guardians) are auth users. Children are profiles with no email,
--     birthdate, real name, photo or voice.
--   * Launch is Israel-only, so families.country is pinned to 'IL'.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

create table public.plan_limits (
  plan                 text primary key check (plan in ('free', 'family')),
  max_children         int     not null check (max_children between 1 and 10),
  tutor_daily_messages int     not null check (tutor_daily_messages between 0 and 200),
  ai_security_track    boolean not null,
  host_rooms           boolean not null,
  certificates         boolean not null,
  weekly_digest        boolean not null
);

insert into public.plan_limits
  (plan, max_children, tutor_daily_messages, ai_security_track, host_rooms, certificates, weekly_digest)
values
  ('free',   1,  5, false, false, false, false),
  ('family', 4, 40, true,  true,  true,  true);

-- Lesson catalog. Lesson bodies live as versioned JSON in /content; this table holds
-- what the database needs to validate progress (track, order, plan, age band).
create table public.lessons (
  id           text primary key check (id ~ '^[a-z]+-[0-9]{2}$'),
  track        text not null check (track in ('ai_literacy', 'cyber_safety', 'ai_security')),
  position     int  not null check (position between 1 and 50),
  min_age_band text not null check (min_age_band in ('8-9', '10-12')),
  plan         text not null check (plan in ('free', 'family')),
  version      int  not null default 1 check (version >= 1),
  unique (track, position)
);

-- ---------------------------------------------------------------------------
-- Families and people
-- ---------------------------------------------------------------------------

create table public.families (
  id         uuid primary key default gen_random_uuid(),
  locale     text not null default 'he' check (locale in ('he', 'en')),
  country    text not null default 'IL' check (country = 'IL'),
  created_at timestamptz not null default now()
);

create table public.guardians (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  family_id  uuid not null references public.families (id) on delete cascade,
  role       text not null check (role in ('owner', 'co_parent')),
  created_at timestamptz not null default now()
);
create index guardians_family_idx on public.guardians (family_id);
create unique index guardians_one_owner_idx on public.guardians (family_id) where role = 'owner';

create table public.children (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null references public.families (id) on delete cascade,
  nickname            text not null check (char_length(btrim(nickname)) between 1 and 24),
  avatar_id           text not null check (avatar_id ~ '^[a-z0-9-]{1,32}$'),
  age_band            text not null check (age_band in ('8-9', '10-12')),
  language            text not null default 'he' check (language in ('he', 'en')),
  daily_minutes       int  not null default 30 check (daily_minutes between 10 and 180),
  tutor_enabled       boolean not null default true,
  -- PIN is a convenience lock between siblings, not a security control.
  pin_hash            text not null,
  pin_failed_attempts int  not null default 0 check (pin_failed_attempts between 0 and 5),
  pin_locked_until    timestamptz,
  -- false = read-only after a downgrade left more profiles than the plan allows.
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);
create index children_family_idx on public.children (family_id);

create table public.consents (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references public.families (id) on delete cascade,
  guardian_id    uuid not null references public.guardians (user_id) on delete cascade,
  scope          text not null check (scope in ('core', 'tutor', 'rooms')),
  policy_version text not null check (policy_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  granted_at     timestamptz not null default now(),
  revoked_at     timestamptz
);
create unique index consents_one_active_idx on public.consents (family_id, scope) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Learning
-- ---------------------------------------------------------------------------

-- family_id is denormalised so Realtime can filter by family and RLS stays a single
-- equality check. Only RPCs write it, always from the child's own row.
create table public.progress (
  child_id     uuid not null references public.children (id) on delete cascade,
  lesson_id    text not null references public.lessons (id) on delete restrict,
  family_id    uuid not null references public.families (id) on delete cascade,
  status       text not null check (status in ('started', 'completed')),
  best_score   int check (best_score between 0 and 3),
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (child_id, lesson_id)
);
create index progress_family_idx on public.progress (family_id);

create table public.badges (
  child_id  uuid not null references public.children (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  badge_id  text not null check (badge_id ~ '^[a-z0-9_-]{3,40}$'),
  earned_at timestamptz not null default now(),
  primary key (child_id, badge_id)
);
create index badges_family_idx on public.badges (family_id);

-- ---------------------------------------------------------------------------
-- AI tutor and safety
-- ---------------------------------------------------------------------------

-- Text is redacted before insert and deleted after 30 days (app.purge_expired).
create table public.tutor_messages (
  id            bigint generated always as identity primary key,
  child_id      uuid not null references public.children (id) on delete cascade,
  family_id     uuid not null references public.families (id) on delete cascade,
  role          text not null check (role in ('child', 'tutor')),
  text_redacted text not null check (char_length(text_redacted) between 1 and 4000),
  safety_flags  text[] not null default '{}',
  input_tokens  int check (input_tokens >= 0),
  output_tokens int check (output_tokens >= 0),
  created_at    timestamptz not null default now()
);
create index tutor_messages_child_time_idx on public.tutor_messages (child_id, created_at desc);
create index tutor_messages_family_idx on public.tutor_messages (family_id);

-- No message content is ever stored here; detail holds labels and counts only.
create table public.safety_events (
  id          bigint generated always as identity primary key,
  family_id   uuid not null references public.families (id) on delete cascade,
  child_id    uuid not null references public.children (id) on delete cascade,
  kind        text not null check (kind in (
                'pii_blocked', 'output_blocked', 'distress', 'unsafe_request',
                'manipulation', 'quota_reached')),
  severity    text not null check (severity in ('info', 'warn', 'high')),
  detail      jsonb not null default '{}'::jsonb check (pg_column_size(detail) < 2048),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);
create index safety_events_family_time_idx on public.safety_events (family_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Audit and billing
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id         bigint generated always as identity primary key,
  family_id  uuid references public.families (id) on delete set null,
  actor      uuid,
  action     text not null check (action ~ '^[a-z_.]{3,64}$'),
  target     text check (char_length(target) <= 200),
  created_at timestamptz not null default now()
);
create index audit_log_family_idx on public.audit_log (family_id, created_at desc);

-- Written only by the billing webhook (service role). No card data, ever.
create table public.subscriptions (
  family_id            uuid primary key references public.families (id) on delete cascade,
  plan                 text not null default 'free' check (plan in ('free', 'family')),
  status               text not null default 'active' check (status in ('active', 'grace', 'canceled')),
  gateway              text check (gateway in ('grow', 'tranzila')),
  gateway_recurring_id text check (char_length(gateway_recurring_id) <= 100),
  current_period_end   timestamptz,
  grace_until          timestamptz,
  updated_at           timestamptz not null default now()
);

-- A pointer only; the tax document itself lives in iCount or the gateway.
create table public.invoices (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null references public.families (id) on delete cascade,
  invoicing_service text not null check (invoicing_service in ('icount', 'grow', 'tranzila')),
  document_id       text not null check (char_length(document_id) <= 100),
  document_url      text check (document_url ~ '^https://'),
  amount_agorot     int  not null check (amount_agorot >= 0),
  currency          text not null default 'ILS' check (currency = 'ILS'),
  issued_at         timestamptz not null default now(),
  unique (invoicing_service, document_id)
);
create index invoices_family_idx on public.invoices (family_id);

-- Idempotency for payment-gateway webhooks, keyed by the gateway's transaction code.
create table public.processed_webhooks (
  gateway          text not null check (gateway in ('grow', 'tranzila')),
  transaction_code text not null check (char_length(transaction_code) <= 100),
  received_at      timestamptz not null default now(),
  primary key (gateway, transaction_code)
);
