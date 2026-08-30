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
is actually funded (`fundingModel`) and treating every income source in a household equally
(no "primary" income).

As of this session, the app has gone through its **first real day of actual daily use** — and
that surfaced several genuine, previously-hidden bugs that only show up with real bills and
real timing, not synthetic test data. All were fixed the same night.

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
  (the exact type) as its literal first parameter, even if unused.
- Always run `npx prisma generate` after schema changes AND fully restart the dev server.
- **Run `npm run build` locally before every commit/merge to `main`** — `next dev`'s compiler
  is more lenient and has repeatedly let real errors through undetected.
- **The generated Prisma client is NOT committed to git** (correctly — it's build output) and
  will not exist on a fresh checkout unless something regenerates it. `apps/web/package.json`
  now has `"postinstall": "prisma generate"` so this happens automatically on every install,
  local or on Vercel. Worth double-checking this script is genuinely a single, correct
  `"scripts"` block — a duplicate JSON key here silently breaks the fix without any error.
- **`vercel --prod` run directly via CLI does not reliably respect `.gitignore`** — it can
  upload the literal working directory, `node_modules` and all. An explicit `.vercelignore`
  file is the fix, independent of `.gitignore`.
- A "module export doesn't exist" error that survives a full cache clear may not be a caching
  issue at all — confirm the file's actual content on disk before assuming it's still a cache
  problem.
- **The single most common real bug class in this app has been "forward-only date logic used
  where 'current cycle, whether past or future' logic was needed."** This has now caused (and
  been fixed) at least five separate times across different functions — `getCurrentOccurrence()`
  is the correct tool whenever the real question is "what does this cycle currently owe,"
  never `projectBillDueDates()` or `nextOccurrenceOnOrAfter()`, which are correct only for
  "what's coming up next."

---

## 3. Tech Stack (decided)

| Layer | Choice | Notes |
|---|---|---|
| Monorepo tool | **Turborepo** | |
| Backend | Next.js API routes | No separate backend server |
| Frontend | **Next.js, built as a PWA** | One codebase |
| UI components | **shadcn/ui** (indigo/violet accent) | No Dialog component installed — custom overlays built plainly with Tailwind |
| Database | Postgres via Neon | Free tier, scales to zero when idle |
| ORM | **Prisma 7** | Driver adapters; client auto-generated via `postinstall` |
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

**`Payment.amount` is already a separate field from `Bill.amount`** — currently always
populated with the bill's own budgeted amount when marking paid, but structurally ready for
the planned "paid a different amount" feature (see Future/Backlog) without a schema change.

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
  data-dense and scroll-heavy on mobile.
- [ ] **Phase 7 — Savings Guidance (future)** — not scoped in detail.

**"Current state" reconciliation feature:**
- [x] Per-bill "needs review" detection for orphaned occurrences — rebuilt this session to
  remove the one-cycle lookback cap entirely (see below) and fix a real bug in how it found
  candidate dates.
- [ ] Full mid-cycle onboarding reconciliation flow — not built.
- [ ] End-of-cycle "Did you get paid?" proactive confirmation flow — not built.

---

## Recently Fixed (2026-08-30 session — first real-world-use bugs, found and fixed same night)

This was the app's first day of genuine daily use with real bills, and it surfaced exactly
the kind of bugs synthetic testing hadn't caught. All fixed the same session:

**Deployment bugs (unrelated to app logic):**
- Vercel production builds were failing with `Module not found: Can't resolve
  '@/generated/prisma/client'`. Root cause: the generated Prisma client isn't committed to
  git (correctly), and nothing regenerated it on a fresh Vercel checkout — only worked
  locally because it already existed on disk from prior manual runs. **Fixed** by adding
  `"postinstall": "prisma generate"` to `apps/web/package.json`. First attempt silently
  failed because the edit created a **duplicate** `"scripts"` JSON key instead of replacing
  the original — worth remembering that duplicate JSON keys don't error, they just get
  silently resolved by whichever parser wins.
- Separately, `vercel --prod` was failing with "File size limit exceeded (100MB)" —
  `node_modules` (1GB) was being included in the CLI upload despite being correctly listed in
  `.gitignore`. The Vercel CLI run directly doesn't reliably respect `.gitignore` the way a
  git-integrated deploy does. **Fixed** with an explicit `.vercelignore` file.

**Four related app-logic bugs, all the same root cause** ("forward-only date logic used where
'current cycle, whether past or future' logic was needed" — the single most recurring bug
class in this project):

1. **`planBillSplit()`** picked its due date via `projectBillDueDates()[0]` (forward-only) —
   meant a bill added or split *after* its due date had already passed this cycle
   **permanently skipped that cycle's occurrence entirely**, with no `Payment` rows ever
   created for it. Confirmed via real data (a student loan due the 25th, added the 29th, had
   zero rows for August, only September onward). **Fixed**: use `getCurrentOccurrence()`
   instead.
2. **`ensureRecurringSplits()`** had the identical bug in its "no split exists yet" fallback.
   **Fixed** the same way.
3. **`findUnresolvedOccurrences()`** (the `needsReview` feature) had the same bug in a
   different shape — it computed its candidate date via `nextOccurrenceOnOrAfter(bill.dueDate,
   lookbackStart)`, which could itself skip forward past the very occurrence it was supposed
   to catch, meaning the one-cycle lookback wasn't just narrow, it was actually broken for the
   case it existed to solve. Per the user's explicit real-world need ("I want the ability to
   mark things paid even IF they are before the previous cycle"), **the one-cycle cap was
   removed entirely** and replaced with a direct `getCurrentOccurrence()` check — simpler code,
   no arbitrary "how far back" limit.
4. **`isOverdue` for split bills** compared raw leg dates against the due date directly, which
   can never resolve true — split legs are always dated *before* the due date they fund, by
   design. **Fixed**: group legs by `splitGroupId`, determine which due-date occurrence each
   group actually funds (same logic `ensureRecurringSplits()` uses), and check whether the
   group funding the *current* cycle specifically is fully paid.

**Repair path for bills already corrupted by the old buggy logic**: toggle `splittable` off
then back on in the edit modal (triggers `regenerateSplitsIfNeeded()`, deleting stale legs and
recreating correctly). Old paid legs left behind by a previous buggy split are harmless — they
just become non-matching historical rows.

**New, NOT-yet-investigated anomaly, deliberately parked**: applying that repair to one real
bill showed a stale/wrong month (July) instead of the expected August. Needs fresh
investigation next session — not chased tonight to avoid a late-session rabbit hole.

---

## Previously Fixed (2026-08-29 session — multi-income-source support)

Full multi-income refactor: no "primary income" concept anywhere. `getCombinedPayDates()` /
`getCombinedPayDatesInRange()` merge every source's real paydays. Bonus-paycheck badges
("3PD"/"5PD") tag only the specific extra occurrence, fully independent per source. Forecast
window widened from 60 to 90 days. Full income-source editing (`EditIncomeModal`).

## Previously Fixed (2026-08-27/28 sessions)

Full bill editing (`EditBillModal`) with a clear structural-change rule. The first "needs
review" reconciliation feature. `fundingModel` (BEFORE_DUE/NEXT_CHECK). Final
`request: NextRequest` route-handler fix.

---

## Known Gaps — Actively Being Worked

- **New anomaly from tonight's repair path**: toggling a bill's splittable status off/on to
  regenerate its splits showed the wrong month (July instead of August) in one real case.
  Not yet investigated — top priority next session alongside the deferred features below.
- **Upcoming Pay Periods card needs a mobile UX redesign** — flagged directly by the user.

---

## Future / Backlog

**Real feature requests from actual daily use (explicitly deferred tonight to avoid a
late-session rabbit hole — priority items for next session, after the July anomaly):**

- **"Paid a different amount."** Let a user mark a bill paid with an actual amount different
  from what was budgeted. Display: original amount shown with strikethrough, colored red if
  paid *more* than budgeted or green if paid *less*, with the new actual amount shown in the
  same color. UI: user wants a single combined button (merging the current separate
  edit/delete icons) opening a small menu — "Edit Bill" / "Mark Paid — different amount" /
  "Delete." **Scope decision already made**: build for non-split (regular) bills first;
  split-leg support as a fast follow-up, not both at once, since the "per-leg vs. only-once-
  both-paid" comparison question needs its own thought. `Payment.amount` already exists as a
  field separate from `Bill.amount` — no schema change needed, just needs to actually be used
  that way (`POST /api/bills/[id]/pay` currently always copies `bill.amount`).
- **"Quick spend / misc" one-time expense entry.** A lightweight way to log an unbudgeted
  one-time expense without it becoming a recurring bill (current due-date projection logic
  makes every non-split bill implicitly recur monthly regardless of `isRecurring`, so a plain
  "add a bill" doesn't cleanly support a true one-off). If the user says "yes, make this
  recurring," **it should automatically create a real recurring Bill** using the same info —
  explicit user decision, not just a reminder to add one manually later.
- **"All bills paid" quick-glance indicator** on the hero card (e.g. a green checkmark vs. a
  red count of overdue bills) — deliberately deferred until the paid-status bugs above are
  fully fixed and trustworthy, since building a summary on top of not-yet-correct data would
  likely need to be redone.
- **Full mid-cycle onboarding reconciliation flow** and **end-of-cycle "Did you get paid?"
  confirmation** — remaining pieces of the "current state" concept.
- **Consolidate duplicate date-equality logic** across a few files into one shared helper.
- **Handle stale/historical split-payment rows in the UI** if a bill ever accumulates split
  history across multiple cycles.
- **Push notifications**, **spending trend charts**, **"Remaining" card color gradient +
  warning icon** *(code drafted this session, not yet confirmed applied — verify next time)*,
  **calendar visualization for pay/due dates**, **collapsible add-forms**, **further settings
  under the hamburger menu**, **email payment-confirmation scanning (opt-in, read-only Gmail
  search)**, **budget-tracker checklist view**, **dashboard-as-information-hub
  restructuring** — all previously logged, unchanged.
- **Security hardening**: dependency scanning, Zod validation on API routes, re-enable
  `noUnusedLocals`/`noUnusedParameters` in `tsconfig.json` once the codebase is stable enough.
- **Consider adopting a real shadcn Dialog component** now that multiple modal-style UI
  patterns exist (`EditBillModal`, `EditIncomeModal`, the needs-review inline prompt).

**Design Direction**: BillOut + 1Bill + EveryDollar + Rocket Money references, unchanged.

---

## 7. Current Status

**Phase:** Phases 0–3.5 fully complete, deployed, verified live. Phase 5 core complete.
Phase 6 in progress.

**2026-08-30 session:** The app's first real day of daily use surfaced two deployment bugs
(Prisma client not generating on Vercel; `node_modules` accidentally included in CLI deploys)
and four related app-logic bugs, all the same root cause: forward-only date logic being used
in places that actually needed "what does this cycle currently owe, past or future"
semantics. Fixed all six. Per the user's explicit real-world need, removed the one-pay-cycle
cap on the `needsReview` lookback entirely, replacing it with a correct, simpler
implementation. Identified and cleanly scoped three real next features from actual usage
("paid a different amount," "quick spend," an all-paid quick-glance indicator) but
deliberately deferred building them tonight to avoid a late-session rabbit hole, after
discovering a new, not-yet-understood anomaly in the bill-repair path.

**Known real gap, next up:** investigate the "shows July instead of August" anomaly from the
splittable-toggle repair path, then build the three deferred features in order (paid-different-
amount, quick-spend, all-paid indicator).

**Next: investigate the July/August anomaly first (regression from tonight's fixes, or a
separate pre-existing issue), then scope and build "paid a different amount" for non-split
bills.**

**Last updated:** 2026-08-30

---

## 8. Decision Log

| Date | Decision | Reasoning |
|---|---|---|
| 2026-07-14 | Web + mobile, shared backend | One codebase covers both platforms |
| 2026-07-14 | Rules engine + LLM explains (not LLM does math) | Reliability + cost control |
| 2026-08-23 | Occurrence-based paid tracking distinct from forward-only due-date projection | "Which occurrence is paid" and "what's next" are different questions |
| 2026-08-26 | Added explicit `Bill.fundingModel` field instead of trying to infer funding behavior | Two real bill-funding behaviors are legitimate but mutually exclusive |
| 2026-08-27 | Scoped the reconciliation feature narrowly to "orphaned occurrences" only | Precise, buildable in one session |
| 2026-08-29 | Removed all "primary income" concepts; every income source is treated equally | User explicitly rejected any income hierarchy |
| 2026-08-30 | Removed the one-pay-cycle cap on needsReview's lookback entirely | User's real-world need: any unresolved bill should be reachable, no matter how far back, since the lookback-window approach was actually broken for its own purpose anyway |
| 2026-08-30 | Deferred 3 real, clearly-scoped feature requests to next session rather than build them the same night as 4 bug fixes | Avoid rabbit-holing at the end of a long session; end on a clean, tested, deployed state |

---

## 9. Session Log

*(Full history through 2026-07-22 preserved in prior version of this document.)*

- **2026-08-23 through 2026-08-28**: Built occurrence-based paid tracking, recurring split
  generation, `fundingModel`, the first "needs review" feature, full bill editing.

- **2026-08-29**: Built the full multi-income-source refactor, bonus-paycheck badges,
  full income-source editing.

- **2026-08-30**: First real day of daily use. Fixed two deployment bugs (Prisma client
  generation on Vercel; `node_modules` in CLI deploys) and four related app-logic bugs, all
  stemming from forward-only date logic used where current-cycle semantics were needed —
  `planBillSplit()`, `ensureRecurringSplits()`'s fallback, `findUnresolvedOccurrences()`
  (which also had its one-cycle cap removed entirely per explicit user request), and
  split-bill `isOverdue` detection. Confirmed all four via real production data before fixing.
  Discovered a new anomaly in the bill-repair path (toggle splittable off/on shows wrong
  month) — deliberately parked rather than chased. Clearly scoped three new real feature
  requests from actual usage ("paid a different amount," "quick spend," an all-paid
  quick-glance indicator) with real design decisions already made, explicitly deferred to
  next session. **Left open:** the July/August anomaly, and all three deferred features.

---

## 10. Next Step (pick up here next session)

1. **Investigate the July/August anomaly** from the splittable-toggle repair path — is it a
   regression from tonight's fixes, or a separate pre-existing bug? Get real data before
   guessing.
2. **Build "paid a different amount"** for non-split bills: combined edit/delete/mark-paid
   button with a small menu, `POST /api/bills/[id]/pay` accepting an optional `amount`
   override, and the red/green strikethrough display treatment. Split-leg support as a fast
   follow-up once this is confirmed working.
3. **Build "quick spend / misc" one-time expense entry**, including the "make this a real
   recurring bill" auto-create path.
4. **Build the "all bills paid" quick-glance indicator** on the hero card, once paid-status
   data is fully trustworthy again.
5. Lower priority: verify the "Remaining" card color-grading code (drafted, not yet confirmed
   applied), the Upcoming Pay Periods mobile redesign, multi-income-schedule edge cases,
   `noUnusedLocals`/`noUnusedParameters`, consolidating duplicate date-equality logic.

**Standing lessons/habits to keep in mind going forward:**
- With `--src-dir`, `proxy.ts` goes in `src/`, not `apps/web/` root.
- Always run `npx prisma generate` after schema changes AND fully restart the dev server.
- **Run a full `npm run build` locally before every commit/merge to `main`.**
- The generated Prisma client isn't committed to git — `postinstall: prisma generate` handles
  this automatically now; watch for accidental duplicate `"scripts"` JSON keys when editing
  `package.json`.
- `vercel --prod` via CLI needs an explicit `.vercelignore` — don't assume `.gitignore` alone
  is respected.
- Next.js 16 App Router dynamic route handlers need `request: NextRequest` — the exact type —
  as the literal first parameter, even if unused.
- **"Forward-only date logic used where current-cycle logic was needed" is this project's
  single most recurring bug class** — `getCurrentOccurrence()` is almost always the right
  tool when the real question is "what does this cycle currently owe," never
  `projectBillDueDates()` or `nextOccurrenceOnOrAfter()`.
- When two real-world behaviors are legitimate but mutually exclusive, add an explicit stored
  user choice — don't try to infer or guess.
- A silently-swallowed typo (or duplicate key) produces no error anywhere, just a
  wrong-but-plausible fallback.
- Scope reconciliation-style or structural-change features precisely before building.
- Giving users a way to correct their own data (an edit modal) can resolve what looks like a
  code bug but is actually just bad input.
- **Know when to stop.** Fixing 4 real, interconnected bugs in one session and stopping there
  — rather than also starting 3 new features the same night — is a good outcome, not an
  incomplete one.