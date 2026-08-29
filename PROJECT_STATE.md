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
is actually funded (see `fundingModel` in Section 4).

A third, still-developing differentiator: the app is starting to catch bills that would
otherwise silently fall through the cracks of a purely forward-looking planner (see the
"needs review" feature in Section 6).

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
  (the exact type, not plain `Request`) as its literal first parameter, even if unused —
  omitting it, or using the wrong type, is a real runtime/build failure, not just cosmetic.
- Always run `npx prisma generate` after schema changes AND fully restart the dev server
  afterward.
- `npx prisma migrate dev` must be run from `apps/web` (where `prisma.config.ts` lives), even
  though `node_modules` is hoisted to the monorepo root.
- **Run `npm run build` locally before every commit/merge to `main`** — `next dev`'s compiler
  is more lenient than a full production build and has twice let real type errors through
  that only surfaced at deploy time (a `Bill` object literal missing `fundingModel`; a route
  handler typed as plain `Request` instead of `NextRequest`).
- A "module export doesn't exist" error that survives a full cache clear (`rm -rf
  apps/web/.next .turbo`) may not be a caching issue at all — confirm the file's actual
  content on disk before assuming it's still a cache problem (a fix meant for one file was
  once accidentally pasted into a different file, producing a fully accurate error).
- A single mistyped object key in a JSON body fails completely silently — check exact field
  names character-by-character when a value "isn't matching" despite correct-looking code.

---

## 3. Tech Stack (decided)

| Layer | Choice | Notes |
|---|---|---|
| Monorepo tool | **Turborepo** | |
| Backend | Next.js API routes | No separate backend server |
| Frontend | **Next.js, built as a PWA** | One codebase |
| UI components | **shadcn/ui** (indigo/violet accent) | No Dialog/modal component installed yet — custom overlays built plainly with Tailwind |
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

**`Bill.fundingModel`**:
- `BEFORE_DUE`: due date must fall within a pay period's date range — for bills covered by
  cash-on-hand before they're due.
- `NEXT_CHECK`: attributed to whichever paycheck lands on/after the due date — for bills
  always paid from a specific/next paycheck regardless of due date (e.g. a mortgage always
  funded by the month's first paycheck, even if that lands after the 1st).

**Full bill editing** (built this session): every field is editable via a modal, with a clear
rule for what happens to existing data — plain fields (amount, category, fundingModel) update
in place with no side effects; changing `dueDate` or toggling `splittable` deletes existing
*unpaid* split legs and regenerates a fresh pair if the bill is still splittable. **Paid
history is never touched by an edit** — it's treated as an immutable historical fact.

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
  per-bill "needs review" indicator, **full bill editing modal (this session)**. Still open:
  dashboard-as-hub restructuring, further settings under the hamburger menu, loading/empty
  states, motion.
- [ ] **Phase 7 — Savings Guidance (future)** — not scoped in detail.

**"Current state" reconciliation feature:**
- [x] Per-bill "needs review" detection for occurrences orphaned by the forward-only period
  builder (one-cycle lookback window) — built and confirmed working.
- [ ] Full mid-cycle onboarding reconciliation flow — not built.
- [ ] End-of-cycle "Did you get paid?" proactive confirmation flow — not built.

---

## Recently Fixed / Built (2026-08-28 session — full bill editing + cleanup)

**Final `request: NextRequest` fix.** Of the three route handlers flagged as still needing
this fix, only one actually still needed it: `bills/[id]/split/route.ts`'s `POST` was typed
as plain `Request` instead of `NextRequest` — structurally similar (has a first parameter,
compiles under `next dev`) but fails Next.js's route type validator at build time. The other
two files (`bills/[id]/route.ts`, `income/[id]/route.ts`) were already correct. Fixed and
confirmed with a clean `npm run build`.

**Full bill editing — designed, built, and confirmed working end-to-end.**
- Explicit design principle agreed before coding (user's own framing): "changes are just
  that, changes... we could delete the old data and treat changes that affect major things
  like new data completely." Translated into a concrete rule:
  - Plain field edits (amount, category, `fundingModel`) — update in place, no side effects.
  - `dueDate` change or `splittable` toggle — delete existing *unpaid* (`SCHEDULED`) split
    legs; if the bill is still splittable, immediately regenerate a fresh pair.
  - **Paid payment history is never touched by an edit**, regardless of what else changes.
- `apps/web/src/lib/split-bill.ts`: added `regenerateSplitsIfNeeded()` implementing this
  rule.
- `apps/web/src/app/api/bills/[id]/route.ts`: `PATCH` now accepts `fundingModel` (with the
  same defensive validation as `POST`) and calls `regenerateSplitsIfNeeded()` when `dueDate`
  or `splittable` actually change.
- `apps/web/src/components/edit-bill-modal.tsx` (new file): a plain custom modal overlay
  (backdrop + centered card, click-outside-to-close) — no shadcn Dialog component existed in
  the project, so this was built directly with Tailwind. Uses the same `FormData`-on-submit
  pattern as the existing add-bill form, because `DayOfMonthPicker` is an uncontrolled
  component (manages its own internal state, only exposes its value via a hidden form input)
  and mixing controlled/uncontrolled patterns in the same form would have been fragile. Shows
  a live yellow warning banner the moment `splittable` or the due date are touched, explaining
  the split-schedule reset *before* the user saves.
- `dashboard/page.tsx`: pencil icon now always opens the modal (replacing the old
  amount-only inline `EditAmountForm` for bills — income editing is unchanged).
- **Confirmed working via real testing**: toggling `splittable` on regenerates fresh split
  legs correctly; toggling it back off cleanly removes them (while still unpaid).

**Two small backlog items closed out:**
- `fundingModel` dropdown wording revisited a second time via explicit choice among 3
  candidate phrasings. Settled on: **"Paid on time, before it's due"** /
  **"Paid from my next paycheck, even if that's a few days late"** — applied in both the
  add-bill form and the edit modal.
- `apps/web/src/lib/categorize-bill.ts` rebuilt from scratch (the original had been lost,
  likely in an earlier merge). Keyword-to-category matching, first-match-wins, matches the
  app's actual category set exactly (so every suggestion has a corresponding icon). Re-wired
  into the add-bill form's name/category `onChange` handlers. Confirmed working (e.g. typing
  "Netflix" auto-fills "subscription").

**New standing lesson reinforced twice now:** `next dev`'s compiler is meaningfully more
lenient than a full production build. Run `npm run build` locally before every commit/merge
to `main` — don't rely on the dev server showing no errors as proof the code is deploy-ready.

---

## Previously Fixed (2026-08-27 session — "needs review" reconciliation feature)

Built `findUnresolvedOccurrences()` — flags a bill when its relevant occurrence falls before
the earliest generated period (genuinely invisible to the app), using a one-pay-cycle lookback
window (the user's own principle: "anything beyond one cycle, the user is misusing the app").
Shown as a per-bill blue `HelpCircle` icon with an inline Paid/Not-yet resolve prompt. Also
added a hamburger menu with an Icon Legend, replacing the standalone Log out button.

## Previously Fixed (2026-08-26 session — recurring splits + fundingModel)

Built `getPayDatesInRange()`, `ensureRecurringSplits()` for automatic recurring split
generation. Designed and built the `fundingModel` feature end-to-end, including schema
migration, API validation, UI, and `calculatePayPeriods()` branching logic.

## Previously Fixed (2026-08-24 and 2026-08-23 sessions)

Occurrence-based paid tracking, per-split-leg independent paid tracking, due-date-anchored
split logic, auto-split-on-creation, pay-period boundary fix, overdue-bill visual indicator.

---

## Known Gaps — Actively Being Worked

- **The broader "current state" reconciliation concept is only partially built.** The
  `needsReview` feature covers the specific "orphaned occurrence" case. Still open: a full
  mid-cycle onboarding flow and an end-of-cycle "Did you get paid?" proactive confirmation.
  Both remain future backlog items needing their own design pass, the way `needsReview` got.

---

## Future / Backlog

- **Full mid-cycle onboarding reconciliation flow** and **end-of-cycle "Did you get paid?"
  confirmation** — the remaining, un-built pieces of the "current state" concept.
- **Multi-income-source pay-schedule limitation** — `calculatePayPeriods()` only uses
  `incomeSources[0]`'s pay schedule/anchor. Not an issue for this household, real gap for
  others.
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
- **Consider adopting a real shadcn Dialog component** now that a second modal-style UI
  pattern (`EditBillModal`) exists — currently built with a plain custom overlay; worth
  consolidating into a shared, reusable modal primitive if a third one comes up.

**Design Direction**: BillOut + 1Bill + EveryDollar + Rocket Money references, unchanged.
Not yet decided: exact full palette, font pairing, dark mode toggle.

---

## 7. Current Status

**Phase:** Phases 0–3.5 fully complete, deployed, verified live. Phase 5 core complete.
Phase 6 in progress.

**2026-08-28 session:** Closed out the last remaining `request: NextRequest` typing issue
(only 1 of the 3 previously-flagged files actually still needed it). Designed and built full
bill editing as its own properly-scoped feature — a clear, explicit rule for what happens to
existing split-payment data when a bill's structural fields change, built via a new custom
modal component, confirmed working end-to-end with real testing. Closed out two smaller
backlog items: a second wording pass on the `fundingModel` dropdown (chosen via explicit
comparison of 3 candidates) and a full rebuild of the previously-lost `categorize-bill.ts`
auto-suggest feature. Reinforced the "always run a full `npm run build` before merging to
`main`" lesson a second time.

**Known real gap, next up:** the broader "current state" reconciliation concept (mid-cycle
onboarding, end-of-cycle confirmation) is still only partially built; multi-income-source
support remains a real gap for other users.

**Next: pick between the remaining reconciliation-feature pieces or multi-income-source
support as the next scoped feature to design and build.**

**Last updated:** 2026-08-28

---

## 8. Decision Log

| Date | Decision | Reasoning |
|---|---|---|
| 2026-07-14 | Web + mobile, shared backend | One codebase covers both platforms |
| 2026-07-14 | Rules engine + LLM explains (not LLM does math) | Reliability + cost control |
| 2026-07-16 | Ollama (dev) / Gemini Flash-Lite governed (prod) | Genuinely free at both stages |
| 2026-07-16 | Dropped React Native/Expo, going PWA instead | No store fees, one codebase |
| 2026-08-23 | Occurrence-based paid tracking distinct from forward-only due-date projection | "Which occurrence is paid" and "what's next" are different questions |
| 2026-08-24 | Merged 3 backlog ideas into one future "current state" reconciliation feature | All three are the same underlying need |
| 2026-08-26 | Added explicit `Bill.fundingModel` field instead of trying to infer funding behavior | Two real bill-funding behaviors are legitimate but mutually exclusive |
| 2026-08-27 | Scoped the reconciliation feature narrowly to "orphaned occurrences" only | Precise, buildable in one session, directly solves the concrete gap found through testing |
| 2026-08-27 | Reconciliation lookback is exactly one pay cycle, no further | Beyond one missed cycle is considered misuse of the app, not worth designing for |
| 2026-08-28 | Editing a bill's due date or splittable status deletes unpaid split legs and regenerates fresh ones; paid history is never touched | "Changes are just that, changes" — treat structural edits as starting the split plan over, rather than trying to migrate/reconcile stale data; history stays immutable |
| 2026-08-28 | Built EditBillModal as a plain custom overlay rather than adopting a component library Dialog | No modal pattern existed yet in the project; kept consistent with the app's existing plain-Tailwind conventions rather than introducing a new dependency for one feature |

---

## 9. Session Log

*(Full history through 2026-07-22 preserved in prior version of this document.)*

- **2026-08-23 through 2026-08-26**: Built and confirmed occurrence-based paid tracking,
  per-split-leg independent paid tracking, due-date-anchored split logic, automatic recurring
  split generation, and the `fundingModel` feature. Found and fixed numerous real bugs along
  the way, including several silent-failure classes (typos, stale cached logic, duplicate
  code paths).

- **2026-08-27**: Designed and built the "needs review" reconciliation feature through
  explicit up-front design decisions before writing code. Added a hamburger menu with an
  Icon Legend. Confirmed working via real testing.

- **2026-08-28**: Fixed the final `request: NextRequest` typing issue (found only 1 of 3
  previously-flagged files still needed it). Designed and built full bill editing — agreed an
  explicit "structural change resets the split plan, paid history is immutable" rule before
  writing any code, built a new `EditBillModal` component, and confirmed the regenerate/remove
  split-leg logic works correctly in both directions via real testing. Revisited the
  `fundingModel` wording via explicit comparison of 3 phrasings. Rebuilt the previously-lost
  `categorize-bill.ts` auto-suggest feature from scratch and confirmed it working. Reinforced
  the "run `npm run build` before merging" lesson a second time after catching another type
  error the dev server had missed. **Left open:** the remaining "current state" reconciliation
  pieces (mid-cycle onboarding, end-of-cycle confirmation) and multi-income-source support.

---

## 10. Next Step (pick up here next session)

1. **Decide and design the next scoped feature** — likely one of:
   - The remaining reconciliation pieces (full mid-cycle onboarding review, or the
     end-of-cycle "Did you get paid?" confirmation flow).
   - Multi-income-source pay-schedule support (a real gap for other users, though not this
     household).
2. Lower priority: `noUnusedLocals`/`noUnusedParameters`, consolidating duplicate
   date-equality logic, considering a real Dialog component now that two modal-style UI
   patterns exist.

**Standing lessons/habits to keep in mind going forward:**
- With `--src-dir`, `proxy.ts` goes in `src/`, not `apps/web/` root.
- Always run `npx prisma generate` after schema changes AND fully restart the dev server.
- Clear `apps/web/.next` (and `.turbo`) if a correct-looking file still errors — but if the
  error persists after a genuinely clean cache clear, confirm the file's real content on disk
  before assuming it's still a cache problem.
- Quote bracket-named folders (`[id]`) in shell commands.
- Confirm `pwd` before path-sensitive commands — `node_modules` lives at the monorepo root.
- Commit real bug fixes immediately once confirmed working.
- **Run a full `npm run build` locally before every commit/merge to `main`** — this has
  caught real errors twice that `next dev` missed.
- Next.js 16 App Router dynamic route handlers need `request: NextRequest` — the exact type,
  not plain `Request` — as the literal first parameter, even if unused.
- Never feed a function a fabricated substitute for a value it treats as authoritative.
- When two real-world behaviors are legitimate but mutually exclusive, add an explicit stored
  user choice — don't try to infer or guess.
- A silently-swallowed typo in an object key produces no error anywhere, just a
  wrong-but-plausible fallback.
- When replacing a block of code, confirm the old version is actually deleted, not left
  running alongside the new one.
- Scope reconciliation-style or structural-change features precisely before building — agree
  the exact rule in plain language first (as with the "structural edit resets the split plan"
  rule), then implement it, rather than discovering edge cases mid-build.