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

---

## 3. Tech Stack (decided)

| Layer | Choice | Notes |
|---|---|---|
| Monorepo tool | Turborepo (or Nx — TBD when we scaffold) | |
| Backend | Node + TypeScript + Express/Fastify | |
| Web + Mobile frontend | **Next.js, built as a PWA** | One codebase. Installable on phones via manifest + service worker. No app store, no store fees, no RN/Expo needed. |
| Database | Postgres via Neon | Free tier |
| ORM | Prisma | |
| Validation | Zod | |
| Auth | Self-rolled (Lucia or similar) | Avoid paid auth providers |
| AI Provider (dev) | **Ollama** (local, self-hosted, unlimited, zero cost) | Primary for local development |
| AI Provider (production) | **Gemini Flash-Lite free tier** | Capped (~1,500 req/day, 15 RPM). Ollama isn't viable in prod (self-hosting an LLM server costs money) |
| Usage Governor | Custom — tracks calls in our DB, enforces a ceiling below Google's real cap, caches AI responses, falls back to rules-engine-only output when near/at the limit | See Phase 3.5 |
| CI | GitHub Actions | Free minutes |

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

- [ ] **Phase 0 — Setup**: GitHub repo, monorepo scaffold, VS Code config, `.env.example`
- [ ] **Phase 1 — Core MVP**: auth, manual income/bill entry, dashboard (income vs. bills vs. remaining)
- [ ] **Phase 2 — Split Engine**: pay-schedule-aware cashflow calculator, split suggestion logic
- [ ] **Phase 3 — AI Coaching Layer**: `AIProvider` interface (Ollama default, Gemini fallback), plain-English suggestions endpoint
- [ ] **Phase 3.5 — Usage Governor**: `AIUsageLog` table, daily ceiling check before every AI call, response caching keyed on bill/income snapshot, graceful fallback to rules-engine-only output, admin usage-visibility endpoint
- [ ] **Phase 4 — Plaid Integration**: bank sync, auto-categorization, reconciliation
- [ ] **Phase 5 — PWA Polish**: manifest.json, service worker, installability, offline fallback, mobile-responsive UI pass

---

## 7. Current Status

**Phase:** Phase 0 (architecture fully decided — scaffolding starts next session)
**Last updated:** 2026-07-16

Nothing scaffolded yet. Stack, AI provider strategy, PWA distribution, and the Usage Governor
concept are all agreed. Next concrete step: choose monorepo tool (Turborepo vs. Nx) and
scaffold the repo skeleton.

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
  only receive tested/confirmed merges from `dev`. Next: Turborepo scaffold, done on `dev`.

---

## 10. Next Step (pick up here next session)

**Pick up here tomorrow:**

1. Confirm you have an empty GitHub repo created (repo name: `split-my-bills`).
2. Clone it locally, open in VS Code.
3. Scaffold with Turborepo: folder structure (`apps/web`, `packages/shared`), `turbo.json`,
   `.gitignore`, `.env.example`, base Next.js app with a PWA manifest stub.
4. First commit + push to `main`, then start Phase 1 work on a feature branch.