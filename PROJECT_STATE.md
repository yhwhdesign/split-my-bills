# Split My Bills — Project State

> Living document. Update the **Current Status** and **Session Log** sections as we work.
> Keep this file in the repo root and commit it after every session.

---

## 1. Project Summary

An EveryDollar-style budgeting app called **Split My Bills** — a paycheck-to-paycheck focused
budget/coaching app that works across mixed pay frequencies for multiple household earners,
built for people who don't have the time (or won't take the time) to manage their finances
properly.

**This was an extremely dense, high-stakes root-cause debugging session** (9/3–9/4, spanning
past midnight), triggered by real split-payment dates being wrong/duplicated for months. The
session's real discipline: **verify every claim against real SQL data before moving on** —
several root causes were found this way, and one genuine Claude arithmetic mistake was also
caught and corrected mid-session by the user pushing back and asking for real data instead of
accepting an explanation.

---

## 2. Guardrails / Constraints (do not violate)

- **Net-zero cost.** No billing surprises, ever.
- **Version control via GitHub.** Feature branches, merged via PR into `main`. Never commit
  directly to `main`.
- **Monorepo** (Turborepo). Deployed on Vercel. Local dev and production share the SAME Neon
  database.
- Manual bill entry + user-initiated statement upload only — no Plaid.

**Critical conventions, reinforced hard this session:**
- Always run `npx prisma generate` after schema changes AND fully restart the dev server.
  **"Already in sync" from `migrate dev` can mean the database is fine but the generated
  Prisma Client is stale** — if TypeScript errors reference fields that are genuinely in the
  schema, run `npx prisma generate` explicitly before assuming something else is wrong.
- **Run `npm run build` locally before every commit/merge to `main`.**
- **ALL date-component reads/writes must consistently use UTC methods
  (`Date.UTC`/`.getUTC*()`/`.setUTC*()`) everywhere in the codebase** — not just in one
  "already fixed" file. This session found a second file (`apps/web/src/lib/split-bill.ts`)
  with its own local-timezone date math that an earlier "fix the shared package" pass had
  completely missed. **After any date-logic fix, grep the WHOLE codebase, not just the file
  you were working in.**
- **An application-level "check-then-create" pattern is NOT a real fix for a race
  condition.** This session proved it directly: Next.js dev mode can genuinely double-invoke
  requests, defeating a simple existence-check. Only a real **database unique constraint**
  makes duplicate creation structurally impossible.
- **Never auto-delete financial data based on a heuristic guess** (from a prior session,
  reinforced again this session by staying disciplined about it).
- **Verify date-sequence arithmetic carefully against the real stored anchor before declaring
  data wrong.** Claude made a real math error mid-session, incorrectly flagging correct data
  as broken — caught only because the user pushed back and asked for the real numbers again.
- When a user says a number still doesn't match their real-world expectation, **keep asking
  clarifying questions and looking at real data** rather than defending the current
  explanation.
- Large code/JSON pastes and file uploads consistently come through **empty** on Claude's
  end — reliable workarounds: plain-text paste (split into 2 messages if very long) or
  screenshots.

---

## 3. Tech Stack (decided)

| Layer | Choice | Notes |
|---|---|---|
| Monorepo tool | **Turborepo** | |
| Backend | Next.js API routes | |
| Frontend | **Next.js, built as a PWA** | |
| UI components | **shadcn/ui** | Custom overlays, no Dialog component |
| Database | Postgres via Neon | |
| ORM | **Prisma 7** | |
| Auth | Self-rolled: bcrypt + `jose` JWT | |
| AI Provider | Ollama (dev) / Gemini Flash-Lite governed (prod) | |

---

## 4. Data Model (current)

```
User
 └─ id, name, email, pay_schedule, payday_anchor_date, lastReviewedMonth (NEW)

IncomeSource
 └─ id, user_id, name, amount, frequency, next_pay_date

Bill
 └─ id, user_id, name, amount, due_date, category,
    is_recurring, splittable, min_split_amount,
    funding_model ("BEFORE_DUE" default | "NEXT_CHECK")

Payment
 └─ id, bill_id, amount, paidAmount (NEW), paid_date, status,
    is_split_payment, split_group_id, is_late
 └─ @@unique([billId, paidDate, isSplitPayment])  (NEW — prevents duplicate splits at the DB level)
```

**`User.lastReviewedMonth`** (new this session): server-persisted tracking of whether the
proactive "new month, review overdue bills" check-in has been shown — replaces an earlier
`localStorage`-based approach, so it survives browser data clears and works correctly across
devices. `GET`/`PATCH /api/user/me` both updated to support it.

**`Payment.paidAmount`** (added a prior session, confirmed working): lets a split leg's
actual paid amount differ from its planned amount — `SplitLegPayModal` + a fixed
`POST/DELETE /api/payments/[id]/pay` (an earlier version of this route had its logic
literally reversed — `POST` was un-marking payments and `DELETE` wasn't clearing amounts;
found and fixed this session).

**`Payment`'s new unique constraint** is the real, structural fix for a duplicate-split-leg
bug that had been silently corrupting data across multiple sessions.

---

## 5. AI Design Principle

The rules engine computes numbers. The LLM only explains/prioritizes those numbers in plain
English — it does not do the math.

---

## 6. Build Phases

- [x] **Phase 0-3.5, Phase 5 (PWA core)** — complete, deployed, verified live.
- [ ] **Phase 6 — Visual Design System & Polish** — in progress. Hero card redesign
  (previous session) and Bills-list current-cycle scoping (this session) both shipped. Still
  open: Upcoming Pay Periods mobile redesign.
- [ ] **Phase 4, Phase 7** — not started.

---

## Recently Fixed / Built (2026-09-03/04 session — deep split-payment root-cause debugging)

**Root cause chain, each step verified against real SQL data before moving to the next:**

1. **The repair path (`regenerateSplitsIfNeeded`, used when toggling `splittable` off/on)
   called `createBillSplit()`** — a function that blindly targets "today's calendar month"
   with zero awareness of existing paid history — **instead of `ensureRecurringSplits()`**,
   which correctly looks at what's already been funded and advances past it. Fixed:
   `regenerateSplitsIfNeeded()` now calls `ensureRecurringSplits()`.

2. **Even after that fix, dates still drifted wrong.** Found: `ensureRecurringSplits()`'s own
   forward-walking loop used `.setMonth()`/`.getMonth()` (LOCAL timezone) instead of UTC
   equivalents. On a non-UTC local dev machine, a UTC-midnight date's *local* calendar day can
   be a day earlier than its UTC day — and JavaScript's `Date.setMonth()` silently **rolls
   over** into a later month when the local day-of-month (e.g. 31) doesn't exist in the target
   month (e.g. September has no 31st). This exact mechanism — not random bad luck — is what
   caused split cycles to drift/skip across multiple prior sessions. Fixed: every date
   mutation in `split-bill.ts` converted to `setUTCMonth`/`getUTCMonth`/`setUTCDate`.

3. **Duplicates STILL appeared after that fix.** Root cause: an earlier app-level "check if a
   row already exists before creating" idempotency guard was genuinely insufficient — Next.js
   dev mode can (and does) double-invoke requests, defeating a simple existence-check before
   either request's write completes. **Fixed properly with a real database constraint**:
   `Payment` now has `@@unique([billId, paidDate, isSplitPayment])`. Generation code now
   attempts the create and gracefully treats a Prisma `P2002` unique-violation as "a
   concurrent request already handled this," not an error. This makes duplicate creation
   **structurally impossible**, not just discouraged.

**A real Claude mistake, caught by the user:** mid-session, Claude incorrectly told the user a
correctly-generated payday pair was wrong (claimed a Nov-1 occurrence's funding pair should
include 10/2, when the correct pair is actually 10/16+10/30). This caused real, unnecessary
alarm and re-checking of otherwise-correct data. Caught only because the user pushed back and
asked to verify against real numbers rather than accept the explanation.

**A genuine, deeper, NOT-yet-solved design gap, surfaced directly by the user:** because
biweekly pay produces 26 paydays/year but bills cycle 12x/year (24 payday-slots needed for
2-leg splits), **some real payday is mathematically guaranteed to go unused** if each bill's
split is computed independently of every other bill. The app's actual premise is that a
3rd/5th "extra" paycheck should be a rare, *flagged* exception (matching the existing
3PD/5PD badge concept) — not something that silently happens as a side effect of per-bill
date math. This needs real **cross-bill coordination** of payday funding, not just per-bill
arithmetic. **Explicitly scoped as its own future dedicated design session — not attempted
this session.**

**Bills list scoped to the current cycle only:** previously showed every split group ever
generated for a bill (all history, all future pre-generated cycles, mixed together) — nearly
unreadable, and made it impossible to visually spot real bugs. Fixed: `GET /api/bills` now
computes `currentSplitGroupId` (the group funding *this* cycle) and `previousSplitGroupId`
(the prior cycle's group, but *only* if it's still unpaid) for each split bill. The Bills list
now filters legs down to just these — normally one pair, occasionally two if something's
still unresolved from last cycle. This was the user's own idea, framed correctly as "the
right first step to make the underlying math actually verifiable," not a cosmetic nice-to-have.

**Clarified the real scope of the proactive month-transition flow**, after real
back-and-forth misunderstanding: **there is no manual "reset" step needed anywhere in the
underlying logic** — paid status is already occurrence-based and naturally stops matching
once a new month's occurrence arrives, with zero code required. The only missing piece was
ever the proactive *nudge*: on a new month, if bills are still overdue, show a modal walking
through them one at a time (Paid / Not yet) before considering the month "reviewed." User
explicitly does NOT want this forced/blocking — wants it offered, and wants the "have we
already shown this for this month" tracking to be **server-persisted**, not
`localStorage`-based (so it survives browser data clears, works across devices).
`User.lastReviewedMonth` (new DB field, migrated) + updated `GET`/`PATCH /api/user/me` are
built. **The frontend still needs to be swapped from its old `localStorage` calls to this new
API — explicitly the next step, not yet done.**

---

## Previously Fixed (2026-08-30 session and earlier)

Full multi-income refactor, timezone-consistency pass on the shared package (later found to
be incomplete — see above), "paid a different amount" for non-split bills, Quick Spend,
`needsReview` uncapped lookback, split-bill `isOverdue` group-matching, the full hero card
redesign.

---

## Known Gaps — Actively Being Worked

- **Frontend month-review flow still uses `localStorage`, not the new server-persisted
  `lastReviewedMonth` field.** This is the explicit next step.
- **Cross-bill payday coordination** so a real paycheck is never silently unused — a genuine,
  deeper design gap, deliberately deferred to its own future session.
- **Upcoming Pay Periods card still needs a mobile UX redesign.**

---

## Future / Backlog

- **Swap the month-review flow's tracking from `localStorage` to `lastReviewedMonth`** (API
  already built) — immediate next step.
- **Design and build cross-bill payday coordination** so 3rd/5th "extra" paychecks are a
  genuine, correctly-flagged rarity rather than an artifact of independent per-bill math.
- **Confirm the month-review modal correctly handles split bills** (it predates today's
  split-`isOverdue` fixes — worth a direct test).
- Upcoming Pay Periods mobile redesign.
- The remaining "current state" reconciliation pieces (full mid-cycle onboarding review).
- Consolidate duplicate date-equality logic across files.
- Previously logged, unchanged: push notifications, spending trend charts, calendar
  visualization, collapsible add-forms, further hamburger-menu settings, email
  payment-confirmation scanning, dashboard-as-hub restructuring, security hardening, a real
  shadcn Dialog component.

**Design Direction**: BillOut + 1Bill + EveryDollar + Rocket Money references, unchanged.

---

## 7. Current Status

**Phase:** Phases 0–3.5, Phase 5 core all complete, deployed, verified live. Phase 6 in
progress.

**2026-09-03/04 session (very long, high-stakes root-cause debugging):** Found and fixed a
chain of three real, compounding bugs behind months of wrong/duplicated split-payment dates —
the repair path calling the wrong function, a local-vs-UTC month-rollover bug in a
previously-unaudited file, and a race condition that an earlier app-level fix had failed to
actually close (now closed with a real database constraint). Caught and corrected one genuine
Claude arithmetic mistake mid-session via user pushback and real-data verification. Scoped the
Bills list down to show only the current (and, if unresolved, previous) split cycle instead of
all history — making the app's data verifiable at a glance. Clarified and began building the
real scope of the proactive month-transition flow (a nudge, not a forced reset), with
server-persisted tracking now in place. Surfaced a genuine, deeper design gap (cross-bill
payday coordination) that's real but deliberately out of scope for tonight.

**Known real gaps, next up:** finish wiring the month-review flow to the new
`lastReviewedMonth` field (frontend swap only — backend is done), then decide whether to
tackle cross-bill payday coordination or the Upcoming Pay Periods redesign next.

**Next: swap `localStorage` calls in `dashboard/page.tsx` for `GET`/`PATCH /api/user/me`'s
`lastReviewedMonth` field, then test the full month-review flow end to end with real split
bills.**

**Last updated:** 2026-09-04

---

## 8. Decision Log

| Date | Decision | Reasoning |
|---|---|---|
| 2026-08-30 | Dropped automatic stale-split-group cleanup entirely | Caused a real regression deleting legitimate unpaid data |
| 2026-09-03 | Replaced an app-level "check-then-create" duplicate guard with a real DB unique constraint | The app-level check was proven insufficient against genuine concurrent/overlapping requests |
| 2026-09-03 | Bills list scoped to current (+ previous-if-unresolved) split cycle only | Makes the app's real data verifiable at a glance instead of buried in a wall of mixed history — explicitly the right first debugging step, per the user |
| 2026-09-03 | Month-transition flow is a proactive, dismissible NUDGE with server-persisted "already shown" tracking, not a forced reset | No underlying reset is actually needed (paid status is already occurrence-based); user explicitly wants to be asked, not forced, and wants tracking to survive browser/device changes |
| 2026-09-03 | Cross-bill payday coordination (so a real paycheck is never silently wasted) is scoped as its own future dedicated session | Genuinely deep, cross-cutting design work — not safe to attempt hastily alongside everything else this session |

---

## 9. Session Log

*(Full history through 2026-08-30 preserved in prior version of this document.)*

- **2026-09-03/04**: Extremely dense, high-stakes real-data debugging session. Found and fixed
  three compounding root causes behind months of wrong/duplicated split-payment data (wrong
  repair function, a local-timezone month-rollover bug in a file an earlier UTC audit had
  missed, and a race condition finally closed with a real DB constraint instead of an
  app-level guess). Corrected one genuine Claude math error mid-session after user pushback.
  Scoped the Bills list to show only the current/unresolved-previous split cycle. Clarified
  the real, narrower scope of the month-transition proactive nudge (no reset needed, just a
  dismissible check-in) and built its server-persisted tracking field + API. Surfaced a real,
  deeper cross-bill payday-coordination gap, deliberately deferred to a future session.
  **Left open:** wiring the frontend to the new `lastReviewedMonth` field (backend done), and
  the cross-bill coordination design work.

---

## 10. Next Step (pick up here next session)

1. **Swap `localStorage` calls in `dashboard/page.tsx`'s month-review `useEffect` and close
   handler for real `GET`/`PATCH /api/user/me` calls** using the new `lastReviewedMonth`
   field — the API side is already built and working.
2. **Test the full month-review flow end to end**, including split bills specifically (it
   predates the split-`isOverdue` fixes from a couple sessions back).
3. **Decide next major focus**: cross-bill payday coordination (the deeper 3PD/5PD design
   gap) vs. the Upcoming Pay Periods mobile redesign.

**Standing lessons/habits to keep in mind going forward:**
- Always run `npx prisma generate` after schema changes AND fully restart the dev server —
  "Already in sync" can mean the DB is fine but the Prisma Client is stale.
- **Run a full `npm run build` locally before every commit/merge to `main`.**
- **ALL date logic must consistently use UTC methods, in every file with its own date math**
  — not just the one file you last "fixed." Grep the whole codebase.
- **An application-level "check-then-create" pattern does not fix a race condition** — only a
  real database constraint does.
- **Never auto-delete financial data based on a heuristic guess.**
- **Verify date-sequence arithmetic against the real stored anchor before declaring data
  wrong** — Claude got this wrong once this session; real data settles it, not confident-
  sounding math.
- When a user says a number still doesn't match reality, keep asking and looking at real
  data rather than defending the current explanation.
- Large pastes/uploads often come through empty — use plain text (split if needed) or
  screenshots instead.

---

## Addendum — 2026-09-04, later in session (reconciliation flow completed and verified)

**Finished wiring the month-review flow to the server-persisted field, and found/fixed two
more real gaps in the process:**

- **Gating bug**: the review modal was checking `userLastReviewedMonth !== currentMonth` to
  decide whether to show — meaning once a month was marked reviewed (even from an earlier,
  incomplete test pass), it stayed permanently suppressed for the rest of that month, even if
  a *new* unresolved item appeared later. **Fixed**: the trigger no longer checks the month
  flag at all — it simply shows whenever an unresolved list is non-empty
  (`isOverdue || previousMonthUnpaid || previousSplitGroupId`), which is self-correcting since
  a genuinely resolved list is empty.

- **A second real reconciliation gap, found via direct testing**: a non-split bill due late in
  the month (e.g. the 25th) could have its *prior* month's occurrence silently "age out" the
  moment the calendar rolled to a new month — `isOverdue` only ever checks the *current*
  month's occurrence, so a bill not yet due this month reports `isOverdue: false` even if last
  month's occurrence was never paid. **Fixed**: added `previousMonthUnpaid` to
  `GET /api/bills` for non-split bills (split bills were already covered by
  `previousSplitGroupId`), with a guard (`b.createdAt < startOfCurrentMonth`) so brand-new
  bills are never false-flagged. The guard went through one real correction: an initial
  stricter version (bill must exist *before its own due date*) incorrectly excluded a real
  bill the user wanted flagged — it had been added a few days *after* its due date had
  already passed, which is a completely normal real-world case, not one that should suppress
  the check.

- **`MonthlyReviewModal`'s `onClose` now takes a boolean** (`allResolved`) — only `true` if
  every single card in that pass was answered "Paid." Any "Not yet," or closing early via the
  X button, passes `false`, so the month is only marked reviewed once genuinely everything is
  confirmed paid — not just "acknowledged."

- **Added consistent visual indicators for all three unresolved states** — `isOverdue`,
  `previousMonthUnpaid`, `previousSplitGroupId` — across three places that previously only
  reacted to `isOverdue` alone: the bill row (red icon + bold red name), the hero card's
  overdue count, and the "N bills past due" modal's list.

- **Confirmed end-to-end with a real bill** (Central Ark Water, due the 25th, never paid in
  August): correctly triggered `previousMonthUnpaid`, showed red/bold in the Bills list, was
  correctly counted in the hero card, and correctly triggered the review modal — which
  reappeared on refresh after answering "Not yet," confirming the persistence logic works as
  intended.

**Explicit TODO logged for a future session, not urgent:** the user wants to do a careful,
unhurried review of the hero card's Total Bills and Remaining box logic/output — not because
anything is known to be broken, but to verify the math is genuinely correct given how much has
changed underneath these figures across several sessions, rather than assume it still is.

**Last updated:** 2026-09-04 (end of session)

---

## Addendum — 2026-09-06 (the "file never saved" saga, and the real fix that resulted)

**A single fix took an extremely long time to verify — not because the fix was wrong, but
because the edited file was never actually saved to disk.** Every diagnostic tried along the
way was legitimate and correctly executed: service worker unregistration, browser cache
clearing, killing the Turborepo daemon, checking for duplicate running processes, a completely
fresh `git clone` into a separate folder, and finally a raw `curl` request that bypassed the
browser entirely. Every single one correctly reported "still broken," because the file
genuinely didn't have the fix yet — no amount of environment-level debugging could have found
that. **The one test that finally proved it: `grep -c "known-new-string" path/to/file.ts`, run
directly in the terminal, completely bypassing the editor.**

**New standing rule, added to the top of the lessons list**: whenever a fix "looks right" in
every paste and passes a clean build, but still doesn't take effect anywhere, the FIRST
diagnostic step — before touching servers, caches, browsers, or processes — should be a raw
`grep`/`cat` of the file straight from disk. This should be step one, not the last resort
after hours of everything else.

**A second, smaller lesson from the same night**: `git status` revealed an unrelated file
(`apps/web/src/app/api/bills/[id]/route.ts`) had been accidentally overwritten with the wrong
route's content at some point — caught only because `git status`'s full file list was read
carefully before committing, rather than running `git add .` blindly. Fixed with
`git checkout -- <file>` to restore it from the last good commit. Reinforced habit: always
review the complete `git status` file list before committing after a long multi-file session,
and use `grep -c` on each changed file as a final sanity check when trust has been shaken.

**The actual fix, once verified**: `POST /api/bills/[id]/pay` now accepts an optional
`occurrenceDate` in its request body — if provided, it marks THAT specific date's occurrence
paid instead of always defaulting to today's current cycle. This was the missing piece that
let the monthly review flow actually resolve a missed prior-month bill, instead of endlessly
re-flagging it (since marking "today's" occurrence paid did nothing to satisfy a check for a
different, earlier date). `GET /api/bills` also now exposes the exact `previousOccurrenceDate`
and `currentOccurrenceDate` for each bill, so the frontend knows precisely which date to
target. **Confirmed working end-to-end**: Central Ark Water's missed August occurrence was
correctly marked paid via the review modal, and did not reappear on refresh. Committed and
pushed to both `dev` and `main` for the first time all week (prior sessions' work had
accumulated locally without being pushed).

**Last updated:** 2026-09-06

---

## Addendum — 2026-09-07, next session begins

Picking up fresh (new day, explicit ask to move a bit faster while still learning
thoroughly). Next up, per the standing backlog: a careful, unhurried review of the hero
card's Total Bills and Remaining box logic/output — not a known bug, just verifying
correctness given how much has changed underneath these figures across sessions.


---

## Addendum — 2026-09-07 (real NEXT_CHECK split-funding bug found and fixed)

**Root cause, finally identified after a long, costly back-and-forth**: split-bill date
selection never accounted for `fundingModel`. A `NEXT_CHECK` bill is meant to be funded by
whatever real paychecks land within its own current month — even if that's technically after
its numeric due date — but the code always used the same backward-looking logic as
`BEFORE_DUE` bills, incorrectly pulling prior-month paydays for early-due-date `NEXT_CHECK`
bills. This was only correctly identified after the user repeatedly and correctly pushed
back that "the paydays drive when bills get paid, not the due date" — a real, previously
unaccounted-for distinction, not the "this is mathematically unavoidable" explanation given
several times earlier (which was true for `BEFORE_DUE`, but wrong for `NEXT_CHECK`).

**The fix required two consistent halves — a real near-miss caught by the user's own sharp
question ("won't this break late detection?"):**
1. **`pickSplitDatesForCurrentMonth()`** (new, shared package) — used only for `NEXT_CHECK`
   bills, picks real paydays within the bill's own current calendar month instead of before
   its due date.
2. **`occurrenceFundedByGroup()`** (new, shared package, `fundingModel`-aware) — used
   **identically** by both `ensureRecurringSplits()` (generation) and `GET /api/bills`
   (overdue detection) to interpret which cycle a group's dates belong to. Fixing only #1
   without #2 would have made the app silently misattribute `NEXT_CHECK` groups to the wrong
   month and miss real late bills — exactly the failure the user was right to flag before
   either half was applied.

**Files changed (all full-file replacements, given the day's trust issues)**:
`packages/shared/src/index.ts`, `apps/web/src/lib/split-bill.ts`,
`apps/web/src/app/api/split-suggestions/route.ts`, `apps/web/src/app/api/bills/route.ts`.

**A costly same-day detour, fully reverted**: an earlier attempt at a "global reset" system
(`User.currentCycleStartedAt`, redefining "paid" as "created since cycle start") was built,
found to instantly break ALL pre-existing payment history the moment it deployed (since
`cycleStart` defaults to migration-time, and nothing created before that could ever match),
and was fully reverted back to the proven date/occurrence-based system. The
`currentCycleStartedAt` field may still exist unused in the schema — not deleted, just no
longer called from anywhere.

**Real test-data contamination found and cleaned**: ~25 `Payment` rows across September were
created in one continuous ~90-second window (one per second) — the unmistakable signature of
an old batch/test script, not real clicks. Given the scale of accumulated test debris across
many days of development, the user ultimately chose to wipe the entire `Payment` table (bills
and income sources untouched) to start genuinely clean. A follow-on bug from that wipe
(`previousMonthUnpaid` firing for every bill since none had any paid history to compare
against) was found and fixed — it now requires at least one real `PAID` record to exist
before it can ever fire.

**Real lesson for future sessions**: when a user keeps rejecting the same explanation after
multiple attempts, stop repeating it and actively look for a genuine distinction in their
requirements that hasn't been accounted for yet, rather than assuming they simply haven't
understood. This session's multi-hour loop was caused by exactly that mistake.

**Last updated:** 2026-09-07