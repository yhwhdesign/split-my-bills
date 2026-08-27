# Split My Bills — Project State

> Living document. Update the **Current Status** and **Session Log** sections as we work.
> Keep this file in the repo root and commit it after every session.

---

## 1. Project Summary

An EveryDollar-style budgeting app called **Split My Bills** (formerly "Bill Splitter") —
positioned as a combined financial-coaching / budget / savings-potential app to help people
who don't have the time (or won't take the time) to manage their finances properly.

Core differentiator: AI-assisted coaching that analyzes a user's income schedule vs. bill due
dates and suggests whether splitting a bill into two smaller payments (aligned to paydays)
would ease cashflow strain. A second, equally central differentiator: bill due dates and
paycheck dates rarely line up — the app's job is to make that mismatch visible and manageable.

**Third differentiator (built this session, in its first real form):** the app can now flag
bills whose relevant due-date occurrence has fallen through the cracks entirely — invisible to
every generated pay period — and give the user one clear, per-bill place to resolve it. See
Section 6 for the "needs review" feature.

---

## 2. Guardrails / Constraints (do not violate)

- **Net-zero cost.** Every service choice must have a genuinely free tier at our scale.
- **No billing surprises, ever.** All AI calls route through our server, gated by a Usage
  Governor (Phase 3.5).
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
- Every Next.js 16 App Router dynamic route handler MUST declare `request: NextRequest` as its
  literal first parameter, even if unused — omitting it is a real runtime crash.
- Always run `npx prisma generate` after schema changes AND fully restart the dev server
  afterward — a regenerated client on disk doesn't help an already-running process.
- `npx prisma migrate dev` must be run from `apps/web` (where `prisma.config.ts` lives), even
  though `node_modules` is hoisted to the monorepo root in this Turborepo setup.
- A "module export doesn't exist" error that survives a full cache clear (`rm -rf
  apps/web/.next .turbo`) may not actually be a caching issue at all — confirm the file's
  actual content on disk matches what you think you saved before assuming it's a cache
  problem. (This session: a fix meant for `packages/shared/src/index.ts` was accidentally
  pasted into `split-suggestions/route.ts` instead — the error was 100% accurate.)
- A single mistyped object key in a JSON body fails completely silently — check exact field
  names character-by-character when a saved value "isn't matching" despite correct-looking
  code on both ends.

---

## 3. Tech Stack (decided)

| Layer | Choice | Notes |
|---|---|---|
| Monorepo tool | **Turborepo** | |
| Backend | Next.js API routes | No separate backend server |
| Frontend | **Next.js, built as a PWA** | One codebase |
| UI components | **shadcn/ui** (indigo/violet accent) | |
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

**`Bill.fundingModel`** (added last session, confirmed working):
- `BEFORE_DUE`: due date must fall within a pay period's date range — for bills covered by
  cash-on-hand before they're due (e.g. a water bill due the 25th).
- `NEXT_CHECK`: attributed to whichever paycheck lands on/after the due date, regardless of
  which period the due date itself falls in — for bills always paid from a specific/next
  paycheck (e.g. a mortgage due the 1st, always funded by the month's first paycheck).

Split-payment legs recur automatically every pay cycle (via `ensureRecurringSplits()`) and can
be marked paid/unpaid independently via their own `status` field.

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
  `Logo`, category icons, pill status badges, split-leg sub-row UI, overdue-bill indicator,
  hamburger menu + Icon Legend (this session), per-bill "needs review" indicator (this
  session). Still open: dashboard-as-hub restructuring, further settings under the hamburger
  menu, loading/empty states, motion.
- [ ] **Phase 7 — Savings Guidance (future)** — not scoped in detail.

**"Current state" reconciliation feature — first real piece shipped this session:**
- [x] Per-bill "needs review" detection for occurrences orphaned by the forward-only period
  builder (one-cycle lookback window) — built and confirmed working.
- [ ] Full mid-cycle onboarding reconciliation (someone starting the app mid-month reviewing
  everything at once) — not built.
- [ ] End-of-cycle "Did you get paid?" proactive confirmation flow — not built.

---

## Recently Fixed / Built (2026-08-27 session — "needs review" reconciliation feature)

**Scoped the reconciliation problem precisely, rather than building the full originally-
envisioned system.** The real, narrow gap: a bill's relevant occurrence (due date for
`BEFORE_DUE`, funding paycheck date for `NEXT_CHECK`) can fall **before the very first period
`calculatePayPeriods()` generates**, making it invisible everywhere in the app — no checkbox,
no period listing, nothing. This is different from an ordinary overdue bill, which already has
a real period and a visible checkbox to resolve it.

**Design decisions, made explicitly before coding:**
- Lookback window: exactly **one pay cycle** before the earliest period — using the user's
  real pay frequency, not a fixed number of months. Reasoning (user's own): "anything beyond
  one cycle, the user is misusing the app at that point" — deliberately not designed to catch
  multiple stacked missed cycles.
- Visibility: both an always-visible **per-bill icon** and available on demand — no separate
  dashboard-wide banner.
- Confirming paid: **no date picker** — just yes/no, using the due date automatically.
- Confirming "not yet": **no persisted state** — just closes the prompt for that view. The
  bill's existing overdue indicator (if any) keeps doing its job; the review prompt reappears
  next time `needsReview` is recomputed.

**Built:**
- `packages/shared/src/index.ts`: `findUnresolvedOccurrences(bills, paySchedule, anchorDate,
  earliestPeriodStart, paidOccurrences)` — walks back exactly one pay cycle from the earliest
  period's start (via the existing `retreatPayDate()`), and flags any bill whose relevant
  occurrence/funding date falls before that period start and isn't already paid.
- `/api/split-suggestions/route.ts`: calls it after `periods` is computed, adds `needsReview`
  to the JSON response.
- `dashboard/page.tsx`: cross-references `needsReview` against the Bills list by `billId`; a
  blue `HelpCircle` icon appears next to any flagged bill. Clicking it expands an inline
  prompt ("Was [bill] paid for [date]? [Paid] [Not yet]") — same expand-in-place pattern as
  existing split-leg sub-rows. "Paid" calls the existing pay endpoint; "Not yet" just closes
  the prompt.
- Added a **hamburger menu** to the dashboard header, replacing the standalone Log out button
  — opens a dropdown with "Icon Legend" (a plain-language card explaining every bill icon:
  split, late split, overdue, needs review) and "Log out". Meant to be the future home for
  account/settings items generally.

**Confirmed working via real testing:** a bill due in the "orphan window" (roughly the 7th–20th
of the month, given this household's biweekly 8/21 anchor) correctly triggers the review icon.
Bills already fixed by `fundingModel` (the mortgage/gas examples from last session) correctly
do NOT trigger it, since `fundingModel` already made them visible in a real period — confirming
the two features are correctly scoped as separate, non-overlapping fixes.

**Also this session:**
- Discovered `apps/web/src/lib/categorize-bill.ts` (an auto-suggest-category-as-you-type
  feature) doesn't actually exist on disk, despite being referenced in `dashboard/page.tsx` —
  likely lost in an earlier merge. Removed the dead reference rather than reconstruct it blind;
  logged as a small backlog item to rebuild later if wanted.
- Flagged the `fundingModel` dropdown wording as still not ideal for non-technical users after
  one improvement pass ("On time, from savings/cash on hand" / "From my next paycheck, even if
  that's a few days late") — deliberately deferred further wording work to a later session.
- Hit and resolved a confusing tooling moment: a "module export doesn't exist" error survived a
  full cache clear because the actual bug was pasting a code fix into the wrong file (meant for
  `packages/shared/src/index.ts`, went into `split-suggestions/route.ts` instead) — worth
  remembering that this exact error message can be either a real caching issue or a genuinely
  missing export, and confirming file contents directly settles it fastest.

---

## Previously Fixed (2026-08-26 session — recurring splits + fundingModel)

- Recurring split generation: `getPayDatesInRange()`, rewritten `pickSplitDates()`,
  `ensureRecurringSplits()` — every splittable+recurring bill now gets a fresh pair of split
  payments each pay cycle automatically.
- `fundingModel` feature: schema migration, API validation, UI select, `calculatePayPeriods()`
  branching logic — confirmed correct with real testing (mortgage due 1st, funded by the 9/4
  paycheck, correctly excluded from the 8/21 period).
- Found and fixed 4 real bugs along the way: a silently-swallowed typo (`findingModel` vs.
  `fundingModel`), a regressed `paidThisMonth` calculation, a stale calendar-relative
  `paidOccurrences` check, and a duplicate assignment loop left in `calculatePayPeriods()` from
  an incomplete edit.

## Previously Fixed (2026-08-24 and 2026-08-23 sessions)

- Occurrence-based paid tracking (`getCurrentOccurrence()` vs. `projectBillDueDates()`)
- Per-split-leg independent paid/unpaid toggling
- Due-date-anchored one-time split logic
- Auto-split-on-bill-creation, pay-period boundary fix, Prisma schema relation fix
- Overdue-bill visual indicator, including correct split-bill handling

---

## Known Gaps — Actively Being Worked

- **The broader "current state" reconciliation concept is only partially built.** This
  session's `needsReview` feature covers the specific "orphaned occurrence" case. Still open:
  a full mid-cycle onboarding flow (someone starting the app mid-month reviewing everything at
  once) and an end-of-cycle "Did you get paid?" proactive confirmation. Both remain future
  backlog items, not yet designed in detail.
- **Three route handlers still missing the required `request: NextRequest` parameter**
  (`bills/[id]/route.ts` DELETE, `bills/[id]/split/route.ts` POST, `income/[id]/route.ts`
  DELETE).
- **`fundingModel` dropdown wording** still not ideal for non-technical users — flagged for a
  future wording pass.

---

## Future / Backlog

- **Full bill editing.** Currently only `amount` is editable via a small inline form.
  Requested: edit everything (due date, category, splittable, fundingModel) — needs the full
  add-bill form fields reused for editing, `PATCH /api/bills/[id]/route.ts` updated to accept
  all fields, and a real product decision on what happens to existing split `Payment` rows
  when a bill's due date or splittable status changes after the fact.
- **Rebuild `categorize-bill.ts`** (auto-suggest category as the user types a bill name) —
  discovered missing this session; not urgent, but was a nice small UX touch.
- **`fundingModel` wording pass** for non-technical users — current phrasing is clearer than
  the original but still not fully plain-language.
- **Multi-income-source pay-schedule limitation** — `calculatePayPeriods()` only uses
  `incomeSources[0]`'s pay schedule/anchor. Not an issue for this household, real gap for
  others.
- **Full mid-cycle onboarding reconciliation flow** and **end-of-cycle "Did you get paid?"
  confirmation** — the remaining, un-built pieces of the "current state" concept.
- **Consolidate duplicate date-equality logic** across a few files into one shared helper.
- **Handle stale/historical split-payment rows in the UI** if a bill ever accumulates split
  history across multiple cycles.
- **Push notifications**, **spending trend charts**, **"Remaining" card color gradient**,
  **calendar visualization for pay/due dates**, **collapsible add-forms**, **further settings
  under the hamburger menu**, **email payment-confirmation scanning (opt-in, read-only Gmail
  search)**, **budget-tracker checklist view**, **dashboard-as-information-hub
  restructuring** — all previously logged, unchanged this session.
- **Security hardening**: dependency scanning, Zod validation on API routes, re-enable
  `noUnusedLocals`/`noUnusedParameters` in `tsconfig.json` once the codebase is stable enough.

**Design Direction**: BillOut + 1Bill + EveryDollar + Rocket Money references, unchanged.
Not yet decided: exact full palette, font pairing, dark mode toggle.

---

## 7. Current Status

**Phase:** Phases 0–3.5 fully complete, deployed, verified live. Phase 5 core complete.
Phase 6 in progress.

**2026-08-27 session:** Designed and built the first real, working piece of the "current
state" reconciliation feature — a precisely-scoped "needs review" indicator for bill
occurrences that fall through the cracks of the app's forward-only period logic (rather than
the full originally-envisioned mid-cycle-onboarding system). Confirmed working via real
testing, correctly distinguishing itself from bills already fixed by last session's
`fundingModel` work. Also shipped a hamburger menu with an Icon Legend, laying groundwork for
future settings. Found a missing file (`categorize-bill.ts`) and resolved cleanly by removing
the dead reference rather than reconstructing blind.

**Known real gap, next up:** the three remaining `request: NextRequest` fixes (quick,
low-risk), then full bill editing (a real, larger scope item).

**Next: fix the 3 remaining route handlers, then scope and build full bill editing.**

**Last updated:** 2026-08-27

---

## 8. Decision Log

| Date | Decision | Reasoning |
|---|---|---|
| 2026-07-14 | Web + mobile, shared backend | One codebase covers both platforms |
| 2026-07-14 | Manual entry first, Plaid later | Reduces early complexity/cost risk |
| 2026-07-14 | Rules engine + LLM explains (not LLM does math) | Reliability + cost control |
| 2026-07-16 | Ollama (dev) / Gemini Flash-Lite governed (prod) | Genuinely free at both stages |
| 2026-07-16 | Dropped React Native/Expo, going PWA instead | No store fees, one codebase |
| 2026-08-23 | Occurrence-based paid tracking distinct from forward-only due-date projection | "Which occurrence is paid" and "what's next" are different questions |
| 2026-08-24 | Split dates anchored to the bill's due date, not today's date | Splits fund a bill by its due date regardless of when the app is opened |
| 2026-08-24 | Merged 3 backlog ideas into one future "current state" reconciliation feature | All three are the same underlying need: a view that looks both backward and forward |
| 2026-08-26 | Recurring split generation is automatic/default, no separate one-time-split mode | Every real recurring bill split in practice is recurring; deletion covers the exception |
| 2026-08-26 | Added explicit `Bill.fundingModel` field instead of trying to infer funding behavior | Two real bill-funding behaviors are legitimate but mutually exclusive; an explicit choice is more honest than clever inference |
| 2026-08-27 | Scoped the reconciliation feature narrowly to "orphaned occurrences" only, not the full mid-cycle system | Precise, buildable in one session, and directly solves the concrete gap found through real testing, without overreaching into unbuilt UX |
| 2026-08-27 | Reconciliation lookback is exactly one pay cycle, no further | User's own principle: beyond one missed cycle is considered misuse of the app, not a case worth designing for |

---

## 9. Session Log

*(Full history through 2026-07-22 preserved in prior version of this document.)*

- **2026-08-23 (three sessions)**: Fixed auto-split-on-creation, pay-period boundary bug,
  occurrence-tracking bugs, split-leg independent paid tracking, a runtime crash from a missing
  `request` parameter, and stale test data cleanup.

- **2026-08-24**: Fixed the split-date anchoring bug via a real example. Ran deliberate A/B
  tests confirming core paid-tracking behavior. Shipped the overdue-bill visual indicator.
  Merged to `main`. Named the "current state" reconciliation concept and the recurring-splits
  gap from real usage.

- **2026-08-26**: Built recurring split generation end-to-end. Designed and built the
  `fundingModel` feature to resolve a genuine conflict between two real bill-funding
  behaviors. Found and fixed 4 real bugs during testing. Confirmed the fix works with real
  data. Testing surfaced a concrete example of the reconciliation feature's shape.

- **2026-08-27**: Designed the "needs review" reconciliation feature through explicit
  up-front design decisions (lookback window, visibility, confirmation flow) before writing
  code. Built `findUnresolvedOccurrences()`, wired it into `/api/split-suggestions`, and built
  the per-bill icon + inline resolve UI in the dashboard, plus a new hamburger menu with an
  Icon Legend. Confirmed working via real testing — correctly triggers for genuinely orphaned
  bills, correctly stays silent for bills already fixed by `fundingModel`. Discovered and
  resolved a missing file (`categorize-bill.ts`) by removing the dead reference. Flagged
  `fundingModel` wording for a future pass. **Left open:** the 3 remaining
  `request: NextRequest` fixes, full bill editing, `categorize-bill.ts` rebuild, and the
  broader mid-cycle-onboarding / end-of-cycle-confirmation pieces of the reconciliation
  concept.

---

## 10. Next Step (pick up here next session)

1. **Fix the 3 remaining route handlers** missing `request: NextRequest`:
   `bills/[id]/route.ts` DELETE, `bills/[id]/split/route.ts` POST, `income/[id]/route.ts`
   DELETE.
2. **Scope and build full bill editing** (amount, due date, category, splittable,
   fundingModel) — including the product decision on what happens to existing split
   `Payment` rows when relevant fields change.
3. **Revisit `fundingModel` dropdown wording** for non-technical users.
4. **Rebuild `categorize-bill.ts`** if still wanted (auto-suggest category as the user types).
5. Lower priority: multi-income-schedule support, full mid-cycle onboarding reconciliation,
   end-of-cycle "Did you get paid?" confirmation, `noUnusedLocals`/`noUnusedParameters`,
   consolidating duplicate date-equality logic.

**Standing lessons/habits to keep in mind going forward:**
- With `--src-dir`, `proxy.ts` goes in `src/`, not `apps/web/` root.
- Always run `npx prisma generate` after schema changes AND fully restart the dev server.
- Clear `apps/web/.next` (and `.turbo`) if a correct-looking file still errors — but if the
  error persists after a genuinely clean cache clear, confirm the file's real content on disk
  before assuming it's still a cache problem.
- Quote bracket-named folders (`[id]`) in shell commands.
- Confirm `pwd` before path-sensitive commands — `node_modules` lives at the monorepo root,
  not inside `apps/web`.
- Commit real bug fixes immediately once confirmed working.
- Next.js 16 App Router dynamic route handlers need `request: NextRequest` as the literal
  first parameter, even if unused.
- Never feed a function a fabricated substitute for a value it treats as authoritative (real
  anchor dates, IDs, etc.) — compute the real range around the real value instead.
- When two real-world behaviors are legitimate but mutually exclusive, add an explicit stored
  user choice — don't try to infer or guess.
- A silently-swallowed typo in an object key produces no error anywhere, just a
  wrong-but-plausible fallback — check exact field names character-by-character.
- When replacing a block of code, confirm the old version is actually deleted, not left
  running alongside the new one.
- Scope reconciliation-style features precisely before building — "orphaned occurrences" was
  buildable in one session; "the full mid-cycle reconciliation system" was not, and trying to
  build the whole thing at once would likely have repeated earlier sessions' rushed-fix
  mistakes.