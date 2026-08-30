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
line up — the app makes that mismatch visible and manageable, modeling *how* a bill is funded
(`fundingModel`) and treating every income source in a household equally.

This session was the app's **first real day of daily use** — which surfaced (and got fixes
for) more real bugs than any prior session, plus two genuinely new features built directly
from that real usage.

---

## 2. Guardrails / Constraints (do not violate)

- **Net-zero cost.** Every service choice must have a genuinely free tier at our scale.
- **No billing surprises, ever.**
- **Version control via GitHub.** Feature branches, merged via PR into `main`. Never commit
  directly to `main`.
- **Local server must behave like it's live.**
- **Built in VS Code.**
- **Distribution: PWA, not native app stores.**
- **Monorepo** (Turborepo).
- **Deployment**: Vercel (free tier), `main` → production. Local dev and production share the
  SAME Neon database — wipe via Neon's SQL editor after test sessions.
- **How users get bill data in: manual entry + user-initiated statement upload only.**

**Important conventions learned the hard way:**
- Every Next.js 16 dynamic route handler needs `request: NextRequest` (exact type) as the
  literal first parameter, even unused.
- Always run `npx prisma generate` after schema changes AND fully restart the dev server.
- **Run `npm run build` locally before every commit/merge to `main`** — `next dev`'s compiler
  is more lenient and has repeatedly let real errors through.
- **The generated Prisma client is NOT committed to git.** `apps/web/package.json` has
  `"postinstall": "prisma generate"` so this happens automatically on every install. Watch
  for accidental **duplicate JSON keys** when editing `package.json` — they don't error, they
  just silently resolve to whichever the parser picks, which can make a fix look like it
  never applied.
- **`vercel --prod` via CLI does not reliably respect `.gitignore`.** An explicit
  `.vercelignore` (node_modules, .next, .turbo, .git) is required independently.
- **This project's single most recurring bug class: forward-only date logic used where
  "current cycle, whether past or future" logic was needed.** `getCurrentOccurrence()` is
  almost always the right tool when the real question is "what does this cycle currently
  owe" — never `projectBillDueDates()` or `nextOccurrenceOnOrAfter()`, which are correct only
  for "what's coming up next."
- **Local dev and Vercel production can disagree on what timezone "midnight" is in**, since
  date construction like `new Date(year, month, day)` depends on the server's local
  timezone. This causes the same logical due-date occurrence to be stored as two different
  timestamps a few hours apart depending on which environment handled the request. Fixed in
  the specific spots hit this session (paid-status matching) by comparing calendar-day
  components (UTC-normalized) instead of exact timestamp ranges — but the deeper, fully
  timezone-independent fix across the whole app is still real, separate future work.

---

## 3. Tech Stack (decided)

| Layer | Choice | Notes |
|---|---|---|
| Monorepo tool | **Turborepo** | |
| Backend | Next.js API routes | |
| Frontend | **Next.js, built as a PWA** | |
| UI components | **shadcn/ui** (indigo/violet accent) | No Dialog component — custom overlays built plainly with Tailwind |
| Database | Postgres via Neon | Free tier, scales to zero when idle |
| ORM | **Prisma 7** | Client auto-generated via `postinstall` |
| Validation | Zod | Installed, not yet wired into API routes |
| Auth | Self-rolled: bcrypt + `jose` JWT, httpOnly cookies | |
| Route protection | `src/proxy.ts` | |
| AI Provider (dev/prod) | Ollama / Gemini Flash-Lite (governed) | |
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

**`Bill.isRecurring` is now actually respected** (it existed in the schema for a long time but
was never checked anywhere until this session): `calculatePayPeriods()` only projects a
single current-cycle occurrence for `isRecurring: false` bills, instead of projecting forward
every month the way a normal recurring bill's due date does. This is what makes "Quick Spend"
entries genuinely one-time.

**`Payment.amount` can now differ from `Bill.amount`** — used by the "paid a different
amount" feature; the field always existed, it just wasn't used that way before.

---

## 5. AI Design Principle

The rules engine computes numbers. The LLM only explains/prioritizes those numbers in plain
English — it does not do the math.

---

## 6. Build Phases

- [x] **Phase 0-3.5** — complete, deployed, verified live.
- [x] **Phase 5 — PWA Polish (core)** — complete and verified on a real iPhone.
- [ ] **Phase 6 — Visual Design System & Polish** — in progress. Shipped this session: the
  combined bill-actions menu (`PayBillMenu`), the "paid different amount" visual treatment,
  the Quick Spend entry form. **Still open, flagged by user as a real UX problem**: the
  Upcoming Pay Periods card is too data-dense and scroll-heavy on mobile.
- [ ] **Phase 4, Phase 7** — not started.

**"Current state" reconciliation feature:**
- [x] Per-bill "needs review" detection — now uncapped (no arbitrary lookback limit).
- [ ] Full mid-cycle onboarding reconciliation flow — not built.
- [ ] End-of-cycle "Did you get paid?" proactive confirmation flow — not built.

---

## Recently Fixed / Built (2026-08-30 session — long, multi-part, first real-world-use day)

**Two deployment bugs:**
- Vercel builds failing (`Module not found: '@/generated/prisma/client'`) — the generated
  Prisma client isn't committed to git and nothing regenerated it on a fresh Vercel checkout.
  Fixed with a `postinstall: "prisma generate"` script (first attempt silently failed from a
  duplicate JSON `"scripts"` key).
- `vercel --prod` failing with "File size limit exceeded (100MB)" — `node_modules` was being
  included in the CLI upload despite `.gitignore`. Fixed with an explicit `.vercelignore`.

**Four related app-logic bugs, all the same root cause (forward-only date logic used where
current-cycle logic was needed):**
1. `planBillSplit()` — fixed to use `getCurrentOccurrence()` instead of
   `projectBillDueDates()[0]`, so a bill split after its due date has already passed this
   cycle no longer permanently skips that cycle's occurrence.
2. `ensureRecurringSplits()`'s "no split exists yet" fallback — same fix.
3. `findUnresolvedOccurrences()` (`needsReview`) — the one-pay-cycle lookback cap was
   **removed entirely** per the user's explicit real-world need ("I want the ability to mark
   things paid even IF they are before the previous cycle"); now uses `getCurrentOccurrence()`
   directly with no arbitrary "how far back" limit.
4. `isOverdue` for split bills — was comparing raw leg dates against the due date directly
   (impossible to ever resolve true, since legs are always dated *before* their due date by
   design). Fixed by grouping legs by `splitGroupId`, determining which occurrence each group
   actually funds, and checking whether the group funding the *current* cycle is fully paid.

**Repair path for bills corrupted by the old buggy logic**: toggle `splittable` off/on in the
edit modal. One repair attempt showed a stale/wrong month (July) — **parked as a
not-yet-investigated anomaly**, not chased at the end of a long session.

**Discovered a significant, previously-invisible timezone bug** while testing "paid a
different amount": local dev and Vercel production construct "midnight" using different
server-local timezones, so the same logical due-date occurrence gets stored as two different
timestamps ~5 hours apart depending on which environment handled the request. This explains a
pattern of near-duplicate `PAID` rows found throughout the whole bill list. Fixed in the
specific spots hit this session (day-matching in `GET /api/bills` and the dedup-delete in
`POST /api/bills/[id]/pay`) by comparing calendar-day components instead of exact timestamp
ranges — **the deeper, app-wide fix is real, separate future work, not done tonight.**

**Feature 1 — "Paid a different amount," fully built:**
- `POST /api/bills/[id]/pay` accepts an optional `amount` override, with day-level dedup so
  re-confirming or updating never creates duplicate `PAID` rows.
- `GET /api/bills` exposes `paidAmount`.
- Bills list now shows the budgeted amount struck through — red if paid *more*, green if paid
  *less* — next to the actual paid amount in that color.
- UI redesigned mid-session per the user's own instinct: replaced the separate pencil+trash
  icons with one 3-dot button opening `PayBillMenu` — four flat options (Edit Bill, **Confirm
  Paid** — one tap at the budgeted amount, **Update Amount** — a small sub-screen for a
  different amount, Delete Bill). The original single "Mark Paid" sub-screen was one tap too
  many for the common case; splitting it into a direct action plus a separate "update" path
  fixed that.

**Feature 2 — "Quick Spend," fully built:**
- Found and fixed a real prerequisite bug first: `Bill.isRecurring` existed in the schema but
  was **never actually checked anywhere** — even non-recurring bills projected forward every
  month. Fixed `calculatePayPeriods()` to respect it (a single current-cycle occurrence only,
  for non-recurring bills).
- A small dashed-border "Quick Spend" form at the top of the Bills card: name, amount, and a
  "this is recurring" checkbox. Always creates the bill and immediately marks it paid *today*
  (new `markPaidNow` flag on `POST /api/bills`). Unchecked, it never reappears. Checked, it
  becomes a real, ongoing recurring bill — exactly the auto-create behavior the user
  specified.

---

## Previously Fixed (2026-08-29 session — multi-income-source support)

Full multi-income refactor, no "primary income" anywhere. Bonus-paycheck badges. Full
income-source editing.

## Previously Fixed (2026-08-23 through 2026-08-28 sessions)

Occurrence-based paid tracking, recurring split generation, `fundingModel`, the first "needs
review" feature, full bill editing, final route-handler typing fix.

---

## Known Gaps — Actively Being Worked

- **New anomaly, not yet investigated**: toggling a bill's splittable status off/on to
  regenerate its splits showed the wrong month (July instead of August) in one real case.
- **The app-wide timezone-independence fix** (local dev vs. production constructing
  "midnight" differently) — patched at the two spots this session actually hit, not fixed
  everywhere date construction happens.
- **Upcoming Pay Periods card needs a mobile UX redesign.**

---

## Future / Backlog

- **Investigate the July/August splittable-toggle anomaly.**
- **Full timezone-independence pass** across all date construction in the app — the real,
  underlying fix behind tonight's targeted day-matching patches.
- **Extend "paid a different amount" to split-bill legs** (built for non-split bills only so
  far, per the original scope decision).
- **"All bills paid" quick-glance indicator** on the hero card — now that paid-status data is
  meaningfully more trustworthy after tonight's fixes, this is closer to buildable.
- **Full mid-cycle onboarding reconciliation flow** and **end-of-cycle "Did you get paid?"
  confirmation** — remaining pieces of the "current state" concept.
- **Upcoming Pay Periods mobile redesign.**
- **Consolidate duplicate date-equality logic** across files into one shared helper (this
  session added yet another one — worth doing this consolidation sooner rather than later).
- **Handle stale/historical split-payment rows in the UI** if a bill ever accumulates split
  history across multiple cycles.
- **Add a note/memo field to Quick Spend entries** — not built this session (would need a
  schema migration), a nice-to-have follow-up.
- Previously logged, unchanged: push notifications, spending trend charts, calendar
  visualization, collapsible add-forms, further hamburger-menu settings, email
  payment-confirmation scanning, budget-tracker checklist view, dashboard-as-hub
  restructuring, security hardening (Zod validation, dependency scanning,
  `noUnusedLocals`/`noUnusedParameters`), a real shadcn Dialog component.

**Design Direction**: BillOut + 1Bill + EveryDollar + Rocket Money references, unchanged.

---

## 7. Current Status

**Phase:** Phases 0–3.5 fully complete, deployed, verified live. Phase 5 core complete.
Phase 6 in progress.

**2026-08-30 session (long, first real-world-use day):** Fixed two deployment bugs and four
related app-logic bugs (all the same "forward-only date logic" root cause). Discovered a
significant timezone-mismatch bug between local dev and production during real testing, and
patched the specific spots it broke. Built two full features directly from real daily-use
feedback: "paid a different amount" (with a redesigned combined bill-actions menu) and "Quick
Spend" one-time expense logging (which required fixing a long-standing dormant bug —
`isRecurring` never being checked — as a prerequisite). Deliberately parked a new anomaly
(July/August month mismatch in the split-repair path) rather than chase it at the end of a
long session.

**Known real gaps, next up:** the July/August anomaly, the app-wide timezone-independence
fix, extending "paid a different amount" to split legs, and the Upcoming Pay Periods mobile
redesign.

**Next: investigate the July/August anomaly first, then decide between the timezone
deep-fix, split-leg amount overrides, or the Pay Periods redesign.**

**Last updated:** 2026-08-30

---

## 8. Decision Log

| Date | Decision | Reasoning |
|---|---|---|
| 2026-08-23 | Occurrence-based paid tracking distinct from forward-only due-date projection | Different questions: "which occurrence is paid" vs. "what's next" |
| 2026-08-27 | Scoped the reconciliation feature narrowly to "orphaned occurrences" only | Precise, buildable in one session |
| 2026-08-29 | Removed all "primary income" concepts | User explicitly rejected any income hierarchy |
| 2026-08-30 | Removed the one-pay-cycle cap on needsReview's lookback entirely | User's real-world need: any unresolved bill should be reachable, no matter how far back |
| 2026-08-30 | Redesigned the bill-actions menu mid-build: separate one-tap "Confirm Paid" from a distinct "Update Amount" sub-screen | The original single "Mark Paid" sub-screen was one extra tap for the common case where the amount matches budget |
| 2026-08-30 | Quick Spend always marks itself paid immediately; recurring is an explicit opt-in checkbox that creates a real ongoing Bill | Matches the actual mental model — logging something that already happened, with recurrence as a deliberate separate choice |
| 2026-08-30 | Patched the timezone mismatch at the specific spots it broke tonight, deferred the full app-wide fix | A comprehensive timezone rewrite is real, careful work that shouldn't be rushed at the end of an already-long session |

---

## 9. Session Log

*(Full history through 2026-07-22 preserved in prior version of this document.)*

- **2026-08-23 through 2026-08-29**: Built occurrence-based paid tracking, recurring split
  generation, `fundingModel`, the first "needs review" feature, full bill/income editing, the
  full multi-income-source refactor, bonus-paycheck badges.

- **2026-08-30**: The app's first real day of daily use. Fixed 2 deployment bugs and 4
  related app-logic bugs (all "forward-only date logic" root cause). Discovered and partially
  patched a real timezone mismatch between local dev and production. Built "paid a different
  amount" (with a mid-session UX redesign of the bill-actions menu) and "Quick Spend" (which
  required fixing a long-dormant `isRecurring` bug as a prerequisite). Deliberately parked a
  new July/August anomaly from the split-repair path. **Left open:** that anomaly, the
  app-wide timezone fix, split-leg amount overrides, and the Pay Periods mobile redesign.

---

## 10. Next Step (pick up here next session)

1. **Investigate the July/August anomaly** from the splittable-toggle repair path.
2. **Decide on the app-wide timezone-independence fix** — a real, careful pass making date
   construction consistent regardless of server timezone, rather than the targeted patches
   applied tonight.
3. **Extend "paid a different amount" to split-bill legs.**
4. **Build the "all bills paid" quick-glance indicator**, now more trustworthy.
5. **Tackle the Upcoming Pay Periods mobile redesign.**
6. Lower priority: consolidate duplicate date-equality logic, add a note field to Quick
   Spend, security hardening, a real Dialog component.

**Standing lessons/habits to keep in mind going forward:**
- With `--src-dir`, `proxy.ts` goes in `src/`, not `apps/web/` root.
- Always run `npx prisma generate` after schema changes AND fully restart the dev server.
- **Run a full `npm run build` locally before every commit/merge to `main`.**
- The generated Prisma client isn't committed to git — watch for duplicate JSON keys when
  editing `package.json`.
- `vercel --prod` via CLI needs an explicit `.vercelignore`.
- Next.js 16 dynamic route handlers need `request: NextRequest` (exact type) as the literal
  first parameter, even if unused.
- **"Forward-only date logic used where current-cycle logic was needed" is this project's
  single most recurring bug class** — `getCurrentOccurrence()` is almost always the right
  tool.
- **Local dev and production can disagree on what timezone "midnight" is** — compare
  calendar-day components (UTC-normalized) rather than exact timestamp ranges for date
  equality, until the deeper app-wide fix lands.
- When two real-world behaviors are legitimate but mutually exclusive, add an explicit stored
  user choice.
- A silently-swallowed typo or duplicate key produces no error, just a wrong-but-plausible
  fallback.
- Giving users a way to correct their own data (an edit modal) can resolve what looks like a
  code bug but is actually just bad input.
- Know when to stop chasing a fresh anomaly at the end of a long session — log it precisely
  and move on.