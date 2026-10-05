# Kids AI & Cyber Safety Academy

A Hebrew and English web app where children aged 8–12 learn AI literacy and online
safety through short game lessons and a guarded AI tutor, SI, a dragon robot. Parents own
the account; children never give an email, real name, photo or voice. Launch is
Israel-only.

This repository is **Sprint 0**: the security-critical foundations, tested, plus a
working app shell and two lessons. The product plan lives in the planning doc.

## What is here

| Path | What it is |
| --- | --- |
| `supabase/migrations/` | Schema, row-level security, validated RPCs, TOTP step-up, plan limits, 30-day transcript retention |
| `supabase/functions/_shared/` | Tutor safety pipeline: PII check, intent classifier, streamed answer with per-sentence filter, output classifier |
| `supabase/functions/tutor-chat/` | Edge Function wiring the pipeline to Supabase and Claude Haiku 4.5 (server-sent events) |
| `supabase/functions/create-family/` | Family creation; accepts only requests signed by the geo gate |
| `workers/geo-gate/` | Cloudflare Worker: Israel-only gate in front of family creation (HTTP 451 elsewhere) |
| `content/` | Lesson catalog, JSON schema, `ai-01` and `cyber-02` in Hebrew and English |
| `evals/` | Tutor evaluation set v1 (107 cases) and the online release-gate runner |
| `apps/web/` | React PWA: sign-in, setup, parent dashboard (Realtime), child picker with picture PIN, lesson map, lesson player, tutor chat |

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
- **Israel-only:** `families.country` is pinned to `IL`, and family creation is only
  reachable through the Worker, which signs the visitor's country, a timestamp and the
  caller's token with HMAC.

## Tests

```bash
npm install
npm run validate:content   # schema, catalog, Hebrew/English parity
npm test                   # 180 unit tests incl. the offline eval gates
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db   # 23 RLS/RPC tests
npm run typecheck          # shared code, Worker, web app
npm run check:functions    # Edge Functions under Deno
ANTHROPIC_API_KEY=... npm run evals:online   # classifier release gates (needs the API)
```

The database tests create a throwaway database on any Postgres 15+ server, load a small
stand-in for Supabase's `auth` schema (`supabase/tests/supabase-stub.sql`), apply every
migration, and drop it afterwards. CI runs all of this on each push
(`.github/workflows/ci.yml`); the online evals run on demand and on prompt changes.

## Local development

```bash
npx supabase start                         # local stack; applies migrations and seed.sql
cp supabase/functions/.env.example supabase/functions/.env   # add ANTHROPIC_API_KEY, GATE_SECRET
npx supabase functions serve --env-file supabase/functions/.env
cd workers/geo-gate && npx wrangler dev --env dev   # set GATE_SECRET in .dev.vars
cp apps/web/.env.example apps/web/.env     # local URL and anon key from `supabase status`
npm run dev                                # http://localhost:5173, /api proxied to the Worker
```

## Deploying

1. Create a Supabase project in an EU region. Enable TOTP MFA, leaked-password
   protection, and Google sign-in; keep anonymous sign-ins off. Keep the default `amr`
   claim format (no custom access-token hook that rewrites it).
2. `npx supabase link`, then `npx supabase db push` and run `supabase/seed.sql`.
3. Set function secrets from `supabase/functions/.env.example`, then
   `npx supabase functions deploy tutor-chat create-family`.
4. Deploy the Worker with the same `GATE_SECRET` and route it on the app's domain at
   `/api/create-family`; add a Cloudflare rate-limit rule on that path.
5. Build `apps/web` and deploy to Cloudflare Pages with security headers (CSP without
   inline script, HSTS, `frame-ancestors 'none'`, `Permissions-Policy` denying camera,
   microphone and geolocation).
6. Without `pg_cron`, schedule `select app.purge_expired()` daily some other way.

## Before the private pilot

- [ ] Run `npm run evals:online` and pass every gate; grow the set toward 300 cases.
- [ ] Confirm the guide's name (`GUIDE_NAME` in `supabase/functions/_shared/prompts.ts`).
- [ ] Verify the helplines in the support reply (105 and 1201) are current.
- [ ] Add Anthropic's child-safety system prompt if one is published (`ANTHROPIC_CHILD_SAFETY_PROMPT`).
- [ ] Privacy notice and the public compliance statement Anthropic's minors guidelines ask for; lawyer review.
- [ ] Write the remaining ten lessons in both languages.
- [ ] Family-data export and deletion, the daily time limit, and billing (Phase 1–2).

## Data the app keeps

Per child: nickname, character, age band, language, settings, a hashed picture PIN,
lesson progress and badges. Tutor transcripts are redacted before storage and deleted
after 30 days; safety events hold labels only, never message text, and are deleted after
90 days. No child email, birthdate, real name, photo, voice or location, ever.
