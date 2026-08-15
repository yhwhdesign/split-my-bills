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
| Monorepo tool | Turborepo (or Nx — TBD when we scaffold) | |
| Backend | Node + TypeScript + Express/Fastify | |
| Web + Mobile frontend | **Next.js, built as a PWA** | One codebase. Installable on phones via manifest + service worker. No app store, no store fees, no RN/Expo needed. |
| Database | Postgres via Neon | Free tier |
| ORM | Prisma | |
| Validation | Zod | |
| Auth | Self-rolled (Lucia or similar) | Avoid paid auth providers |
| AI Provider (dev) | **Ollama** (local, self-hosted, unlimited, zero cost) | Primary for local development |
| AI Provider (production) | **Gemini Flash-Lite free tier** | Capped (~1,500 req/day, 15 RPM). Ollama isn't viable in prod (self-hosting an LLM server costs money) |
| Usage Governor | Custom — tracks calls in our DB, enforces a ceiling below Google's real cap, caches AI responses, falls back to rules-engine-only output when near/at the limit | See Phase 3.5 |
| CI | GitHub Actions | Free minutes |

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

- [ ] **Phase 0 — Setup**: GitHub repo, monorepo scaffold, VS Code config, `.env.example`
- [ ] **Phase 1 — Core MVP**: auth, manual income/bill entry, dashboard (income vs. bills vs. remaining)
- [ ] **Phase 2 — Split Engine**: pay-schedule-aware cashflow calculator, split suggestion logic
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

**Phase:** Phase 1 in progress — auth backend complete and pushed. shadcn/ui installed
(Radix + Maia preset), accent color set, base components added. UI pages still not built.
**Last updated:** 2026-07-18

Nothing scaffolded yet. Stack, AI provider strategy, PWA distribution, and the Usage Governor
concept are all agreed. Next concrete step: choose monorepo tool (Turborepo vs. Nx) and
scaffold the repo skeleton.

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

**Next session starts here:** decide what to scaffold next — options are (a) `packages/shared`
package + wire it into `apps/web` as a real workspace dependency (proves cross-package imports
work before we rely on them for real logic), or (b) start on the Prisma schema + Neon DB
connection, or (c) start the PWA manifest/service worker. Recommend (a) first since later
phases depend on the shared package existing and working.

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

**Next session starts here:** build the actual signup and login page UI using shadcn
components (`card`, `input`, `label`, `button`) styled with our indigo accent, wired to the
`/api/auth/signup` and `/api/auth/login` routes built last session. Then test the full
signup → login → protected `/dashboard` redirect flow end to end.

- **2026-07-17 (cont'd, session end)**: Hit a real bug before committing: `middleware.ts`
  landed at `apps/middleware.ts` instead of `apps/web/middleware.ts` (a `cd` level mix-up,
  same category as the earlier `src/index.ts` misplacement). This one was sneaky — wrong
  location means Next.js silently does NOT run the middleware at all, no error, no crash —
  route protection would have quietly not worked. Caught it via `git status` showing the file
  without the expected `web/` path prefix, before committing. Fixed by moving it into place
  and re-verifying `git status` showed correct paths. Auth backend commit pushed clean to
  `dev` (6 files: middleware, 3 API routes, auth lib, package.json). Session paused here.

- **2026-07-17 (cont'd)**: Discussed automated bank-account data pulling (bills, deposits,
  auto-notifications, projections). Researched Plaid pricing — confirmed it has no lasting
  free production tier (real recurring costs, ~$9K/year median), conflicting with the
  net-zero hardline. Decided against Plaid in the free core app; replaced Phase 4 with
  user-initiated CSV/PDF statement upload, parsed by our AI layer into structured data, with
  trend detection and cashflow projections built from real history. Plaid logged in backlog
  as a possible future paid-tier decision only. Also discussed and logged app design direction
  (BillOut + 1Bill + EveryDollar references) as backlog notes for when Phase 1 UI work begins.

---

## 10. Next Step (pick up here next session)

**Pick up here tomorrow:**

1. Confirm you have an empty GitHub repo created (repo name: `split-my-bills`).
2. Clone it locally, open in VS Code.
3. Scaffold with Turborepo: folder structure (`apps/web`, `packages/shared`), `turbo.json`,
   `.gitignore`, `.env.example`, base Next.js app with a PWA manifest stub.
4. First commit + push to `main`, then start Phase 1 work on a feature branch.