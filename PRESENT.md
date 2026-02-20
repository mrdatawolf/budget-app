# Budget App — Technical Presentation

## What Is It?

A **zero-based budget tracker** — every dollar of income gets assigned to a category until you hit $0 remaining. Think YNAB, but self-hosted and local-first.

**Built in ~6 weeks** (Jan 7 – Feb 19, 2026) — 136 commits, ~130 files of TypeScript + Swift.

---

## The Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 (App Router), TypeScript, Tailwind CSS |
| **API Server** | Hono (standalone, decoupled from Next.js) |
| **Database** | PGlite (local PostgreSQL-in-process) + Supabase (cloud sync) |
| **Auth** | Clerk (JWT for remote, implicit user locally) |
| **Bank Integration** | Teller API (mTLS certificate auth) |
| **Charts** | D3.js + d3-sankey |
| **Mobile** | Native iOS (SwiftUI) + Capacitor (hybrid) |
| **Desktop** | Standalone executable (cross-platform builds) |

---

## Live Demo Walkthrough

### 1. Budget View (Main Page)
- Categories with emoji headers (Income, Household, Food, etc.)
- Budget items with planned vs actual progress bars
- Drag-and-drop reorder
- Click any item → detail sidebar with transactions and circular progress
- "Add Group" — custom categories with emoji picker

### 2. Transactions
- Add manually or import from bank (Teller API)
- Split a single transaction across multiple budget items
- Soft delete + restore
- Merchant-based auto-categorization suggestions

### 3. Recurring Payments
- Track bills: monthly, quarterly, semi-annual, annual
- Auto-calculates monthly contribution for non-monthly bills
- Progress bars toward next due date
- Auto-creates budget items in new months
- Auto-resets when payment period passes

### 4. Insights (D3 Charts)
- **Budget vs Actual** — horizontal grouped bar chart
- **Spending Trends** — multi-line chart across months (toggle categories)
- **Cash Flow Sankey** — income sources → categories → budget items

### 5. Monthly Report
- Buffer flow: underspent / overspent / left to budget
- Category breakdown with spending analysis
- Projected next month buffer

---

## Architecture Evolution

### Phase 1: Monolith (v0.1–v1.0)
```
Browser → Next.js API Routes → SQLite (better-sqlite3)
```
- Started as a simple Next.js app with SQLite
- Added Clerk auth, multi-user support, onboarding flow

### Phase 2: Cloud Database (v1.4)
```
Browser → Next.js API Routes → Supabase PostgreSQL
```
- Migrated from SQLite to Supabase PostgreSQL
- Dealt with PostgreSQL `numeric` returning strings (not numbers)
- Optimized Teller sync from ~60s to <1s (N+1 → batch queries)

### Phase 3: Client-Server Separation (v2.0)
```
Browser → Next.js (:3400) → rewrite proxy → Hono API (:3401) → PGlite/Supabase
```
- Extracted all 45+ API handlers into standalone Hono server
- 10 route files, ~3,100 lines of API code
- Dual-mode auth: local (no auth) vs remote (Clerk JWT with RS256 verification)
- Next.js rewrites proxy `/api/*` to Hono (same-origin, no CORS issues)
- Single `pnpm dev` starts both servers with health checks and auto-restart

### Phase 4: Local-First (v1.5 branch)
```
All reads/writes → PGlite (local) ←sync→ Supabase (cloud)
```
- PGlite = PostgreSQL running in-process (no external DB needed)
- Same Drizzle schema for local and cloud
- UUIDs everywhere (no ID collisions during offline creation)
- Cloud sync planned: pull-then-push, cloud wins conflicts

---

## Interesting Technical Challenges

### The UTC Date Bug
`new Date("2026-02-19")` parses as **UTC midnight** — in US timezones, that's the **previous day**.

**Fix:** Created `lib/dateHelpers.ts` — split the string, construct with `new Date(year, month-1, day)`. Had to fix 11 files across the codebase.

### PGlite + Next.js HMR
Hot module replacement creates new module instances, but PGlite can only have one connection to a database file. Old connections weren't closing → **database corruption**.

**Fix:** Stash the PGlite instance on `globalThis` so it survives HMR reloads in dev mode.

### Month Indexing Across Platforms
- JavaScript: `Date.getMonth()` → Jan = **0**
- Swift: `Calendar.component(.month)` → Jan = **1**
- API uses 0-indexed (JS convention)
- iOS app subtracts 1 before every API call

### PostgreSQL Numeric Gotcha
`numeric(10,2)` columns return **strings**, not numbers. Every arithmetic operation needs `parseFloat(String(value))`. Had to fix 10+ files after the Supabase migration.

### Split Transaction Ownership
When a transaction is split, the parent's `budgetItemId` becomes `null`. Ownership verification for auth had to follow the **split transaction path** instead of the direct parent.

---

## Code Stats

| Metric | Count |
|--------|-------|
| Total commits | 136 |
| TypeScript files | ~99 |
| Swift files (iOS) | 32 |
| API route files | 10 |
| API handlers | 45+ |
| Lines of API code | ~3,100 |
| Database tables | 8 |
| D3 chart components | 3 |
| Onboarding steps | 6 |

---

## AI-Assisted Development

This project was built with significant help from **Claude** (Anthropic's AI).

### How It Worked
- Claude Code (CLI tool) running in the terminal / VS Code
- Conversational development: describe what I want, iterate on implementation
- Claude reads the codebase, suggests changes, writes code, runs commands
- `CLAUDE.md` file acts as persistent project context across sessions

### What AI Was Good At
- Boilerplate and CRUD (API routes, type definitions, schema changes)
- Database migrations and data transformations
- Finding and fixing bugs across many files (UTC date fix across 11 files)
- Refactoring (extracting Hono server from Next.js API routes)
- Remembering project conventions and patterns

### What Still Needed Human Judgment
- Architecture decisions (local-first vs cloud, Hono vs Edge Functions)
- UX design and flow (onboarding steps, what information to show where)
- Prioritization (which features matter, what to skip)
- Edge cases from real-world usage (the UTC bug was found by using the app)

---

## What's Next

- **Sync engine** — bidirectional PGlite ↔ Supabase sync
- **Cloud connect UI** — settings page to link local app to cloud account
- **Capacitor static build** — true offline mobile app with bundled PGlite
- **Cross-chart filtering** — click a category to filter all Insights charts
- **Export** — charts as PNG/SVG, budget data as CSV

---

## Questions?

**Repo:** [github.com/mrdatawolf/budget-app](https://github.com/mrdatawolf/budget-app)
