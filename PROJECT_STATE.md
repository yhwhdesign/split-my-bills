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
- **Deployment**: live app is on Vercel (free tier), connected to GitHub. `main` is linked
  as the production branch — merging `dev` → `main` and pushing will auto-deploy to
  https://split-my-bills.vercel.app (confirm this auto-deploy behavior is actually enabled/
  desired before relying on it; so far deploys have been triggered manually via `vercel --prod`).
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
| Web + Mobile frontend | **Next.js, built as a PWA** | One codebase. Installable on phones via manifest + service worker (Phase 5, not yet built). No app store, no store fees, no RN/Expo needed. |
| UI components | **shadcn/ui** (Radix UI + Maia preset) | Free, copy-paste, no lock-in. Indigo/violet accent color, not generic finance green/blue |
| Database | Postgres via Neon | Free tier, scales to zero when idle. **Live and connected.** |
| ORM | **Prisma 7** | Uses driver adapters (`@prisma/adapter-pg`) — a Prisma 7 breaking change from older versions. Schema deployed, migrations working |
| Validation | Zod | Not yet wired into API routes — planned, not yet done |
| Auth | **Self-rolled**: bcrypt password hashing + `jose` JWT sessions, httpOnly cookies | **Built and fully verified working** |
| Route protection | **`proxy.ts`** (Next.js 16's replacement for `middleware.ts`) | Must live in `src/proxy.ts` given our `--src-dir` setup |
| AI Provider (dev) | **Ollama** (local, self-hosted, unlimited, zero cost) | Not yet integrated — Phase 3 |
| AI Provider (production) | **Gemini Flash-Lite free tier** | Capped (~1,500 req/day, 15 RPM). Not yet integrated — Phase 3 |
| Usage Governor | Custom — tracks calls in our DB, enforces a ceiling below Google's real cap, caches AI responses, falls back to rules-engine-only output when near/at the limit | Designed, not yet built — Phase 3.5 |
| CI | GitHub Actions | Free minutes. Not yet set up |

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

- [x] **Phase 0 — Setup**: GitHub repo, monorepo scaffold, VS Code config, `.env.example` — **complete**
- [x] **Phase 1 — Core MVP**: auth (✅ complete, verified), manual income/bill CRUD
  (✅ **fully complete** — create/read/update/delete all working end to end, inline-edit UI
  built), dashboard showing income vs. bills vs. remaining (✅ complete) — **Phase 1 complete**
- [x] **Phase 2 — Split Engine**: pay-schedule-aware cashflow calculator, split suggestion logic
  — **core logic complete**: pay periods, 3-paycheck-month detection, shortfall calculation,
  and split suggestions all built, wired end to end, and verified with no errors. Not yet
  manually tested against a real/deliberate shortfall scenario, but logic confirmed sound.
  **Explicit scope addition (2026-07-19, from real user experience):** biweekly/weekly pay
  schedules produce a genuine "3-paycheck month" roughly twice a year (26 biweekly paychecks
  don't divide evenly into 12 months) — a common real situation most budgeting apps ignore.
  The engine must detect these months explicitly and treat the "extra" paycheck as a planning
  opportunity (build buffer, prepay a splittable bill, or prepare for the following leaner
  2-paycheck month) rather than letting it blend into normal spending unnoticed. This is a
  strong showcase for both the split-suggestion feature and the AI coaching layer.
  **Status: FULLY COMPLETE (2026-07-20)** — detection, shortfall suggestions, AND
  3-paycheck-month opportunity suggestions (`generateOpportunitySuggestions()`) all built,
  wired, and compiling with no errors. **2026-07-19: manually tested end to end with a real
  shortfall scenario** (added a bill large enough to push a period into deficit, marked it
  splittable) — Pay Periods correctly flipped to "Short $X.XX," and the Split Suggestions
  card correctly appeared showing the bill with accurate reasoning.
- [ ] **Phase 3 — AI Coaching Layer**: `AIProvider` interface (Ollama default, Gemini fallback), plain-English suggestions endpoint
- [ ] **Phase 3.5 — Usage Governor**: `AIUsageLog` table, daily ceiling check before every AI call, response caching keyed on bill/income snapshot, graceful fallback to rules-engine-only output, admin usage-visibility endpoint
- [ ] **Phase 4 — Statement Import & Trend Analysis**: user-initiated CSV/PDF bank statement
  upload (their choice, nothing auto-pulled), AI-parsed into structured bills/transactions
  (reuses the same AI layer as Phase 3), trend detection (recurring bills, average amounts,
  spending patterns) and cashflow projections built from real historical data. Zero new
  vendor cost — no bank API, just file parsing.
- [ ] **Phase 5 — PWA Polish**: manifest.json, service worker, installability, offline fallback, mobile-responsive UI pass, "update available" refresh prompt flow, iOS install-guidance screen (see backlog note below)
- [ ] **Phase 6 — Visual Design System & Polish**: a dedicated phase to actually close the gap
  toward feeling like a genuinely shippable, designed product (BillOut/1Bill-level), not just
  a functional app. Consolidates previously-scattered backlog design ideas into real scope:
  (1) "Remaining" card color gradient (green→yellow→red) + warning icon; (2) collapsible
  "add income/bill" forms with progressive disclosure; (3) pay-date + bill-date calendar
  visualization; (4) "Recurring" vs "One-time" bill grouping; (5) spending trend charts
  (ties to Phase 4 data); (6) distinct header/dropdown coloring on expandable cards;
  (7) a genuine design-system pass — consistent spacing scale, refined typography beyond the
  current ad-hoc sizing, possibly custom illustration/empty-states, real micro-interactions
  (transitions, hover states, loading skeletons instead of plain "Loading..." text). This is
  intentionally the LAST core phase — real design polish is most effective once all features
  exist to be polished, not before. Expect this to take real, iterative time across multiple
  sessions, not one sitting.
- [ ] **Phase 7 — Savings Guidance (future)**: user clarified the app's core vision (2026-07-22):
  input all data once, get clear guidance across paychecks/bills/3-paycheck-month timing, see
  a clear view of the rest of the year at a glance — then expand into an AI-assisted savings
  advisor that helps identify opportunities to save money based on the user's real financial
  patterns. Not yet scoped in detail — flagged as the natural next major feature area after
  core bill/split functionality and Phase 6 polish are solid.

---

## Future / Backlog (not yet phased — tracked so we don't lose them)

- **Security hardening**: password hashing, secure sessions, per-user data isolation
  (every query scoped to logged-in user), input validation via Zod on all entry points,
  automated dependency scanning (GitHub Actions + Dependabot, free).
- **Push notifications**: Web Push API (free, standard). Note: iOS Safari requires the PWA
  be "Added to Home Screen" before push works — plan an install prompt/nudge if we want
  reliable iPhone delivery. Android/Chrome has no such restriction.
- **Rocket Money-inspired ideas** (added 2026-07-19): spending trend line/bar charts over
  time (Phase 4, once statement import gives us historical data — `recharts` available);
  visually group "Recurring" vs "One-time" bills on the dashboard instead of one flat list
  (`isRecurring` field already exists on `Bill`, just needs UI work); trend indicator
  (up/down arrow vs. last period) on the "Remaining" summary card instead of a flat snapshot.
- **"Remaining" definition confirmed** (2026-07-19): stays a budget-snapshot number
  (Income − ALL bills, paid or not), not a live cash balance — user confirmed this is correct
  since there's no bank connection to track true real-time balance against anyway.
- **Upcoming Pay Periods — visual polish for later** (2026-07-19): once more color/theming
  work happens, the expandable period header and its dropdown bill-list body should use
  visually distinct background colors/shades (header vs. expanded content), not the same
  surface — pure eye-candy, low priority, revisit during a dedicated visual-polish pass.
- **"Remaining" card color gradient + warning icon** (added 2026-07-19, user idea): instead
  of the current binary red/primary color logic, grade the "Remaining" card's background
  through green → yellow → red based on how much buffer remains (not just negative-or-not),
  with a warning icon appearing once it crosses into the red zone. Ties directly into the
  already-planned push notifications (Phase 5) — a new trigger condition ("remaining balance
  entered the red zone") rather than a new notification system. Not yet built — logged as
  visual-polish work to tackle once Phase 2's core split-suggestion logic is complete, so the
  two pieces of work don't get half-finished in parallel.
- **Calendar visualization for pay dates + bill due dates** (added 2026-07-20, user idea):
  after a user's first income source is entered, show a calendar (month and/or year view)
  plotting small colored dots on paydays — extendable to also plot bill due dates in a
  different color. User-customizable dot colors (future settings page). Same-day overlaps
  should stack distinct dots rather than merge colors, so nothing gets hidden. **Technically
  well-positioned to build**: `getUpcomingPayDates()` and `projectBillDueDates()` already
  generate real calendar dates for exactly this purpose — currently capped at a 60-day
  rolling window for the cashflow engine, would just need extending to a full-year window
  for calendar display. Good pairing with Phase 2's existing risk detection — seeing pay
  dates and bill dates on the same calendar makes shortfall periods visually obvious. Not
  yet built — good candidate for a dedicated visual/UX phase.
- **Collapsible "add income" form + calendar placement** (added 2026-07-20, user idea): once
  at least one income source exists, collapse/shrink the add-income form (currently always
  visible) and replace it with an "Add more income" button that expands the form back down
  when clicked. The form itself should include a "Done for now" button (alongside the
  existing "Add Income" button) to collapse it back up. The pay-date calendar (see above)
  should live directly under the Income Sources list, in this same collapsed/expanded flow.
  On mobile specifically, likely wants a modal/sheet pattern instead of inline expand, for
  space reasons — to be finalized during actual mobile-responsive UI work (Phase 5). Same
  progressive-disclosure pattern likely worth applying to the Bills form too, for consistency.
  Not yet built — UX/polish backlog, to tackle once core functionality (Phase 3+) is further
  along.

- **2026-07-20 (cont'd, Phase 3 started)**: Started Phase 3 (AI coaching layer). Installed
  Ollama locally, pulled `llama3.1:8b`, confirmed working via `ollama run`. Built the
  `AIProvider` interface (`src/lib/ai/provider.ts` — one method, `generateCoaching()`, takes
  our already-computed Phase 2 structured data and returns plain-English text, per the
  original "rules engine computes, AI explains" design principle) and `OllamaProvider`
  implementation (`src/lib/ai/ollama-provider.ts`) with a carefully constructed prompt: hands
  the model our pre-computed numbers rather than asking it to do math, includes tone/length
  constraints (concise, warm, ~150 words), and explicitly instructs it to say things look
  fine when they do rather than manufacturing false urgency. Tested directly via a standalone
  script (`npx tsx src/lib/ai/test.ts`) against sample data — **confirmed working, produced
  genuinely usable coaching output.** Noted a real, expected tradeoff: running the 8B model
  locally briefly used significant CPU/resources during generation — confirms the reasoning
  behind planning Gemini (not self-hosted Ollama) for production, since a live multi-user app
  can't have every request bog down a shared server. Local dev experience only; doesn't
  affect end users once Gemini is wired up. Noted `llama3.2:3b` as a lighter/faster local
  model option if the 8B model's resource use becomes annoying during regular dev work.

  Hit a real scare: local login started failing with `ECONNREFUSED` from Prisma while the
  Vercel deployment worked fine. Root cause found by user: `apps/web/.env` had accidentally
  been overwritten with unrelated content (from copy-pasting the project status file at some
  point), corrupting `DATABASE_URL`. Fixed by restoring the correct value. **Lesson: keep
  `.env` edits isolated — don't paste other file contents into the same editor session
  without double-checking which file is active.** Confirmed working again locally.

- **2026-07-20 (cont'd)**: Confirmed the AI Coach dashboard card works end to end — real,
  data-grounded output rendering correctly (two paragraphs, clearly reflecting actual input
  data). Switched local dev default from `llama3.1:8b` to `llama3.2:3b` (smaller/faster
  download and inference) per user preference: fast iteration now while testing wiring, since
  the prompt/pipeline logic is model-independent and doesn't need final-quality output to
  validate. **Real quality difference observed and worth remembering**: `llama3.1:8b` gave
  direct, concrete, actionable coaching suggestions; `llama3.2:3b` gave the same volume of
  information but leaned generic/encouraging rather than specific — same prompt, smaller
  model followed the "give concrete actions" instruction less closely. **Standing decision:
  `llama3.2:3b` stays the local dev default for now** (fast iteration), but the real quality
  bar for this feature is the `8b`/Gemini level, not the `3b` level — worth switching back to
  a larger model (or testing against Gemini) before judging final output quality, not just
  wiring correctness.

**Next session starts here:** AI coaching pipeline is fully built, wired, and confirmed
working end to end locally via Ollama (currently `llama3.2:3b` for fast dev iteration).
Remaining Phase 3 work: build the `GeminiProvider` (production AI, free tier) and the Usage
Governor (Phase 3.5 — daily ceiling tracking, response caching, graceful fallback to
rules-engine-only output). Session paused here (near usage limit).

- **2026-07-20 (cont'd)**: Built `GeminiProvider` (`src/lib/ai/gemini-provider.ts`) — calls
  the Gemini Flash-Lite free-tier API. Refactored the previously-duplicated prompt-building
  logic out of both `ollama-provider.ts` and `gemini-provider.ts` into a single shared
  `buildCoachingPrompt()` in `src/lib/ai/prompt.ts`, so the two providers can never drift out
  of sync. Built `getAIProvider()` (`src/lib/ai/get-provider.ts`) — a simple selector that
  returns `GeminiProvider` when `NODE_ENV === "production"` and `OllamaProvider` otherwise,
  requiring zero manual configuration since Next.js/Vercel set `NODE_ENV` automatically.
  Updated `/api/ai-coaching` to use the selector instead of hardcoding Ollama. **Confirmed
  the graceful-degradation error handling works correctly in practice**: tested locally with
  Ollama stopped — request failed cleanly, route caught it and returned `coaching: null`
  instead of crashing; restarting Ollama fixed it immediately with no other changes needed.
  Added `GEMINI_API_KEY` to `.env.example`. **Both providers built, selector wired, local
  (Ollama) path fully confirmed working — Gemini (production) path not yet tested live.**

- **2026-07-20 (cont'd)**: Deployed Phase 3 AI work to production. Merged `dev` → `main`,
  pushed. Ran into a Vercel CLI "not authorized" error — resolved with `vercel login` to
  re-authenticate (session had simply expired, not a real problem). **Confirmed the Gemini
  production path works live on https://split-my-bills.vercel.app** — the deployed app
  correctly used `GeminiProvider` (via `NODE_ENV === "production"`) and the AI Coach card
  rendered real output. **Phase 3's core provider system is now fully complete and verified
  on both paths**: Ollama locally, Gemini in production, automatic selection, no manual
  switching required. Remaining Phase 3 work: the Usage Governor (Phase 3.5) — daily ceiling
  tracking, response caching, graceful fallback to rules-engine-only output when near/at the
  free-tier limit.

- **2026-07-20 (cont'd, Phase 3.5)**: Built the Usage Governor. Added `AIUsageLog` (one row
  per calendar day, tracks call count) and `AICoachingCache` (one cached response per user,
  keyed by a hash of their current bills/income/suggestions data) to the Prisma schema, ran
  both migrations. Built `src/lib/ai/usage-governor.ts`: `canMakeAICall()` checks today's
  count against a ceiling of 1,350 (deliberately below Gemini's real 1,500/day free-tier cap,
  so a burst of traffic can't cross the real limit before our counter catches up) — but only
  actively limits in production, since local Ollama dev calls are free/unlimited and shouldn't
  be throttled; `recordAICall()` increments today's count; `hashCoachingInput()` (SHA-256)
  supports the caching layer. Wired into `/api/ai-coaching`: checks cache first (if the
  user's underlying data hasn't changed since their last AI call, serves the cached response
  instantly with zero quota used); if no valid cache, checks the governor before calling the
  AI provider; on success, records the call and updates the cache. Added a graceful, honest
  UI message on the dashboard's AI Coach card for when the daily limit is reached — reassures
  the user that their bills/split suggestions above remain fully accurate, only the AI
  narration pauses until the next day. Compiled with no errors.

  **Phase 3 is now fully complete**: dual-provider system (Ollama dev / Gemini production)
  verified working on both paths, plus the Usage Governor guaranteeing the original
  net-zero/no-billing-surprises promise now that AI calls are live in production. This closes
  out the original three-part AI vision from session one: rules engine computes, AI explains,
  governor guarantees it never costs anything.

- **2026-07-20 (cont'd, session end)**: Deployed the Usage Governor to production. Merged
  `dev` → `main` (this time via an interactive Vim merge-commit prompt — noted as a normal,
  expected part of `git merge` when there's no `-m` flag; save and exit with `:wq`). Pushed to
  `origin/main`. **Confirmed working live on https://split-my-bills.vercel.app via mobile** —
  the full app, including the AI coaching pipeline and Usage Governor, is now deployed and
  verified working in production. **Phase 3 (AI coaching layer) is fully complete, deployed,
  and confirmed working end to end.** Session paused here.

- **2026-07-20 (cont'd)**: Made quick mobile-responsive fixes to the dashboard — summary
  cards grid (`grid-cols-1 sm:grid-cols-3`), Income/Bills two-column grid
  (`grid-cols-1 md:grid-cols-2`), tighter outer padding on mobile (`p-4 sm:p-8`), and
  `flex-wrap` on bill/income list rows and pay-period header rows so content wraps instead of
  overflowing on narrow screens. **These are functional fixes only** — nothing overlapping or
  broken anymore — **not a real visual redesign**. User confirmed it's usable now but still
  not close to the BillOut/1Bill-inspired look from the design direction notes. **Flagged as
  needing its own dedicated design session**: pull up the BillOut/1Bill references again
  side-by-side with the actual app and rebuild the dashboard's visual structure intentionally
  (real card styling, spacing rhythm, information grouping) rather than continuing to patch
  individual Tailwind classes piecemeal. This is real, not-yet-done work — distinct from the
  "mobile-responsive" checkbox, which is now reasonably satisfied functionally.

- **2026-07-21**: Dedicated design session, as planned — pulled up BillOut and 1Bill
  references again fresh, compared side-by-side with the actual current app, and made a
  deliberate visual pass rather than more piecemeal tweaks. Changes: added `shadow-sm` +
  `py-6` (real elevation + breathing room) consistently across every card on the dashboard
  (summary cards, AI Coach, Pay Periods, Split Suggestions, Opportunities, Income Sources,
  Bills); bumped summary card numbers to `text-3xl font-bold` with small uppercase-tracked
  labels above them for confident hierarchy; increased outer section spacing
  (`space-y-8 sm:space-y-10`); made primary buttons `font-semibold` for more visual
  confidence; added clear typography hierarchy within list rows (bold `font-medium` names,
  `font-semibold` amounts — previously everything was the same weight); restructured bill
  rows into a two-line layout (bold name on top, smaller muted "Due X · Category" line
  below), finally surfacing the `category` field visually for the first time and matching
  BillOut's pattern of bold-primary-info + small-muted-metadata per row. **Confirmed working
  in local dev.** This is a real, meaningful visual step toward the BillOut/1Bill design
  direction — not yet a full match, but no longer just "functional and unstyled." Good
  natural stopping point for the session.

- **2026-07-21 (cont'd)**: Extended design session, incorporating Rocket Money as a third
  visual reference alongside BillOut/1Bill. Researched Rocket Money's actual visual language
  (dark high-contrast hero sections, bold data visualization, confident large numbers) rather
  than just features. Discussed design philosophy at length: visual interest should come from
  clarity/confidence/purposeful motion, not decoration for its own sake — restraint with one
  accent color, real data visualization once available, whitespace as a deliberate feature.
  Gave an honest comparative assessment against all three references: design language is
  genuinely in the same family (not clashing/amateurish), feature set is arguably ahead in
  one meaningful way (pay-schedule-aware split suggestions + 3-paycheck-month detection, which
  none of the three references do), and the honest gap is iteration density — no real charts
  yet (blocked on Phase 4 data), no motion/animation, no loading/empty-state polish, less
  component-level refinement — all addressable, not signs of a flawed foundation.

  Consolidated all scattered Phase 6-adjacent backlog design ideas into a real, scoped
  **Phase 6 — Visual Design System & Polish**, deliberately placed as the last core phase
  (most effective once all features exist to be polished).

  Built and shipped several concrete improvements: (1) softened `--background` from pure
  white to a subtle warm off-white (`oklch(0.975 0.003 90)`) per user's correct read that
  pure white felt harsh/sterile — kept `--card` at true white so cards still visually "lift"
  off the page; (2) replaced the three separate light summary cards + progress bar with a
  single unified dark hero card (`bg-zinc-900`, white/zinc-400 text, divided stat columns)
  — directly inspired by Rocket Money's contrast technique, now the clear visual anchor of
  the dashboard; (3) built a reusable `Logo` component (`src/components/logo.tsx` — PiggyBank
  icon + "SplitMyBills" wordmark with the primary-colored second half) and used it
  consistently on login, signup, and the dashboard header; (4) fixed a real, meaningful bug:
  visiting the bare root URL showed the leftover session-one test page instead of routing
  anywhere real — fixed with a proper server-side redirect in `page.tsx` (logged-in → 
  `/dashboard`, logged-out → `/login`); (5) added `/api/user/me` and wired the user's real
  name into the dashboard header ("Welcome back, [Name]").

  Hit the exact same category of bug as the earlier `utils.ts` incident: the user-name
  display looked completely correct on every level (API returning correct data confirmed via
  direct browser visit, `loadData()` correct, state declaration correct, JSX correct) yet
  didn't render — resolved by clearing `.next` and hard-refreshing, not a real code bug.
  **This is now a confirmed, repeatable pattern worth remembering as a standing habit: if
  code checks out correct on every level but behavior doesn't match, clear
  `apps/web/.next` and hard-refresh before assuming there's a logic bug to find.**

  Logged a new backlog idea: an account menu/settings page (log out, pay schedule editing,
  dark mode toggle, calendar dot-color customization, eventually account management) — now
  that the user's name is displayed, a natural next step once enough settings-worthy features
  exist to justify a dedicated page.

  **All of the above tested and confirmed working locally**, not yet committed/deployed.

- **2026-07-21 (cont'd)**: Committed and deployed today's design pass — merged `dev` → `main`,
  pushed, confirmed working live on both desktop and mobile. User caught a real bug: long
  bill/income names caused the entire amount+icons block to wrap below the name (a side
  effect of the earlier mobile `flex-wrap` fix), breaking column alignment of dollar amounts
  row to row. Fixed by restructuring both list rows: name/category side gets
  `flex-1 min-w-0` (wraps/shrinks freely without pushing anything), amount+icons side gets
  `shrink-0` (never gives up space, stays locked right), and amounts got a fixed
  `min-w-[70px] text-right` so dollar figures stay vertically aligned in a clean column
  regardless of name length or amount digit count. **Confirmed looking noticeably better —
  good stopping point for the design session.**

- **2026-07-21 (cont'd)**: Continued the design pass — added a proper header with app name +
  subtitle (replacing bare "Dashboard"), category icons on bills (`getCategoryIcon()` helper,
  soft-match on common category names with a generic fallback), pill-shaped colored status
  badges on pay periods ("Short $X" / "On track" — replacing plain colored text), and a
  visual income-vs-bills progress bar under the summary cards (green/yellow/red depending on
  percentage of income committed to bills).

  **Found and fixed a significant, long-standing bug**: user correctly noticed the app had
  essentially NO color anywhere except the AI Coach card's tinted background — everything else
  read as flat gray. Root cause: `globals.css` had **two** `--primary` definitions —
  `:root` (light mode, what was actually being viewed) was still at shadcn's original default
  gray (`oklch(0.205 0 0)`, zero chroma/saturation) from the very first scaffold, while only
  `.dark`'s `--primary` had ever been updated to our real indigo accent color back when we
  set the design direction. Since the app has been in light mode this whole time, **every
  `bg-primary`/`text-primary`/`border-primary` class across the entire app has been silently
  rendering as gray since the color was first "set" many sessions ago** — a real, significant
  oversight now finally caught and fixed by updating `:root`'s `--primary` to match the
  intended indigo (`oklch(0.585 0.233 277.117)`). **Confirmed fixed — real color now visible
  throughout the app**: buttons, badges, borders, the progress bar, everything.

- **2026-07-20 (cont'd)**: Deployed to production on Vercel. Merged `dev` into `main` for the
  first time since session one (resolved an expected merge conflict on `PROJECT_STATE.md` by
  taking `dev`'s version, since `main` had been untouched since the initial commit — every
  other file merged cleanly as new additions). Installed Vercel CLI, linked the GitHub repo,
  created a new project with root directory set to `apps/web` (required since this is a
  monorepo). Added `DATABASE_URL` and `AUTH_SECRET` as environment variables in the Vercel
  dashboard (Settings → Environment Variables — distinct from the separate "Environments"
  page, an easy mix-up), then redeployed with `vercel --prod` so they took effect. **Live at
  https://split-my-bills.vercel.app** — confirmed working on a real phone over a real
  internet connection, no local network/WiFi dependency. This also resolved the earlier
  mobile-login bug investigation (form submitting as GET instead of via fetch) — deploying
  bypassed it entirely rather than requiring further local debugging.

  Confirmed expected next issue: **mobile layout needs real responsive design work** — current
  dashboard uses desktop-first fixed grids (`grid-cols-2`, `grid-cols-3`), not yet adapted for
  small screens. This is exactly what Phase 5 (PWA Polish, mobile-responsive UI pass) is for —
  not a bug, a known and already-planned gap.
- **Account menu / settings page** (added 2026-07-21, user idea): now that the user's name
  is displayed on the dashboard, a natural next step is a real account menu (dropdown from
  the header, likely near the logo/name) housing things like: log out (currently a standalone
  button), a settings page (pay schedule editing, the "customizable dot colors" idea from the
  calendar backlog item, dark mode toggle), and eventually account management (email/password
  change, delete account). Not yet built — good candidate for Phase 6 or its own small phase
  once enough settings-worthy features exist to justify a dedicated page.

- **2026-07-22**: Built PWA installability (Phase 5 core). Designed a custom app icon
  (two overlapping circles divided by a bar, on indigo — visually represents "splitting a
  bill into two payments," tying the icon itself to the app's core differentiator rather
  than a generic finance symbol) and generated it at all required sizes (16/32/180/192/512px)
  via a Python/cairosvg script. Built `manifest.json` (standalone display, indigo theme
  color, off-white background color matching the site), added proper `metadata`/`viewport`
  exports in `layout.tsx` (favicon links, Apple touch icon, `appleWebApp` config for iOS
  installability), built a minimal service worker (`public/sw.js` — pass-through only, no
  offline caching yet, just enough to satisfy installability requirements) and a
  `ServiceWorkerRegistration` client component to register it. Hit one user error (forgot to
  add the import for the registration component) — quickly self-corrected. **Confirmed
  working on real iPhone**: icon shows correctly in the share sheet and as the home-screen
  icon, app opens standalone (no browser chrome) when launched from the home screen — real,
  working PWA installability.

  Attempted to add a proper branded splash screen (generated a matching off-white/logo splash
  PNG at a common iPhone resolution, wired via `apple-touch-startup-image` link tag) to
  replace the blank white loading flash. **Confirmed the file was correctly committed to git
  at the right path**, but the deployed production site returned 404 for it even after a
  clean merge/deploy — likely a Vercel build-cache issue, attempted a forced rebuild
  (`vercel --prod --force`) but didn't get to confirm the result before deciding to
  deprioritize it. **User made the call to accept the minor cosmetic gap (brief white flash
  instead of a branded splash) rather than keep debugging a small polish item** — correct
  call, since core installability is fully proven working and this is genuinely low-stakes.
  Logged as a known, low-priority loose end for Phase 6 rather than something broken.

- **2026-07-22 (cont'd)**: Built a branded install-prompt banner (`InstallPrompt` component)
  to solve the discovery problem — without it, most users would never know the app is
  installable, especially on iOS which has no automatic browser install banner. Detects
  platform via user agent: iOS gets step-by-step Share → Add to Home Screen instructions
  (since iOS doesn't allow a programmatic install trigger); Android gets a real one-tap
  "Install App" button using the native `beforeinstallprompt` browser API. Only shows if not
  already running standalone, and remembers dismissal via `localStorage` so it doesn't nag
  repeatedly. Styled consistently with the app's existing tinted-card visual language (reuses
  the `Logo` component and the same `bg-primary/5` treatment as other suggestion cards) rather
  than looking like a generic browser popup. Deployed and **confirmed working correctly on a
  real phone** with the right platform-specific instructions showing.
- **Auto-categorization + icons, and real split actions built** (2026-07-22): built
  `suggestCategory()` (keyword-matching against bill name, e.g. "Comcast Internet" → 
  "Internet") — deliberately logic-based, not AI, since simple keyword matching doesn't need
  real reasoning and using AI here would burn Gemini quota unnecessarily; wired into the
  "Add Bill" form so category auto-fills as the name is typed, while respecting manual edits.
  Expanded `getCategoryIcon()`'s icon mapping to match the fuller category list. **User
  clarified the app's core purpose more precisely**: input data once, get clear guidance
  across paychecks/bills/3-paycheck-month timing, see the rest of the year clearly, with a
  future savings-focused AI advisor layer — logged as a new **Phase 7 (Savings Guidance)** in
  the roadmap. This also surfaced an honest gap: marking a bill "splittable" only ever
  generated a suggestion, never actually created real split payments. Built the real action:
  `/api/bills/[id]/split` creates two actual `Payment` records (half the bill amount each,
  linked via `splitGroupId`) using the fields that had existed unused in the schema since
  session one, wrapped in a DB transaction so both halves are created together or not at all.
  Added a "Split this bill" button to the Split Suggestions card. **Not yet tested end to
  end** — the next-payday date math in the handler is an honest rough placeholder, flagged
  for refinement once the basic action is confirmed working.

- **2026-07-22 (cont'd)**: Fresh full-file replacement of `dashboard/page.tsx` after the
  category auto-suggest edit accidentally duplicated the bill form's name/category fields and
  displaced the "Splittable into two payments" checkbox (also lost the `dueDate` field in the
  same mix-up) — rewritten cleanly with all `useState` calls consolidated at the top and every
  feature verified present exactly once.

  **Found and fixed a significant, real bug**: user correctly noticed the Upcoming Pay
  Periods list showed a wrong next-payday date for a real biweekly income entry (today's
  actual payday showing the 11th as the next one, not 14 days out). Root cause: the
  split-suggestions engine had been reading pay schedule/anchor date from `User.paySchedule`
  and `User.paydayAnchor` — fields set once at signup as a placeholder (`paydayAnchor` was
  literally `new Date()` at account creation) — instead of from the real `IncomeSource`
  record's actual `frequency`/`nextPayDate` fields the user enters through the income form.
  **This meant the entire cashflow engine had been calculating every pay period from an
  irrelevant signup timestamp since Phase 2 was first built**, not from real user data — a
  genuine architectural miss that simply hadn't surfaced clearly with earlier test data.
  Fixed in `/api/split-suggestions/route.ts`: now uses `incomeSources[0].frequency` and
  `incomeSources[0].nextPayDate` instead of the `User` table fields. Honest known
  simplification, consistent with one flagged earlier: uses the first income source as the
  timing anchor, accurate for a single income source, a future refinement needed for users
  with multiple differently-scheduled incomes. **Not yet re-tested after the fix.**

- **Email payment-confirmation scanning** (added 2026-07-19, user idea, researched): opt-in
  feature to search a user's email (via Gmail API OAuth, read-only scope) for payment
  confirmation emails ("thank you for your payment," receipts, etc.) to help auto-detect
  bills paid without requiring 100% manual entry. Researched cost: **fits net-zero well**,
  unlike Plaid — Gmail API is free for standard use (search/read against the user's own
  inbox), not a paid third-party aggregation service. One honest caveat: Google announced
  usage-based billing for quota overages is coming later in 2026 with 90+ days notice before
  activating, but our use case (periodic targeted search, not high-volume) would stay
  comfortably within free quota. Design principles: must be an explicit, separate opt-in
  toggle (never assumed/default-on), request only Gmail's read-only scope (never send/modify
  access), search for specific patterns rather than ingesting full inbox contents, and pair
  naturally with the Phase 3 AI layer for extracting amount/date/biller from matched emails
  (same "AI-parsed structured extraction" pattern already planned for statement uploads).
  Not yet built — good candidate for a Phase 4/5-adjacent future phase.

- **2026-07-19 (cont'd, late)**: User identified a real, meaningful flaw: the dashboard's
  "Total Income" and "Remaining" cards were disconnected from the accurate, timing-aware
  Pay Periods engine already built — "Total Income" summed raw per-paycheck amounts with no
  regard for pay frequency (a biweekly $1,000 paycheck showed as "$1,000/month" instead of
  the true ~$2,166/month equivalent), and "Remaining" was a flat `Income − Bills` guess that
  ignored actual due dates and paycheck timing entirely, contradicting the correct
  period-by-period risk data already shown lower on the page. Fixed by adding
  `normalizeToMonthly()` to `packages/shared` (converts any pay frequency to a true monthly
  equivalent) and changing "Remaining" to source from the nearest actual pay period
  (`currentPeriod.income - currentPeriod.totalBillAmount`) instead of a flat calculation —
  so it now uses the same engine as the Pay Periods list and the two will never contradict
  each other. Hit a variable-ordering bug (`periodRemaining` referenced `totalBills` before
  its declaration — a genuine mistake in the given code, not a user error) causing a
  "Cannot access before initialization" runtime error; fixed by reordering the declarations.
  **Confirmed working and looking meaningfully better** — this was a real correctness fix,
  not just a cosmetic one.

- **2026-07-19 (cont'd, late)**: Built `generateSplitSuggestions()` in `packages/shared` —
  the actual split-suggestion logic that completes Phase 2's core purpose. For each risky
  pay period, checks every splittable bill in it: calculates a straight half-now/half-next-
  payday split, whether that split would fully resolve the period's shortfall or just reduce
  it, and generates a plain-text reasoning string (structured output that Phase 3's AI layer
  will later turn into fuller coaching, per the original rules-engine-computes /
  AI-explains design principle). Wired into `/api/split-suggestions` (now returns both
  `periods` and `suggestions`) and a new dashboard card, visually distinct via a soft
  primary-tinted background — first real functional use of the indigo accent color, not just
  decorative. Confirmed no errors; card correctly shows nothing when there's no shortfall/
  no splittable bills in a risky period yet (expected behavior with current test data, not a
  bug) — full end-to-end trigger not yet manually tested with a real shortfall scenario, but
  logic and wiring confirmed sound.

  **Phase 2's core logic is now essentially complete**: pay period generation, 3-paycheck-
  month detection, cashflow risk/shortfall calculation, and split suggestions all built and
  wired end to end. Remaining Phase 2 work is mostly testing edge cases (e.g., confirming a
  real shortfall scenario end to end) rather than new logic.

- **2026-07-20**: Closed the last known Phase 2 gap — built `generateOpportunitySuggestions()`
  in `packages/shared`, which detects 3-paycheck months that are NOT already a shortfall and
  have genuine surplus, then suggests building a buffer or prepaying a splittable bill ahead
  of the next (leaner, regular 2-paycheck) period. Wired into `/api/split-suggestions`
  (now returns `periods`, `suggestions`, and `opportunities`) and a new "Extra Paycheck
  Opportunities" dashboard card, styled consistently with the existing Split Suggestions
  card. Compiled with no errors. **Phase 2 is now fully complete** — every piece of scope
  defined for it (pay periods, 3-paycheck-month detection and opportunity suggestions,
  shortfall detection and split suggestions) is built and wired end to end.
- **Overdue bill reconciliation prompt** (added 2026-07-19, user idea, low priority): once a
  bill's due date passes without it being marked paid, prompt the user ("Was this paid?")
  rather than letting it silently go unconfirmed. If yes, let them pick the actual paid date
  (no schema change needed — `Payment.paidDate` already supports this, current mark-as-paid
  just always defaults to "today"). If the recorded paid date is after the due date, show a
  small "(paid late)" label next to the bill name. Purely additive to the existing mark-as-paid
  feature — does not touch the "Remaining" calculation or require reworking anything shipped.

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

**Phase:** Phase 1 complete. Phase 2 FULLY COMPLETE. Phase 3 FULLY COMPLETE, DEPLOYED, AND
VERIFIED LIVE. Mobile-responsive functional fixes done. **Phase 6 (Visual Design System &
Polish) now exists as a real scoped phase** in the roadmap, consolidating previously
scattered design backlog items. Significant progress made toward it today: light-mode color
bug fixed (major), off-white background softened, dark hero summary card built (Rocket
Money-inspired contrast technique), reusable `Logo` component built and used consistently
across login/signup/dashboard, root URL redirect fixed (was showing a dead test page),
user's real name now displayed on the dashboard. **All confirmed working locally, not yet
committed/deployed.**
**Next: commit and deploy this batch, then continue Phase 6 refinement OR move to Phase 4.**
**Last updated:** 2026-07-21 (branding + hero card + fixes, pending deploy)

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

*(at this point, next step chosen was: `packages/shared` — see below)*

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

*(at this point, next step chosen was: build signup/login UI — see below)*

- **2026-07-18 (cont'd)**: Built signup, login, and a minimal dashboard page using shadcn
  components. Signup worked and redirected correctly, but visiting `/login` while already
  logged in kept showing the login form instead of redirecting to `/dashboard` — meaning
  route protection wasn't working. Debugged via `curl` first (confirmed the signup route
  correctly sets a real, valid session cookie — ruled out the backend), then via debug
  `console.log` statements in the routing file (confirmed the browser dev-server terminal,
  not browser DevTools, is where server-side logs print — new concept, noted for future
  reference). Zero debug output appeared even after correct code — meaning the file wasn't
  executing at all. Researched and found the real cause: **Next.js 16 deprecated
  `middleware.ts` in favor of `proxy.ts`** (renamed export too: `proxy` not `middleware`).
  Renamed the file and export, but still got zero execution — hit a **second** issue: since
  this project uses `--src-dir`, `proxy.ts` must live at `apps/web/src/proxy.ts` (same level
  as `app/`), not `apps/web/proxy.ts` — the exact same "wrong folder level relative to `src/`"
  bug pattern as three earlier bugs tonight (`index.ts`, `utils.ts`, and the original
  `middleware.ts` placement). Fixed by moving it into `src/`. **Confirmed working live** —
  the dev server's file watcher picked up the corrected location instantly, debug logs
  appeared, and the browser correctly redirected an already-logged-in user away from `/login`
  to `/dashboard`. **Full auth flow now verified end to end: signup → session cookie set →
  dashboard access → route protection correctly redirects both directions.**

  **Standing lesson, now a checklist item for any new top-level config file** (proxy.ts,
  middleware.ts, or similar future files): with `--src-dir` enabled, these files belong
  inside `src/`, at the same level as `app/` — not at the `apps/web/` root.

  Added a logout button to the dashboard (the API route already existed from the earlier auth
  backend build, just needed UI wiring). Converted dashboard to a client component for the
  click handler. **Ran a full 4-step manual test, all passed**: (1) logout correctly redirects
  to `/login`, (2) attempting to visit `/dashboard` while logged out correctly bounces back to
  `/login` via `proxy.ts`, (3) logging back in with real credentials correctly lands on
  `/dashboard`. **Phase 1 auth is fully complete and verified**: signup, login, logout, and
  route protection all confirmed working end to end in both directions.

  Also hit a real bug before committing this batch: `middleware.ts` (before the rename above)
  had landed at `apps/middleware.ts` instead of the correct location — same category of `cd`
  level mix-up as other bugs this project. Caught via `git status` showing the file without
  the expected `web/` path prefix, before committing. Fixed by moving it into place and
  re-verifying `git status` showed correct paths.

- **2026-07-18 (cont'd, late)**: Discussed automated bank-account data pulling (bills,
  deposits, auto-notifications, projections). Researched Plaid pricing — confirmed it has no
  lasting free production tier (real recurring costs, ~$9K/year median), conflicting with the
  net-zero hardline. Decided against Plaid in the free core app; replaced Phase 4 with
  user-initiated CSV/PDF statement upload, parsed by our AI layer into structured data, with
  trend detection and cashflow projections built from real history. Plaid logged in backlog
  as a possible future paid-tier decision only. Also discussed and logged app design direction
  (BillOut + 1Bill + EveryDollar references) as backlog notes for Phase 1 UI work.

- **2026-07-18 (cont'd, late)**: Built full CRUD for income sources and bills. API routes:
  `GET`/`POST /api/income` and `/api/bills`, plus `PATCH`/`DELETE /api/income/[id]` and
  `/api/bills/[id]` — every route scoped to the logged-in user (via a new shared
  `getCurrentUserId()` helper in `src/lib/session.ts`) and every PATCH/DELETE double-checks
  `existing.userId !== userId` before touching data, so no user can edit/delete another
  user's records even by guessing an ID. Rebuilt the dashboard page to actually show real
  data: three summary cards (Income / Bills / Remaining, remaining turns red via
  `--destructive` when negative — first real use of the color-coded status language from our
  design direction), plus add-forms for both income and bills.

  Hit two bugs: (1) a form-reset `TypeError` from calling `.reset()` on `e.currentTarget`
  after an `await` — React can clear that reference by then; fixed by capturing
  `const form = e.currentTarget` before the `await` and using `form` throughout. (2) The
  bracket-named dynamic route folders (`[id]`) — zsh interprets `[id]` as a glob pattern, so
  the `mkdir`/`touch` commands need quotes around the path. Separately, a stray `cd` left the
  terminal inside `apps/web` when creating the income `[id]` route, causing it to nest at
  `apps/web/apps/web/src/app/api/income/[id]/route.ts` — diagnosed via `find` from the repo
  root (showed the duplicate path clearly), fixed by moving the file into place and deleting
  the stray `apps/web/apps` folder. Bills route was created correctly the second time by
  confirming `pwd` before running the command. Added delete buttons to both income and bill
  list items, wired to the new DELETE routes — tested and confirmed working.

  **Full CRUD now verified working end to end for both Income Sources and Bills**, fully
  scoped per-user. Backend PATCH/edit routes exist and work; **UI for editing amounts inline
  is not yet built** — currently the only way to fix a mistake is delete-and-re-add.

---

## 10. Next Step (pick up here next session)

**Where things stand:** Phase 0 (setup) and Phase 1 (auth + core CRUD) are both complete and
verified. The app has real signup/login/logout, protected routes, and a working dashboard
where a logged-in user can add, view, and delete their own income sources and bills, with
live totals (Income / Bills / Remaining). Everything is committed and pushed to `dev`.

- **2026-07-19**: Built inline-edit UI for income/bill amounts (click-to-edit pattern with a
  reusable `EditAmountForm` component, Save/Cancel). **Phase 1 is now fully complete** —
  full CRUD (create/read/update/delete) working end to end for both Income Sources and Bills.
  Swapped text-label Edit/Delete/Save/Cancel buttons for faded `lucide-react` icons
  (`Pencil`, `Trash2`, `Check`, `X`) using `text-muted-foreground/50` with color-on-hover —
  present but not visually loud, matching the calm design direction.

  Looked at Rocket Money for additional feature ideas. Two concrete, buildable ideas logged
  to backlog: (1) spending trend line/bar charts over time (ties into Phase 4 once historical
  data exists via statement import — `recharts` is available in this environment), (2)
  visually grouping "Recurring" vs "One-time" bills on the dashboard rather than one flat list
  (we already have `isRecurring` on the `Bill` model, just needs UI grouping). Also noted the
  general pattern of showing a trend indicator (up/down vs. last period) on the "Remaining"
  summary card, not just a snapshot number — future polish, not urgent.

  Hit a copy-paste bug while adapting the income section's icon buttons for bills: the JSX
  variable (`i` → `b`) got fixed, but two function calls were left pointing at the wrong
  handlers entirely — `setEditingIncomeId(b.id)` and `handleDeleteIncome(b.id)` instead of
  the bill-specific versions. Symptom was subtle: no error, button just did nothing (it was
  setting `editingIncomeId`, which nothing in the bills section checks). VS Code's own
  TypeScript hints had flagged this before it was addressed. Fixed by correcting both calls
  to `setEditingBillId(b.id)` and `handleDeleteBill(b.id)`. **Tested and confirmed working —
  Phase 1 is now fully, genuinely complete**: full CRUD with polished inline-edit icon UI for
  both Income Sources and Bills.

- **2026-07-19 (cont'd)**: Started Phase 2 (Split Engine). Built `getUpcomingPayDates()` in
  `packages/shared` — generates real calendar pay dates from a user's pay schedule + anchor
  date within a rolling window (default 60 days), handling all four schedule types including
  the trickier `SEMIMONTHLY` case (snapped to 1st/15th convention, most common real-world
  pattern). User explained a real, important use case: biweekly pay produces a genuine
  "3-paycheck month" about twice a year (26 paychecks don't divide evenly into 12 months) —
  a real financial-planning wrinkle at their job that most budgeting apps ignore entirely.
  Added `groupPayDatesByMonth()` to explicitly detect and flag these months
  (`isThreePaycheckMonth`), so downstream logic (cashflow calculator, split suggestions, and
  eventually AI narration) can treat the "extra" paycheck as a deliberate planning
  opportunity rather than something that just blends into normal spending. Logged as explicit
  Phase 2 scope, not just a side note.

- **2026-07-19 (cont'd)**: Built `projectBillDueDates()` and `calculatePayPeriods()` in
  `packages/shared` — the core Phase 2 cashflow engine. Projects a bill's day-of-month due
  date into real calendar dates, slots each bill into the pay period it falls in (the stretch
  between one payday and the next), and flags any period where total bills exceed that
  period's income (`isCashflowRisk`, with an exact `shortfall` dollar amount) — with
  3-paycheck-month detection baked in per period from the earlier work. Hit a real bug: the
  original `PaySchedule` type (from session one, before the real Prisma schema existed) used
  lowercase values (`"weekly"`, etc.), colliding with the new uppercase-based logic that
  matches the actual schema — TypeScript correctly flagged the mismatch. Fixed by updating
  the original type definition to uppercase, matching reality everywhere else in the app.

  Built `/api/split-suggestions` (sums all income sources against the user's pay schedule —
  noted as a simplification for users with multiple differently-scheduled income sources,
  a future refinement) and wired an "Upcoming Pay Periods" card into the dashboard showing
  each period's date, bill count/total, risk status, and 3-paycheck-month flag.

  Added a real "mark as paid" feature, using the `Payment` model that had existed in the
  schema since session one but was never wired up: `POST`/`DELETE /api/bills/[id]/pay`
  creates/removes a `Payment` record for the current month, `GET /api/bills` now includes
  `paidThisMonth` per bill, and the dashboard shows a clickable check-circle icon with
  strikethrough styling for paid bills.

  Discussed whether "Remaining" should change based on paid status — clarified and confirmed
  it stays a budget-snapshot number (Income − ALL bills, paid or not matters for the monthly
  plan either way), not a live cash balance, since there's no bank connection to track a true
  real-time balance against. Also made the "Upcoming Pay Periods" list expandable — clicking
  a period's header reveals the individual bills within it in smaller muted text; logged a
  future visual-polish idea (distinct header vs. dropdown background colors) for later.
  **All of the above tested and confirmed working.**

**Pick up here — Phase 2, the Split Engine:**

Build the real pay-schedule-aware cashflow calculator and split-suggestion logic, replacing
the placeholder `isCashflowRisk()` function in `packages/shared`. This is the heart of the
product — the feature that makes this different from a plain budgeting app. Rough shape:
for each bill, check whether its due date falls in a pay period where cumulative bills
exceed available income, and if so, whether splitting it into two payments aligned to two
paydays would smooth out that cashflow strain. This is deterministic math (rules engine),
not AI — Phase 3 (AI layer) later just explains this output in plain English.

**Standing lessons/habits to keep in mind going forward** (learned the hard way this project):
- With `--src-dir` enabled, config files like `proxy.ts` belong inside `src/`, at the same
  level as `app/` — not at the `apps/web/` root.
- Always run `npx prisma generate` explicitly after any schema change — don't rely on
  `migrate dev` to do it silently.
- If a file/path checks out completely correct but an error persists, clear `apps/web/.next`
  before assuming the file itself is broken.
- Bracket-named folders (like Next.js's `[id]` dynamic routes) need quotes in shell commands,
  or zsh will try to glob-expand them.
- Before running `mkdir`/`touch`/similar path-sensitive commands, confirm `pwd` first —
  several bugs this project came from running a command one folder level off from expected.