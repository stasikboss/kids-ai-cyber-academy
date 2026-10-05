-- Kids AI & Cyber Safety Academy: daily time limit, data export and deletion.
--
--   * Daily time limit: the app reports visible child-screen time once a minute; the
--     tutor gate and lesson starts refuse once children.daily_minutes is used up.
--     Finishing a lesson already started is still allowed.
--   * Export: a guardian downloads every row held about the family as JSON.
--   * Deletion: a child profile, or the whole family. Family deletion is two steps:
--     prepare_family_deletion (as the owner, with step-up) then the delete-family Edge
--     Function calls svc_delete_family and removes the guardians' auth users.

-- ---------------------------------------------------------------------------
-- Daily time limit
-- ---------------------------------------------------------------------------

create table public.child_activity (
  child_id  uuid not null references public.children (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  day       date not null,
  seconds   int  not null default 0 check (seconds between 0 and 86400),
  last_beat timestamptz not null default now(),
  primary key (child_id, day)
);
create index child_activity_family_idx on public.child_activity (family_id);

alter table public.child_activity enable row level security;
create policy child_activity_read on public.child_activity
  for select to authenticated using (family_id = (select app.current_family()));
revoke all on public.child_activity from anon, authenticated;
grant select on public.child_activity to authenticated;

create function app.israel_today()
returns date
language sql stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Jerusalem')::date
$$;

-- {used_seconds, limit_seconds, time_up} for today, Israel time.
create function app.time_status(p_child uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'used_seconds',  coalesce(a.seconds, 0),
    'limit_seconds', c.daily_minutes * 60,
    'time_up',       coalesce(a.seconds, 0) >= c.daily_minutes * 60
  )
  from public.children c
  left join public.child_activity a on a.child_id = c.id and a.day = app.israel_today()
  where c.id = p_child
$$;

-- Heartbeat from the app while a child screen is visible (about every 60 s).
-- Credits at most the wall-clock time since the previous beat (plus 5 s of slack),
-- so two open tabs cannot double-count. Pass 1 just to read the current status.
create function public.record_activity(p_child uuid, p_seconds int)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_family uuid;
begin
  if not app.is_guardian_of_child(p_child) then
    raise exception 'not_found' using errcode = '42501';
  end if;
  if p_seconds is null or p_seconds not between 1 and 120 then
    raise exception 'invalid_argument' using errcode = '22023', detail = 'seconds';
  end if;

  select family_id into v_family from public.children where id = p_child;

  insert into public.child_activity as a (child_id, family_id, day, seconds, last_beat)
  values (p_child, v_family, app.israel_today(), case when p_seconds = 1 then 0 else p_seconds end, now())
  on conflict (child_id, day) do update
    set seconds = least(
          86400,
          a.seconds + case
            when p_seconds = 1 then 0
            else least(p_seconds, greatest(0, extract(epoch from now() - a.last_beat)::int) + 5)
          end),
        last_beat = case when p_seconds = 1 then a.last_beat else now() end;

  return app.time_status(p_child);
end;
$$;

-- The tutor gate gains a time_up reason (checked before the message quota).
create or replace function public.svc_tutor_gate(p_user uuid, p_child uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_child public.children%rowtype;
  v_plan  text;
  v_limit int;
  v_used  int;
  v_reason text;
begin
  select c.* into v_child
  from public.children c
  join public.guardians g on g.family_id = c.family_id
  where c.id = p_child and g.user_id = p_user;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'not_found');
  end if;

  v_plan := app.family_plan(v_child.family_id);
  select tutor_daily_messages into v_limit from public.plan_limits where plan = v_plan;
  select count(*) into v_used
  from public.tutor_messages
  where child_id = p_child and role = 'child' and created_at >= app.israel_day_start();

  v_reason := case
    when not v_child.active then 'child_inactive'
    when not v_child.tutor_enabled then 'tutor_disabled'
    when not exists (
      select 1 from public.consents
      where family_id = v_child.family_id and scope = 'tutor' and revoked_at is null
    ) then 'consent_required'
    when (app.time_status(p_child) ->> 'time_up')::boolean then 'time_up'
    when v_used >= v_limit then 'quota_reached'
    else null
  end;

  return jsonb_build_object(
    'allowed',   v_reason is null,
    'reason',    v_reason,
    'used',      v_used,
    'limit',     v_limit,
    'plan',      v_plan,
    'family_id', v_child.family_id,
    'language',  v_child.language,
    'age_band',  v_child.age_band
  );
end;
$$;

-- New lessons cannot start once today's time is used; a lesson in progress can finish.
create or replace function public.record_lesson_start(p_child uuid, p_lesson text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_family uuid := app.assert_lesson_allowed(p_child, p_lesson);
begin
  if (app.time_status(p_child) ->> 'time_up')::boolean then
    raise exception 'time_up' using errcode = '42501';
  end if;

  insert into public.progress (child_id, lesson_id, family_id, status)
  values (p_child, p_lesson, v_family, 'started')
  on conflict (child_id, lesson_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Export: every row held about the family, for the guardian who asks.
-- ---------------------------------------------------------------------------

create function public.export_family_data()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_family uuid := app.require_guardian();
  v_export jsonb;
begin
  perform app.require_step_up();

  v_export := jsonb_build_object(
    'format',      'kids-ai-cyber-academy/export-v1',
    'exported_at', now(),
    'family',      (select to_jsonb(f) from public.families f where f.id = v_family),
    'guardians',   coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', g.user_id, 'role', g.role, 'email', u.email, 'created_at', g.created_at)
        order by g.created_at)
      from public.guardians g join auth.users u on u.id = g.user_id
      where g.family_id = v_family), '[]'::jsonb),
    'children',    coalesce((
      select jsonb_agg(to_jsonb(c) - 'pin_hash' - 'pin_failed_attempts' order by c.created_at)
      from public.children c where c.family_id = v_family), '[]'::jsonb),
    'consents',    coalesce((
      select jsonb_agg(to_jsonb(x) order by x.granted_at)
      from public.consents x where x.family_id = v_family), '[]'::jsonb),
    'progress',    coalesce((
      select jsonb_agg(to_jsonb(p) order by p.started_at)
      from public.progress p where p.family_id = v_family), '[]'::jsonb),
    'badges',      coalesce((
      select jsonb_agg(to_jsonb(b) order by b.earned_at)
      from public.badges b where b.family_id = v_family), '[]'::jsonb),
    'activity',    coalesce((
      select jsonb_agg(to_jsonb(a) order by a.day)
      from public.child_activity a where a.family_id = v_family), '[]'::jsonb),
    'tutor_messages', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.id)
      from public.tutor_messages m where m.family_id = v_family), '[]'::jsonb),
    'safety_events', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.id)
      from public.safety_events s where s.family_id = v_family), '[]'::jsonb),
    'subscription', (select to_jsonb(s) from public.subscriptions s where s.family_id = v_family),
    'invoices',    coalesce((
      select jsonb_agg(to_jsonb(i) order by i.issued_at)
      from public.invoices i where i.family_id = v_family), '[]'::jsonb),
    'audit_log',   coalesce((
      select jsonb_agg(to_jsonb(l) order by l.id)
      from public.audit_log l where l.family_id = v_family), '[]'::jsonb)
  );

  perform app.audit(v_family, 'family.exported', null);
  return v_export;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deletion
-- ---------------------------------------------------------------------------

-- Removes one child and, by cascade, their progress, badges, activity, transcripts
-- and safety events.
create function public.delete_child(p_child uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_family uuid := app.require_guardian();
begin
  perform app.require_step_up();

  delete from public.children where id = p_child and family_id = v_family;
  if not found then
    raise exception 'not_found' using errcode = '42501';
  end if;

  perform app.audit(v_family, 'child.deleted', p_child::text);
end;
$$;

-- Step 1 of family deletion, called by the delete-family Edge Function with the
-- owner's own token, so RLS context and the step-up check are the owner's.
create function public.prepare_family_deletion()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_family uuid := app.require_guardian();
begin
  perform app.require_step_up();

  if not exists (
    select 1 from public.guardians where user_id = (select auth.uid()) and role = 'owner'
  ) then
    raise exception 'owner_only' using errcode = '42501';
  end if;

  -- A live standing order must be stopped at the gateway first, or it keeps charging.
  if exists (
    select 1 from public.subscriptions
    where family_id = v_family and status in ('active', 'grace') and gateway_recurring_id is not null
  ) then
    raise exception 'cancel_subscription_first' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'family_id', v_family,
    'guardian_ids', (select jsonb_agg(user_id) from public.guardians where family_id = v_family)
  );
end;
$$;

-- Step 2, service role only. Deletes the family and everything under it, drops the
-- family's audit trail, and leaves a single pseudonymous record of the deletion.
-- The Edge Function then deletes the returned auth users.
create function public.svc_delete_family(p_family uuid, p_actor uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_guardians jsonb;
begin
  if not exists (
    select 1 from public.guardians where family_id = p_family and user_id = p_actor and role = 'owner'
  ) then
    raise exception 'owner_only' using errcode = '42501';
  end if;

  select jsonb_agg(user_id) into v_guardians from public.guardians where family_id = p_family;

  delete from public.audit_log where family_id = p_family;
  delete from public.families where id = p_family;

  insert into public.audit_log (family_id, actor, action, target)
  values (null, p_actor, 'family.deleted', p_family::text);

  return jsonb_build_object('guardian_ids', coalesce(v_guardians, '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention: activity rows go after 90 days, alongside the existing rules.
-- ---------------------------------------------------------------------------

create or replace function app.purge_expired()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_messages int;
  v_events   int;
  v_webhooks int;
  v_activity int;
begin
  delete from public.tutor_messages where created_at < now() - interval '30 days';
  get diagnostics v_messages = row_count;

  delete from public.safety_events where created_at < now() - interval '90 days';
  get diagnostics v_events = row_count;

  delete from public.processed_webhooks where received_at < now() - interval '90 days';
  get diagnostics v_webhooks = row_count;

  delete from public.child_activity where day < app.israel_today() - 90;
  get diagnostics v_activity = row_count;

  return jsonb_build_object(
    'tutor_messages', v_messages,
    'safety_events', v_events,
    'processed_webhooks', v_webhooks,
    'child_activity', v_activity
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function app.israel_today(), app.time_status(uuid) from public;
grant execute on function app.israel_today() to authenticated, service_role;

revoke execute on function
  public.record_activity(uuid, int),
  public.export_family_data(),
  public.delete_child(uuid),
  public.prepare_family_deletion(),
  public.svc_delete_family(uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.record_activity(uuid, int),
  public.export_family_data(),
  public.delete_child(uuid),
  public.prepare_family_deletion()
to authenticated;

grant execute on function public.svc_delete_family(uuid, uuid) to service_role;
