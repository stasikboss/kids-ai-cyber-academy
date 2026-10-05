-- Kids AI & Cyber Safety Academy: helper functions, row-level security and grants.
--
-- Access model:
--   anon           nothing.
--   authenticated  SELECT on its own family's rows (RLS); writes only through RPCs.
--   service_role   Edge Functions; bypasses RLS; the only caller of svc_* functions.

-- ---------------------------------------------------------------------------
-- Helpers (schema app, not exposed through the Data API)
-- ---------------------------------------------------------------------------

-- The caller's family, or null when the caller is not a guardian.
create function app.current_family()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select g.family_id from public.guardians g where g.user_id = (select auth.uid())
$$;

create function app.is_guardian_of_child(p_child uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.children c
    join public.guardians g on g.family_id = c.family_id
    where c.id = p_child and g.user_id = (select auth.uid())
  )
$$;

-- True when the session reached AAL2 with a TOTP verification in the last p_max_age.
-- Child mode runs on the parent's session, so "the session is AAL2" is not enough:
-- sensitive actions need a fresh TOTP step-up.
-- Reads Supabase Auth's default amr format ([{method, timestamp}]). A custom
-- access-token hook that rewrites amr to RFC 8176 strings removes the timestamps, and
-- this then always returns false (fails closed); keep the default format.
create function app.recent_step_up(p_max_age interval default interval '10 minutes')
returns boolean
language sql stable
set search_path = ''
as $$
  with claims as (select coalesce((select auth.jwt()), '{}'::jsonb) as j)
  select
    coalesce(claims.j ->> 'aal', '') = 'aal2'
    and jsonb_typeof(claims.j -> 'amr') = 'array'
    and exists (
      select 1
      from jsonb_array_elements(claims.j -> 'amr') as e
      where e ->> 'method' = 'totp'
        and jsonb_typeof(e -> 'timestamp') = 'number'
        and to_timestamp((e ->> 'timestamp')::double precision) > now() - p_max_age
    )
  from claims
$$;

-- Plan in force: a paid plan counts while active, in grace, or canceled but paid up.
create function app.family_plan(p_family uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select s.plan
    from public.subscriptions s
    where s.family_id = p_family
      and (
        s.status in ('active', 'grace')
        or (s.status = 'canceled' and s.current_period_end > now())
      )
  ), 'free')
$$;

-- Start of the current day in Israel; tutor quotas reset at local midnight.
create function app.israel_day_start()
returns timestamptz
language sql stable
set search_path = ''
as $$
  select (date_trunc('day', now() at time zone 'Asia/Jerusalem')) at time zone 'Asia/Jerusalem'
$$;

create function app.require_guardian()
returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_family uuid;
begin
  v_family := app.current_family();
  if v_family is null then
    raise exception 'not_a_guardian' using errcode = '42501';
  end if;
  return v_family;
end;
$$;

create function app.require_step_up()
returns void
language plpgsql stable
set search_path = ''
as $$
begin
  if not app.recent_step_up() then
    raise exception 'step_up_required' using errcode = '42501',
      hint = 'Verify a TOTP code (supabase.auth.mfa.challengeAndVerify) and retry.';
  end if;
end;
$$;

create function app.audit(p_family uuid, p_action text, p_target text)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.audit_log (family_id, actor, action, target)
  values (p_family, (select auth.uid()), p_action, p_target)
$$;

-- ---------------------------------------------------------------------------
-- Row-level security: on for every table, read-only policies for guardians
-- ---------------------------------------------------------------------------

alter table public.plan_limits        enable row level security;
alter table public.lessons            enable row level security;
alter table public.families           enable row level security;
alter table public.guardians          enable row level security;
alter table public.children           enable row level security;
alter table public.consents           enable row level security;
alter table public.progress           enable row level security;
alter table public.badges             enable row level security;
alter table public.tutor_messages     enable row level security;
alter table public.safety_events      enable row level security;
alter table public.audit_log          enable row level security;
alter table public.subscriptions      enable row level security;
alter table public.invoices           enable row level security;
alter table public.processed_webhooks enable row level security;  -- no policies: service role only

create policy plan_limits_read on public.plan_limits
  for select to authenticated using (true);

create policy lessons_read on public.lessons
  for select to authenticated using (true);

create policy families_read on public.families
  for select to authenticated using (id = (select app.current_family()));

create policy guardians_read on public.guardians
  for select to authenticated using (family_id = (select app.current_family()));

create policy children_read on public.children
  for select to authenticated using (family_id = (select app.current_family()));

create policy consents_read on public.consents
  for select to authenticated using (family_id = (select app.current_family()));

create policy progress_read on public.progress
  for select to authenticated using (family_id = (select app.current_family()));

create policy badges_read on public.badges
  for select to authenticated using (family_id = (select app.current_family()));

create policy tutor_messages_read on public.tutor_messages
  for select to authenticated using (family_id = (select app.current_family()));

create policy safety_events_read on public.safety_events
  for select to authenticated using (family_id = (select app.current_family()));

create policy audit_log_read on public.audit_log
  for select to authenticated using (family_id = (select app.current_family()));

create policy subscriptions_read on public.subscriptions
  for select to authenticated using (family_id = (select app.current_family()));

create policy invoices_read on public.invoices
  for select to authenticated using (family_id = (select app.current_family()));

-- ---------------------------------------------------------------------------
-- Grants. Supabase grants broad table privileges to anon/authenticated by default;
-- strip them and add back only SELECT. RLS stays the second line of defence.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

grant select on
  public.plan_limits, public.lessons, public.families, public.guardians,
  public.consents, public.progress, public.badges, public.tutor_messages,
  public.safety_events, public.audit_log, public.subscriptions, public.invoices
to authenticated;

-- Column-level grant: the PIN hash and failure counter are never readable by clients.
grant select (
  id, family_id, nickname, avatar_id, age_band, language, daily_minutes,
  tutor_enabled, pin_locked_until, active, created_at
) on public.children to authenticated;

-- Policies call these helpers with the caller's privileges.
revoke all on all functions in schema app from public;
grant execute on function
  app.current_family(),
  app.is_guardian_of_child(uuid),
  app.recent_step_up(interval),
  app.family_plan(uuid),
  app.israel_day_start()
to authenticated, service_role;
