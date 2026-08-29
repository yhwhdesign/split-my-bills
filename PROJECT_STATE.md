# Split My Bills — Project State

> Living document. Update the **Current Status** and **Session Log** sections as we work.
> Keep this file in the repo root and commit it after every session.

---

## 1. Project Summary

An EveryDollar-style budgeting app called **Split My Bills** — a combined
financial-coaching / budget / savings-potential app to help people who don't have the time
(or won't take the time) to manage their finances properly.

Core differentiator: AI-assisted coaching that analyzes a user's income schedule vs. bill due
dates and suggests whether splitting a bill into two smaller payments (aligned to paydays)
would ease cashflow strain. A second differentiator: bill due dates and paycheck dates rarely
line up — the app makes that mismatch visible and manageable, including modeling *how* a bill
is actually funded (`fundingModel`).

As of this session, a third real capability: **the app treats every income source in the
household equally.** There is no "primary" income driving the schedule — every real paycheck
from every source funds every bill, including splits, and the app's own periods, income
totals, and bonus-paycheck detection are all built from the full combined picture.

---

## 2. Guardrails / Constraints (do not violate)

- **Net-zero cost.** Every service choice must have a genuinely free tier at our scale.
- **No billing surprises, ever.** All AI calls route through our server, gated by a Usage
  Governor.
- **Version control via GitHub.** Feature branches, merged via PR into `main`. Never commit
  directly to `main`.
- **Local server must behave like it's live** — reachable from a real phone.
- **Built in VS Code.**
- **Distribution: PWA, not native app stores.**
- **Monorepo** (Turborepo) — shared logic between web and the PWA.
- **Deployment**: Vercel (free tier), `main` → production. Local dev and production share the
  SAME Neon database via the same `DATABASE_URL` — test data created locally is immediately
  visible on the live site. Wipe via Neon's SQL editor after testing sessions.
- **How users get bill data in: manual entry + user-initiated statement upload only.**

**Important conventions learned the hard way:**
- Every Next.js 16 App Router dynamic route handler MUST declare `request: NextRequest`
  (the exact type, not plain `Request`) as its literal first parameter, even if unused.
- Always run `npx prisma generate` after schema changes AND fully restart the dev server.
- **Run `npm run build` locally before every commit/merge to `main`** — `next dev`'s compiler
  is more lenient and has twice let real type errors through undetected.
- A "module export doesn't exist" error that survives a full cache clear may not be a caching
  issue at all — confirm the file's actual content on disk before assuming it's still a cache
  problem.
- A single mistyped object key in a JSON body fails completely silently.
- **Giving users a way to correct their own data (an edit modal) can resolve what looks like a
  code bug but is actually just bad input** — faster than debugging logic that was already
  correct.

---

## 3. Tech Stack (decided)

| Layer | Choice | Notes |
|---|---|---|
| Monorepo tool | **Turborepo** | |
| Backend | Next.js API routes | No separate backend server |
| Frontend | **Next.js, built as a PWA** | One codebase |
| UI components | **shadcn/ui** (indigo/violet accent) | No Dialog component installed — custom overlays built plainly with Tailwind |
| Database | Postgres via Neon | Free tier, scales to zero when idle |
| ORM | **Prisma 7** | Driver adapters |
| Validation | Zod | Installed, not yet wired into API routes |
| Auth | Self-rolled: bcrypt + `jose` JWT, httpOnly cookies | Fully working |
| Route protection | `src/proxy.ts` | |
| AI Provider (dev) | Ollama (local) | Requires Ollama running locally |
| AI Provider (production) | Gemini Flash-Lite free tier (governed) | |
| Usage Governor | Custom, built and deployed | |
| CI | GitHub Actions | Not yet set up |

---

## 4. Data Model (current)

```
User
 └─ id, name, email, pay_schedule, payday_anchor_date

IncomeSource
 └─ id, user_id, name, amount, frequency, next_pay_date

Bill
 └─ id, user_id, name, amount, due_date, category,
    is_recurring, splittable, min_split_amount,
    funding_model  ("BEFORE_DUE" default | "NEXT_CHECK")

Payment
 └─ id, bill_id, amount, paid_date, status, is_split_payment, split_group_id,
    is_late

SplitSuggestion (AI-generated, cached)
 └─ id, user_id, bill_id, suggested_split, reasoning,
    suggested_dates[], confidence, created_at
```

**Multi-income-source model** (built this session): there is no "primary" income source
anywhere in the codebase. Every function that plans periods, splits, or reconciliation now
takes `IncomeSourceInput[]` (a list of `{ amount, paySchedule, anchorDate }`) and treats every
source equally:
- `getCombinedPayDates()` / `getCombinedPayDatesInRange()`: merge every source's real payday
  sequence into one combined, chronologically sorted timeline. If two sources happen to pay
  on the exact same calendar day, that day's amounts are summed rather than producing two
  separate (broken, zero-length) periods.
- Each period's `income` is the real amount landing in that specific period — not a flat
  total smeared across every period.
- Splits (`pickSplitDates()`) draw from the full combined pool of every source's paydays.

**Bonus-paycheck detection** (`bonusPaycheckLabels: string[]` on each `PayPeriod`): flags the
*specific* paycheck that's genuinely extra for its schedule — the 3rd biweekly check in a
month (labeled `"3PD"`), or the 5th weekly check (`"5PD"`) — not the whole calendar month.
Evaluated completely independently per income source; semimonthly and monthly never qualify
(they always produce a fixed count every month). Two sources landing a bonus on the same day
both show their labels together.

---

## 5. AI Design Principle

The rules engine computes numbers. The LLM only explains/prioritizes those numbers in plain
English — it does not do the math.

---

## 6. Build Phases

- [x] **Phase 0 — Setup** — complete
- [x] **Phase 1 — Core MVP** — fully complete
- [x] **Phase 2 — Split Engine** — fully complete
- [x] **Phase 3 — AI Coaching Layer** — fully complete, deployed, verified live
- [x] **Phase 3.5 — Usage Governor** — fully complete and deployed
- [ ] **Phase 4 — Statement Import & Trend Analysis** — not started
- [x] **Phase 5 — PWA Polish (core)** — complete and verified on a real iPhone
- [ ] **Phase 6 — Visual Design System & Polish** — in progress. Shipped: dark hero card,
  category icons, split-leg sub-row UI, overdue-bill indicator, hamburger menu + Icon Legend,
  per-bill "needs review" indicator, full bill/income editing modals, bonus-paycheck badges.
  **Still open, flagged by user as a real UX problem**: the Upcoming Pay Periods card is too
  data-dense and scroll-heavy on mobile — doesn't feel like a native mobile app. Needs a
  dedicated redesign pass.
- [ ] **Phase 7 — Savings Guidance (future)** — not scoped in detail.

**"Current state" reconciliation feature:**
- [x] Per-bill "needs review" detection for orphaned occurrences — built and confirmed
  working.
- [ ] Full mid-cycle onboarding reconciliation flow — not built.
- [ ] End-of-cycle "Did you get paid?" proactive confirmation flow — not built.

---

## Recently Fixed / Built (2026-08-29 session — multi-income-source support)

**The core refactor.** User's own framing for why this mattered: *"the app would be
pointless if we were not allowing ALL options for ALL payday options"* — explicitly rejecting
any "primary income" concept. Every function touching income now takes a list, not a single
schedule:

- `packages/shared/src/index.ts`: new `IncomeSourceInput` type; new `getCombinedPayDates()`
  and `getCombinedPayDatesInRange()` merging every source's real paydays; `calculatePayPeriods()`,
  `pickSplitDates()`, `planBillSplit()`, `findUnresolvedOccurrences()` all rewritten to accept
  `IncomeSourceInput[]` instead of one `(amount, paySchedule, anchorDate)` triple.
- `apps/web/src/lib/split-bill.ts`, `apps/web/src/app/api/split-suggestions/route.ts`,
  `apps/web/src/app/api/ai-coaching/route.ts`: all `primaryIncome`/`incomeSources[0]`
  references removed; each now builds a full `IncomeSourceInput[]` from every income source
  and passes it through everywhere. `POST /api/bills/route.ts` needed **zero changes** — it
  only calls `createBillSplit(bill.id, userId)`, and all multi-income logic now lives inside
  that function, a good sign the refactor's boundaries were clean.
- **Confirmed working via real testing** with two income sources on different schedules
  (biweekly + weekly): period boundaries and per-period income both correctly reflect the
  combined real picture, not a flattened average.

**Bonus-paycheck badges — iterated through several real design refinements based on live
testing**, landing on: only the *specific* extra occurrence gets tagged (e.g. only the 3rd
biweekly check, not all three paychecks in that month), evaluated fully independently per
income source, with support for multiple simultaneous badges on the same date. Replaced the
old "3-paycheck month" text sentence with a compact `"3PD"`/`"5PD"` badge. Also fixed a real
windowing bug: the bonus check was using the same window as normal period generation, so a
bonus payday sitting near the edge could be undercounted — fixed with a wider, dedicated
lookback for this specific check. Forecast window widened from 60 to 90 days by default so a
bonus paycheck becomes visible with real lead time, not just after the fact.

**Full income-source editing** (`EditIncomeModal`, new file) — previously only `amount` was
editable inline. Built using the same modal pattern as `EditBillModal`, with a native
`<input type="date">` instead of `DayOfMonthPicker` (since `nextPayDate` is a full calendar
date, not a day-of-month). The backend already fully supported this — purely a frontend gap.
**Discovered as an immediate, real need mid-session**: the user mistyped a pay date while
testing and had no way to fix it without deleting/recreating the income source. Confirmed the
"missing bonus badge" symptom at the time was genuinely just that wrong data, not a code bug —
once the modal existed, the user fixed the date directly and the detection logic was
immediately proven correct.

---

## Previously Fixed (2026-08-28 session — full bill editing + cleanup)

Fixed the final `request: NextRequest` typing issue. Designed and built full bill editing
(`EditBillModal`) with an explicit rule: structural changes (`dueDate`, `splittable`) delete
unpaid split legs and regenerate fresh ones; paid history is never touched. Closed out the
`fundingModel` wording pass and rebuilt the lost `categorize-bill.ts`.

## Previously Fixed (2026-08-27 session — "needs review" reconciliation feature)

Built `findUnresolvedOccurrences()` — flags a bill when its relevant occurrence falls before
the earliest generated period, using a one-pay-cycle lookback window. Added a hamburger menu
with an Icon Legend.

## Previously Fixed (2026-08-23 through 2026-08-26 sessions)

Occurrence-based paid tracking, per-split-leg independent paid tracking, due-date-anchored
split logic, automatic recurring split generation, the `fundingModel` feature, overdue-bill
visual indicator.

---

## Known Gaps — Actively Being Worked

- **Upcoming Pay Periods card needs a mobile UX redesign** — flagged directly by the user as
  too data-dense/scroll-heavy, not feeling like a native mobile experience. Real, scoped
  visual work, not yet started.
- **The broader "current state" reconciliation concept is only partially built** — the
  `needsReview` feature covers the "orphaned occurrence" case. Still open: full mid-cycle
  onboarding review, end-of-cycle "Did you get paid?" confirmation.

---

## Future / Backlog

- **Upcoming Pay Periods mobile redesign** (see Known Gaps — now the most concrete, most
  clearly-scoped open UI item).
- **Full mid-cycle onboarding reconciliation flow** and **end-of-cycle "Did you get paid?"
  confirmation** — remaining pieces of the "current state" concept.
- **Consolidate duplicate date-equality logic** across a few files into one shared helper.
- **Handle stale/historical split-payment rows in the UI** if a bill ever accumulates split
  history across multiple cycles.
- **Push notifications**, **spending trend charts**, **"Remaining" card color gradient +
  warning icon**, **calendar visualization for pay/due dates**, **collapsible add-forms**,
  **further settings under the hamburger menu**, **email payment-confirmation scanning
  (opt-in, read-only Gmail search)**, **budget-tracker checklist view**,
  **dashboard-as-information-hub restructuring** — all previously logged, unchanged.
- **Security hardening**: dependency scanning, Zod validation on API routes, re-enable
  `noUnusedLocals`/`noUnusedParameters` in `tsconfig.json` once the codebase is stable enough.
- **Consider adopting a real shadcn Dialog component** now that three modal-style UI patterns
  exist (`EditBillModal`, `EditIncomeModal`, and the needs-review inline prompt) — currently
  each built plainly with Tailwind; worth consolidating into one shared primitive.

**Design Direction**: BillOut + 1Bill + EveryDollar + Rocket Money references, unchanged.
Not yet decided: exact full palette, font pairing, dark mode toggle.

---

## 7. Current Status

**Phase:** Phases 0–3.5 fully complete, deployed, verified live. Phase 5 core complete.
Phase 6 in progress.

**2026-08-29 session:** Completed the multi-income-source refactor the user had been wanting
since early sessions — removed every "primary income" concept from the codebase, replacing it
with a combined-paydays model where every income source funds every bill equally, including
splits. Iterated through several real design refinements on bonus-paycheck detection based on
live testing (fixing a windowing bug and a "whole month flagged" overreach along the way),
landing on precise per-source, per-specific-occurrence badges ("3PD"/"5PD"). Built full
income-source editing, which also happened to resolve a live testing confusion (a mistyped
pay date) — good confirmation the underlying detection logic was correct.

**Known real gap, next up:** the Upcoming Pay Periods card needs a real mobile UX redesign
pass — flagged directly by the user, not yet started. The remaining reconciliation-feature
pieces (mid-cycle onboarding, end-of-cycle confirmation) also remain open.

**Next: pick a redesign approach for Upcoming Pay Periods, or continue with a remaining
reconciliation-feature piece — user's call next session.**

**Last updated:** 2026-08-29

---

## 8. Decision Log

| Date | Decision | Reasoning |
|---|---|---|
| 2026-07-14 | Web + mobile, shared backend | One codebase covers both platforms |
| 2026-07-14 | Rules engine + LLM explains (not LLM does math) | Reliability + cost control |
| 2026-07-16 | Dropped React Native/Expo, going PWA instead | No store fees, one codebase |
| 2026-08-23 | Occurrence-based paid tracking distinct from forward-only due-date projection | "Which occurrence is paid" and "what's next" are different questions |
| 2026-08-26 | Added explicit `Bill.fundingModel` field instead of trying to infer funding behavior | Two real bill-funding behaviors are legitimate but mutually exclusive |
| 2026-08-27 | Scoped the reconciliation feature narrowly to "orphaned occurrences" only | Precise, buildable in one session, directly solves the concrete gap found through testing |
| 2026-08-28 | Editing a bill's due date or splittable status deletes unpaid split legs and regenerates fresh ones; paid history is never touched | "Changes are just that, changes" — treat structural edits as starting over, history stays immutable |
| 2026-08-29 | Removed all "primary income" concepts; every income source is treated equally for every calculation | User explicitly rejected any income hierarchy — the app should use ALL money to pay ALL bills |
| 2026-08-29 | Bonus-paycheck badges tag only the specific extra occurrence, fully independent per income source | Flagging the whole month bled a biweekly bonus onto unrelated periods from other schedules; only the true extra occurrence is meaningful |
| 2026-08-29 | Forecast window widened from 60 to 90 days | A bonus paycheck should be visible with lead time to plan for it, not just noticed after the fact |

---

## 9. Session Log

*(Full history through 2026-07-22 preserved in prior version of this document.)*

- **2026-08-23 through 2026-08-27**: Built occurrence-based paid tracking, per-split-leg
  paid tracking, due-date-anchored splits, recurring split generation, the `fundingModel`
  feature, the overdue-bill indicator, and the first "needs review" reconciliation feature.

- **2026-08-28**: Fixed the final route-handler typing issue. Designed and built full bill
  editing with an explicit structural-change rule. Closed two small backlog items
  (`fundingModel` wording, rebuilding `categorize-bill.ts`).

- **2026-08-29**: Built the full multi-income-source refactor across the shared package and
  every caller — removed all "primary income" logic per the user's explicit direction.
  Iterated live on bonus-paycheck detection through several real design corrections (a
  windowing bug, an over-broad "whole month" flag, then landing on precise per-occurrence,
  per-source badges) directly from testing with two real differently-scheduled income
  sources. Built full income-source editing (`EditIncomeModal`), which incidentally resolved
  a mid-session data-entry confusion and confirmed the detection logic was correct all along.
  User flagged the Upcoming Pay Periods card as needing a real mobile redesign — logged as
  the next concrete UI project. **Left open:** the Pay Periods redesign, and the remaining
  reconciliation-feature pieces.

---

## 10. Next Step (pick up here next session)

1. **Decide on the Upcoming Pay Periods redesign** — the user's own words: too much
   scrolling, too data-dense, doesn't feel like a native mobile app. Needs its own design
   conversation (what's the minimal useful view? collapsed by default? swipeable? a different
   card format entirely?) before writing any code — same disciplined approach used for
   `needsReview` and `fundingModel`.
2. Alternatively: continue the "current state" reconciliation concept (full mid-cycle
   onboarding review, or the end-of-cycle "Did you get paid?" confirmation flow).
3. Lower priority: consolidate duplicate date-equality logic, consider a real Dialog
   component now that three modal-style patterns exist, `noUnusedLocals`/`noUnusedParameters`.

**Standing lessons/habits to keep in mind going forward:**
- With `--src-dir`, `proxy.ts` goes in `src/`, not `apps/web/` root.
- Always run `npx prisma generate` after schema changes AND fully restart the dev server.
- Clear `apps/web/.next` (and `.turbo`) if a correct-looking file still errors — but confirm
  the file's real content on disk before assuming it's still a cache problem.
- Quote bracket-named folders (`[id]`) in shell commands.
- Confirm `pwd` before path-sensitive commands — `node_modules` lives at the monorepo root.
- Commit real bug fixes immediately once confirmed working.
- **Run a full `npm run build` locally before every commit/merge to `main`.**
- Next.js 16 App Router dynamic route handlers need `request: NextRequest` — the exact type —
  as the literal first parameter, even if unused.
- Never feed a function a fabricated substitute for a value it treats as authoritative.
- When two real-world behaviors are legitimate but mutually exclusive, add an explicit stored
  user choice — don't try to infer or guess.
- A silently-swallowed typo in an object key produces no error anywhere, just a
  wrong-but-plausible fallback.
- When replacing a block of code, confirm the old version is actually deleted, not left
  running alongside the new one.
- Scope reconciliation-style or structural-change features precisely before building.
- **Giving users a way to correct their own data (an edit modal) can resolve what looks like
  a code bug but is actually just bad input** — worth building general-purpose edit
  capabilities early, since they double as debugging tools during testing.