-- Kids AI & Cyber Safety Academy: service-role functions, retention and Realtime.
--
-- svc_* functions are called only by Edge Functions holding the service-role key.
-- They take the caller's user id as an argument (the Edge Function verifies the JWT
-- first) and re-check family membership themselves, because the service role
-- bypasses RLS.

-- ---------------------------------------------------------------------------
-- Family creation (reached only through the Israel-only geo gate)
-- ---------------------------------------------------------------------------

-- Idempotent: a user who already belongs to a family gets that family back.
create function public.svc_create_family(p_user uuid, p_locale text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_family uuid;
begin
  if p_locale not in ('he', 'en') then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'not_found' using errcode = '42501';
  end if;

  select family_id into v_family from public.guardians where user_id = p_user;
  if v_family is not null then
    return v_family;
  end if;

  insert into public.families (locale) values (p_locale) returning id into v_family;
  insert into public.guardians (user_id, family_id, role) values (p_user, v_family, 'owner');
  insert into public.subscriptions (family_id, plan, status) values (v_family, 'free', 'active');
  insert into public.audit_log (family_id, actor, action, target)
  values (v_family, p_user, 'family.created', v_family::text);

  return v_family;
end;
$$;

-- ---------------------------------------------------------------------------
-- AI tutor gateway
-- ---------------------------------------------------------------------------

-- Decides whether this user may send this child's next tutor message.
-- Returns {"allowed": bool, "reason": text|null, "used", "limit", "plan",
--          "family_id", "language", "age_band"}.
create function public.svc_tutor_gate(p_user uuid, p_child uuid)
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

-- Last p_limit turns for this child, oldest first, already redacted.
create function public.svc_recent_tutor_turns(p_child uuid, p_limit int default 6)
returns table (role text, text_redacted text)
language sql stable security definer
set search_path = ''
as $$
  select t.role, t.text_redacted
  from (
    select m.role, m.text_redacted, m.id
    from public.tutor_messages m
    where m.child_id = p_child and m.created_at > now() - interval '1 day'
    order by m.id desc
    limit least(greatest(p_limit, 0), 12)
  ) t
  order by t.id asc
$$;

-- Stores one turn. The child's line always counts toward the daily quota, even when
-- it was blocked before reaching the model. Returns {"used", "limit"}.
create function public.svc_log_tutor_turn(
  p_child         uuid,
  p_child_text    text,
  p_child_flags   text[],
  p_tutor_text    text,
  p_tutor_flags   text[],
  p_input_tokens  int,
  p_output_tokens int
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_limit  int;
  v_used   int;
begin
  select family_id into v_family from public.children where id = p_child;
  if v_family is null then
    raise exception 'not_found' using errcode = '42501';
  end if;

  insert into public.tutor_messages (child_id, family_id, role, text_redacted, safety_flags)
  values (p_child, v_family, 'child', left(p_child_text, 4000), coalesce(p_child_flags, '{}'));

  if p_tutor_text is not null and char_length(p_tutor_text) > 0 then
    insert into public.tutor_messages
      (child_id, family_id, role, text_redacted, safety_flags, input_tokens, output_tokens)
    values
      (p_child, v_family, 'tutor', left(p_tutor_text, 4000), coalesce(p_tutor_flags, '{}'),
       p_input_tokens, p_output_tokens);
  end if;

  select tutor_daily_messages into v_limit
  from public.plan_limits where plan = app.family_plan(v_family);
  select count(*) into v_used
  from public.tutor_messages
  where child_id = p_child and role = 'child' and created_at >= app.israel_day_start();

  return jsonb_build_object('used', v_used, 'limit', v_limit);
end;
$$;

create function public.svc_log_safety_event(
  p_child    uuid,
  p_kind     text,
  p_severity text,
  p_detail   jsonb
)
returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_id     bigint;
begin
  select family_id into v_family from public.children where id = p_child;
  if v_family is null then
    raise exception 'not_found' using errcode = '42501';
  end if;

  insert into public.safety_events (family_id, child_id, kind, severity, detail)
  values (v_family, p_child, p_kind, p_severity, coalesce(p_detail, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------

-- Tutor transcripts: 30 days. Safety events and webhook keys: 90 days.
create function app.purge_expired()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_messages int;
  v_events   int;
  v_webhooks int;
begin
  delete from public.tutor_messages where created_at < now() - interval '30 days';
  get diagnostics v_messages = row_count;

  delete from public.safety_events where created_at < now() - interval '90 days';
  get diagnostics v_events = row_count;

  delete from public.processed_webhooks where received_at < now() - interval '90 days';
  get diagnostics v_webhooks = row_count;

  return jsonb_build_object(
    'tutor_messages', v_messages,
    'safety_events', v_events,
    'processed_webhooks', v_webhooks
  );
end;
$$;

do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('purge-expired', '15 1 * * *', 'select app.purge_expired()');
  else
    raise notice 'pg_cron is not available: schedule app.purge_expired() daily by other means';
  end if;
end;
$do$;

-- ---------------------------------------------------------------------------
-- Realtime: the parent dashboard listens to progress and safety events.
-- Realtime applies the same RLS policies to each subscriber.
-- ---------------------------------------------------------------------------

do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.progress, public.safety_events;
  end if;
end;
$do$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function
  public.svc_create_family(uuid, text),
  public.svc_tutor_gate(uuid, uuid),
  public.svc_recent_tutor_turns(uuid, int),
  public.svc_log_tutor_turn(uuid, text, text[], text, text[], int, int),
  public.svc_log_safety_event(uuid, text, text, jsonb)
from public, anon, authenticated;

grant execute on function
  public.svc_create_family(uuid, text),
  public.svc_tutor_gate(uuid, uuid),
  public.svc_recent_tutor_turns(uuid, int),
  public.svc_log_tutor_turn(uuid, text, text[], text, text[], int, int),
  public.svc_log_safety_event(uuid, text, text, jsonb)
to service_role;

revoke execute on function app.purge_expired() from public;
grant execute on function app.purge_expired() to service_role;
