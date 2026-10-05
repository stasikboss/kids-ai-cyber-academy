-- Kids AI & Cyber Safety Academy: RPCs callable by signed-in guardians.
--
-- Every function is SECURITY DEFINER with an empty search_path, checks that the caller
-- is a guardian of the family it touches, validates every argument, and writes the
-- family_id itself (never from client input).
--
-- Error codes raised (message text, which clients match on):
--   not_a_guardian, not_found, step_up_required, consent_required, plan_child_limit,
--   child_inactive, lesson_not_available, invalid_argument

-- ---------------------------------------------------------------------------
-- Consent
-- ---------------------------------------------------------------------------

create function public.grant_consent(p_scope text, p_policy_version text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_family uuid := app.require_guardian();
begin
  if p_scope not in ('core', 'tutor', 'rooms')
     or p_policy_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  insert into public.consents (family_id, guardian_id, scope, policy_version)
  values (v_family, (select auth.uid()), p_scope, p_policy_version)
  on conflict (family_id, scope) where revoked_at is null do nothing;

  perform app.audit(v_family, 'consent.granted', p_scope || ':' || p_policy_version);
end;
$$;

create function public.revoke_consent(p_scope text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_family uuid := app.require_guardian();
begin
  if p_scope not in ('core', 'tutor', 'rooms') then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  update public.consents
     set revoked_at = now()
   where family_id = v_family and scope = p_scope and revoked_at is null;

  perform app.audit(v_family, 'consent.revoked', p_scope);
end;
$$;

-- ---------------------------------------------------------------------------
-- Children (all changes need a fresh TOTP step-up)
-- ---------------------------------------------------------------------------

create function public.add_child(
  p_nickname  text,
  p_avatar_id text,
  p_age_band  text,
  p_language  text,
  p_pin       text
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_family uuid := app.require_guardian();
  v_limit  int;
  v_count  int;
  v_id     uuid;
begin
  perform app.require_step_up();

  if not exists (
    select 1 from public.consents
    where family_id = v_family and scope = 'core' and revoked_at is null
  ) then
    raise exception 'consent_required' using errcode = '42501';
  end if;

  if p_pin is null or p_pin !~ '^[0-8]{4}$' then
    raise exception 'invalid_argument' using errcode = '22023', detail = 'pin';
  end if;

  -- Serialise concurrent adds for the same family so the plan limit holds.
  perform 1 from public.families where id = v_family for update;

  select max_children into v_limit
  from public.plan_limits where plan = app.family_plan(v_family);

  select count(*) into v_count
  from public.children where family_id = v_family and active;

  if v_count >= v_limit then
    raise exception 'plan_child_limit' using errcode = 'P0001';
  end if;

  insert into public.children (family_id, nickname, avatar_id, age_band, language, pin_hash)
  values (
    v_family, btrim(p_nickname), p_avatar_id, p_age_band, p_language,
    extensions.crypt(p_pin, extensions.gen_salt('bf', 8))
  )
  returning id into v_id;

  perform app.audit(v_family, 'child.created', v_id::text);
  return v_id;
end;
$$;

create function public.update_child_settings(
  p_child         uuid,
  p_daily_minutes int,
  p_tutor_enabled boolean,
  p_language      text
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_family uuid := app.require_guardian();
begin
  perform app.require_step_up();

  update public.children
     set daily_minutes = p_daily_minutes,
         tutor_enabled = p_tutor_enabled,
         language      = p_language
   where id = p_child and family_id = v_family;

  if not found then
    raise exception 'not_found' using errcode = '42501';
  end if;

  perform app.audit(v_family, 'child.settings_updated', p_child::text);
end;
$$;

create function public.set_child_pin(p_child uuid, p_pin text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_family uuid := app.require_guardian();
begin
  perform app.require_step_up();

  if p_pin is null or p_pin !~ '^[0-8]{4}$' then
    raise exception 'invalid_argument' using errcode = '22023', detail = 'pin';
  end if;

  update public.children
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)),
         pin_failed_attempts = 0,
         pin_locked_until = null
   where id = p_child and family_id = v_family;

  if not found then
    raise exception 'not_found' using errcode = '42501';
  end if;

  perform app.audit(v_family, 'child.pin_changed', p_child::text);
end;
$$;

-- Returns {"ok": true} or {"ok": false, "attempts_left": n, "locked_until": ts}.
-- Five wrong tries lock the profile for 15 minutes.
create function public.verify_child_pin(p_child uuid, p_pin text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_child public.children%rowtype;
  v_attempts int;
begin
  if not app.is_guardian_of_child(p_child) then
    raise exception 'not_found' using errcode = '42501';
  end if;

  select * into v_child from public.children where id = p_child for update;

  if v_child.pin_locked_until is not null and v_child.pin_locked_until > now() then
    return jsonb_build_object('ok', false, 'attempts_left', 0, 'locked_until', v_child.pin_locked_until);
  end if;

  if p_pin ~ '^[0-8]{4}$' and v_child.pin_hash = extensions.crypt(p_pin, v_child.pin_hash) then
    update public.children
       set pin_failed_attempts = 0, pin_locked_until = null
     where id = p_child;
    return jsonb_build_object('ok', true);
  end if;

  v_attempts := v_child.pin_failed_attempts + 1;

  if v_attempts >= 5 then
    update public.children
       set pin_failed_attempts = 0, pin_locked_until = now() + interval '15 minutes'
     where id = p_child
    returning pin_locked_until into v_child.pin_locked_until;
    return jsonb_build_object('ok', false, 'attempts_left', 0, 'locked_until', v_child.pin_locked_until);
  end if;

  update public.children set pin_failed_attempts = v_attempts where id = p_child;
  return jsonb_build_object('ok', false, 'attempts_left', 5 - v_attempts, 'locked_until', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Lessons and progress
-- ---------------------------------------------------------------------------

-- Shared checks for lesson writes. Returns the child's family.
create function app.assert_lesson_allowed(p_child uuid, p_lesson text)
returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_child  public.children%rowtype;
  v_lesson public.lessons%rowtype;
begin
  if not app.is_guardian_of_child(p_child) then
    raise exception 'not_found' using errcode = '42501';
  end if;

  select * into v_child from public.children where id = p_child;
  if not v_child.active then
    raise exception 'child_inactive' using errcode = '42501';
  end if;

  select * into v_lesson from public.lessons where id = p_lesson;
  if not found then
    raise exception 'not_found' using errcode = '42501';
  end if;

  if (v_lesson.plan = 'family' and app.family_plan(v_child.family_id) <> 'family')
     or (v_lesson.min_age_band = '10-12' and v_child.age_band <> '10-12') then
    raise exception 'lesson_not_available' using errcode = '42501';
  end if;

  return v_child.family_id;
end;
$$;

create function public.record_lesson_start(p_child uuid, p_lesson text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_family uuid := app.assert_lesson_allowed(p_child, p_lesson);
begin
  insert into public.progress (child_id, lesson_id, family_id, status)
  values (p_child, p_lesson, v_family, 'started')
  on conflict (child_id, lesson_id) do nothing;
end;
$$;

-- Scores are 0-3 (the three check questions). Completing every lesson in a track
-- earns that track's badge. Returns {"best_score": n, "new_badges": [...]}.
create function public.record_lesson_result(p_child uuid, p_lesson text, p_score int)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_family     uuid := app.assert_lesson_allowed(p_child, p_lesson);
  v_track      text;
  v_best       int;
  v_new_badges text[] := '{}';
  v_badge      text;
begin
  if p_score is null or p_score not between 0 and 3 then
    raise exception 'invalid_argument' using errcode = '22023', detail = 'score';
  end if;

  insert into public.progress as p
    (child_id, lesson_id, family_id, status, best_score, completed_at, updated_at)
  values
    (p_child, p_lesson, v_family, 'completed', p_score, now(), now())
  on conflict (child_id, lesson_id) do update
    set status       = 'completed',
        best_score   = greatest(coalesce(p.best_score, 0), excluded.best_score),
        completed_at = coalesce(p.completed_at, excluded.completed_at),
        updated_at   = now()
  returning best_score into v_best;

  select track into v_track from public.lessons where id = p_lesson;

  if not exists (
    select 1
    from public.lessons l
    left join public.progress pr
      on pr.lesson_id = l.id and pr.child_id = p_child and pr.status = 'completed'
    where l.track = v_track and pr.lesson_id is null
  ) then
    v_badge := 'track-' || replace(v_track, '_', '-');
    insert into public.badges (child_id, family_id, badge_id)
    values (p_child, v_family, v_badge)
    on conflict do nothing;
    if found then
      v_new_badges := array_append(v_new_badges, v_badge);
    end if;
  end if;

  return jsonb_build_object('best_score', v_best, 'new_badges', to_jsonb(v_new_badges));
end;
$$;

-- ---------------------------------------------------------------------------
-- Parent views
-- ---------------------------------------------------------------------------

create function public.tutor_quota(p_child uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_limit  int;
  v_used   int;
begin
  if not app.is_guardian_of_child(p_child) then
    raise exception 'not_found' using errcode = '42501';
  end if;

  select family_id into v_family from public.children where id = p_child;

  select tutor_daily_messages into v_limit
  from public.plan_limits where plan = app.family_plan(v_family);

  select count(*) into v_used
  from public.tutor_messages
  where child_id = p_child and role = 'child' and created_at >= app.israel_day_start();

  return jsonb_build_object('used', v_used, 'limit', v_limit, 'plan', app.family_plan(v_family));
end;
$$;

create function public.mark_safety_event_reviewed(p_event bigint)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_family uuid := app.require_guardian();
begin
  update public.safety_events
     set reviewed_at = coalesce(reviewed_at, now())
   where id = p_event and family_id = v_family;

  if not found then
    raise exception 'not_found' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: nothing in public is executable unless listed here.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.grant_consent(text, text),
  public.revoke_consent(text),
  public.add_child(text, text, text, text, text),
  public.update_child_settings(uuid, int, boolean, text),
  public.set_child_pin(uuid, text),
  public.verify_child_pin(uuid, text),
  public.record_lesson_start(uuid, text),
  public.record_lesson_result(uuid, text, int),
  public.tutor_quota(uuid),
  public.mark_safety_event_reviewed(bigint)
to authenticated;
