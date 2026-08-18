# Split My Bills — Project State

> Living document. Update the **Current Status** and **Session Log** sections as we work.
> Keep this file in the repo root and commit it after every session.

---

## 1. Project Summary

An EveryDollar-style budgeting app called **Split My Bills** (formerly "Bill Splitter").
Core differentiator: AI-assisted coaching that analyzes a user's income schedule vs. bill due
dates and suggests whether splitting a bill into two smaller payments (aligned to paydays)
would ease cashflow strain.

---

## 2. Guardrails / Constraints (do not violate)

- **Net-zero cost.** Every service choice must have a genuinely free tier at our scale.
  Flag anything that risks incurring cost before implementing it.
- **No billing surprises, ever.** Neither us (the operators) nor any end user should be able
  to trigger a charge. Users never hold an API key or call any AI provider directly — all AI
  calls route through our server, gated by a Usage Governor (see Phase 3.5).
- **Version control via GitHub.** All work happens in feature branches, merged via PR into `main`.
- **Local server must behave like it's live** — reachable from a real phone (same WiFi or
  Expo tunnel), not just `localhost`.
- **Built in VS Code.**
- **Distribution: PWA, not native app stores.** No Apple/Google developer account, no store
  fees, no App Store/Play Store review process. "Mobile app" = installable web app.
- **Monorepo** — one repo, shared logic between web and the PWA (same Next.js app).
- **Branch workflow**: `main` only receives merges from `dev` after work is tested and
  confirmed. All day-to-day work happens on `dev` (or feature branches off `dev`, once
  real feature work starts). Never commit directly to `main`.
- **How users get bill data in: manual entry + user-initiated statement upload only.**
  No live bank-account connection (Plaid or similar) in the free/core product — researched
  2026-07-17 and confirmed Plaid has no lasting free tier for production use (real costs,
  ~$9K/year median per Vendr data, once past a short trial), which breaks the no-billing-
  surprises rule. Real bank-sync is a possible *future paid tier* decision, not part of the
  net-zero core app. See Phase 4 and Future/Backlog for the chosen alternative (AI-parsed
  statement import).

---

## 3. Tech Stack (decided)

| Layer | Choice | Notes |
|---|---|---|
| Monorepo tool | **Turborepo** (confirmed over Nx — industry-standard default at our scale) | |
| Backend | Next.js API routes (Node + TypeScript) | No separate Express/Fastify server — Next.js's own API routes handle this |
| Web + Mobile frontend | **Next.js, built as a PWA** | One codebase. Installable on phones via manifest + service worker (Phase 5, not yet built). No app store, no store fees, no RN/Expo needed. |
| UI components | **shadcn/ui** (Radix UI + Maia preset) | Free, copy-paste, no lock-in. Indigo/violet accent color, not generic finance green/blue |
| Database | Postgres via Neon | Free tier, scales to zero when idle. **Live and connected.** |
| ORM | **Prisma 7** | Uses driver adapters (`@prisma/adapter-pg`) — a Prisma 7 breaking change from older versions. Schema deployed, migrations working |
| Validation | Zod | Not yet wired into API routes — planned, not yet done |
| Auth | **Self-rolled**: bcrypt password hashing + `jose` JWT sessions, httpOnly cookies | **Built and fully verified working** |
| Route protection | **`proxy.ts`** (Next.js 16's replacement for `middleware.ts`) | Must live in `src/proxy.ts` given our `--src-dir` setup |
| AI Provider (dev) | **Ollama** (local, self-hosted, unlimited, zero cost) | Not yet integrated — Phase 3 |
| AI Provider (production) | **Gemini Flash-Lite free tier** | Capped (~1,500 req/day, 15 RPM). Not yet integrated — Phase 3 |
| Usage Governor | Custom — tracks calls in our DB, enforces a ceiling below Google's real cap, caches AI responses, falls back to rules-engine-only output when near/at the limit | Designed, not yet built — Phase 3.5 |
| CI | GitHub Actions | Free minutes. Not yet set up |

**Decided:** Ollama for dev, Gemini Flash-Lite (governed) for production. React Native/Expo dropped in favor of PWA — simpler, still net-zero, no store accounts needed.

---

## 4. Data Model (draft — will evolve)

```
User
 └─ id, name, email, pay_schedule, payday_anchor_date

IncomeSource
 └─ id, user_id, name, amount, frequency, next_pay_date

Bill
 └─ id, user_id, name, amount, due_date, category,
    is_recurring, splittable, min_split_amount

Payment
 └─ id, bill_id, amount, paid_date, status, is_split_payment, split_group_id

SplitSuggestion (AI-generated, cached)
 └─ id, user_id, bill_id, suggested_split, reasoning,
    suggested_dates[], confidence, created_at
```

---

## 5. AI Design Principle

The rules engine computes numbers (cashflow strain, split feasibility).
The LLM only explains/prioritizes those numbers in plain English — it does not do the math itself.

---

## 6. Build Phases

- [x] **Phase 0 — Setup**: GitHub repo, monorepo scaffold, VS Code config, `.env.example` — **complete**
- [x] **Phase 1 — Core MVP**: auth (✅ complete, verified), manual income/bill CRUD
  (✅ **fully complete** — create/read/update/delete all working end to end, inline-edit UI
  built), dashboard showing income vs. bills vs. remaining (✅ complete) — **Phase 1 complete**
- [x] **Phase 2 — Split Engine**: pay-schedule-aware cashflow calculator, split suggestion logic
  — **core logic complete**: pay periods, 3-paycheck-month detection, shortfall calculation,
  and split suggestions all built, wired end to end, and verified with no errors. Not yet
  manually tested against a real/deliberate shortfall scenario, but logic confirmed sound.
  **Explicit scope addition (2026-07-19, from real user experience):** biweekly/weekly pay
  schedules produce a genuine "3-paycheck month" roughly twice a year (26 biweekly paychecks
  don't divide evenly into 12 months) — a common real situation most budgeting apps ignore.
  The engine must detect these months explicitly and treat the "extra" paycheck as a planning
  opportunity (build buffer, prepay a splittable bill, or prepare for the following leaner
  2-paycheck month) rather than letting it blend into normal spending unnoticed. This is a
  strong showcase for both the split-suggestion feature and the AI coaching layer.
  **Status: FULLY COMPLETE (2026-07-20)** — detection, shortfall suggestions, AND
  3-paycheck-month opportunity suggestions (`generateOpportunitySuggestions()`) all built,
  wired, and compiling with no errors. **2026-07-19: manually tested end to end with a real
  shortfall scenario** (added a bill large enough to push a period into deficit, marked it
  splittable) — Pay Periods correctly flipped to "Short $X.XX," and the Split Suggestions
  card correctly appeared showing the bill with accurate reasoning.
- [ ] **Phase 3 — AI Coaching Layer**: `AIProvider` interface (Ollama default, Gemini fallback), plain-English suggestions endpoint
- [ ] **Phase 3.5 — Usage Governor**: `AIUsageLog` table, daily ceiling check before every AI call, response caching keyed on bill/income snapshot, graceful fallback to rules-engine-only output, admin usage-visibility endpoint
- [ ] **Phase 4 — Statement Import & Trend Analysis**: user-initiated CSV/PDF bank statement
  upload (their choice, nothing auto-pulled), AI-parsed into structured bills/transactions
  (reuses the same AI layer as Phase 3), trend detection (recurring bills, average amounts,
  spending patterns) and cashflow projections built from real historical data. Zero new
  vendor cost — no bank API, just file parsing.
- [ ] **Phase 5 — PWA Polish**: manifest.json, service worker, installability, offline fallback, mobile-responsive UI pass, "update available" refresh prompt flow, iOS install-guidance screen (see backlog note below)

---

## Future / Backlog (not yet phased — tracked so we don't lose them)

- **Security hardening**: password hashing, secure sessions, per-user data isolation
  (every query scoped to logged-in user), input validation via Zod on all entry points,
  automated dependency scanning (GitHub Actions + Dependabot, free).
- **Push notifications**: Web Push API (free, standard). Note: iOS Safari requires the PWA
  be "Added to Home Screen" before push works — plan an install prompt/nudge if we want
  reliable iPhone delivery. Android/Chrome has no such restriction.
- **Rocket Money-inspired ideas** (added 2026-07-19): spending trend line/bar charts over
  time (Phase 4, once statement import gives us historical data — `recharts` available);
  visually group "Recurring" vs "One-time" bills on the dashboard instead of one flat list
  (`isRecurring` field already exists on `Bill`, just needs UI work); trend indicator
  (up/down arrow vs. last period) on the "Remaining" summary card instead of a flat snapshot.
- **"Remaining" definition confirmed** (2026-07-19): stays a budget-snapshot number
  (Income − ALL bills, paid or not), not a live cash balance — user confirmed this is correct
  since there's no bank connection to track true real-time balance against anyway.
- **Upcoming Pay Periods — visual polish for later** (2026-07-19): once more color/theming
  work happens, the expandable period header and its dropdown bill-list body should use
  visually distinct background colors/shades (header vs. expanded content), not the same
  surface — pure eye-candy, low priority, revisit during a dedicated visual-polish pass.
- **"Remaining" card color gradient + warning icon** (added 2026-07-19, user idea): instead
  of the current binary red/primary color logic, grade the "Remaining" card's background
  through green → yellow → red based on how much buffer remains (not just negative-or-not),
  with a warning icon appearing once it crosses into the red zone. Ties directly into the
  already-planned push notifications (Phase 5) — a new trigger condition ("remaining balance
  entered the red zone") rather than a new notification system. Not yet built — logged as
  visual-polish work to tackle once Phase 2's core split-suggestion logic is complete, so the
  two pieces of work don't get half-finished in parallel.
- **Email payment-confirmation scanning** (added 2026-07-19, user idea, researched): opt-in
  feature to search a user's email (via Gmail API OAuth, read-only scope) for payment
  confirmation emails ("thank you for your payment," receipts, etc.) to help auto-detect
  bills paid without requiring 100% manual entry. Researched cost: **fits net-zero well**,
  unlike Plaid — Gmail API is free for standard use (search/read against the user's own
  inbox), not a paid third-party aggregation service. One honest caveat: Google announced
  usage-based billing for quota overages is coming later in 2026 with 90+ days notice before
  activating, but our use case (periodic targeted search, not high-volume) would stay
  comfortably within free quota. Design principles: must be an explicit, separate opt-in
  toggle (never assumed/default-on), request only Gmail's read-only scope (never send/modify
  access), search for specific patterns rather than ingesting full inbox contents, and pair
  naturally with the Phase 3 AI layer for extracting amount/date/biller from matched emails
  (same "AI-parsed structured extraction" pattern already planned for statement uploads).
  Not yet built — good candidate for a Phase 4/5-adjacent future phase.

- **2026-07-19 (cont'd, late)**: User identified a real, meaningful flaw: the dashboard's
  "Total Income" and "Remaining" cards were disconnected from the accurate, timing-aware
  Pay Periods engine already built — "Total Income" summed raw per-paycheck amounts with no
  regard for pay frequency (a biweekly $1,000 paycheck showed as "$1,000/month" instead of
  the true ~$2,166/month equivalent), and "Remaining" was a flat `Income − Bills` guess that
  ignored actual due dates and paycheck timing entirely, contradicting the correct
  period-by-period risk data already shown lower on the page. Fixed by adding
  `normalizeToMonthly()` to `packages/shared` (converts any pay frequency to a true monthly
  equivalent) and changing "Remaining" to source from the nearest actual pay period
  (`currentPeriod.income - currentPeriod.totalBillAmount`) instead of a flat calculation —
  so it now uses the same engine as the Pay Periods list and the two will never contradict
  each other. Hit a variable-ordering bug (`periodRemaining` referenced `totalBills` before
  its declaration — a genuine mistake in the given code, not a user error) causing a
  "Cannot access before initialization" runtime error; fixed by reordering the declarations.
  **Confirmed working and looking meaningfully better** — this was a real correctness fix,
  not just a cosmetic one.

- **2026-07-19 (cont'd, late)**: Built `generateSplitSuggestions()` in `packages/shared` —
  the actual split-suggestion logic that completes Phase 2's core purpose. For each risky
  pay period, checks every splittable bill in it: calculates a straight half-now/half-next-
  payday split, whether that split would fully resolve the period's shortfall or just reduce
  it, and generates a plain-text reasoning string (structured output that Phase 3's AI layer
  will later turn into fuller coaching, per the original rules-engine-computes /
  AI-explains design principle). Wired into `/api/split-suggestions` (now returns both
  `periods` and `suggestions`) and a new dashboard card, visually distinct via a soft
  primary-tinted background — first real functional use of the indigo accent color, not just
  decorative. Confirmed no errors; card correctly shows nothing when there's no shortfall/
  no splittable bills in a risky period yet (expected behavior with current test data, not a
  bug) — full end-to-end trigger not yet manually tested with a real shortfall scenario, but
  logic and wiring confirmed sound.

  **Phase 2's core logic is now essentially complete**: pay period generation, 3-paycheck-
  month detection, cashflow risk/shortfall calculation, and split suggestions all built and
  wired end to end. Remaining Phase 2 work is mostly testing edge cases (e.g., confirming a
  real shortfall scenario end to end) rather than new logic.

- **2026-07-20**: Closed the last known Phase 2 gap — built `generateOpportunitySuggestions()`
  in `packages/shared`, which detects 3-paycheck months that are NOT already a shortfall and
  have genuine surplus, then suggests building a buffer or prepaying a splittable bill ahead
  of the next (leaner, regular 2-paycheck) period. Wired into `/api/split-suggestions`
  (now returns `periods`, `suggestions`, and `opportunities`) and a new "Extra Paycheck
  Opportunities" dashboard card, styled consistently with the existing Split Suggestions
  card. Compiled with no errors. **Phase 2 is now fully complete** — every piece of scope
  defined for it (pay periods, 3-paycheck-month detection and opportunity suggestions,
  shortfall detection and split suggestions) is built and wired end to end.
- **Overdue bill reconciliation prompt** (added 2026-07-19, user idea, low priority): once a
  bill's due date passes without it being marked paid, prompt the user ("Was this paid?")
  rather than letting it silently go unconfirmed. If yes, let them pick the actual paid date
  (no schema change needed — `Payment.paidDate` already supports this, current mark-as-paid
  just always defaults to "today"). If the recorded paid date is after the due date, show a
  small "(paid late)" label next to the bill name. Purely additive to the existing mark-as-paid
  feature — does not touch the "Remaining" calculation or require reworking anything shipped.

**Design Direction** (added 2026-07-17): References are BillOut (calm, organized, card-based
layout, sparing color-as-accent) + 1Bill (bolder, more saturated color confidence, friendlier
bigger type) + EveryDollar (overall clarity/simplicity benchmark). Direction: BillOut's
organized bones (cards not tables, clear info hierarchy, generous whitespace, rounded corners)
combined with 1Bill's bolder color confidence — a strong primary color used deliberately on
key surfaces (hero elements, primary actions, the AI split-suggestion callout) rather than the
muted default finance-app blue/green everywhere. Practical implications already decided: cards
not dense tables for bills/income; clear color-coded status language (paid/upcoming/at-risk)
tying directly into the cashflow-risk feature; Tailwind (installed) + shadcn/ui (free,
copy-paste, no lock-in) for standard components, fully custom styling for the dashboard and
split-suggestion cards. Not yet decided: exact hex palette, font pairing, dark mode — to be
finalized when Phase 1 UI work begins.
- **iOS browser behavior (researched 2026-07-17)**: all iOS browsers (Safari, Chrome, Firefox,
  Edge) use Apple's WebKit engine under the hood — no browser-specific crash/render risk on
  iOS. The app always works as a normal website regardless of browser. What's conditional:
  (1) home-screen install works from Safari, Chrome, Edge, Firefox, Orion on iOS 16.4+, but
  NOT reliably from in-app browsers (Mail, Instagram, etc. — user must open in a real browser
  first); (2) push notifications only work for a PWA actually installed to the home screen,
  on any iOS browser. Plan: build a lightweight "install this app" guidance screen for iOS
  users as part of Phase 5, since iOS has no automatic install banner like Android/desktop do.
- **Bank sync (Plaid) — deliberately NOT in the free core app**: researched 2026-07-17, real
  ongoing cost (subscription/per-call fees, no lasting free production tier) conflicts with
  the net-zero hardline. If ever pursued, it would be a clearly separate future paid tier that
  funds its own Plaid costs, not something bundled into the free app. Chosen free alternative:
  user-initiated statement upload (CSV/PDF), parsed by our AI layer into structured bills/
  transactions, with trend detection and cashflow projections built from that real historical
  data. User stays in control of what's shared — nothing pulled automatically.
- **Multi-user readiness confirmed**: architecture already supports sharing the app with
  real users once Auth (Phase 1) is built — `User` table scoping, PWA URL-based distribution
  (no app store needed), and the Usage Governor were all designed with multi-user sharing
  in mind from the start. Free tiers (Neon/Vercel/Gemini) comfortably cover small-to-moderate
  usage; degrades gracefully (AI pauses, app keeps working) rather than risking surprise cost
  if usage ever grew large.

---

## 7. Current Status

**Phase:** Phase 1 complete. **Phase 2 core logic complete AND tested end to end** — pay
periods, 3-paycheck-month detection, shortfall calculation, and split suggestions all built,
wired, and manually verified working against a real shortfall scenario. One known remaining
gap: 3-paycheck-month "opportunity" suggestions (prepay/buffer) not yet built — current
suggestions only react to shortfalls, not surplus months. That's the natural next piece, or
Phase 3 (AI coaching layer) is also a reasonable next direction.
**Last updated:** 2026-07-19 (late)

---

## 8. Decision Log

| Date | Decision | Reasoning |
|---|---|---|
| 2026-07-14 | Web + mobile, shared backend | User wants both platforms from one codebase |
| 2026-07-14 | Manual entry first, Plaid later | Reduces early complexity/cost risk |
| 2026-07-14 | Rules engine + LLM explains (not LLM does math) | Reliability + cost control |
| 2026-07-14 | Net-zero cost constraint set | User requirement |
| 2026-07-16 | Ollama for local dev, Gemini Flash-Lite (governed) for production | Ollama = truly unlimited/free but not viable to self-host live; Gemini free tier is capped but genuinely free in prod |
| 2026-07-16 | Built a Usage Governor as its own phase (3.5) | User hardline: zero billing surprises, for us or for users |
| 2026-07-16 | Dropped React Native/Expo, going PWA instead | User confirmed distribution is PWA, not app-store native. One Next.js codebase covers web + "mobile app," no store fees |

---

## 9. Session Log

> Add a short entry each session: what we discussed/built, what's left open.

- **2026-07-14**: Defined product concept, tech stack, guardrails (GitHub, live-feeling local
  server, net-zero cost, VS Code). Created this state file. No code written yet.
- **2026-07-16**: Resolved AI provider decision (Ollama dev / Gemini prod), designed the Usage
  Governor concept to guarantee zero billing surprises for us and for users, and confirmed
  distribution is PWA — dropping React Native/Expo from the stack. Updated stack table, phases,
  and guardrails accordingly. Confirmed Turborepo over Nx (industry-standard default for
  solo/small JS-TS projects our size; Nx's extra power targets large multi-language orgs we're
  not). Still no code written yet — architecture is fully decided, next session starts scaffolding.
- **2026-07-17**: Renamed project from "Bill Splitter" to "Split My Bills" before creating the
  GitHub repo. Repo name decided: `split-my-bills`. Repo created via `gh` CLI, cloned locally,
  opened in VS Code. `PROJECT_STATE.md` committed and pushed as the first commit on `main`.
  Created `dev` branch off `main` and set it as the working branch going forward — `main` will
  only receive tested/confirmed merges from `dev`. Scaffolded the monorepo on `dev`: root
  `package.json` with npm workspaces, Turborepo installed + `turbo.json` configured, Next.js
  (TypeScript, Tailwind, App Router, `src/` dir) scaffolded into `apps/web`, root `.gitignore`
  and `.env.example` created. Hit and fixed a Turborepo error (missing `packageManager` field
  in root `package.json` — added `"packageManager": "npm@<version>"`). First code commit pushed
  to `dev` (30 files). **Verified end-to-end: `npm run dev` from root runs via Turborepo →
  Next.js serves on `localhost:3000`, and is also reachable from a real phone over local WiFi
  via the machine's local IP.** Foundation confirmed working before any app logic is written.

*(at this point, next step chosen was: `packages/shared` — see below)*

- **2026-07-17 (cont'd)**: Built `packages/shared` — its own `package.json`
  (`@split-my-bills/shared`) and a first real (small) piece of domain logic in `src/index.ts`
  (`PaySchedule` type, `Bill` interface, `isCashflowRisk()` function). Wired it into `apps/web`
  as a workspace dependency and updated `page.tsx` to actually import and render its output as
  a live end-to-end test. Hit a real bug: `src/index.ts` was created at the repo root instead
  of inside `packages/shared/` (a `cd` mix-up), causing a "Module not found" error even though
  the workspace symlink and both `package.json` files were correct. Diagnosed it by checking
  each link in the chain (symlink → package.json → actual file), found the misplaced file via
  `find . -name index.ts`, moved it to the correct path, and confirmed the fix — the shared
  package's logic now renders correctly in the browser, both locally and on mobile. Also
  cleaned up `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` (AI-tool boilerplate from
  `create-next-app`, redundant with `PROJECT_STATE.md`). Committed and pushed to `dev`.

- **2026-07-17 (cont'd, evening)**: Wrote the real Prisma schema (`User`, `IncomeSource`, `Bill`,
  `Payment`, `SplitSuggestion`, plus `PaySchedule`/`PaymentStatus` enums) matching our original
  data model design, using `Decimal` for money fields (avoids float rounding errors) and
  `onDelete: Cascade` for referential integrity. Hit a real Prisma 7 breaking change: the
  `datasource.url` field is no longer allowed directly in `schema.prisma` — connection URLs
  now live only in `prisma.config.ts` for the CLI, and the runtime `PrismaClient` requires an
  explicit driver adapter package (`@prisma/adapter-pg` + `pg`). Fixed by removing `url` from
  the schema, installing the adapter, and building `src/lib/prisma.ts` as a single shared
  client instance (with a dev-mode global-reuse pattern to avoid connection-pool exhaustion on
  hot reload). First migration (`init`) ran successfully — live tables now exist in Neon.

  Hit a second real bug: the Prisma Client wasn't actually generated at the path our schema's
  `output` pointed to, even though `migrate dev` is supposed to run `generate` automatically —
  it silently didn't. Diagnosed via `find`/`ls` (confirmed no `generated/` folder existed
  anywhere), fixed by running `npx prisma generate` explicitly, which succeeded and created
  the client at the expected path. **Lesson learned, now a standing habit: always run
  `npx prisma generate` explicitly after any schema change, don't rely on `migrate dev` to
  do it silently.**

  Verified end-to-end with a real query: `page.tsx` now calls `prisma.user.count()` and
  correctly renders "Users in database: 0" — confirmed live round-trip from Next.js through
  the driver adapter to the real Neon Postgres database.

- **2026-07-17 (cont'd)**: Built the full auth backend for Phase 1: `src/lib/auth.ts`
  (bcrypt password hashing, JWT session tokens via `jose`, 7-day expiry), signup/login/logout
  API routes (`/api/auth/signup`, `/login`, `/logout`) using httpOnly secure cookies, and
  `middleware.ts` enforcing route protection (`/dashboard` requires a session; `/login` and
  `/signup` redirect away if already logged in). Generic "Invalid credentials" message used
  for both wrong-email and wrong-password cases (deliberate security practice — doesn't leak
  which emails are registered). Verified: dev server starts with no errors, all imports/syntax
  clean. **Not yet built: the actual signup/login UI pages** — backend is ready, no forms exist
  yet to call these routes from.

- **2026-07-18**: Set up shadcn/ui — chose Radix UI as the component library (most mature/
  battle-tested, best accessibility defaults) and the **Maia** preset (soft, rounded, generous
  spacing — matches our BillOut-inspired calm/consumer-facing design direction, versus Nova/
  Mira which are dashboard-dense or Lyra which is sharp/technical). Added `button`, `input`,
  `label`, `card` components. Set the accent color to an indigo/violet (`oklch(0.585 0.233
  277.117)` light / `oklch(0.673 0.182 276.935)` dark) in `globals.css` — deliberately not the
  generic finance-app green/blue, calmer than red/orange given the app deals with bill-stress,
  applied to `--primary`, `--ring`, `--sidebar-primary`. Hit a confusing bug: `src/lib/utils.ts`
  (shadcn's `cn()` helper) appeared correctly in place with correct content and dependencies
  installed, yet Next.js kept reporting "Module not found." Root cause was **stale Turbopack
  cache** from an earlier moment when the file genuinely was missing — not a real file/path
  problem this time. Fixed by deleting `apps/web/.next` and hard-refreshing the browser.
  **Lesson: if a file/path checks out completely correct but the error persists, clear
  `.next` before assuming the file itself is broken.**

*(at this point, next step chosen was: build signup/login UI — see below)*

- **2026-07-18 (cont'd)**: Built signup, login, and a minimal dashboard page using shadcn
  components. Signup worked and redirected correctly, but visiting `/login` while already
  logged in kept showing the login form instead of redirecting to `/dashboard` — meaning
  route protection wasn't working. Debugged via `curl` first (confirmed the signup route
  correctly sets a real, valid session cookie — ruled out the backend), then via debug
  `console.log` statements in the routing file (confirmed the browser dev-server terminal,
  not browser DevTools, is where server-side logs print — new concept, noted for future
  reference). Zero debug output appeared even after correct code — meaning the file wasn't
  executing at all. Researched and found the real cause: **Next.js 16 deprecated
  `middleware.ts` in favor of `proxy.ts`** (renamed export too: `proxy` not `middleware`).
  Renamed the file and export, but still got zero execution — hit a **second** issue: since
  this project uses `--src-dir`, `proxy.ts` must live at `apps/web/src/proxy.ts` (same level
  as `app/`), not `apps/web/proxy.ts` — the exact same "wrong folder level relative to `src/`"
  bug pattern as three earlier bugs tonight (`index.ts`, `utils.ts`, and the original
  `middleware.ts` placement). Fixed by moving it into `src/`. **Confirmed working live** —
  the dev server's file watcher picked up the corrected location instantly, debug logs
  appeared, and the browser correctly redirected an already-logged-in user away from `/login`
  to `/dashboard`. **Full auth flow now verified end to end: signup → session cookie set →
  dashboard access → route protection correctly redirects both directions.**

  **Standing lesson, now a checklist item for any new top-level config file** (proxy.ts,
  middleware.ts, or similar future files): with `--src-dir` enabled, these files belong
  inside `src/`, at the same level as `app/` — not at the `apps/web/` root.

  Added a logout button to the dashboard (the API route already existed from the earlier auth
  backend build, just needed UI wiring). Converted dashboard to a client component for the
  click handler. **Ran a full 4-step manual test, all passed**: (1) logout correctly redirects
  to `/login`, (2) attempting to visit `/dashboard` while logged out correctly bounces back to
  `/login` via `proxy.ts`, (3) logging back in with real credentials correctly lands on
  `/dashboard`. **Phase 1 auth is fully complete and verified**: signup, login, logout, and
  route protection all confirmed working end to end in both directions.

  Also hit a real bug before committing this batch: `middleware.ts` (before the rename above)
  had landed at `apps/middleware.ts` instead of the correct location — same category of `cd`
  level mix-up as other bugs this project. Caught via `git status` showing the file without
  the expected `web/` path prefix, before committing. Fixed by moving it into place and
  re-verifying `git status` showed correct paths.

- **2026-07-18 (cont'd, late)**: Discussed automated bank-account data pulling (bills,
  deposits, auto-notifications, projections). Researched Plaid pricing — confirmed it has no
  lasting free production tier (real recurring costs, ~$9K/year median), conflicting with the
  net-zero hardline. Decided against Plaid in the free core app; replaced Phase 4 with
  user-initiated CSV/PDF statement upload, parsed by our AI layer into structured data, with
  trend detection and cashflow projections built from real history. Plaid logged in backlog
  as a possible future paid-tier decision only. Also discussed and logged app design direction
  (BillOut + 1Bill + EveryDollar references) as backlog notes for Phase 1 UI work.

- **2026-07-18 (cont'd, late)**: Built full CRUD for income sources and bills. API routes:
  `GET`/`POST /api/income` and `/api/bills`, plus `PATCH`/`DELETE /api/income/[id]` and
  `/api/bills/[id]` — every route scoped to the logged-in user (via a new shared
  `getCurrentUserId()` helper in `src/lib/session.ts`) and every PATCH/DELETE double-checks
  `existing.userId !== userId` before touching data, so no user can edit/delete another
  user's records even by guessing an ID. Rebuilt the dashboard page to actually show real
  data: three summary cards (Income / Bills / Remaining, remaining turns red via
  `--destructive` when negative — first real use of the color-coded status language from our
  design direction), plus add-forms for both income and bills.

  Hit two bugs: (1) a form-reset `TypeError` from calling `.reset()` on `e.currentTarget`
  after an `await` — React can clear that reference by then; fixed by capturing
  `const form = e.currentTarget` before the `await` and using `form` throughout. (2) The
  bracket-named dynamic route folders (`[id]`) — zsh interprets `[id]` as a glob pattern, so
  the `mkdir`/`touch` commands need quotes around the path. Separately, a stray `cd` left the
  terminal inside `apps/web` when creating the income `[id]` route, causing it to nest at
  `apps/web/apps/web/src/app/api/income/[id]/route.ts` — diagnosed via `find` from the repo
  root (showed the duplicate path clearly), fixed by moving the file into place and deleting
  the stray `apps/web/apps` folder. Bills route was created correctly the second time by
  confirming `pwd` before running the command. Added delete buttons to both income and bill
  list items, wired to the new DELETE routes — tested and confirmed working.

  **Full CRUD now verified working end to end for both Income Sources and Bills**, fully
  scoped per-user. Backend PATCH/edit routes exist and work; **UI for editing amounts inline
  is not yet built** — currently the only way to fix a mistake is delete-and-re-add.

---

## 10. Next Step (pick up here next session)

**Where things stand:** Phase 0 (setup) and Phase 1 (auth + core CRUD) are both complete and
verified. The app has real signup/login/logout, protected routes, and a working dashboard
where a logged-in user can add, view, and delete their own income sources and bills, with
live totals (Income / Bills / Remaining). Everything is committed and pushed to `dev`.

- **2026-07-19**: Built inline-edit UI for income/bill amounts (click-to-edit pattern with a
  reusable `EditAmountForm` component, Save/Cancel). **Phase 1 is now fully complete** —
  full CRUD (create/read/update/delete) working end to end for both Income Sources and Bills.
  Swapped text-label Edit/Delete/Save/Cancel buttons for faded `lucide-react` icons
  (`Pencil`, `Trash2`, `Check`, `X`) using `text-muted-foreground/50` with color-on-hover —
  present but not visually loud, matching the calm design direction.

  Looked at Rocket Money for additional feature ideas. Two concrete, buildable ideas logged
  to backlog: (1) spending trend line/bar charts over time (ties into Phase 4 once historical
  data exists via statement import — `recharts` is available in this environment), (2)
  visually grouping "Recurring" vs "One-time" bills on the dashboard rather than one flat list
  (we already have `isRecurring` on the `Bill` model, just needs UI grouping). Also noted the
  general pattern of showing a trend indicator (up/down vs. last period) on the "Remaining"
  summary card, not just a snapshot number — future polish, not urgent.

  Hit a copy-paste bug while adapting the income section's icon buttons for bills: the JSX
  variable (`i` → `b`) got fixed, but two function calls were left pointing at the wrong
  handlers entirely — `setEditingIncomeId(b.id)` and `handleDeleteIncome(b.id)` instead of
  the bill-specific versions. Symptom was subtle: no error, button just did nothing (it was
  setting `editingIncomeId`, which nothing in the bills section checks). VS Code's own
  TypeScript hints had flagged this before it was addressed. Fixed by correcting both calls
  to `setEditingBillId(b.id)` and `handleDeleteBill(b.id)`. **Tested and confirmed working —
  Phase 1 is now fully, genuinely complete**: full CRUD with polished inline-edit icon UI for
  both Income Sources and Bills.

- **2026-07-19 (cont'd)**: Started Phase 2 (Split Engine). Built `getUpcomingPayDates()` in
  `packages/shared` — generates real calendar pay dates from a user's pay schedule + anchor
  date within a rolling window (default 60 days), handling all four schedule types including
  the trickier `SEMIMONTHLY` case (snapped to 1st/15th convention, most common real-world
  pattern). User explained a real, important use case: biweekly pay produces a genuine
  "3-paycheck month" about twice a year (26 paychecks don't divide evenly into 12 months) —
  a real financial-planning wrinkle at their job that most budgeting apps ignore entirely.
  Added `groupPayDatesByMonth()` to explicitly detect and flag these months
  (`isThreePaycheckMonth`), so downstream logic (cashflow calculator, split suggestions, and
  eventually AI narration) can treat the "extra" paycheck as a deliberate planning
  opportunity rather than something that just blends into normal spending. Logged as explicit
  Phase 2 scope, not just a side note.

- **2026-07-19 (cont'd)**: Built `projectBillDueDates()` and `calculatePayPeriods()` in
  `packages/shared` — the core Phase 2 cashflow engine. Projects a bill's day-of-month due
  date into real calendar dates, slots each bill into the pay period it falls in (the stretch
  between one payday and the next), and flags any period where total bills exceed that
  period's income (`isCashflowRisk`, with an exact `shortfall` dollar amount) — with
  3-paycheck-month detection baked in per period from the earlier work. Hit a real bug: the
  original `PaySchedule` type (from session one, before the real Prisma schema existed) used
  lowercase values (`"weekly"`, etc.), colliding with the new uppercase-based logic that
  matches the actual schema — TypeScript correctly flagged the mismatch. Fixed by updating
  the original type definition to uppercase, matching reality everywhere else in the app.

  Built `/api/split-suggestions` (sums all income sources against the user's pay schedule —
  noted as a simplification for users with multiple differently-scheduled income sources,
  a future refinement) and wired an "Upcoming Pay Periods" card into the dashboard showing
  each period's date, bill count/total, risk status, and 3-paycheck-month flag.

  Added a real "mark as paid" feature, using the `Payment` model that had existed in the
  schema since session one but was never wired up: `POST`/`DELETE /api/bills/[id]/pay`
  creates/removes a `Payment` record for the current month, `GET /api/bills` now includes
  `paidThisMonth` per bill, and the dashboard shows a clickable check-circle icon with
  strikethrough styling for paid bills.

  Discussed whether "Remaining" should change based on paid status — clarified and confirmed
  it stays a budget-snapshot number (Income − ALL bills, paid or not matters for the monthly
  plan either way), not a live cash balance, since there's no bank connection to track a true
  real-time balance against. Also made the "Upcoming Pay Periods" list expandable — clicking
  a period's header reveals the individual bills within it in smaller muted text; logged a
  future visual-polish idea (distinct header vs. dropdown background colors) for later.
  **All of the above tested and confirmed working.**

**Pick up here — Phase 2, the Split Engine:**

Build the real pay-schedule-aware cashflow calculator and split-suggestion logic, replacing
the placeholder `isCashflowRisk()` function in `packages/shared`. This is the heart of the
product — the feature that makes this different from a plain budgeting app. Rough shape:
for each bill, check whether its due date falls in a pay period where cumulative bills
exceed available income, and if so, whether splitting it into two payments aligned to two
paydays would smooth out that cashflow strain. This is deterministic math (rules engine),
not AI — Phase 3 (AI layer) later just explains this output in plain English.

**Standing lessons/habits to keep in mind going forward** (learned the hard way this project):
- With `--src-dir` enabled, config files like `proxy.ts` belong inside `src/`, at the same
  level as `app/` — not at the `apps/web/` root.
- Always run `npx prisma generate` explicitly after any schema change — don't rely on
  `migrate dev` to do it silently.
- If a file/path checks out completely correct but an error persists, clear `apps/web/.next`
  before assuming the file itself is broken.
- Bracket-named folders (like Next.js's `[id]` dynamic routes) need quotes in shell commands,
  or zsh will try to glob-expand them.
- Before running `mkdir`/`touch`/similar path-sensitive commands, confirm `pwd` first —
  several bugs this project came from running a command one folder level off from expected.