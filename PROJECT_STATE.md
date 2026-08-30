# Split My Bills — Project State

> Living document. Update the **Current Status** and **Session Log** sections as we work.
> Keep this file in the repo root and commit it after every session.

---

## 1. Project Summary

An EveryDollar-style budgeting app called **Split My Bills** — a combined
financial-coaching / budget / savings-potential app to help people who don't have the time
(or won't take the time) to manage their finances properly.

**User's explicit current priority**: get the app's core logic ("the bones") fully solid and
non-confusing before the next real payday (9/4), so a genuinely clean month can run starting
then. New features can come after — correctness matters more right now.

This was an extremely long, two-block real-world-use session. The first block fixed several
deep date/timezone bugs discovered through actual daily use. The second block was a full,
heavily-iterated redesign of the hero card's numbers, which surfaced (and fixed) several more
real bugs — including one genuine regression that was caught and reverted before it caused
lasting damage.

---

## 2. Guardrails / Constraints (do not violate)

- **Net-zero cost.** No billing surprises, ever.
- **Version control via GitHub.** Feature branches, merged via PR into `main`. Never commit
  directly to `main`.
- **Local dev must behave like it's live.** Built in VS Code. PWA distribution.
- **Monorepo** (Turborepo). Deployed on Vercel.
- Local dev and production share the SAME Neon database — wipe via Neon's SQL editor after
  test sessions.
- Manual bill entry + user-initiated statement upload only — no Plaid.

**Critical conventions learned the hard way:**
- Every Next.js 16 dynamic route handler needs `request: NextRequest` (exact type) as the
  literal first parameter, even unused.
- Always run `npx prisma generate` after schema changes AND fully restart the dev server.
- **Run `npm run build` locally before every commit/merge to `main`.**
- The generated Prisma client isn't committed to git — `postinstall: "prisma generate"`
  handles it. Watch for accidental duplicate JSON keys in `package.json` — they silently
  resolve to whichever the parser picks, no error.
- `vercel --prod` via CLI needs an explicit `.vercelignore` — doesn't reliably respect
  `.gitignore` alone.
- **This project's single most recurring bug class: forward-only date logic used where
  "current cycle, whether past or future" logic was needed.** `getCurrentOccurrence()` is
  almost always the right tool.
- **ALL date-component reads/writes must consistently use UTC methods** (`Date.UTC`,
  `.getUTC*()`, `.setUTC*()`) — never mixed with local methods (`.getFullYear()`, etc.), even
  after a "deep fix" is applied to one file. **Check every file that consumes a fixed
  function's output, not just the function itself** — a mid-session regression this session
  happened exactly this way (the shared package was fixed, two route files that read its
  output weren't, and paid-checkboxes silently stopped working).
- **Never auto-delete financial data based on a heuristic guess**, no matter how confident it
  seems — a real regression happened this session from exactly that (see Known Gaps/history).
- **A manual-entry budgeting app's numbers are only as good as what's actually logged.** A
  "wrong-feeling" total is often a real data-completeness gap (untracked spending), not a
  code bug — confirmed directly this session.
- When a scoping decision trades correctness for speed (e.g. "exclude split bills for now"),
  expect to be asked to close that gap once real money stops being counted — happened twice
  this session (paid-different-amount factoring, and "Actual so far").

---

## 3. Tech Stack (decided)

| Layer | Choice | Notes |
|---|---|---|
| Monorepo tool | **Turborepo** | |
| Backend | Next.js API routes | |
| Frontend | **Next.js, built as a PWA** | |
| UI components | **shadcn/ui** (indigo/violet accent) | No Dialog component — custom overlays |
| Database | Postgres via Neon | Free tier |
| ORM | **Prisma 7** | Client auto-generated via `postinstall` |
| Auth | Self-rolled: bcrypt + `jose` JWT, httpOnly cookies | |
| AI Provider (dev/prod) | Ollama / Gemini Flash-Lite (governed) | |

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
```

`Bill.isRecurring` is now genuinely respected everywhere. `Payment.amount` can differ from
`Bill.amount` (used by "paid a different amount," non-split bills only so far).

---

## 5. AI Design Principle

The rules engine computes numbers. The LLM only explains/prioritizes those numbers in plain
English — it does not do the math.

---

## 6. Build Phases

- [x] **Phase 0-3.5** — complete, deployed, verified live.
- [x] **Phase 5 — PWA Polish (core)** — complete, verified on a real iPhone.
- [ ] **Phase 6 — Visual Design System & Polish** — in progress. **Major hero card
  redesign shipped this session** (see below). **Still open, flagged repeatedly by user**:
  the Upcoming Pay Periods card needs a mobile UX redesign (too data-dense, too much
  scrolling).
- [ ] **Phase 4, Phase 7** — not started.

---

## Recently Fixed / Built (2026-08-30 session — very long, two major work blocks)

### Block 1 — Date/timezone deep-dive (triggered by first real-world-use bugs)

- **Deployment fixes**: Vercel Prisma-client generation (`postinstall` script, after a
  duplicate-JSON-key false start), `.vercelignore` for CLI upload size limits.
- **`getUpcomingPayDates()` fixed to retreat BACKWARD from any anchor** (past or future) to
  find the true most-recent payday — previously a perfectly normal future-dated "next pay
  date" broke period boundaries entirely, for any pay frequency.
- **Full UTC consistency pass across `packages/shared/src/index.ts`** — every function that
  builds or reads a calendar day now uses `Date.UTC`/`.getUTC*()`/`.setUTC*()` consistently,
  fixing the root cause of local-dev-vs-Vercel-production "midnight" mismatches that were
  producing duplicate/mismatched `PAID` rows throughout the whole bill list.
- **`calculatePayPeriods()` now always includes a bill's CURRENT cycle occurrence** as a
  placement candidate (not just future ones) — fixes overdue bills being simultaneously
  invisible to every period AND to `needsReview` (a real gap between the two systems).
- **`findUnresolvedOccurrences()` now excludes split bills** — it always reported a split
  bill's full amount, which is wrong for a partial leg; split bills have their own correct
  per-leg mechanism already.
- **Regression found and fixed same session**: after the deep UTC fix, two API route files
  (`GET /api/bills`, `POST`/`DELETE /api/bills/[id]/pay`) still read the now-UTC-anchored
  `getCurrentOccurrence()` output using local (non-UTC) getters, silently breaking every
  paid-checkbox. Fixed by converting the remaining local getters in both files.
- **A real regression, caught and reverted**: an automatic "stale split group" cleanup
  attempt deleted legitimate unpaid split-leg data (conflated old bug debris with a
  legitimately-reachable old cycle the user had just un-paid). Immediately reverted;
  **decision made to never attempt automatic financial-data cleanup again.**

### Block 2 — Hero card full redesign (extensive live iteration with user)

- **Income box**: big number = real sum of every upcoming paycheck through Dec 31 (not a
  smoothed average); small number = full current calendar month's expected income (correctly
  fluctuates on 3-paycheck months, works across all 4 pay frequencies combined).
- **Total Bills box**: big number = "Total Bills This Month" (sum of every *recurring* bill's
  full amount; Quick Spend one-offs excluded); sub-line 1 = clickable "Due before next
  payday" (combines currentPeriod bills + needsReview items into one honest total, opens a
  modal listing them); sub-line 2 = clickable "N bills past due" (opens a modal listing them)
  or a green checkmark.
- **Remaining box**: big number = "Projected Remaining" through the last payday of next
  month (summed across periods); small lines = "This payday to next" (tight single-period
  figure) and "Actual so far" (real money left this period — correctly scoped to only count
  payments whose date falls within the CURRENT period's own boundaries, and correctly
  **includes paid split legs**, summed individually by their own paid status/date).
- **Real user pushback that improved the design**: split bills were initially excluded from
  "Actual so far" as a speed/safety scoping call — the user correctly rejected this, since
  excluding real paid money makes the number wrong, not appropriately cautious. Fixed.
- **Important non-bug finding**: after real-world math verification, the user found "Actual
  so far" doesn't match their real bank balance. Root cause: the app can only reflect money
  actually logged — the gap is real, untracked spending (gas, groceries, etc.) never entered
  via Quick Spend. This is inherent to manual-entry budgeting, not a code bug. Framed as: the
  number is a floor/minimum, not a full forecast; Quick Spend is the intended tool to close
  this gap by logging real spending as it happens.

---

## Previously Fixed (2026-08-23 through 2026-08-29 sessions)

Occurrence-based paid tracking, recurring split generation, `fundingModel`, the first "needs
review" feature, full bill/income editing, the multi-income-source refactor, bonus-paycheck
badges, "paid a different amount" (non-split bills), "Quick Spend."

---

## Known Gaps — Actively Being Worked

- **"Paid a different amount" doesn't yet work for split-bill legs** — the `PayBillMenu`
  Update Amount feature and the strikethrough display only apply to non-split bills right
  now. This is the explicitly agreed next task.
- **Upcoming Pay Periods card needs a mobile UX redesign.**
- **The broader "current state" reconciliation concept** (full mid-cycle onboarding review,
  end-of-cycle "Did you get paid?" confirmation) is still only partially built.

---

## Future / Backlog

- **Extend "paid a different amount" to split-bill legs** — next up, explicitly agreed.
- **A full deliberate walkthrough test** before 9/4: add one bill of each
  type/schedule/funding-model, mark paid various ways, verify every hero-card number reflects
  it correctly — user's stated goal of solid, non-confusing bones before the next payday.
- Upcoming Pay Periods mobile redesign.
- Full mid-cycle onboarding reconciliation flow, end-of-cycle "Did you get paid?"
  confirmation.
- Consolidate duplicate date-equality logic across files.
- Handle stale/historical split-payment rows in the UI if a bill accumulates split history
  across multiple cycles.
- Previously logged, unchanged: push notifications, spending trend charts, calendar
  visualization, collapsible add-forms, further hamburger-menu settings, email
  payment-confirmation scanning, dashboard-as-hub restructuring, security hardening (Zod
  validation, dependency scanning, `noUnusedLocals`/`noUnusedParameters`), a real shadcn
  Dialog component.

**Design Direction**: BillOut + 1Bill + EveryDollar + Rocket Money references, unchanged.

---

## 7. Current Status

**Phase:** Phases 0–3.5 fully complete, deployed, verified live. Phase 5 core complete.
Phase 6 in progress.

**2026-08-30 session (very long, two major blocks):** Fixed a deep chain of date/timezone
bugs discovered through real daily use — culminating in a full UTC-consistency pass across
the shared package, and catching a mid-session regression where two route files weren't
updated to match. Caught and reverted one real data-loss regression (automatic split-group
cleanup) before it caused lasting harm, and made a firm decision never to attempt automatic
financial-data cleanup again. Then did a full, heavily-iterated redesign of the hero card's
three number boxes (Income, Total Bills, Remaining), each now showing a genuine longer-horizon
projection plus real, current sub-figures — fixing several more real bugs along the way,
including split bills being wrongly excluded from "Actual so far." Confirmed, through real
user math-checking, that a remaining discrepancy between the app's numbers and real bank
balance is a genuine data-completeness gap (untracked spending), not a code bug.

**Known real gaps, next up:** extend "paid a different amount" to split-bill legs, then do a
full deliberate walkthrough test before the 9/4 payday reset.

**Next: build split-leg support for "paid a different amount," then walk through every bill
type/scenario together to confirm the hero card is fully solid before 9/4.**

**Last updated:** 2026-08-30

---

## 8. Decision Log

| Date | Decision | Reasoning |
|---|---|---|
| 2026-08-23 | Occurrence-based paid tracking distinct from forward-only due-date projection | Different questions |
| 2026-08-29 | Removed all "primary income" concepts | User explicitly rejected any income hierarchy |
| 2026-08-30 | Dropped automatic stale-split-group cleanup entirely, will not attempt again | Caused a real regression deleting legitimate unpaid data; too risky to automate reliably |
| 2026-08-30 | Full UTC-consistency pass across the shared package, rather than more targeted patches | Targeted patches kept missing new spots; the underlying inconsistency needed a real, complete fix |
| 2026-08-30 | Hero card redesigned around real, current, longer-horizon figures instead of smoothed averages | User wanted honest projections (real sums through concrete dates) rather than statistical smoothing that didn't match any real period |
| 2026-08-30 | Split legs included in "Actual so far," reversing an earlier speed-scoping exclusion | Excluding real paid money makes a "how much do I have" number actively wrong, not safely conservative |
| 2026-08-30 | Accepted that remaining discrepancies between app totals and real bank balance are a data-completeness issue, not a bug to fix in code | Confirmed via the user's own real-world math check; inherent to manual-entry budgeting |

---

## 9. Session Log

*(Full history through 2026-08-29 preserved in prior version of this document.)*

- **2026-08-30 (very long session, two blocks)**: Block 1 — fixed a deep chain of
  timezone/date bugs from real daily use (Prisma/Vercel deploy fixes, `getUpcomingPayDates()`
  backward-retreat, full UTC consistency pass, `calculatePayPeriods()` current-occurrence
  inclusion, `needsReview` split-bill exclusion), catching and reverting one real data-loss
  regression along the way (automatic split-group cleanup). Block 2 — fully redesigned the
  hero card's three number boxes through extensive live iteration, fixing the "Due before
  next payday" double-counting bug, the "Actual so far" period-scoping bug, and the
  split-leg-exclusion gap in that same figure (reversed after direct user pushback).
  Confirmed a remaining real/app discrepancy is a data-completeness issue, not a bug. **Left
  open:** split-leg support for "paid a different amount," and a full pre-9/4 walkthrough
  test.

---

## 10. Next Step (pick up here next session)

1. **Build split-leg support for "paid a different amount"** — extend `PayBillMenu`'s Update
   Amount feature and the strikethrough display to work per-leg for split bills, matching the
   non-split behavior already built.
2. **Full deliberate walkthrough test before 9/4**: add one bill of each type (split/non-split,
   BEFORE_DUE/NEXT_CHECK, recurring/one-time), mark paid via every path (quick checkbox,
   Confirm Paid, Update Amount, per-leg), and verify every hero-card number updates correctly
   — the user's explicit goal of solid, non-confusing bones before the next payday.
3. Lower priority: Upcoming Pay Periods mobile redesign, the remaining reconciliation-feature
   pieces, consolidating duplicate date-equality logic.

**Standing lessons/habits to keep in mind going forward:**
- Always run `npx prisma generate` after schema changes AND fully restart the dev server.
- **Run a full `npm run build` locally before every commit/merge to `main`.**
- **ALL date logic must consistently use UTC methods — check every consumer of a fixed
  function's output, not just the function itself.**
- **Never auto-delete financial data based on a heuristic guess.**
- **A manual-entry budgeting app's numbers are only as good as what's actually logged** — a
  "wrong-feeling" total is often a data-completeness gap, not a bug.
- When a scoping decision trades correctness for speed, expect to close that gap once real
  money stops being counted.
- "Forward-only date logic used where current-cycle logic was needed" remains this project's
  single most recurring bug class.
- When file/document uploads come through empty, ask for plain-text paste or a screenshot
  instead of retrying the same upload method.