# Split My Bills — Project State

> Living document. Update the **Current Status** and **Session Log** sections as we work.
> Keep this file in the repo root and commit it after every session.

---

## 1. Project Summary

An EveryDollar-style budgeting app called **Split My Bills** (formerly "Bill Splitter").
Core differentiator: AI-assisted coaching that analyzes a user's income schedule vs. bill due
dates and suggests whether splitting a bill into two smaller payments (aligned to paydays)
would ease cashflow strain. A second, equally central differentiator: bill due dates and
paycheck dates rarely line up — the app's job is to make that mismatch visible and manageable,
not just track bills and income as separate lists.

**Emerging third differentiator (identified this session, not yet built):** the app needs to
work not just as a forward-only planner, but as an **as-of-today reconciliation tool** —
letting a user see, at any point mid-cycle, what's already settled and what's still open,
looking both backward and forward from today. See "Known Gaps" and "Future / Backlog" below
for the concrete shape of this.

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
- **Deployment**: live app is on Vercel (free tier), connected to GitHub. `main` is linked
  as the production branch — merging `dev` → `main` and pushing will auto-deploy to
  https://split-my-bills.vercel.app (confirm this auto-deploy behavior is actually enabled/
  desired before relying on it; so far deploys have been triggered manually via `vercel --prod`).
  **Confirmed this session: local dev and the Vercel production deployment share the SAME
  Neon database** via the same `DATABASE_URL` — bill/income/payment data is always identical
  between them instantly; only application code differs (whatever's on disk locally vs. what
  was last deployed from `main`). Worth knowing before creating test data — it's visible on
  the live production site too. A separate dev-only database is a possible future improvement,
  not urgent for how this is being used day-to-day right now.
  Environment variables (`DATABASE_URL`, `AUTH_SECRET`) are set in the Vercel dashboard
  separately from local `.env` — they don't sync automatically, must be updated in both
  places if changed.
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
| Web + Mobile frontend | **Next.js, built as a PWA** | One codebase. Installable on phones via manifest + service worker (Phase 5). No app store, no store fees, no RN/Expo needed. |
| UI components | **shadcn/ui** (Radix UI + Maia preset) | Free, copy-paste, no lock-in. Indigo/violet accent color, not generic finance green/blue |
| Database | Postgres via Neon | Free tier, scales to zero when idle. **Live and connected.** Shared between local dev and Vercel production (see Guardrails). |
| ORM | **Prisma 7** | Uses driver adapters (`@prisma/adapter-pg`) — a Prisma 7 breaking change from older versions. Schema deployed, migrations working |
| Validation | Zod | Not yet wired into API routes — planned, not yet done |
| Auth | **Self-rolled**: bcrypt password hashing + `jose` JWT sessions, httpOnly cookies | **Built and fully verified working** |
| Route protection | **`proxy.ts`** (Next.js 16's replacement for `middleware.ts`) | Must live in `src/proxy.ts` given our `--src-dir` setup |
| AI Provider (dev) | **Ollama** (local, self-hosted, unlimited, zero cost) — currently `llama3.2:3b` for fast iteration | Built and verified working |
| AI Provider (production) | **Gemini Flash-Lite free tier** | Capped (~1,500 req/day, 15 RPM). Built, deployed, and verified live |
| Usage Governor | Custom — tracks calls in our DB, enforces a ceiling below Google's real cap (1,350/day), caches AI responses, falls back to rules-engine-only output when near/at the limit | **Built and deployed** |
| CI | GitHub Actions | Free minutes. Not yet set up |

**Decided:** Ollama for dev, Gemini Flash-Lite (governed) for production. React Native/Expo dropped in favor of PWA — simpler, still net-zero, no store accounts needed.

**Important convention (learned the hard way):** every Next.js 16 App Router dynamic route
handler (`POST`, `DELETE`, etc. in a `[id]/route.ts` file) MUST declare `request: NextRequest`
as its literal first parameter, even if the handler body never uses it. Omitting it doesn't
just fail `tsc --noEmit` — it causes a real runtime crash
(`Cannot destructure property 'id' of '(intermediate value)' as it is undefined`) because
Next.js always calls handlers as `handler(request, context)`, so `params` silently gets bound
to the request object instead of the context object.

**Useful command discovered this session — raw SQL via Prisma without needing a script:**
```
npx prisma db execute --file=<path to .sql file> --schema=<path to schema.prisma>
```
Avoids import/path-alias resolution problems that a standalone `tsx`/`ts-node` script can run
into when it tries to import `@/lib/prisma` outside of Next.js's own module resolution.

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
 └─ id, bill_id, amount, paid_date, status, is_split_payment, split_group_id,
    is_late

SplitSuggestion (AI-generated, cached)
 └─ id, user_id, bill_id, suggested_split, reasoning,
    suggested_dates[], confidence, created_at
```

**Built and confirmed working:** `Payment.paidDate` represents the *specific projected
due-date occurrence* a payment covers, computed via `getCurrentOccurrence()` (not
`projectBillDueDates()`, which is a different-purpose "what's next" function — see Section 6).

**Built, needs correction (in progress):** split-payment legs (`Payment` rows with
`isSplitPayment: true`) can be marked paid/unpaid independently of each other via their own
`status` field. This part works. However, the *dates* those legs are scheduled on
(`planBillSplit()`) are still being computed incorrectly — see Known Gaps below.

---

## 5. AI Design Principle

The rules engine computes numbers (cashflow strain, split feasibility).
The LLM only explains/prioritizes those numbers in plain English — it does not do the math itself.

---

## 6. Build Phases

- [x] **Phase 0 — Setup**: GitHub repo, monorepo scaffold, VS Code config, `.env.example` — **complete**
- [x] **Phase 1 — Core MVP**: auth, manual income/bill CRUD, dashboard — **fully complete**, including inline-edit UI
- [x] **Phase 2 — Split Engine**: pay-schedule-aware cashflow calculator, split suggestion logic,
  3-paycheck-month detection and opportunity suggestions — **fully complete**
- [x] **Phase 3 — AI Coaching Layer**: `AIProvider` interface (Ollama default, Gemini fallback),
  plain-English suggestions endpoint — **fully complete, deployed, and verified live**
- [x] **Phase 3.5 — Usage Governor**: `AIUsageLog` table, daily ceiling check (1,350/day) before
  every AI call, response caching keyed on bill/income snapshot, graceful fallback to
  rules-engine-only output, admin usage-visibility endpoint — **fully complete and deployed**
- [ ] **Phase 4 — Statement Import & Trend Analysis**: user-initiated CSV/PDF bank statement
  upload, AI-parsed into structured bills/transactions, trend detection and cashflow
  projections built from real historical data. Not started.
- [x] **Phase 5 — PWA Polish (core)**: manifest.json, custom app icon (all sizes), service
  worker, installability, branded install-prompt banner (iOS share-sheet instructions,
  Android one-tap install) — **built and confirmed working on a real iPhone**. Branded splash
  screen attempted but deprioritized (production 404, low-stakes cosmetic gap, logged for
  Phase 6). Mobile-responsive functional fixes done (grid breakpoints, wrapping, alignment) —
  not yet a full visual redesign pass.
- [ ] **Phase 6 — Visual Design System & Polish**: in progress. Shipped so far: dark
  high-contrast hero summary card (Rocket Money-inspired), `Logo` component, light-mode
  `--primary` color bug fix (was silently rendering gray app-wide), category icons on bills,
  pill-shaped status badges on pay periods, income-vs-bills progress bar, root-URL redirect
  fix, two-line bill row layout, long-name/amount column alignment fixes, split-leg sub-row UI.
  Still open: real dashboard-as-hub restructuring, account menu/settings page, further
  component-level polish, loading/empty states, motion, overdue-bill visual indicator (see
  Known Gaps).
- [ ] **Phase 7 — Savings Guidance (future)**: AI-assisted savings advisor that identifies
  savings opportunities from the user's real financial patterns, once Phase 4 data exists.
  Not yet scoped in detail.

---

## Recently Fixed / In Progress (2026-08-24, fourth session — split-date logic + product scoping)

- **`planBillSplit()` fixed once, found to still be wrong, root cause now correctly
  understood.** First fix this session made `planBillSplit()` use "most recent payday and
  next payday relative to **today**" (`payDates[0]`/`payDates[1]` after adding the
  `includeMostRecentPast` flag it was missing). This looked correct in isolated testing but
  was wrong in principle: **splits must be anchored to the bill's due date, not to today's
  date**, since the whole point of a split is funding a bill by its due date, regardless of
  what day someone happens to open the app. Confirmed via a real example: a student loan due
  the 25th, actually paid via splits on the 7th and the 21st — both paydays *before* the due
  date. **Corrected rule, not yet implemented as of end of session:** find the bill's next
  unpaid due-date occurrence, then take the two most recent paydays on or before that due
  date (regardless of which calendar month either falls in). `isLate` should mean "this split
  payment's date falls after the bill's due date."

- **Confirmed working, via real (non-test) bills:** Remaining correctly updates with paid
  status; Upcoming Pay Periods correctly reflects paid/unpaid; Total Bills deliberately does
  **not** factor in paid status (it's a flat sum by design — a different metric, not a bug,
  worth remembering so it doesn't look like a discrepancy later); marking a genuinely overdue
  bill (mortgage due the 1st, tested on 8/24) paid correctly recorded it against the actual
  overdue occurrence while the *next* occurrence (not yet due) correctly still shows as owed —
  this was confirmed to be correct behavior, not a bug.

- **Full DB wipe performed** (Payment, Bill, IncomeSource only — User untouched) via raw SQL
  through `npx prisma db execute`, after a Node script approach failed due to an unresolvable
  `@/lib/prisma` import path outside of Next.js's module resolution. Both spouses' real income
  sources were re-added afterward for a clean, deliberate round of test-bill testing.

---

## Previously Fixed (2026-08-23, third session — occurrence math + split-leg paid tracking)

- **`getCurrentOccurrence()` added and correctly distinguished from `projectBillDueDates()`.**
  `projectBillDueDates()` is a "what's the next upcoming due date" function — it always skips
  forward past due dates already in the past. Reusing it to determine "which occurrence is
  being paid" broke paid-tracking for any bill whose due date had already passed this cycle
  (e.g. paying on the 5th a bill due the 1st would wrongly record against next month). Added
  `getCurrentOccurrence(dueDate, referenceDate)` — always returns the current month's
  occurrence regardless of past/future — and swapped it in everywhere "which occurrence is
  being paid" is computed (`pay/route.ts`, `GET /api/bills/route.ts`,
  `/api/split-suggestions/route.ts`). **Confirmed working.**

- **Split-payment legs can now be marked paid independently.** Bills with an active split plan
  were completely excluded from the normal paid-tracking path and rendered only via
  `splitOverrides`, which had no paid/unpaid concept at all. Added
  `/api/payments/[id]/pay/route.ts` (`POST`/`DELETE` toggling a specific `Payment` row's
  `status` between `SCHEDULED`/`PAID`), which works for free with existing filtering since
  `splitPayments` queries already filter on `status: "SCHEDULED"`. Updated `dashboard/page.tsx`
  with per-leg checkboxes. **This part (paid-toggle mechanics) is confirmed working — it's the
  split-date scheduling logic, a separate concern, that still needs the fix described above.**

- **Stale test data cleared**, and a real runtime crash fixed in `pay/route.ts`'s `DELETE`
  handler (missing required `request: NextRequest` parameter — see Section 3's callout).
  **Three other route handlers still have this same latent bug**
  (`bills/[id]/route.ts` DELETE, `bills/[id]/split/route.ts` POST, `income/[id]/route.ts`
  DELETE) — not yet fixed, not currently causing visible problems, but worth fixing
  proactively.

---

## Previously Fixed (2026-08-23, second session)

- **`paidOccurrences` was computed but never passed to `calculatePayPeriods()`** in
  `/api/split-suggestions/route.ts` — 6 of 7 arguments were passed. Fixed by adding the
  missing argument. **Confirmed working.**

---

## Previously Fixed (2026-08-23, first session)

- **Auto-split on bill creation** now correctly calls `createBillSplit()` immediately.
- **Pay-period boundary bug** in `getUpcomingPayDates()` (was discarding the most recent past
  payday) fixed via an opt-in `includeMostRecentPast` parameter. **Confirmed fixed.**

---

## Known Gaps — Actively Being Worked (as of 2026-08-24)

- **`planBillSplit()` needs the due-date-anchored rewrite described above.** This is the
  active, next piece of work — not yet implemented. Needs: find the bill's next unpaid
  due-date occurrence, take the two most recent paydays on or before it, set `isLate` based on
  whether either payment date falls after the due date.

- **Three route handlers still missing the required `request: NextRequest` parameter**
  (`bills/[id]/route.ts` DELETE, `bills/[id]/split/route.ts` POST, `income/[id]/route.ts`
  DELETE). Same bug already caused one real runtime crash in a sibling file — worth fixing
  proactively.

- **A larger product concept identified this session, deliberately not yet designed or
  built — "current state" reconciliation.** The app currently only looks forward from a fixed
  anchor date. Real usage surfaced a need to also look **backward** from today, unifying three
  previously-separate backlog ideas into one feature:
  1. **Mid-cycle onboarding reconciliation** — someone starting the app mid-month or later
     needs a way to mark which of the current cycle's bills are already paid vs. still owed,
     since the app has no history to infer this from.
  2. **"Did you get paid?" / end-of-cycle confirmation** before paid-status resets for a new
     cycle, rather than a silent automatic reset (previously scoped narrower, as just a payday
     check-in).
  3. **Predictable late-due-to-payday-timing bills** — e.g. mortgage due the 1st, but the
     actual payday that funds it doesn't land until the 4th. The app should be able to
     represent/predict this rather than only reacting after the due date has passed.

  User explicitly wants this designed in its own dedicated session with full attention, not
  rushed alongside other fixes. Flagged as the clear next major design conversation once
  today's narrower fixes are wrapped up.

---

## Future / Backlog (not yet phased — tracked so we don't lose them)

- **"Current state" reconciliation feature** — see Known Gaps above. This is now the single
  highest-value backlog item; supersedes the three previously-separate ideas it merges.
- **Multi-income-source pay-schedule limitation.** `calculatePayPeriods()`/split-suggestions
  only uses `incomeSources[0]`'s pay schedule/anchor date for period boundaries and paydays —
  `totalIncome` correctly sums all income sources' *amounts*, but a second income source on a
  *different schedule* is currently invisible to period/payday calculations. Not an issue for
  this household (both paychecks land the same day), but flagged as a real problem for other
  users whose incomes don't align. Deliberately deferred — needs real design (average the
  paydays? track separate period-sets per income source and merge them?), not a quick patch.
- **Overdue-bill visual indicator.** Currently nothing distinguishes "this bill's due date has
  passed and it's still unpaid" from a normal unpaid bill — no icon, no flag. A small,
  self-contained addition (`isOverdue` computed similarly to `paidThisMonth`, reusing the
  existing `AlertTriangle` icon already used for `hasLateSplit`). Related to, but smaller and
  more immediate than, the full reconciliation feature above.
- **Security hardening**: automated dependency scanning (GitHub Actions + Dependabot, free);
  Zod validation on all API entry points (not yet wired despite being installed); enable
  `noUnusedLocals`/`noUnusedParameters` in `tsconfig.json` once the codebase is clean enough
  not to create noise.
- **Consolidate duplicate date-equality logic**: `isSameDay()` in `split-suggestions/route.ts`
  and the inline comparison in `isPaidOccurrence()` (shared package) should become one shared
  exported helper.
- **Handle stale/historical split-payment rows in the UI.** The current split-leg sub-row
  rendering shows *all* `isSplitPayment` rows found for a bill, not just the current active
  cycle's two legs — fine for now (one active split per bill at a time), but worth revisiting
  if a bill can ever accumulate split history across multiple cycles.
- **Push notifications**: Web Push API (free, standard). iOS Safari requires the PWA be
  "Added to Home Screen" before push works.
- **Rocket Money-inspired ideas**: spending trend line/bar charts over time (Phase 4, once
  statement import gives historical data — `recharts` available); visually group "Recurring"
  vs "One-time" bills on the dashboard (`isRecurring` field exists, needs UI); trend indicator
  (up/down arrow) on the Remaining card.
- **"Remaining" card color gradient + warning icon**: grade the Remaining card's background
  green → yellow → red based on buffer remaining, with a warning icon in the red zone. Ties
  into push notifications as a new trigger condition.
- **Calendar visualization for pay dates + bill due dates**: month/year view plotting colored
  dots on paydays and bill due dates. `getUpcomingPayDates()`/`projectBillDueDates()` already
  generate the real dates needed — would need extending from the current rolling window to a
  full-year window for display.
- **Collapsible add-income / add-bill forms**: collapse once at least one entry exists, replace
  with an "Add more" button; likely a modal/sheet pattern on mobile. Pairs with the calendar
  visualization idea, which would live directly under the Income Sources list.
- **Account menu / settings page**: log out, pay schedule editing, dark mode toggle, calendar
  dot-color customization, eventual account management (email/password change, delete account).
- **Email payment-confirmation scanning** (researched, fits net-zero): opt-in Gmail API
  (read-only scope) search for payment confirmation emails, to help auto-detect bills paid
  without full manual entry. Must be explicit opt-in, read-only, pattern-targeted search (not
  full-inbox ingestion), reusing the same AI-parsed-extraction pattern planned for statement
  imports.
- **Budget-tracker checklist view**: bills due before next payday, checked off as paid, falling
  off the list once paid — depends on paid-tracking (including split legs and the split-date
  fix) being fully solid first.
- **Dashboard-as-information-hub restructuring**: small icon-based action cards (add bill/
  income, payday calendar, etc.) instead of the current linear card stack. Real, scoped Phase
  6 work, not yet attempted.

**Design Direction**: References are BillOut (calm, card-based, sparing color-as-accent) +
1Bill (bolder saturated color confidence, friendlier type) + EveryDollar (clarity/simplicity
benchmark) + Rocket Money (dark high-contrast hero sections, bold data visualization — added
as a third reference 2026-07-21). Direction: BillOut's organized bones combined with 1Bill's
bolder color confidence and Rocket Money's contrast technique for hero elements. Not yet
decided: exact full palette beyond the current indigo accent, font pairing, dark mode toggle.

- **iOS browser behavior** (researched 2026-07-17): all iOS browsers use WebKit, no
  browser-specific risk. Home-screen install works from Safari/Chrome/Edge/Firefox/Orion on
  iOS 16.4+, but not reliably from in-app browsers (Mail, Instagram, etc.). Push notifications
  require home-screen install on any iOS browser.
- **Bank sync (Plaid) — deliberately NOT in the free core app**: real ongoing cost conflicts
  with net-zero. Chosen alternative: user-initiated statement upload, AI-parsed, with trend
  detection built from that real historical data.
- **Multi-user readiness confirmed**: architecture (per-user scoping, PWA distribution, Usage
  Governor) was designed with multi-user sharing in mind from the start — the user's spouse
  is a real user of the app.

---

## 7. Current Status

**Phase:** Phases 0–3.5 fully complete, deployed, and verified live. Phase 5 core (PWA
installability) complete and verified on a real device. Phase 6 in progress, including
confirmed-working split-leg paid-tracking UI.

**2026-08-24 (fourth session):** Ran a deliberate, real-data testing pass after a full DB
wipe. Confirmed several previously-built fixes are solid: Remaining/Upcoming Pay Periods
correctly reflect paid status, overdue-occurrence handling is correct, split-leg paid toggling
works. Found that the split-date scheduling fix from the previous session was based on the
wrong anchor point (today's date instead of the bill's due date) — confirmed via a real
example (loan due the 25th, split paid the 7th and 21st) that splits must be computed as "the
two most recent paydays on or before the bill's due date." This corrected logic is understood
and agreed on but **not yet implemented**. Also surfaced and clearly scoped a larger,
deliberately-deferred product concept — an as-of-today "current state" reconciliation view
that looks both backward and forward — unifying three previously-separate backlog ideas.
Agreed to keep today's scope narrow (finish the split-date fix) and design the larger feature
in its own dedicated session.

**Next: implement the due-date-anchored `planBillSplit()` fix, retest the split bill, then
decide whether to start on part of the reconciliation-feature design or continue with other
open items (the three remaining `request: NextRequest` fixes, the overdue-bill indicator,
etc.).**

**Last updated:** 2026-08-24

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
| 2026-08-23 | Occurrence-based paid tracking instead of calendar-month-based | Bill due dates and calendar months can diverge once projected forward; occurrence-based tracking resets automatically and matches the app's actual due-date model |
| 2026-08-23 | Added `getCurrentOccurrence()` as distinct from `projectBillDueDates()` | "Which occurrence is being paid" and "what's the next upcoming due date" are different questions; conflating them broke paid-tracking for any overdue bill |
| 2026-08-23 | Split-payment legs are marked paid independently, via their own `Payment.status` | User confirmed: legs land in different pay periods and are often paid at different times, so a single paid toggle per bill doesn't fit once a bill is split |
| 2026-08-24 | Split dates must be anchored to the bill's due date, not to today's date | Splits exist to fund a bill by its due date; anchoring to "today" instead broke correctness for bills due early in the month, and doesn't serve users who start the app mid-cycle |
| 2026-08-24 | Merged three backlog ideas (mid-cycle onboarding, payday check-in reset, predictable late-due-to-payday-timing bills) into one future "current state" reconciliation feature, to be designed in its own dedicated session | All three are really the same underlying need: an as-of-today view that looks both backward and forward, not just forward-only |

---

## 9. Session Log

> Add a short entry each session: what we discussed/built, what's left open.

*(Full history through 2026-07-22 preserved in prior version of this document — Phase 0
through the initial Phase 6 design pass, all early bug fixes and standing lessons. Picking up
from the most recent sessions below.)*

- **2026-08-23 (first session)**: Fixed the auto-split-on-bill-creation gap and a pay-period
  boundary bug. **Confirmed fixed.** Surfaced the paid-status gap and designed occurrence-based
  paid tracking.

- **2026-08-23 (second session)**: Fixed a missing `paidOccurrences` argument in the
  `calculatePayPeriods()` call. **Confirmed fixed.** User applied `tsconfig.json` strictness
  flags, which surfaced 4 route handlers missing a required `request: NextRequest` parameter;
  user chose to sidestep fixing those for now and reverted the files.

- **2026-08-23 (third session)**: Found and fixed a real occurrence-math bug
  (`getCurrentOccurrence()` vs. `projectBillDueDates()`) and a real runtime crash in
  `pay/route.ts`'s `DELETE` (the parked `request: NextRequest` issue, now biting at runtime).
  Discovered split-payment bills were entirely disconnected from paid tracking; built
  `/api/payments/[id]/pay` and per-leg checkbox UI so each split leg can be marked paid
  independently. Cleared stale test data.

- **2026-08-24 (fourth session)**: Discovered the split-date bug (dates landing on 8/23 and
  10/18 instead of anything sensible) while testing a real bill. Traced it to
  `planBillSplit()` reusing the same missing-`includeMostRecentPast`-flag pattern as before,
  plus a wrong "same calendar month as due date" matching rule. First fix attempt swapped in
  "most recent payday / next payday relative to today" — but user clarified via a concrete
  real example (loan due the 25th, split paid the 7th and 21st) that this was still the wrong
  anchor: splits need to be relative to the bill's **due date**, not to today, since the app
  needs to support someone starting mid-cycle and still getting a sensible split. Corrected
  rule agreed on (two most recent paydays on or before the due date) but not yet implemented.

  Did a full DB wipe (`Payment`/`Bill`/`IncomeSource`, `User` preserved) via raw SQL after a
  Node script failed on an import-resolution error outside Next.js's module system. Re-added
  both spouses' real income sources and ran a deliberate round of real-bill testing:
  - Confirmed Remaining, Upcoming Pay Periods, and Total Bills all behave correctly (the
    latter deliberately ignores paid status — a different metric, not a bug).
  - Confirmed overdue-occurrence handling is correct (tested with the mortgage, due the 1st,
    tested on the 24th — behaved exactly as designed).
  - Surfaced a real, unbuilt gap: no visual indicator currently exists for "this bill's due
    date has passed and it's still unpaid."

  While discussing the split-date fix, the conversation surfaced a larger product need: the
  app currently only plans forward from a fixed anchor, but real usage (mid-cycle onboarding,
  bills that predictably land late because of payday timing like a mortgage due the 1st but
  funded by a payday on the 4th) requires the ability to also look backward from today. Agreed
  to scope this as its own future "current state" reconciliation feature, designed in a
  dedicated session, and keep the current session focused on finishing the narrower
  due-date-anchored split fix.

  **Left open:** the corrected `planBillSplit()` has not yet been written/applied. The three
  remaining `request: NextRequest`-missing route handlers are still unfixed. The overdue-bill
  visual indicator is not yet built. The larger reconciliation feature is scoped but not
  designed.

---

## 10. Next Step (pick up here next session)

1. **Implement the due-date-anchored `planBillSplit()` fix**, replacing the current
   today-anchored version:
   - Find the bill's next unpaid due-date occurrence.
   - Take the two most recent paydays on or before that due date (regardless of calendar
     month).
   - Set `isLate` based on whether a given split payment's date falls after the due date.
   - Retest against the real student loan bill (due the 25th) and confirm it produces
     sensible dates.
2. **Fix the three remaining route handlers** missing `request: NextRequest`:
   `bills/[id]/route.ts` DELETE, `bills/[id]/split/route.ts` POST, `income/[id]/route.ts`
   DELETE.
3. **Decide scope for the next working session**: either begin design work on the larger
   "current state" reconciliation feature (mid-cycle onboarding + payday check-in reset +
   predictable late-due-to-payday bills, unified), or continue with smaller open items first
   (overdue-bill visual indicator, multi-income-schedule limitation, etc.) — user's call.
4. Lower priority, whenever convenient: re-enable `noUnusedLocals`/`noUnusedParameters` in
   `tsconfig.json`; consolidate duplicate `isSameDay`-style logic into one shared helper.

**Standing lessons/habits to keep in mind going forward** (learned the hard way this project):
- With `--src-dir` enabled, config files like `proxy.ts` belong inside `src/`, at the same
  level as `app/` — not at the `apps/web/` root.
- Always run `npx prisma generate` explicitly after any schema change — don't rely on
  `migrate dev` to do it silently.
- If a file/path checks out completely correct but an error persists, clear `apps/web/.next`
  before assuming the file itself is broken.
- Bracket-named folders (like Next.js's `[id]` dynamic routes) need quotes in shell commands,
  or zsh will try to glob-expand them.
- Before running `mkdir`/`touch`/similar path-sensitive commands, confirm `pwd` first.
- Commit real bug fixes immediately once confirmed working — don't leave them uncommitted
  mid-session; a `git revert` can silently undo an uncommitted fix.
- A `?` or unexpected symbol in a file/folder `ls` listing is a real signal of a hidden/invalid
  character, not a rendering quirk — worth renaming/recreating rather than assuming it's cosmetic.
- **Computing a value doesn't mean you passed it anywhere.** A correctly-built, correctly-typed
  local variable can sit unused right next to the function call that needed it, with no
  compiler error, if `noUnusedLocals` isn't enabled.
- **Every Next.js 16 App Router dynamic route handler needs `request: NextRequest` as its
  literal first parameter**, even if unused — omitting it is a real runtime crash, not just a
  type-checker complaint, because Next.js always calls handlers positionally.
- **A function's name and its correctness don't guarantee it's being used for the right
  question.** `projectBillDueDates()` was correctly built for "what's coming up next," but got
  reused for "which occurrence is this action for" — a subtly different question. Worth asking
  "what is this function's actual contract?" before reusing it in a new context.
- **"Relative to today" and "relative to the relevant due date" are frequently different
  anchors, and picking the wrong one produces plausible-looking but wrong results.** The
  split-date bug happened twice in a row because the fix kept anchoring to today instead of
  to the bill's due date — worth explicitly asking "what should this actually be anchored to"
  before writing date-math logic, not just "does this produce a date in the right ballpark."
- **When a fix is scoped too narrowly on the first pass, testing with real (not synthetic)
  data is often what surfaces it.** Both split-date bugs were only caught once tested against
  real bills with real due dates and real pay history — synthetic/quick test cases can pass
  while still encoding the wrong rule.

---

## Addendum — 2026-08-24, end of session (overdue-bill indicator shipped)

**Shipped tonight, after the merge:** an overdue-bill visual indicator, built and confirmed
working against a real bill (mortgage due the 1st, tested on 8/24 — correctly showed the red
overdue icon for the unpaid August occurrence).

- `GET /api/bills/route.ts`: added a computed `isOverdue` field per bill — `true` when
  `getCurrentOccurrence(bill.dueDate) < today` and the bill isn't already `paidThisMonth`.
  Reuses the same occurrence-based pattern already established for `paidThisMonth`.
- `dashboard/page.tsx`: added `isOverdue: boolean` to the `Bill` type; renders a red
  `AlertTriangle` icon next to the bill name when `isOverdue` is true, distinct from the
  existing yellow `AlertTriangle` used for `hasLateSplit`.
- Committed to `dev` and pushed. DB wiped again afterward (Payment/Bill/IncomeSource, via
  Neon's SQL editor) to leave production clean for next session.

**This closes out the "Overdue-bill visual indicator" backlog item** from Section 6 / Known
Gaps — remove it from the open list; it's done.

**Confirmed, real next-session priority: recurring splits.** This is the single most important
functional gap left — a splittable bill like "CashApp - Groceries + Gas" only ever gets ONE
pair of split `Payment` rows, ever; nothing regenerates a new pair for the next pay cycle.
This needs to be built as its own focused session, not squeezed in. Rough shape already agreed:

1. Every split bill should behave like an unsplit bill's due date does — automatically
   "reappearing" every cycle with no manual action, via a lazy check (likely at the top of
   `GET /api/split-suggestions`): does this bill have a scheduled/paid pair covering the
   current cycle? If not, generate the next pair.
2. Open design question, not yet decided: does every splittable bill recur automatically by
   default (simplest — no schema change), or does the app need an explicit `splitMode` /
   "one-time vs. recurring" choice on the bill? Discussion leaned toward: probably no user
   ever wants a one-time-only split that stops recurring, so recurring-by-default for any
   `splittable` bill is likely the right call — worth confirming with the user first thing next
   session before writing code, rather than assuming.
3. A related, separate open question already logged: due-date-driven splits (fund one due
   date via the two most recent paydays before it — the student loan pattern) vs.
   payday-driven splits with no due-date tie-in at all (the groceries/gas pattern). Both need
   to keep recurring; the question is only which two paydays get picked each cycle.

**Last updated:** 2026-08-24 (end of session)