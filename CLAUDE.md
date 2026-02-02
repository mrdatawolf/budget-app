# Claude Context Document

This document contains context for Claude AI to continue development on this budget app. Use this to quickly get up to speed when starting a new session.

## Project Overview

A zero-based budget tracking application built with Next.js, TypeScript, and Tailwind CSS. The app features bank account integration via Teller API for automatic transaction imports.

**Current Version:** v1.4.0
**Last Session:** 2026-01-29

## Tech Stack

- **Framework:** Next.js 16.x (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **ORM:** Drizzle ORM
- **Database:** Supabase (PostgreSQL) — migrated from SQLite in v1.4.0
- **Authentication:** Clerk (@clerk/nextjs)
- **Bank Integration:** Teller API
- **Mobile:** Capacitor (live server mode)
- **Icons:** react-icons (FaXxx from react-icons/fa only)

## Key Concepts

### Zero-Based Budgeting
- Every dollar of income must be assigned to a category
- Formula: Buffer + Income = Total Expenses (when balanced)
- Buffer = money carried over from previous month

### Budget Structure
```
Budget (month/year)
├── Buffer (starting balance)
├── Categories
│   ├── Income (special - tracked separately)
│   ├── Giving
│   ├── Household
│   ├── Transportation
│   ├── Food
│   ├── Personal
│   ├── Insurance
│   └── Saving
└── Each category has Budget Items (line items)
    └── Each item has Transactions and Split Transactions
```

## Database Schema (db/schema.ts)

### Key Tables

1. **budgets** - Monthly budget containers
   - id, **userId**, month, year, buffer, createdAt

2. **budget_categories** - Categories within each budget
   - id, budgetId, categoryType, name, order

3. **budget_items** - Line items within categories
   - id, categoryId, name, planned, order, **recurringPaymentId** (links to recurring_payments)

4. **transactions** - Individual transactions
   - id, budgetItemId, linkedAccountId, date, description, amount, type ('income'|'expense'), merchant, deletedAt (soft delete)

5. **split_transactions** - When a transaction is split across multiple budget items
   - id, parentTransactionId, budgetItemId, amount, description

6. **recurring_payments** - Recurring bills and subscriptions
   - id, **userId**, name, amount, frequency, nextDueDate, fundedAmount, categoryType, isActive

7. **linked_accounts** - Connected bank accounts from Teller
   - id, **userId**, tellerAccountId, accessToken, institutionName, etc.

8. **user_onboarding** - Onboarding progress tracking
   - id, **userId** (unique), currentStep, completedAt, skippedAt, createdAt

### User Data Isolation
- `budgets`, `linked_accounts`, and `recurring_payments` have `userId` columns (Clerk user ID)
- Child tables (budgetCategories, budgetItems, transactions, splitTransactions) inherit ownership through parent relationships
- All API routes verify ownership before returning/modifying data

### Important Relationships

- `budget_items.recurringPaymentId` links a budget item to a recurring payment
- When a recurring payment has a categoryType, budget items are auto-created in new months
- Split transactions reference both the parent transaction AND a budget item

## Recent Changes (v0.8.0)

### Recurring Payments Feature
- Full CRUD at `/recurring` page
- Frequencies: monthly, quarterly, semi-annually, annually
- Auto-calculates monthly contribution for non-monthly payments
- Progress tracking toward next payment due date
- 60-day warning banner for upcoming payments
- **Linking:** Budget items can be linked to recurring payments via `recurringPaymentId`

### Budget Item Detail View
- Click any budget item to see details in the right sidebar
- Shows: circular progress indicator, remaining balance, transactions list
- "Make this recurring" button navigates to `/recurring` with pre-filled data AND passes `budgetItemId` to link them

### Buffer Flow in Monthly Report
- Located in Insights > Monthly Summary modal
- Shows: Current Buffer, + Underspent, - Overspent, = Projected Next Month Buffer
- Calculation: `nextBuffer = buffer + underspent - overspent`
- Note: Income variance was intentionally removed per user request

### Transaction Colors
- Income transactions display in green (`text-green-600`)
- Expense transactions display in black/gray (`text-gray-900`)
- Applied in both BudgetSection dropdown and BudgetSummary item detail view

### Recurring Payment Emoji
- Budget items linked to recurring payments show 🔄 emoji
- Displayed in BudgetSection.tsx next to item name

## Recent Changes (v0.9.0)

### Split Transaction Editing
- Click any split transaction to open the SplitTransactionModal pre-populated with existing splits
- Editable from three locations:
  1. **Item Detail View**: Click split transactions in the activity list
  2. **Tracked Transactions Tab**: Click split transactions in the sidebar
  3. **BudgetSection Dropdown**: Click split transactions in the expanded transaction list under budget items
- Modal shows "Edit Split" title when editing (vs "Split Transaction" for new)
- `ExistingSplit` interface added to SplitTransactionModal.tsx
- Cross-component communication via state lifting in page.tsx (`splitToEdit`, `handleSplitClick`, `clearSplitToEdit`)

### Implementation Details
- `SplitTransactionModal.tsx`: Added `existingSplits` prop and `isEditMode` logic
- `BudgetSummary.tsx`: Added `fetchAndOpenSplitModal()` function, `splitToEdit` prop handling
- `BudgetSection.tsx`: Added `onSplitClick` prop for split transaction click handling
- `page.tsx`: Added state management for cross-component split editing

## Recent Changes (v1.0.0)

### Clerk Authentication
- Full user authentication via Clerk (@clerk/nextjs)
- Sign-in and sign-up pages with Clerk components
- Route protection via middleware - all routes except /sign-in and /sign-up require authentication
- UserButton in sidebar footer for account management and sign-out

### Multi-User Support
- `userId` column added to: `budgets`, `linked_accounts`, `recurring_payments`
- All API routes check authentication and scope queries to the authenticated user
- New users automatically get a fresh budget created on first visit
- Existing data can be claimed via `/api/auth/claim-data` endpoint

### Auth Implementation Details
- `middleware.ts`: Uses `clerkMiddleware` with `createRouteMatcher` for route protection
- `lib/auth.ts`: Helper functions `requireAuth()` and `isAuthError()` for API routes
- All 11 API route files updated with auth checks and userId scoping
- Migration script: `scripts/migrate-add-userid.ts` for adding userId columns to existing DB

### Environment Variables (Clerk)
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

## Key Files and Their Purposes

### Pages (app/)
- `page.tsx` - Main budget view with all categories (includes onboarding redirect check)
- `recurring/page.tsx` - Recurring payments management
- `settings/page.tsx` - Bank account management (Teller)
- `insights/page.tsx` - Insights hub with Monthly Summary access
- `onboarding/page.tsx` - Interactive onboarding flow (6 steps, standalone layout)
- `sign-in/[[...sign-in]]/page.tsx` - Clerk sign-in page
- `sign-up/[[...sign-up]]/page.tsx` - Clerk sign-up page (redirects to `/onboarding`)

### Components (components/)
- `BudgetSection.tsx` - Renders a single category with its items, handles drag-drop reorder
- `BudgetSummary.tsx` - Right sidebar with Summary/Transactions tabs AND budget item detail view
- `MonthlyReportModal.tsx` - Monthly report with Buffer Flow section and empty-state handling
- `DashboardLayout.tsx` - Main layout wrapper with sidebar
- `Sidebar.tsx` - Collapsible navigation sidebar with UserButton and "Getting Started" link
- `AddTransactionModal.tsx` - Add/edit transaction modal
- `SplitTransactionModal.tsx` - Split transaction interface
- `onboarding/WelcomeStep.tsx` - Step 1: Welcome screen
- `onboarding/ConceptsStep.tsx` - Step 2: Zero-based budgeting explainer
- `onboarding/BufferStep.tsx` - Step 3: Interactive buffer input
- `onboarding/ItemsStep.tsx` - Step 4: Category cards with suggested items
- `onboarding/TransactionStep.tsx` - Step 5: First transaction with suggested transactions
- `onboarding/CompleteStep.tsx` - Step 6: Celebration and summary

### API Routes (app/api/)
- `budgets/route.ts` - GET creates/returns budget, syncs recurring payments to budget items
- `onboarding/route.ts` - Onboarding status CRUD (GET/POST/PUT/PATCH)
- `recurring-payments/route.ts` - Full CRUD, DELETE unlinks budget items first
- `transactions/route.ts` - CRUD with soft delete support
- `transactions/split/route.ts` - Split transaction creation
- `teller/` - Bank integration endpoints
- `auth/claim-data/route.ts` - Claim unclaimed data for migrating users

### Utilities (lib/)
- `budgetHelpers.ts` - `transformDbBudgetToAppBudget()` transforms DB data to app types
- `teller.ts` - Teller API client
- `auth.ts` - Authentication helpers (`requireAuth()`, `isAuthError()`)

### Root Files
- `middleware.ts` - Clerk middleware for route protection

### Types (types/)
- `budget.ts` - All TypeScript interfaces (Budget, BudgetItem, Transaction, etc.)

## Important Code Patterns

### API Route Authentication
All API routes follow this pattern:
```typescript
import { requireAuth, isAuthError } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  // Use userId in queries
  const data = await db.query.budgets.findFirst({
    where: and(eq(budgets.userId, userId), eq(budgets.month, month)),
  });
}
```

### Fetching Budget
```typescript
const response = await fetch(`/api/budgets?month=${m}&year=${y}`);
const data = await response.json();
const transformedBudget = transformDbBudgetToAppBudget(data);
```

### Linking Budget Item to Recurring Payment
When creating a recurring payment from "Make this recurring":
1. URL params include `budgetItemId`
2. POST to `/api/recurring-payments` includes `budgetItemId` in body
3. API updates budget item: `set({ recurringPaymentId: payment.id })`

### Deleting Recurring Payment
Must unlink budget items FIRST, then delete:
```typescript
await db.update(budgetItems).set({ recurringPaymentId: null }).where(eq(budgetItems.recurringPaymentId, paymentId));
await db.delete(recurringPayments).where(eq(recurringPayments.id, paymentId));
```

### Auto-sync Recurring to Budget Items
In `api/budgets/route.ts` GET handler:
- Fetches all active recurring payments
- For each with a categoryType, checks if budget item exists in matching category
- Creates budget item if missing, with `recurringPaymentId` set

## UI Patterns

### Colors
- All colors use semantic CSS tokens defined in `globals.css` — see `DESIGN_SYSTEM.md`
- Income/positive: `text-success`
- Expense/negative: `text-danger`
- Neutral: `text-text-primary`
- Over budget: `text-danger`
- Under budget: `text-success`
- Primary actions: `bg-primary` / `hover:bg-primary-hover`

### Category Emojis
```typescript
const emojiMap: Record<string, string> = {
  'Income': '💰', 'Giving': '🤲', 'Household': '🏠',
  'Transportation': '🚗', 'Food': '🍽️', 'Personal': '👤',
  'Insurance': '🛡️', 'Saving': '💵'
};
```

### Recurring Indicator
- 🔄 emoji shown on budget items with `recurringPaymentId`
- Also shown in item detail view as "Recurring payment" label

## Known State / Pending Items

### Working Features
- **User authentication** via Clerk (sign-in, sign-up, sign-out)
- **Multi-user support** - each user sees only their own data
- **Interactive onboarding** - 6-step guided setup for new users
- Full budget CRUD with categories and items
- Transaction management (add, edit, soft delete, restore)
- Split transactions across multiple budget items
- **Edit existing splits** by clicking split transactions (from Item Detail, Tracked tab, or BudgetSection dropdown)
- Bank integration via Teller
- Recurring payments with linking to budget items
- Budget item detail view in sidebar
- Monthly report with Buffer Flow and empty-state handling
- Copy budget from previous month

### Potential Future Work
- The "Add Group" button at bottom of budget page is non-functional (placeholder)
- Could add ability to edit recurring payment from budget item detail view
- Could add recurring payment auto-advance when marked as paid

## Development Commands

```bash
npm run dev          # Start development server
npm run db:push      # Push schema changes to Supabase PostgreSQL
npm run db:studio    # Open Drizzle Studio to view/edit data
npm run build        # Production build
npm run cap:sync     # Sync Capacitor
npm run cap:ios      # Build + open Xcode
npm run cap:android  # Build + open Android Studio
```

## Testing Notes

When testing recurring payments:
1. Create a recurring payment with a category
2. Navigate to a new month - budget item should auto-create
3. Click budget item, use "Make this recurring" to link existing item
4. Verify 🔄 emoji appears after linking
5. Delete recurring payment - verify budget items are unlinked (not deleted)

## Common Issues & Solutions

### Recurring emoji not showing after "Make this recurring"
- Fixed: POST endpoint now accepts `budgetItemId` and updates the budget item

### Delete not working for recurring payments
- Fixed: DELETE endpoint now unlinks budget items before deleting

### Buffer Flow showing wrong values
- Underspent = sum of (planned - actual) where planned > actual
- Overspent = sum of (actual - planned) where actual > planned
- Only expense categories are included (not income)

## Common Issues & Solutions (Auth)

### Clock Skew Error
- Clerk JWT validation fails if system clock is off by more than a few seconds
- Fix: Sync system clock (Windows: Settings > Time > Sync now)
- Error message: "JWT cannot be used prior to not before date claim (nbf)"

### Redirect Loop After Sign-in
- Usually caused by clock skew (see above)
- Can also be caused by conflicting redirect props on SignIn component
- Current setup uses `fallbackRedirectUrl="/"` which respects the redirect_url query param

### Claiming Existing Data
- Use `/api/auth/claim-data` POST endpoint to claim unclaimed records (userId = '')
- GET endpoint shows count of unclaimed records

## Recent Changes (v1.1.0)

### UI Overhaul
- **Font:** Switched to Outfit (Google Fonts) via `next/font/google`
- **Color system:** Emerald primary palette with semantic CSS tokens in `globals.css`, mapped to Tailwind via `@theme inline`
- **Design system:** Documented in `DESIGN_SYSTEM.md`
- **Icons:** Unified to `react-icons/fa` only (removed `react-icons/hi2`)
- **Cursor:** Global `cursor: pointer` on all interactive elements via `@layer base`
- **Sidebar tabs:** Summary/Transactions icons wrapped in circles with proper badge positioning

## Recent Changes (v1.2.0)

### Currency Formatting
- **`lib/formatCurrency.ts`:** Utility function for consistent `$x,xxx.xx` formatting
- Applied across 6+ files (BudgetHeader, BudgetSummary, BudgetSection, MonthlyReportModal, SplitTransactionModal, recurring page)

### Budget Summary Enhancements
- **Total Savings rows** added to Planned and Actual sections in BudgetSummary sidebar
- **Tighter spacing** in summary sidebar

### Progress Bar Color
- Changed budget item progress bar from faint blue (`bg-primary-light`) to green (`bg-success`)
- Over-budget items use red (`bg-danger`) with matching glow shadows

### Auth Page Theming
- **Clerk components** styled with Emerald design system via `appearance` prop
- Variables: `colorPrimary: #059669`, Outfit font, matching text/input colors
- Card styling: `shadow-xl border border-border`

### Animated Auth Background
- Diagonal repeating "BUDGET APP" text on sign-in and sign-up pages
- 45-degree rotation with oversized container (`-100%` inset) for full coverage
- **Animated:** Alternating `scroll-left` / `scroll-right` CSS keyframe animations per row
- Non-uniform pattern: varying text sizes (`text-xl`/`text-2xl`/`text-3xl`), opacities (`0.04`–`0.07`), and gaps
- Animation speeds: 240s / 280s / 320s (slow, subtle movement)
- Keyframes added to `globals.css`: `scroll-left` and `scroll-right`
- Decorative: `pointer-events-none`, `select-none`, `aria-hidden="true"`

### Split Transaction Bug Fix
- Fixed ownership verification for split transactions (parent has null `budgetItemId` after splitting)
- Both `transactions/route.ts` and `transactions/split/route.ts` now check ownership via split transaction path

## Recent Changes (v1.3.0)

### Interactive Onboarding
- **6-step guided onboarding** for new users at `/onboarding`
- Steps: Welcome → Concepts → Set Buffer → Create Budget Items → Add Transaction → Complete
- Required on first sign-up (redirect from `/` if not completed, sign-up redirects to `/onboarding`)
- Revisitable via "Getting Started" link in sidebar (FaLightbulb icon)
- Progress persisted in `user_onboarding` table — users can resume if interrupted
- Skip option available (marks `skippedAt`, redirects to dashboard)

### Onboarding Step Details
- **Step 2 (Concepts):** Explains zero-based budgeting with 3 concept cards and example budget breakdown
- **Step 4 (Items):** Suggested budget items as clickable pill badges per category (Rent $1,200, Groceries $400, etc.). Click populates name/amount fields.
- **Step 5 (Transaction):** Suggested transactions as quick-fill badges based on items created in step 4 (Weekly groceries $85.50, Gas fill-up $45, etc.)
- **Step 6 (Complete):** Summary of what was created, marks onboarding complete via API

### Onboarding API (`/api/onboarding/route.ts`)
- `GET` — Check status (completed, currentStep)
- `POST` — Initialize record for new user
- `PUT` — Update current step
- `PATCH` — Complete or skip (`{ action: 'complete' | 'skip' }`)

### Monthly Report Empty States
- **Top Spending Items:** Shows friendly message instead of empty table when no spending
- **Potential Reallocation:** Hidden entirely when `totalExpenses === 0`
- **Category Breakdown:** Adds "No spending recorded yet" note when no expenses
- **Buffer Flow:** Contextual help text for new users vs active users

### Other Changes
- `.env.example` file added for new users
- `.gitignore` updated with `!.env.example` exception
- `README.md` updated with v1.2.0 release info and setup instructions
- Migration script: `scripts/migrate-add-onboarding.ts` for existing users
- Standalone onboarding layout (no DashboardLayout) with `h-screen overflow-hidden` and scrollable content area

## Recent Changes (v1.4.0)

### Supabase Migration (Phases 1-4)
- **Database:** Migrated from SQLite (`better-sqlite3`) to Supabase PostgreSQL
- **Schema:** Converted all tables from `sqliteTable` to `pgTable` in `db/schema.ts`
  - `integer().primaryKey({ autoIncrement: true })` → `serial().primaryKey()`
  - `integer({ mode: 'timestamp' })` → `timestamp({ withTimezone: true })`
  - `integer({ mode: 'boolean' })` → `boolean()`
  - `real()` → `numeric({ precision: 10, scale: 2 })`
- **Driver:** Switched from `drizzle-orm/better-sqlite3` to `drizzle-orm/postgres-js` in `db/index.ts`
- **Dependencies:** Removed `better-sqlite3` / `@types/better-sqlite3`, added `postgres`
- **Data migration script:** `scripts/migrate-data.ts` — migrates all 7 tables in FK order with sequence resets
- **Drizzle config:** `drizzle.config.ts` updated to `dialect: 'postgresql'` with `DATABASE_URL`

### PostgreSQL Numeric Type Fixes
PostgreSQL `numeric` columns return strings, not numbers. All arithmetic operations across 10+ files updated:
- **Read pattern:** `parseFloat(String(value))` for arithmetic
- **Write pattern:** `String(value)` for DB inserts (e.g., `fundedAmount: '0'`, `amount: String(parseFloat(amount))`)
- **Affected files:** `budgetHelpers.ts`, `recurring-payments/route.ts`, `recurring-payments/contribute/route.ts`, `recurring-payments/reset/route.ts`, `transactions/split/route.ts`, `budget-items/route.ts`, `budgets/route.ts`, `budgets/copy/route.ts`, `auth/claim-data/route.ts`, `SplitTransactionModal.tsx`
- **`.returning()` migration:** Replaced SQLite `.changes` with PostgreSQL `.returning({ id: X.id }).length` in `auth/claim-data/route.ts`

### Phase 5 Skipped — Edge Functions NOT Migrated
**Decision:** Phase 5 (migrating API routes to Supabase Edge Functions) was intentionally skipped. The app continues to use Next.js API routes (`app/api/`) which connect directly to Supabase PostgreSQL via Drizzle ORM.

**Rationale:**
- Next.js API routes already work with PostgreSQL — no functional reason to migrate
- Edge Functions use Deno runtime, requiring significant code rewriting
- Teller API integration (certificates, mTLS) would need special handling in Deno
- Current architecture (Next.js API routes → PostgreSQL) works for both web and Capacitor mobile
- Skipping avoids introducing complexity with no user-facing benefit

**Architecture:** Web + Capacitor Mobile → Next.js API Routes (Vercel) → Supabase PostgreSQL

**If Edge Functions are ever needed:**
- See `MOBILE_MIGRATION_PLAN.md` Phase 5 for the full plan
- 11 route files, 26 handlers would need conversion
- Would require Supabase CLI, Deno-compatible Drizzle setup, and secrets management for Teller certs

### Capacitor Setup (Phase 6)
- **Mode:** Live server (wraps deployed Next.js URL, no static export)
- **Config:** `capacitor.config.ts` with `server.url` pointing to deployed app
- **Dependencies:** `@capacitor/core`, `@capacitor/cli`
- **Scripts:** `cap:sync`, `cap:ios`, `cap:android` added to `package.json`
- **Phase 7 deferred:** iOS/Android platform setup not yet done (`@capacitor/ios`, `@capacitor/android` not installed)

### Teller Sync Optimization
- **Problem:** Sync took ~60s for 5 transactions due to N+1 queries over network to Supabase
- **Fix:** Refactored `POST` handler in `teller/sync/route.ts` to use batch queries:
  - Single `inArray` SELECT to fetch all existing transactions by Teller IDs
  - Single batch `INSERT` for new transactions
  - Individual `UPDATE`s only for changed rows (different data per row)
- **Result:** Reduced from ~500 individual DB queries to ~3-5 batch queries

### Monthly Report Fix
- **Bug:** Saving category was being counted as an expense in Monthly Report totals
- **Fix:** Added `key !== 'saving'` filter in `MonthlyReportModal.tsx` for both current and previous month calculations

### Split Transaction Fix
- **Bug:** `e.amount.toFixed is not a function` when clicking split transactions to edit
- **Cause:** PostgreSQL `numeric` returns strings, not numbers
- **Fix:** Wrapped with `parseFloat(String(s.amount)).toFixed(2)` in `SplitTransactionModal.tsx`

### Previous Month Transactions
- **Feature:** Sidebar "New" (uncategorized) transactions tab now shows last 3 days of previous month
- **Backend:** `GET /api/teller/sync` extended to include previous month's last 3 days, adds `fromPreviousMonth` flag per transaction
- **Frontend:** `BudgetSummary.tsx` groups transactions with "Previous Month (Last 3 Days)" and "This Month" headings
- **Behavior:** Once assigned to a budget item, transactions count toward the budget item's actuals regardless of date

### Environment Variables (Supabase)
```env
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres
# Supabase client not used directly (queries go through Drizzle ORM)
```

## Session Handoff Notes

Last session ended after:
1. Completed Supabase migration (Phases 1-4)
2. Skipped Phase 5 (Edge Functions) — documented rationale above
3. Set up Capacitor live server mode (Phase 6)
4. Fixed all PostgreSQL numeric type issues across 10+ files
5. Optimized Teller sync from ~60s to fast batch queries
6. Fixed Monthly Report excluding Saving from expenses
7. Fixed split transaction `.toFixed()` error
8. Added previous month transactions feature (last 3 days)
9. Build verified passing

The app is in a stable state with v1.4.0 changes applied.

## Branch Goal: Local-First Architecture (v1.5.0)

Migrate from cloud-only (Supabase PostgreSQL) to a **local-first architecture** with optional cloud sync:
- **Primary database:** PGlite (PostgreSQL in browser/Node) for all direct app interactions
- **Cloud database:** Supabase PostgreSQL as source of truth for multi-device sync
- **New installs:** Use local database only until user explicitly connects to cloud
- **Sync strategy:** Cloud always wins conflicts; local data pushed after pull completes
- **Authentication:** None required locally (single implicit user); Clerk auth only for cloud sync

### Architecture Diagram
```
┌─────────────────────────────────────────────────────────────────┐
│                    App (Next.js + Capacitor)                    │
│                                                                 │
│   All reads/writes ──────► PGlite (local)                       │
│                                                                 │
│   ┌──────────────┐       Sync Process        ┌───────────────┐  │
│   │   PGlite     │ ◄─────────────────────►   │   Supabase    │  │
│   │   (local)    │   (auto when online +     │  (PostgreSQL) │  │
│   │              │    cloud connected)       │    (cloud)    │  │
│   └──────────────┘                           └───────────────┘  │
│                                                                 │
│   No auth locally              Clerk auth for sync              │
│   Single implicit user         userId scopes cloud data         │
└─────────────────────────────────────────────────────────────────┘
```

### Key Decisions
| Aspect | Decision |
|--------|----------|
| Local database | PGlite (same PostgreSQL schema for local + cloud) |
| Record identity | UUIDs (enables offline creation without collision) |
| Sync trigger | Auto-sync on app open + every 5 min (configurable via `NEXT_PUBLIC_SYNC_INTERVAL_MS`) |
| Sync scope | All data (no partial sync) |
| Conflict resolution | Cloud always wins |
| Deletes | Soft delete (`deletedAt` timestamp) |
| Teller bank sync | Only available when cloud connected |
| Web deployment | Keep Vercel |

---

## Migration Phases

### Phase 1: Schema Migration to UUIDs ✅ COMPLETE
**Goal:** Convert all tables from auto-increment integer IDs to UUIDs (required for sync without ID collisions).

**Completed work:**
- Updated `db/schema.ts` - All 8 tables converted:
  - `serial('id').primaryKey()` → `uuid('id').primaryKey().defaultRandom()`
  - All foreign keys changed from `integer` to `uuid` type
- Updated `types/budget.ts` - All ID types changed from `number` to `string`
- Updated all API routes - Removed `parseInt()` calls on IDs
- Updated all components with ID props - Changed from `number` to `string`
- Created `scripts/migrate-to-uuid.ts` - Migration script for Supabase data
- Updated `tsconfig.json` - Added "scripts" to exclude array
- Deleted legacy SQLite migration scripts (check-schema.ts, migrate-add-*.ts, migrate-data.ts)

**Files modified (20+):**
- `db/schema.ts`, `types/budget.ts`
- `components/AddTransactionModal.tsx`, `components/BudgetSummary.tsx`, `components/SplitTransactionModal.tsx`
- All 11 API route files (budget-items, budgets, recurring-payments, transactions, teller, onboarding, auth)
- `app/page.tsx`, `app/settings/page.tsx`

**⏳ Pending:** Run migration script on Supabase (`npx tsx scripts/migrate-to-uuid.ts`)

---

### Phase 2: Add PGlite Local Database Layer 🔲 PENDING
**Goal:** Add PGlite as the local database using the same schema as cloud.

**Planned work:**
- Install `@electric-sql/pglite`
- Create `db/local.ts` - PGlite connection with IndexedDB persistence
- Create `db/cloud.ts` - Rename/refactor existing cloud connection
- Update `db/index.ts` - Export local DB as primary, cloud DB on-demand

**Key benefit:** PGlite is PostgreSQL, so same schema works for both - no type conversion needed.

---

### Phase 3: Implement Local-Only Mode 🔲 PENDING
**Goal:** App works entirely locally with no authentication required.

**Planned work:**
- Update `middleware.ts` - Remove route protection
- Update all 11 API routes - Remove `requireAuth()` checks
- Update `lib/auth.ts` - Add local vs cloud auth distinction
- Create `lib/cloudConnection.ts` - Track cloud connection state

---

### Phase 4: Build Sync Engine 🔲 PENDING
**Goal:** Implement bidirectional sync between local PGlite and cloud Supabase.

**Planned work:**
- Create `lib/sync/index.ts` - Main sync orchestrator
- Create `lib/sync/pull.ts` - Cloud → Local sync
- Create `lib/sync/push.ts` - Local → Cloud sync
- Create `lib/sync/status.ts` - Sync status tracking
- Create `lib/sync/autoSync.ts` - Auto-sync triggers

**Sync process:**
1. Check online status and cloud connection
2. Authenticate via Clerk
3. **PULL:** Cloud → Local (cloud wins conflicts)
4. **PUSH:** Local → Cloud (new local records)
5. Update sync timestamp

**Sync order (FK dependencies):** budgets → budget_categories → linked_accounts → recurring_payments → budget_items → transactions → split_transactions → user_onboarding

---

### Phase 5: Create Cloud Connect UI 🔲 PENDING
**Goal:** Settings page UI to connect local app to cloud account.

**Planned work:**
- Update `app/settings/page.tsx` - Add Cloud Sync section
- Create `components/CloudConnectButton.tsx`
- Create `components/CloudStatus.tsx`
- Create `components/CloudRestoreModal.tsx`

**User flow:**
1. User visits Settings > "Connect to Cloud"
2. Clerk sign-in/sign-up
3. If cloud has data → offer restore
4. If no cloud data → offer upload
5. Enable auto-sync

---

### Phase 6: Configure Capacitor Static Build 🔲 PENDING
**Goal:** Switch Capacitor from live server mode to static export with bundled PGlite.

**Planned work:**
- Update `next.config.ts` - Enable static export (`output: 'export'`)
- Update `capacitor.config.ts` - Point to `out/` directory
- Restructure API routes → client-side functions in `lib/`
- Update build scripts for mobile

---

## Environment Variables (Local-First)

```env
# Existing
DATABASE_URL=postgresql://...  # Cloud DB for sync
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# New for local-first
NEXT_PUBLIC_SYNC_INTERVAL_MS=300000  # 5 minutes default
```

---

## Reference

Full migration plan: [LOCAL_FIRST_MIGRATION_PLAN.md](LOCAL_FIRST_MIGRATION_PLAN.md)