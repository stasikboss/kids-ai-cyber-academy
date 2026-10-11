# Kids AI & Cyber Safety Academy

A Hebrew and English web app where children aged 8–12 learn AI literacy and online
safety through short game lessons and a guarded AI tutor, SI, a dragon robot. Parents own
the account; children never give an email, real name, photo or voice. Launch is
Israel-only.

This repository covers Sprint 0, Phase 1 and the Phase 2 billing build: the
security-critical foundations, all 15 lessons in both languages, a daily time limit
enforced by the database, family data export and deletion, and the Family plan with
Grow monthly payments and iCount invoices. Billing still has to be run end to end in
Grow's and iCount's sandboxes (see "Before the private pilot"). The product plan lives
in the planning doc.

## What is here

| Path | What it is |
| --- | --- |
| `supabase/migrations/` | Schema, row-level security, validated RPCs, TOTP step-up, plan limits, 30-day transcript retention |
| `supabase/functions/_shared/` | Tutor safety pipeline: PII check, intent classifier, streamed answer with per-sentence filter, output classifier |
| `supabase/functions/tutor-chat/` | Edge Function wiring the pipeline to Supabase and Claude Haiku 4.5 (server-sent events) |
| `supabase/functions/create-family/` | Family creation; accepts only requests signed by the geo gate |
| `supabase/functions/delete-family/` | Deletes a family's data and its parents' sign-in accounts (owner only, fresh TOTP) |
| `supabase/functions/billing-*/` | Family plan: `checkout` (Grow payment page), `webhook` (Grow notifications, verified with Grow), `cancel`, `invoices` (iCount retry queue) |
| `workers/geo-gate/` | Cloudflare Worker: Israel-only gate in front of family creation (HTTP 451 elsewhere) |
| `content/` | Lesson catalog, JSON schema, bilingual lesson sources and the generated Hebrew and English lesson files (15 lessons) |
| `evals/` | Tutor evaluation set v1 (107 cases) and the online release-gate runner |
| `apps/web/` | React PWA: sign-in, setup, parent dashboard (Realtime, screen time, data export and deletion), child picker with picture PIN, lesson map, lesson player, tutor chat |

## How the safety rules are enforced

- **Families are isolated by the database**, not the app: RLS on every table,
  `SELECT`-only grants, all writes through `SECURITY DEFINER` RPCs that check the caller
  and set `family_id` themselves. The PIN hash is hidden by a column-level grant.
- **Child mode runs on the parent's session**, so sensitive RPCs (add a child, change
  settings or a PIN) require a TOTP verification from the last 10 minutes
  (`app.recent_step_up`), read from the JWT's `amr` claim. Leaving child mode asks for
  the code too.
- **Consent comes first:** no child profile can exist before core consent; the tutor
  needs its own consent.
- **The tutor never sees personal details:** a deterministic check blocks phone numbers,
  Israeli ID numbers, cards, emails, addresses, schools, full names and usernames before
  any model call, and teaches the child why. Distress, unsafe and manipulation messages
  get fixed human-written replies and a parent alert. Answers stream sentence by sentence
  through a filter, then a classifier reviews the whole answer and fails closed.
- **The daily time limit is the database's call:** the app sends a heartbeat each minute
  while child mode is visible; `record_activity` credits at most the real time since the
  last beat, so a tampered client cannot add time faster than the clock. Starting a
  lesson and every tutor message are refused once the limit is reached (Israel time).
- **Parents control the data:** export returns everything the app holds about the family
  as one JSON file; deleting a child or the whole family needs a fresh TOTP code, and
  family deletion is owner-only and refused while a paid subscription is still renewing.
  Deletion removes the parents' sign-in accounts too and leaves one audit row with no
  family link.
- **Payments are verified, never trusted:** Grow's notifications carry no signature, so
  the webhook looks every transaction up with Grow (`getTransactionInfo`) and records
  only what Grow confirms: paid, the amount, the standing order. The server sets every
  price; a payment for the wrong amount is recorded but does not grant the plan.
  Replays are harmless (one ledger row per transaction). Card details only ever go to
  Grow's hosted page.
- **Plans lapse by date, not by a job:** a renewing plan stays Family for 7 days past
  its period end while a late renewal comes in; a canceled plan stays until its period
  end. When a plan lapses, profiles beyond the free limit are paused, not deleted.
  Cancelling stops Grow's standing order first; if Grow can't be reached, nothing is
  marked canceled.
- **Israel-only:** `families.country` is pinned to `IL`, and family creation is only
  reachable through the Worker, which signs the visitor's country, a timestamp and the
  caller's token with HMAC.

## Tests

```bash
npm install
npm run validate:content   # schema, catalog, Hebrew/English parity
npm test                   # 222 unit tests incl. the offline eval gates, lesson drift check, billing flows
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db   # 48 RLS/RPC/billing tests
npm run typecheck          # shared code, Worker, web app
npm run check:functions    # Edge Functions under Deno
ANTHROPIC_API_KEY=... npm run evals:online   # classifier release gates (needs the API)
```

The database tests create a throwaway database on any Postgres 15+ server, load a small
stand-in for Supabase's `auth` schema (`supabase/tests/supabase-stub.sql`), apply every
migration, and drop it afterwards. CI runs all of this on each push
(`.github/workflows/ci.yml`); the online evals run on demand and on prompt changes.

## Writing lessons

Each lesson is written once in `content/source/*.ts`, Hebrew and English side by side,
so ids, bins and answers are shared and cannot drift. Titles, order, plan and age band
live in `content/catalog.json`.

```bash
npm run build:lessons      # writes content/lessons/<lang>/<id>.json
npm run validate:content
```

Commit the generated JSON; the tests fail if it differs from the source. Hebrew uses
plural forms to avoid gendered second person, and the geresh (׳), not an apostrophe.

## Local development

```bash
npx supabase start                         # local stack; applies migrations and seed.sql
cp supabase/functions/.env.example supabase/functions/.env   # add ANTHROPIC_API_KEY, GATE_SECRET
npx supabase functions serve --env-file supabase/functions/.env
cd workers/geo-gate && npx wrangler dev --env dev   # set GATE_SECRET in .dev.vars
cp apps/web/.env.example apps/web/.env     # local URL and anon key from `supabase status`
npm run dev                                # http://localhost:5173, /api proxied to the Worker
```

## Deploying for free

`.github/workflows/deploy.yml` deploys on free tiers after CI passes on `main`, or by
hand (Actions → Deploy → Run workflow):

- **Supabase (free plan):** database, sign-in and the `create-family` and
  `delete-family` functions; `tutor-chat` only once an Anthropic key is set.
- **Cloudflare Pages (free):** the app, and the Israel-only gate as a Pages Function on
  the same site (`apps/web/functions/api/create-family.ts`), so no domain is needed.
- **Launch switches** (`public.app_settings`), applied on every run: the Family plan
  is free for every family (`FREE_FAMILY_PLAN`, default `on`) and SI is on only when
  `ANTHROPIC_API_KEY` is set (`TUTOR`, default `on`). Billing functions are not
  deployed and nothing is on sale.

One-time setup:

1. **Supabase:** create a project on the free plan in Frankfurt (eu-central-1) and keep
   its database password. Create a personal access token (Account → Access Tokens).
2. **Cloudflare:** note your account ID; create an API token with the account
   permission *Cloudflare Pages: Edit*.
3. **Google sign-in** (recommended): in Google Cloud, create an OAuth client of type
   *Web application* with the authorized redirect URI
   `https://<project-ref>.supabase.co/auth/v1/callback`. Without Google or your own
   SMTP, only your Supabase team's addresses can sign in: Supabase's built-in email
   reaches team members only, 2 messages an hour.
4. **GitHub** → Settings → Secrets and variables → Actions:

   | Kind | Name | Value |
   | --- | --- | --- |
   | Secret | `SUPABASE_ACCESS_TOKEN` | the personal access token |
   | Secret | `SUPABASE_DB_PASSWORD` | the database password |
   | Secret | `CLOUDFLARE_API_TOKEN` | the Pages token |
   | Variable | `SUPABASE_PROJECT_REF` | the 20-letter project ref |
   | Variable | `CLOUDFLARE_ACCOUNT_ID` | the account ID |
   | Secret (optional) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | the OAuth client |
   | Secret (optional) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SENDER_EMAIL`, `SMTP_SENDER_NAME` | email sign-in for everyone |
   | Secret (later) | `ANTHROPIC_API_KEY` | turns SI on |

5. Run the workflow. Its summary shows the app's address
   (`https://<project>.pages.dev`) and a smoke test: the app loads, deep links work,
   the gate refuses a request without a token, and the security headers are present.

Good to know: a free Supabase project pauses after a stretch without use (restore it
from the dashboard), and Pages Functions count toward Cloudflare's free Workers
requests. Cloudflare rate-limit rules need a domain on Cloudflare; until then the gate
relies on create-family needing a signed-in parent and being idempotent.

## Deploying by hand

1. Create a Supabase project in an EU region. Enable TOTP MFA, leaked-password
   protection, and Google sign-in; keep anonymous sign-ins off. Keep the default `amr`
   claim format (no custom access-token hook that rewrites it).
2. `npx supabase link`, then `npx supabase db push` and run `supabase/seed.sql`.
3. Set function secrets from `supabase/functions/.env.example`, then
   `npx supabase functions deploy tutor-chat create-family delete-family billing-checkout billing-webhook billing-cancel billing-invoices`.
   `billing-webhook` deploys with `verify_jwt = false` (Grow cannot send a JWT; see
   `supabase/config.toml`).
4. Billing: ask Grow for the recurring page code and register
   `https://<project>.supabase.co/functions/v1/billing-webhook?k=<GROW_WEBHOOK_SECRET>`
   as the webhook for monthly charges (sandbox and production are configured
   separately). In Supabase Cron, call `billing-invoices` every 15 minutes with the
   service-role key as the bearer token. Set the confirmed price in
   `plan_limits.monthly_price_agorot` (it is ₪29.90 as a placeholder).
5. Deploy the Worker with the same `GATE_SECRET` and route it on the app's domain at
   `/api/create-family`; add a Cloudflare rate-limit rule on that path.
6. Build `apps/web` and deploy to Cloudflare Pages with security headers (CSP without
   inline script, HSTS, `frame-ancestors 'none'`, `Permissions-Policy` denying camera,
   microphone and geolocation).
7. Without `pg_cron`, schedule `select app.purge_expired()` daily some other way.

## Before the private pilot

- [ ] Run `npm run evals:online` and pass every gate; grow the set toward 300 cases.
- [ ] Confirm the guide's name (`GUIDE_NAME` in `supabase/functions/_shared/prompts.ts`).
- [ ] Verify the helplines in the support reply (105 and 1201) are current.
- [ ] Add Anthropic's child-safety system prompt if one is published (`ANTHROPIC_CHILD_SAFETY_PROMPT`).
- [ ] Privacy notice and the public compliance statement Anthropic's minors guidelines ask for; lawyer review.
- [ ] Review all 15 lessons with a teacher and a native Hebrew editor; try them with a few children.
- [ ] Confirm the Family plan price (placeholder ₪29.90 a month, VAT included).
- [ ] Grow sandbox, end to end: the `createPaymentProcess` fields for a recurring page
      code, the `getTransactionInfo` response shape, what `approveTransaction` expects,
      and the monthly webhook's format. All of it is isolated in
      `supabase/functions/_shared/grow.ts`, whose parsers fail closed. Then Grow's
      integration review for production.
- [ ] iCount: check `supabase/functions/_shared/icount.ts` against iCount's API
      reference (it could not be read while this was built) and issue one real document
      in a test company. Or set `INVOICING=gateway` and let Grow issue the invoices.
- [ ] Accountant: invoice-receipts to "Private customer" without a name, VAT-inclusive
      pricing, and how refunds are documented.
- [ ] Lawyer: cancellation terms for a continuing transaction under the Consumer
      Protection Law (in-app cancellation, timing, confirmation) and the refund policy.
- [ ] Watch the function logs for `billing ALERT` (duplicate payments, amount
      mismatches, charges after cancellation, unknown payments); each needs a person.

## Data the app keeps

Per child: nickname, character, age band, language, settings, a hashed picture PIN,
lesson progress, badges and seconds of use per day (deleted after 90 days). Tutor transcripts are redacted before storage and deleted
after 30 days; safety events hold labels only, never message text, and are deleted after
90 days. No child email, birthdate, real name, photo, voice or location, ever.

Per family, for billing: the plan and its dates, and one row per payment (amount, Grow's
transaction and approval numbers, invoice status). The identifiers Grow needs to stop
a standing order are hidden from the app and left out of the export. Card details and
the payer's name never reach this app; they stay with Grow, and tax documents stay in
iCount.
