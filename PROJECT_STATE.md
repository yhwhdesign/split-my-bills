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
paycheck dates rarely line up — the app's job is to make that mismatch visible and manageable,
not just track bills and income as separate lists.

**Third differentiator, now under active construction:** the app needs to model *how* a bill
is actually funded, not just when it's due. Some bills must be covered by cash-on-hand before
their due date; others are always paid from a specific/next paycheck regardless of due date.
See Section 6 for the `fundingModel` feature that encodes this.

---

## 2. Guardrails / Constraints (do not violate)

- **Net-zero cost.** Every service choice must have a genuinely free tier at our scale.
- **No billing surprises, ever.** Users never hold an API key or call any AI provider
  directly — all AI calls route through our server, gated by a Usage Governor (Phase 3.5).
- **Version control via GitHub.** Feature branches, merged via PR into `main`.
- **Local server must behave like it's live** — reachable from a real phone.
- **Built in VS Code.**
- **Distribution: PWA, not native app stores.**
- **Monorepo** (Turborepo) — shared logic between web and the PWA.
- **Branch workflow**: `main` only receives merges from `dev` after work is tested and
  confirmed. Never commit directly to `main`.
- **Deployment**: Vercel (free tier), connected to GitHub, `main` → production. Local dev and
  production share the SAME Neon database via the same `DATABASE_URL` — test data created
  locally is immediately visible on the live site. No separate dev database set up (deemed
  unnecessary given current usage); wipe via Neon's SQL editor after testing sessions instead.
- **How users get bill data in: manual entry + user-initiated statement upload only.** No
  Plaid/bank-sync in the free core app (real ongoing cost conflicts with net-zero).

**Important conventions learned the hard way:**
- Every Next.js 16 App Router dynamic route handler (`POST`, `DELETE`, etc. in a `[id]/route.ts`
  file) MUST declare `request: NextRequest` as its literal first parameter, even if unused —
  omitting it is a real runtime crash, not just a type-checker complaint, since Next.js always
  calls handlers positionally as `handler(request, context)`.
- Always run `npx prisma generate` explicitly after schema changes, AND fully restart the dev
  server afterward — a regenerated client on disk doesn't help an already-running Node process
  that has the old client cached in memory. A plain browser refresh is not enough.
- In this Turborepo setup, `node_modules` is hoisted to the monorepo root, not present inside
  `apps/web` — `npx prisma migrate dev` must be run from `apps/web` (where `prisma.config.ts`
  lives) for datasource resolution to work; running from the monorepo root fails differently.
- A single mistyped object key in a JSON body (e.g. `findingModel` instead of `fundingModel`)
  fails completely silently — JS doesn't error on unknown/extra keys — and any defensive
  fallback on the receiving end (e.g. `fundingModel ?? "BEFORE_DUE"`) will mask it as a
  "wrong value saved" bug rather than an obvious typo. Worth eventual TypeScript-typed request
  bodies to catch this class of bug at compile time instead of by testing.

---

## 3. Tech Stack (decided)

| Layer | Choice | Notes |
|---|---|---|
| Monorepo tool | **Turborepo** | |
| Backend | Next.js API routes (Node + TypeScript) | No separate backend server |
| Web + Mobile frontend | **Next.js, built as a PWA** | One codebase |
| UI components | **shadcn/ui** (indigo/violet accent) | |
| Database | Postgres via Neon | Free tier, scales to zero when idle |
| ORM | **Prisma 7** | Driver adapters (`@prisma/adapter-pg`) |
| Validation | Zod | Installed, not yet wired into API routes |
| Auth | Self-rolled: bcrypt + `jose` JWT, httpOnly cookies | Fully working |
| Route protection | `src/proxy.ts` (Next.js 16) | |
| AI Provider (dev) | Ollama (local) | Requires Ollama actually running locally — if it's not, AI coaching fails gracefully with a console error but doesn't break anything else |
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
    funding_model  (NEW — "BEFORE_DUE" default | "NEXT_CHECK")

Payment
 └─ id, bill_id, amount, paid_date, status, is_split_payment, split_group_id,
    is_late

SplitSuggestion (AI-generated, cached)
 └─ id, user_id, bill_id, suggested_split, reasoning,
    suggested_dates[], confidence, created_at
```

**`Bill.fundingModel`** — added this session via a real Prisma migration
(`add_bill_funding_model`), applied successfully to production. Defaults every existing bill
to `BEFORE_DUE`, so nothing's behavior silently changed for bills already in the system.
- `BEFORE_DUE`: the bill's due date must fall within a pay period's date range (today's
  original logic) — correct for bills that must be covered by cash-on-hand before they're due
  (e.g. a water bill due the 25th, funded by the paycheck before it).
- `NEXT_CHECK`: the bill is attributed to whichever paycheck lands on or after its due date,
  regardless of which period the due date itself technically falls in — correct for bills
  always paid from a specific/next paycheck (e.g. a mortgage due the 1st, but the household
  always pays it from the first paycheck of the month, even if that lands a few days late).

**Split-payment legs** (`Payment` rows with `isSplitPayment: true`) now correctly recur every
pay cycle automatically (see Section 6) and can be marked paid/unpaid independently of each
other via their own `status` field.

---

## 5. AI Design Principle

The rules engine computes numbers (cashflow strain, split feasibility).
The LLM only explains/prioritizes those numbers in plain English — it does not do the math.

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
  `Logo` component, category icons, pill status badges, income-vs-bills progress bar, split-leg
  sub-row UI, overdue-bill visual indicator (with correct split-bill handling). Still open:
  dashboard-as-hub restructuring, account menu/settings page, loading/empty states, motion.
- [ ] **Phase 7 — Savings Guidance (future)** — not scoped in detail.

---

## Recently Fixed / Built (2026-08-26 session — recurring splits + funding model)

**Recurring split generation — built and working.**
- `packages/shared/src/index.ts`: added `getPayDatesInRange(paySchedule, anchorDate,
  rangeStart, rangeEnd)` — walks backward AND forward from the user's *real* pay anchor to
  find every payday in any given range. This replaced an earlier, broken attempt that
  fabricated a fake substitute anchor date and fed it into `getUpcomingPayDates()`, which
  silently produced wrong payday cycles (e.g. 8/15/8/29 instead of the real 8/21/9/4 cycle) —
  root cause: never feed a function a fabricated stand-in for a value it treats as
  authoritative.
- Rewrote `pickSplitDates()` to use `getPayDatesInRange()` — confirmed correct against real
  data: a bill due the 25th, tested with a real payday anchor, produced the correct real
  paydays.
- `apps/web/src/lib/split-bill.ts`: added `ensureRecurringSplits()`, called at the top of
  `GET /api/split-suggestions` for every bill that is `splittable && isRecurring` — backfills
  a new pair of split payments each cycle automatically, mirroring how `projectBillDueDates()`
  already makes unsplit bills' due dates reappear every month with zero manual action.
- Confirmed: splittable/recurring status doesn't need a separate "one-time split" mode — every
  splittable bill just recurs by default via the existing `isRecurring` field; if it shouldn't
  recur, the user deletes it.

**`fundingModel` feature — built and confirmed working (after fixing 3 real bugs along the way).**
- Schema: `Bill.fundingModel` enum field added via migration, defaults to `BEFORE_DUE`.
- `POST /api/bills/route.ts`: accepts `fundingModel`, defensively validates it (falls back to
  `BEFORE_DUE` for any unrecognized value) rather than trusting the raw request body.
- `dashboard/page.tsx`: added a select on the add-bill form ("Paid from cash on hand, before
  the due date" / "Paid from the next paycheck on or after the due date").
- `packages/shared/src/index.ts`: `Bill` interface now requires `fundingModel`;
  `calculatePayPeriods()`'s bill-to-period assignment logic branches on it — `NEXT_CHECK`
  bills are attributed to the first payday on/after their due date, `BEFORE_DUE` bills keep
  the original due-date-inside-period-range check.
- **Confirmed correct with real testing**: a mortgage due the 1st with `fundingModel:
  NEXT_CHECK` now correctly shows in the 9/4 period (not 8/21) and the 10/2 period (not
  9/18), matching the household's real payment pattern.

**Three real bugs found and fixed during this feature's build (all now resolved):**
1. A typo in `dashboard/page.tsx`'s `handleAddBill` — sent `findingModel` instead of
   `fundingModel` in the request body. Failed completely silently (no server error) because
   the defensive fallback in `POST /api/bills` quietly defaulted to `BEFORE_DUE` — looked like
   a "wrong value saved" bug until the exact field name was checked character-by-character.
2. `paidThisMonth` (`GET /api/bills`) had regressed back to using `projectBillDueDates()`
   instead of `getCurrentOccurrence()` — likely reverted during an earlier merge — causing
   repeated duplicate `PAID` `Payment` rows (8 created in one test) with the checkbox never
   visually updating. Fixed by restoring `getCurrentOccurrence()`.
3. `/api/split-suggestions/route.ts`'s `paidOccurrences` computation had the same
   calendar-month-relative bug in a third location — fixed properly (not just patched) by
   removing the recompute-and-compare logic entirely: `paidOccurrences` is now built directly
   from real `PAID` `Payment` rows' own stored `paidDate` values, which is simpler, always
   accurate, and naturally supports multiple stacked unpaid occurrences if that ever happens.
4. **The final `calculatePayPeriods()` fix accidentally left the OLD assignment loop in place
   alongside the NEW `fundingModel`-aware one**, instead of replacing it — both loops ran every
   period, causing the `NEXT_CHECK` mortgage to be pushed twice (once by each loop, into two
   different periods). Fixed by deleting the old loop entirely, leaving only the
   `fundingModel`-aware version.

**Discovered, not yet built:** with `fundingModel: NEXT_CHECK` now correctly excluding a bill
from a period where its due date falls before that period even starts (e.g. the 9/1 mortgage
correctly isn't listed under 8/21 anymore), there is currently **no mechanism to reconcile a
past, unaddressed occurrence** — e.g. August's mortgage never appeared in any period the user
could act on, yet `isOverdue` correctly flags it as unpaid with no natural place to resolve
it. This is the user's own real-world confirmation of the previously-scoped "current state"
reconciliation feature (see below) — precisely the gap it needs to close.

---

## Previously Fixed (2026-08-24 and 2026-08-23 sessions)

- Occurrence-based paid tracking (`getCurrentOccurrence()` vs. `projectBillDueDates()`)
- Per-split-leg independent paid/unpaid toggling (`/api/payments/[id]/pay`)
- Due-date-anchored one-time split logic (superseded/extended by this session's recurring work)
- Auto-split-on-bill-creation, pay-period boundary fix, Prisma schema relation fix
- Overdue-bill visual indicator, including correct split-bill handling

---

## Known Gaps — Actively Being Worked

- **"Current state" reconciliation feature — the single highest-priority next design item.**
  Concretely demonstrated this session: a `NEXT_CHECK` bill's earlier due-date occurrence can
  fall entirely outside any period the user is shown, yet remain genuinely unpaid and
  unaddressed. The app needs a mechanism to surface and resolve occurrences like this — most
  concretely, the user described wanting: at the point a new cycle rolls in (or on request),
  the app prompts "has [bill] been paid for [prior period]?" and lets the user confirm or
  correct it, rather than the app silently assuming or requiring the user to notice on their
  own. This unifies three previously-separate backlog ideas: mid-cycle onboarding
  reconciliation, an end-of-cycle "Did you get paid?" confirmation, and predictable
  late-due-to-payday-timing bills (now partially modeled via `fundingModel`, but the
  backward-looking gap itself is still fully open). Wants this designed in its own dedicated
  session.
- **Three route handlers still missing the required `request: NextRequest` parameter**
  (`bills/[id]/route.ts` DELETE, `bills/[id]/split/route.ts` POST, `income/[id]/route.ts`
  DELETE) — same bug class that caused a real runtime crash once already elsewhere.

---

## Future / Backlog

- **Full bill editing.** Currently the edit/pencil button only allows editing `amount` via a
  small inline form. Requested: ability to edit everything (due date, category, splittable,
  fundingModel) — deliberately scoped as its own future feature rather than done quickly,
  since it needs: reusing the full add-bill form fields for an edit flow, updating
  `PATCH /api/bills/[id]/route.ts` to accept all fields, and a real product decision on what
  happens to existing split `Payment` rows when a bill's due date or splittable status changes
  after the fact (regenerate them vs. leave stale).
- **Multi-income-source pay-schedule limitation.** `calculatePayPeriods()` only uses
  `incomeSources[0]`'s pay schedule/anchor for period boundaries and paydays — not an issue
  for this household (both paychecks land the same day) but a real gap for other users.
- **Consolidate duplicate date-equality logic** across a few files into one shared helper.
- **Handle stale/historical split-payment rows in the UI** if a bill ever accumulates split
  history across multiple cycles (currently shows all `isSplitPayment` rows found).
- **Push notifications**, **spending trend charts**, **"Remaining" card color gradient**,
  **calendar visualization for pay/due dates**, **collapsible add-forms**, **account/settings
  page**, **email payment-confirmation scanning (opt-in, read-only Gmail search)**,
  **budget-tracker checklist view**, **dashboard-as-information-hub restructuring** — all
  previously logged, unchanged this session.
- **Security hardening**: dependency scanning, Zod validation on API routes, re-enable
  `noUnusedLocals`/`noUnusedParameters` in `tsconfig.json` once the codebase is stable enough.

**Design Direction**: BillOut (calm, card-based) + 1Bill (bold color confidence) + EveryDollar
(clarity benchmark) + Rocket Money (dark high-contrast hero, bold data viz). Not yet decided:
exact full palette, font pairing, dark mode toggle.

**Other standing notes**: iOS PWA install behavior researched and confirmed working; Plaid
bank-sync deliberately excluded from the free core app; multi-user architecture (spouse as a
real user) was designed in from the start.

---

## 7. Current Status

**Phase:** Phases 0–3.5 fully complete, deployed, verified live. Phase 5 core complete.
Phase 6 in progress.

**2026-08-26 session:** Built and confirmed working: automatic recurring split-payment
generation (a splittable, recurring bill now gets a fresh pair of split payments every pay
cycle with zero manual action), and a new `fundingModel` field letting each bill declare
whether it's funded by cash-on-hand before its due date, or by the next paycheck on/after its
due date — resolving a genuine, previously undiagnosed conflict between two real household
bill types (a water bill vs. a mortgage). Found and fixed four real bugs along the way,
including a subtle silent-typo bug and a duplicate-loop bug from an incomplete replacement
edit. Testing the `fundingModel` fix surfaced, very concretely, the exact shape of the
"current state" reconciliation feature that's been scoped but deliberately deferred across
several sessions — a real past-due occurrence with no natural point in the UI for the user to
resolve it.

**Known real gap, next up:** design and build the "current state" reconciliation feature —
this is now clearly the single most valuable next step, with a concrete, user-confirmed
example ready to design against. Secondary: full bill editing, and the three remaining
`request: NextRequest` fixes.

**Next: design the reconciliation feature (a prompt/flow for confirming whether past-due
occurrences were actually paid) as its own dedicated session, starting from tonight's exact
mortgage example.**

**Last updated:** 2026-08-26

---

## 8. Decision Log

| Date | Decision | Reasoning |
|---|---|---|
| 2026-07-14 | Web + mobile, shared backend | One codebase covers both platforms |
| 2026-07-14 | Manual entry first, Plaid later | Reduces early complexity/cost risk |
| 2026-07-14 | Rules engine + LLM explains (not LLM does math) | Reliability + cost control |
| 2026-07-14 | Net-zero cost constraint set | User requirement |
| 2026-07-16 | Ollama (dev) / Gemini Flash-Lite governed (prod) | Genuinely free at both stages |
| 2026-07-16 | Built a Usage Governor as its own phase | Zero billing surprises, hard requirement |
| 2026-07-16 | Dropped React Native/Expo, going PWA instead | No store fees, one codebase |
| 2026-08-23 | Occurrence-based paid tracking, `getCurrentOccurrence()` distinct from `projectBillDueDates()` | "Which occurrence is being paid" and "what's next" are different questions |
| 2026-08-23 | Split-payment legs marked paid independently | Legs land in different pay periods, paid at different times |
| 2026-08-24 | Split dates anchored to the bill's due date, not today's date | Splits fund a bill by its due date regardless of when the app is opened |
| 2026-08-24 | Merged 3 backlog ideas into one future "current state" reconciliation feature | All three are the same underlying need: an as-of-today view looking both backward and forward |
| 2026-08-26 | Recurring split generation is automatic and default for any splittable+recurring bill, no separate one-time-split mode | Every real bill the household splits is recurring in practice; deletion covers the rare exception |
| 2026-08-26 | Added explicit `Bill.fundingModel` field instead of trying to infer funding behavior | Two real household bill types are legitimate but mutually exclusive — cash-on-hand-before-due vs. next-check-after-due — and can't be reconciled by one universal rule; an explicit stored choice is more honest and more reliable than clever inference |

---

## 9. Session Log

*(Full history through 2026-07-22 preserved in prior version of this document.)*

- **2026-08-23 (three sessions)**: Fixed auto-split-on-creation, pay-period boundary bug,
  `paidOccurrences` argument bug, `getCurrentOccurrence()` vs `projectBillDueDates()`,
  split-leg independent paid tracking, a real runtime crash from a missing `request`
  parameter, and stale test data cleanup.

- **2026-08-24**: Root-caused and fixed the split-date bug (`planBillSplit()` needed to anchor
  to the bill's due date, not today's date) via a real example (loan due the 25th, split paid
  the 7th/21st). Did a full DB wipe and ran deliberate A/B tests confirming Remaining, Upcoming
  Pay Periods, and overdue-occurrence handling all behave correctly. Shipped the overdue-bill
  visual indicator, including correct handling for split bills. Merged to `main` (untangling a
  genuinely messy conflict along the way). Surfaced and named the "current state"
  reconciliation concept from real usage (mortgage due the 1st, funded by a payday landing on
  the 4th) and the recurring-splits gap (a splittable bill only ever getting one pair of
  payments, ever).

- **2026-08-26**: Built recurring split generation end-to-end (`getPayDatesInRange()`,
  rewritten `pickSplitDates()`, `ensureRecurringSplits()`), fixing a real anchor-fabrication
  bug along the way. Designed and built the `fundingModel` feature (schema migration, API,
  UI, `calculatePayPeriods()` branching logic) to resolve a genuine conflict between two real
  bill-funding behaviors. Found and fixed three additional real bugs during testing (a silent
  typo, a regressed `paidThisMonth` calculation, a stale calendar-relative `paidOccurrences`
  check, and a duplicate-loop leftover from an incomplete edit — four total, corrected above).
  Confirmed the fix works correctly with real data. Testing surfaced a concrete, user-described
  example of the reconciliation feature's exact shape, ready to design from next session.
  **Left open:** the reconciliation feature itself (design not started), the 3 remaining
  `request: NextRequest` fixes, and full bill editing (newly requested, deliberately deferred).

---

## 10. Next Step (pick up here next session)

1. **Design the "current state" reconciliation feature**, starting from tonight's concrete
   example: a `NEXT_CHECK` bill's earlier due-date occurrence can fall outside every period
   shown to the user, yet remain genuinely unpaid with no natural point to resolve it. Rough
   shape already discussed: a prompt, at the start of a new cycle or on request, asking
   "has [bill] been paid for [prior period]?" — design the actual UI flow, when it triggers,
   and how confirmed/denied answers update `Payment` records, before writing any code.
2. **Fix the 3 remaining route handlers** missing `request: NextRequest`:
   `bills/[id]/route.ts` DELETE, `bills/[id]/split/route.ts` POST, `income/[id]/route.ts`
   DELETE.
3. **Scope and build full bill editing** (amount, due date, category, splittable,
   fundingModel) — including the product decision on what happens to existing split
   `Payment` rows when relevant fields change.
4. Lower priority: multi-income-schedule support, `noUnusedLocals`/`noUnusedParameters`,
   consolidating duplicate date-equality logic.

**Standing lessons/habits to keep in mind going forward:**
- With `--src-dir`, `proxy.ts` goes in `src/`, not `apps/web/` root.
- Always run `npx prisma generate` after schema changes AND fully restart the dev server
  afterward — a regenerated client on disk doesn't help an already-running process.
- Clear `apps/web/.next` if a correct-looking file still errors.
- Quote bracket-named folders (`[id]`) in shell commands, or zsh will glob-expand them.
- Confirm `pwd` before path-sensitive commands — in this monorepo, `node_modules` lives at the
  root, not inside `apps/web`, which affects where certain `npx` commands must be run from.
- Commit real bug fixes immediately once confirmed working.
- Next.js 16 App Router dynamic route handlers need `request: NextRequest` as the literal
  first parameter, even if unused — omitting it is a real runtime crash.
- A correctly-typed variable that's computed but never passed as a function argument produces
  no compiler error without `noUnusedLocals` enabled.
- **A function that fabricates a substitute input value and feeds it into another function
  that treats that input as authoritative will silently drift wrong** — never fake an anchor
  date, ID, or similar "source of truth" value; compute the real range/window around the real
  value instead.
- **When two real-world behaviors are legitimate but mutually exclusive, add an explicit
  stored user choice — don't try to infer or guess.** The `fundingModel` field exists because
  no universal date-math rule could satisfy both a "pay before due date" bill and a "pay from
  next check regardless of due date" bill at the same time.
- **A silently-swallowed typo in an object key is one of the hardest bugs to spot** — it
  produces no error anywhere, just a wrong-but-plausible fallback value. When a value "isn't
  saving right" despite correct-looking code on both ends, check the exact field name
  character-by-character before assuming deeper logic is wrong.
- **When replacing a block of code, make sure the old version is actually deleted** — an
  incomplete "add this, in place of that" instruction can result in both versions running
  side by side, silently doubling results instead of throwing any visible error.