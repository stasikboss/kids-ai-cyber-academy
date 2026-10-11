-- Kids AI & Cyber Safety Academy: Family plan billing.
--
-- Gateway: Grow (formerly Meshulam) runs the monthly standing order. Invoices: iCount,
-- issued from a retry queue so an invoicing outage never loses a payment.
--
-- Trust model. Grow's payment notifications carry no signature, so they are never
-- trusted on their own: the billing-webhook Edge Function looks every transaction up
-- with Grow and passes only verified values to svc_record_payment. The server sets
-- every amount; the browser only ever asks to start a checkout.
--
-- Entitlement is computed from dates, so nothing has to run on a schedule for a plan
-- to lapse (app.billing_phase):
--   active    renewing, paid through current_period_end
--   past_due  renewing, a renewal is late; still Family for a 7-day grace period
--   canceled  not renewing; Family until current_period_end
--   free      everything else
-- When a plan lapses, child profiles beyond the free limit are paused, never deleted.

-- ---------------------------------------------------------------------------
-- Price, subscription details, checkouts, the payment ledger
-- ---------------------------------------------------------------------------

-- Consumer prices in Israel are shown with VAT, so this includes VAT.
alter table public.plan_limits
  add column monthly_price_agorot int not null default 0
    check (monthly_price_agorot between 0 and 100000);

-- 0 means the Family plan is not on sale: prepare_checkout refuses and the app says
-- so. The service launches free. To start selling, set the price, e.g. ₪29.90:
--   update public.plan_limits set monthly_price_agorot = 2990 where plan = 'family';

alter table public.subscriptions
  -- Monthly amount the standing order was set up with; renewals must match it.
  add column recurring_amount_agorot int check (recurring_amount_agorot > 0),
  -- What the gateway needs to change or stop the standing order. Never sent to clients.
  add column gateway_ref jsonb not null default '{}'::jsonb
    check (jsonb_typeof(gateway_ref) = 'object');

-- One row per attempt to subscribe. Its id travels through the gateway as a custom
-- field, which is how the first payment finds its family.
create table public.checkout_sessions (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families (id) on delete cascade,
  created_by    uuid not null,
  gateway       text not null check (gateway in ('grow', 'tranzila')),
  plan          text not null default 'family' check (plan = 'family'),
  amount_agorot int  not null check (amount_agorot > 0),
  process_id    text check (char_length(process_id) <= 100),
  status        text not null default 'pending' check (status in ('pending', 'paid')),
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);
create index checkout_sessions_family_idx on public.checkout_sessions (family_id, created_at);

-- Every verified payment, once. The primary key makes webhook replays harmless.
create table public.payments (
  gateway          text not null check (gateway in ('grow', 'tranzila')),
  transaction_id   text not null check (char_length(transaction_id) between 1 and 100),
  family_id        uuid not null references public.families (id) on delete cascade,
  checkout_id      uuid references public.checkout_sessions (id) on delete set null,
  kind             text not null check (kind in ('initial', 'renewal')),
  outcome          text not null check (outcome in (
                     'applied', 'duplicate', 'amount_mismatch', 'charged_after_cancel')),
  amount_agorot    int  not null check (amount_agorot > 0),
  recurring_id     text check (char_length(recurring_id) <= 100),
  asmachta         text check (char_length(asmachta) <= 40),
  period_end       timestamptz,
  received_at      timestamptz not null default now(),
  invoice_status   text not null default 'pending'
                     check (invoice_status in ('pending', 'issued', 'failed', 'not_required')),
  invoice_attempts int  not null default 0,
  invoice_next_try timestamptz not null default now(),
  invoice_error    text check (char_length(invoice_error) <= 500),
  primary key (gateway, transaction_id)
);
create index payments_family_idx on public.payments (family_id, received_at);
create index payments_invoice_queue_idx on public.payments (invoice_next_try)
  where invoice_status = 'pending';

-- An invoice belongs to exactly one payment.
alter table public.invoices
  add column payment_gateway        text,
  add column payment_transaction_id text,
  add constraint invoices_payment_fk foreign key (payment_gateway, payment_transaction_id)
    references public.payments (gateway, transaction_id) on delete cascade,
  add constraint invoices_one_per_payment unique (payment_gateway, payment_transaction_id);

-- Replaced by the payments ledger.
drop table public.processed_webhooks;

alter table public.checkout_sessions enable row level security;  -- no policies: service role only
alter table public.payments          enable row level security;  -- no policies: service role only
revoke all on public.checkout_sessions, public.payments from anon, authenticated;

-- Guardians see their plan, not the gateway's identifiers.
revoke select on public.subscriptions from authenticated;
grant select (family_id, plan, status, current_period_end, grace_until, updated_at)
  on public.subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- Entitlement
-- ---------------------------------------------------------------------------

-- A renewing plan stays Family for 7 days past its period end while a late renewal
-- comes in; a canceled plan stays Family until its period end. A Family row with no
-- period end is a complimentary plan set by hand.
create or replace function app.family_plan(p_family uuid)
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

create function app.billing_phase(p_family uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select case
    when app.family_plan(p_family) = 'free' then 'free'
    when s.status = 'canceled' then 'canceled'
    when s.current_period_end is not null and now() >= s.current_period_end then 'past_due'
    else 'active'
  end
  from public.subscriptions s
  where s.family_id = p_family
$$;

-- Profiles beyond the plan's child limit are paused: the earliest-created active
-- profiles stay usable, the rest keep their data but cannot play or chat.
create function app.child_paused(p_child uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  with target as (
    select family_id from public.children where id = p_child
  ), ranked as (
    select c.id, row_number() over (order by c.created_at, c.id) as n
    from public.children c, target t
    where c.family_id = t.family_id and c.active
  )
  select coalesce(
    (select r.n from ranked r where r.id = p_child)
      > (select pl.max_children from public.plan_limits pl, target t
          where pl.plan = app.family_plan(t.family_id)),
    false)
$$;

create or replace function app.assert_lesson_allowed(p_child uuid, p_lesson text)
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
  if app.child_paused(p_child) then
    raise exception 'child_paused' using errcode = '42501';
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

-- What the parent's plan screen shows.
create function public.billing_status()
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

-- ---------------------------------------------------------------------------
-- Checkout: prepare_checkout (as the guardian, with step-up), then the Edge Function
-- asks Grow for a payment page and records its process id with svc_attach_checkout.
-- ---------------------------------------------------------------------------

create function public.prepare_checkout()
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

create function public.svc_attach_checkout(p_checkout uuid, p_process_id text)
returns void
language sql security definer
set search_path = ''
as $$
  update public.checkout_sessions
     set process_id = left(p_process_id, 100)
   where id = p_checkout and status = 'pending'
$$;

-- ---------------------------------------------------------------------------
-- Payments. Called only with values the Edge Function verified with the gateway:
--   {gateway, transaction_id, checkout_id?, recurring_id?, amount_agorot, asmachta?,
--    ref: {...what the gateway needs to stop this standing order}, invoice: bool}
-- Returns {outcome, family_id, kind, period_end, cancel_ref}. cancel_ref, when set, is
-- a standing order the caller must stop at the gateway (a duplicate, or one replaced
-- by a new subscription).
-- ---------------------------------------------------------------------------

create function public.svc_record_payment(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_gateway   text := p ->> 'gateway';
  v_txn       text := p ->> 'transaction_id';
  v_recurring text := nullif(p ->> 'recurring_id', '');
  v_amount    int;
  v_checkout  public.checkout_sessions%rowtype;
  v_sub       public.subscriptions%rowtype;
  v_existing  public.payments%rowtype;
  v_family    uuid;
  v_kind      text;
  v_outcome   text;
  v_end       timestamptz;
  v_cancel    jsonb;
begin
  if v_gateway is null or v_gateway not in ('grow', 'tranzila')
     or v_txn is null or char_length(v_txn) not between 1 and 100
     or jsonb_typeof(p -> 'amount_agorot') <> 'number'
     or jsonb_typeof(coalesce(p -> 'ref', '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  v_amount := (p ->> 'amount_agorot')::int;
  if v_amount <= 0 then
    raise exception 'invalid_argument' using errcode = '22023', detail = 'amount';
  end if;

  -- Replays (the gateway retrying, or the monthly webhook and the redirect both firing).
  select * into v_existing from public.payments where gateway = v_gateway and transaction_id = v_txn;
  if found then
    return jsonb_build_object(
      'outcome', 'replay', 'family_id', v_existing.family_id, 'kind', v_existing.kind,
      'period_end', v_existing.period_end, 'cancel_ref', null);
  end if;

  -- A renewal of a standing order we already know...
  if v_recurring is not null then
    select * into v_sub from public.subscriptions
     where gateway = v_gateway and gateway_recurring_id = v_recurring
     for update;
  end if;

  if v_sub.family_id is not null then
    v_family := v_sub.family_id;
    v_kind := 'renewal';
  else
    -- ...or the first payment of a checkout.
    if coalesce(p ->> 'checkout_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select * into v_checkout from public.checkout_sessions where id = (p ->> 'checkout_id')::uuid;
    end if;
    if v_checkout.id is null then
      raise exception 'unknown_payment' using errcode = 'P0002';
    end if;
    v_family := v_checkout.family_id;
    v_kind := 'initial';
    select * into v_sub from public.subscriptions where family_id = v_family for update;
  end if;

  if v_kind = 'initial' then
    if v_amount <> v_checkout.amount_agorot then
      v_outcome := 'amount_mismatch';
    elsif v_sub.gateway_recurring_id is not null
          and v_sub.gateway_recurring_id is distinct from v_recurring
          and app.billing_phase(v_family) in ('active', 'past_due') then
      -- Two checkouts paid at once: keep the first, stop the second, refund by hand.
      v_outcome := 'duplicate';
      v_cancel := coalesce(p -> 'ref', '{}'::jsonb);
    else
      v_outcome := 'applied';
      -- A lapsed standing order that was never canceled is replaced; stop the old one.
      if v_sub.gateway_recurring_id is not null
         and v_sub.gateway_recurring_id is distinct from v_recurring
         and v_sub.status <> 'canceled' then
        v_cancel := v_sub.gateway_ref;
      end if;
      -- Paid-up time left on a canceled plan is kept, not lost.
      v_end := greatest(now(), coalesce(v_sub.current_period_end, now())) + interval '1 month';
      update public.subscriptions
         set plan = 'family', status = 'active', gateway = v_gateway,
             gateway_recurring_id = v_recurring, gateway_ref = coalesce(p -> 'ref', '{}'::jsonb),
             recurring_amount_agorot = v_amount, current_period_end = v_end,
             grace_until = null, updated_at = now()
       where family_id = v_family;
      update public.checkout_sessions set status = 'paid', paid_at = now() where id = v_checkout.id;
    end if;
  else
    if v_amount <> v_sub.recurring_amount_agorot then
      v_outcome := 'amount_mismatch';
    else
      v_outcome := case when v_sub.status = 'canceled' then 'charged_after_cancel' else 'applied' end;
      -- On time: the next month follows on. Late (in grace): a full month from today.
      v_end := greatest(coalesce(v_sub.current_period_end, now()), now()) + interval '1 month';
      update public.subscriptions
         set current_period_end = v_end, plan = 'family', updated_at = now()
       where family_id = v_family;
    end if;
  end if;

  insert into public.payments (
    gateway, transaction_id, family_id, checkout_id, kind, outcome, amount_agorot,
    recurring_id, asmachta, period_end, invoice_status)
  values (
    v_gateway, v_txn, v_family, v_checkout.id, v_kind, v_outcome, v_amount,
    v_recurring, left(p ->> 'asmachta', 40), v_end,
    -- Money was received in every outcome, so every payment gets a tax document.
    case when coalesce((p ->> 'invoice')::boolean, true) then 'pending' else 'not_required' end);

  insert into public.audit_log (family_id, actor, action, target)
  values (v_family, null, 'billing.payment_' || v_outcome, v_gateway || ':' || v_txn);

  return jsonb_build_object(
    'outcome', v_outcome, 'family_id', v_family, 'kind', v_kind,
    'period_end', v_end, 'cancel_ref', v_cancel);
end;
$$;

-- ---------------------------------------------------------------------------
-- Invoice queue. Claiming leases a payment for 10 minutes, so the webhook and the
-- scheduled retry never issue the same invoice at the same time.
-- ---------------------------------------------------------------------------

create function public.svc_claim_invoices(
  p_gateway text default null,
  p_transaction text default null,
  p_limit int default 20
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_claimed jsonb;
begin
  with due as (
    select p.gateway, p.transaction_id
    from public.payments p
    where p.invoice_status = 'pending'
      and p.invoice_next_try <= now()
      and (p_transaction is null or (p.gateway = p_gateway and p.transaction_id = p_transaction))
    order by p.received_at
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    for update skip locked
  ), claimed as (
    update public.payments p
       set invoice_attempts = p.invoice_attempts + 1,
           invoice_next_try = now() + interval '10 minutes'
      from due
     where p.gateway = due.gateway and p.transaction_id = due.transaction_id
    returning p.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'gateway',        c.gateway,
    'transaction_id', c.transaction_id,
    'family_id',      c.family_id,
    'kind',           c.kind,
    'amount_agorot',  c.amount_agorot,
    'received_at',    c.received_at,
    'attempt',        c.invoice_attempts,
    'locale',         f.locale,
    'email',          (select u.email from public.guardians g join auth.users u on u.id = g.user_id
                        where g.family_id = c.family_id and g.role = 'owner' limit 1)
  ) order by c.received_at), '[]'::jsonb)
  into v_claimed
  from claimed c join public.families f on f.id = c.family_id;

  return v_claimed;
end;
$$;

create function public.svc_record_invoice(
  p_gateway text, p_transaction text, p_service text, p_document_id text, p_document_url text
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
begin
  select * into v_payment from public.payments
   where gateway = p_gateway and transaction_id = p_transaction for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.invoices (
    family_id, invoicing_service, document_id, document_url, amount_agorot,
    payment_gateway, payment_transaction_id)
  values (
    v_payment.family_id, p_service, p_document_id,
    case when p_document_url ~ '^https://' then p_document_url end,
    v_payment.amount_agorot, p_gateway, p_transaction)
  on conflict (payment_gateway, payment_transaction_id) do nothing;

  update public.payments
     set invoice_status = 'issued', invoice_error = null
   where gateway = p_gateway and transaction_id = p_transaction;
end;
$$;

-- Backs off 2, 4, 8 ... minutes (capped at 12 hours) and gives up after 10 attempts,
-- leaving the payment for a person to look at.
create function public.svc_invoice_failed(p_gateway text, p_transaction text, p_error text)
returns void
language sql security definer
set search_path = ''
as $$
  update public.payments
     set invoice_status = case when invoice_attempts >= 10 then 'failed' else 'pending' end,
         invoice_next_try = now() + least(power(2, invoice_attempts), 720) * interval '1 minute',
         invoice_error = left(p_error, 500)
   where gateway = p_gateway and transaction_id = p_transaction and invoice_status = 'pending'
$$;

-- ---------------------------------------------------------------------------
-- Cancellation: prepare_cancel_subscription (as a guardian, with step-up), then the
-- Edge Function stops the standing order at the gateway and calls svc_mark_canceled.
-- The plan stays Family until the paid period ends.
-- ---------------------------------------------------------------------------

create function public.prepare_cancel_subscription()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_family uuid := app.require_guardian();
begin
  perform app.require_step_up();
  if not exists (
    select 1 from public.subscriptions
    where family_id = v_family and plan = 'family' and status in ('active', 'grace')
  ) then
    raise exception 'not_subscribed' using errcode = 'P0001';
  end if;
  return jsonb_build_object('family_id', v_family);
end;
$$;

create function public.svc_cancel_details(p_family uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'gateway', s.gateway, 'recurring_id', s.gateway_recurring_id, 'ref', s.gateway_ref)
  from public.subscriptions s
  where s.family_id = p_family
$$;

create function public.svc_mark_canceled(p_family uuid, p_actor uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_end timestamptz;
begin
  update public.subscriptions
     set status = 'canceled', updated_at = now()
   where family_id = p_family and status in ('active', 'grace')
  returning current_period_end into v_end;

  insert into public.audit_log (family_id, actor, action, target)
  values (p_family, p_actor, 'billing.canceled', null);

  return jsonb_build_object('access_until', v_end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Export without the gateway's identifiers; payments added.
-- ---------------------------------------------------------------------------

create or replace function public.export_family_data()
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
    'subscription', (
      select to_jsonb(s) - 'gateway_ref' - 'gateway_recurring_id'
      from public.subscriptions s where s.family_id = v_family),
    'payments',    coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', p.kind, 'outcome', p.outcome, 'amount_agorot', p.amount_agorot,
        'received_at', p.received_at, 'period_end', p.period_end) order by p.received_at)
      from public.payments p where p.family_id = v_family), '[]'::jsonb),
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
-- Retention: unpaid checkouts go after 7 days; processed_webhooks no longer exists.
-- Payments stay while the family exists (the tax documents themselves live in iCount).
-- ---------------------------------------------------------------------------

create or replace function app.purge_expired()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_messages  int;
  v_events    int;
  v_activity  int;
  v_checkouts int;
begin
  delete from public.tutor_messages where created_at < now() - interval '30 days';
  get diagnostics v_messages = row_count;

  delete from public.safety_events where created_at < now() - interval '90 days';
  get diagnostics v_events = row_count;

  delete from public.child_activity where day < app.israel_today() - 90;
  get diagnostics v_activity = row_count;

  delete from public.checkout_sessions where status = 'pending' and created_at < now() - interval '7 days';
  get diagnostics v_checkouts = row_count;

  return jsonb_build_object(
    'tutor_messages', v_messages,
    'safety_events', v_events,
    'child_activity', v_activity,
    'checkout_sessions', v_checkouts
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function app.billing_phase(uuid), app.child_paused(uuid) from public;
grant execute on function app.billing_phase(uuid), app.child_paused(uuid) to authenticated, service_role;

revoke execute on function
  public.billing_status(),
  public.prepare_checkout(),
  public.prepare_cancel_subscription(),
  public.svc_attach_checkout(uuid, text),
  public.svc_record_payment(jsonb),
  public.svc_claim_invoices(text, text, int),
  public.svc_record_invoice(text, text, text, text, text),
  public.svc_invoice_failed(text, text, text),
  public.svc_cancel_details(uuid),
  public.svc_mark_canceled(uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.billing_status(),
  public.prepare_checkout(),
  public.prepare_cancel_subscription()
to authenticated;

grant execute on function
  public.svc_attach_checkout(uuid, text),
  public.svc_record_payment(jsonb),
  public.svc_claim_invoices(text, text, int),
  public.svc_record_invoice(text, text, text, text, text),
  public.svc_invoice_failed(text, text, text),
  public.svc_cancel_details(uuid),
  public.svc_mark_canceled(uuid, uuid)
to service_role;
