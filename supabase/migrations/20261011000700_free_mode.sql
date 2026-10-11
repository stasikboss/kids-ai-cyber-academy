-- Kids AI & Cyber Safety Academy: launch switches.
--
-- One row of settings the deployment controls (the deploy workflow sets them from
-- GitHub repository variables on every run):
--   free_family_plan  every family gets the Family plan's features and nobody is
--                     charged. Paid subscriptions, if any, keep working underneath.
--   tutor_available   the SI tutor is offered at all (off until an Anthropic API key
--                     is configured).
-- Both default to the paid, tutor-on product, so tests and local development behave
-- as before unless a test switches them.

create table public.app_settings (
  id               boolean primary key default true check (id),
  free_family_plan boolean not null default false,
  tutor_available  boolean not null default true,
  updated_at       timestamptz not null default now()
);
insert into public.app_settings default values;

alter table public.app_settings enable row level security;
create policy app_settings_read on public.app_settings for select to authenticated using (true);
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to authenticated;

create function app.setting_free_family_plan()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select free_family_plan from public.app_settings where id), false)
$$;

create function app.setting_tutor_available()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select tutor_available from public.app_settings where id), true)
$$;

-- What the family has paid for, ignoring the free switch.
create function app.paid_plan(p_family uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select case when exists (
    select 1
    from public.subscriptions s
    where s.family_id = p_family
      and s.plan = 'family'
      and (
        (s.status in ('active', 'grace')
          and (s.current_period_end is null or now() < s.current_period_end + interval '7 days'))
        or (s.status = 'canceled' and s.current_period_end > now())
      )
  ) then 'family' else 'free' end
$$;

-- The plan in force: Family while the free switch is on, otherwise what was paid for.
create or replace function app.family_plan(p_family uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select case when app.setting_free_family_plan() then 'family' else app.paid_plan(p_family) end
$$;

-- Billing state follows the paid subscription only.
create or replace function app.billing_phase(p_family uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select case
    when app.paid_plan(p_family) = 'free' then 'free'
    when s.status = 'canceled' then 'canceled'
    when s.current_period_end is not null and now() >= s.current_period_end then 'past_due'
    else 'active'
  end
  from public.subscriptions s
  where s.family_id = p_family
$$;

create or replace function public.billing_status()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_family uuid := app.require_guardian();
  v_sub    public.subscriptions%rowtype;
  v_phase  text := app.billing_phase(v_family);
begin
  select * into v_sub from public.subscriptions where family_id = v_family;
  return jsonb_build_object(
    'plan',               app.family_plan(v_family),
    'phase',              v_phase,
    'renews',             v_phase in ('active', 'past_due'),
    'free_family_plan',   app.setting_free_family_plan(),
    'current_period_end', case when v_phase <> 'free' then v_sub.current_period_end end,
    'grace_until',        case when v_phase = 'past_due' then v_sub.current_period_end + interval '7 days' end,
    'price_agorot',       (select monthly_price_agorot from public.plan_limits where plan = 'family'),
    'paused_children',    coalesce((
      select jsonb_agg(c.id order by c.created_at)
      from public.children c
      where c.family_id = v_family and app.child_paused(c.id)), '[]'::jsonb)
  );
end;
$$;

-- Nobody is asked to pay while the Family plan is free for everyone.
create or replace function public.prepare_checkout()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_family uuid := app.require_guardian();
  v_sub    public.subscriptions%rowtype;
  v_price  int;
  v_id     uuid;
begin
  perform app.require_step_up();

  if app.setting_free_family_plan() then
    raise exception 'billing_unavailable' using errcode = 'P0001';
  end if;

  select * into v_sub from public.subscriptions where family_id = v_family for update;

  -- One live standing order per family; a second would charge twice.
  if app.billing_phase(v_family) in ('active', 'past_due') and v_sub.gateway_recurring_id is not null then
    raise exception 'already_subscribed' using errcode = 'P0001';
  end if;

  if (select count(*) from public.checkout_sessions
       where family_id = v_family and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  select monthly_price_agorot into v_price from public.plan_limits where plan = 'family';
  if coalesce(v_price, 0) <= 0 then
    raise exception 'billing_unavailable' using errcode = 'P0001';
  end if;

  insert into public.checkout_sessions (family_id, created_by, gateway, amount_agorot)
  values (v_family, (select auth.uid()), 'grow', v_price)
  returning id into v_id;

  perform app.audit(v_family, 'billing.checkout_started', v_id::text);

  return jsonb_build_object(
    'checkout_id',   v_id,
    'amount_agorot', v_price,
    'locale',        (select locale from public.families where id = v_family)
  );
end;
$$;

-- The tutor gate refuses first when SI is switched off for everyone.
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
    when not app.setting_tutor_available() then 'tutor_unavailable'
    when not v_child.active then 'child_inactive'
    when app.child_paused(p_child) then 'child_paused'
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

revoke all on function
  app.setting_free_family_plan(), app.setting_tutor_available(), app.paid_plan(uuid)
from public;
grant execute on function
  app.setting_free_family_plan(), app.setting_tutor_available(), app.paid_plan(uuid)
to authenticated, service_role;
