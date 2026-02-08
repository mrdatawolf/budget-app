# Claude Context Document

This document contains context for Claude AI to continue development on this budget app. Use this to quickly get up to speed when starting a new session.

## Project Overview

A zero-based budget tracking application built with Next.js, TypeScript, and Tailwind CSS. The app features bank account integration via Teller API for automatic transaction imports.

**Current Version:** v2.0.0-alpha (Client-Server Separation — Phase 3 complete)
**Last Session:** 2026-02-07

## Instructions for Claude

- **Do NOT commit** unless explicitly authorized by the user
- Wait for user approval before running `git commit`, `git push`, or similar commands
- When changes are ready, describe what would be committed and ask if the user wants to proceed

## Tech Stack

- **Architecture:** Monorepo (pnpm workspaces) — client-server separation (API fully migrated to Hono)
- **Framework:** Next.js 16.x (App Router) for client, Hono for API server
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **ORM:** Drizzle ORM
- **Database:** PGlite (local PostgreSQL) + Supabase (cloud sync)
- **Authentication:** Clerk (@clerk/nextjs) — used for cloud sync, implicit local user otherwise
- **Bank Integration:** Teller API (mTLS)
- **Mobile:** Capacitor (live server mode) + Native iOS (SwiftUI)
- **Charts:** D3.js + d3-sankey
- **Icons:** react-icons (FaXxx from react-icons/fa only)

## iOS App (SwiftUI)

Native iOS app built with SwiftUI targeting iOS 17+. Located in `ios/BudgetApp/`.

### Tech Stack
- **Language:** Swift 5.9+
- **UI Framework:** SwiftUI (iOS 17+)
- **Architecture:** MVVM
- **Authentication:** Clerk iOS SDK
- **Networking:** URLSession + async/await

### Project Structure
```
ios/BudgetApp/
├── BudgetApp.xcodeproj
├── BudgetApp/
│   ├── App/
│   │   └── BudgetAppApp.swift       # Entry point with Clerk auth
│   ├── Models/
│   │   ├── Budget.swift             # Budget, BudgetCategory, BudgetItem
│   │   ├── Transaction.swift        # Transaction, SplitTransaction
│   │   ├── LinkedAccount.swift
│   │   └── RecurringPayment.swift
│   ├── Services/
│   │   ├── APIClient.swift          # Generic HTTP client
│   │   ├── BudgetService.swift
│   │   ├── AccountsService.swift
│   │   ├── TransactionService.swift
│   │   └── RecurringService.swift
│   ├── ViewModels/
│   │   ├── BudgetViewModel.swift
│   │   ├── TransactionsViewModel.swift
│   │   ├── AccountsViewModel.swift
│   │   ├── InsightsViewModel.swift
│   │   └── RecurringViewModel.swift
│   ├── Views/
│   │   ├── Budget/                  # BudgetView, CategorySection, etc.
│   │   ├── Transactions/            # TransactionsView
│   │   ├── Accounts/                # AccountsView
│   │   ├── Insights/                # InsightsView
│   │   ├── Settings/                # SettingsView, RecurringPaymentsView
│   │   ├── Onboarding/              # SignInView
│   │   └── Components/              # MonthYearPicker, etc.
│   └── Utilities/
│       ├── Constants.swift          # API base URL, Clerk keys
│       └── Extensions.swift
```

### Key Implementation Details

**Month Indexing (Critical!):**
- Web app uses 0-indexed months (JavaScript `Date.getMonth()`: Jan=0, Feb=1)
- Swift uses 1-indexed months (`Calendar.component(.month)`: Jan=1, Feb=2)
- iOS app converts to 0-indexed before API calls: `selectedMonth = calendar.component(.month, from: now) - 1`

**Date Parsing:**
- Transaction `date` field: "YYYY-MM-DD" format (not ISO8601)
- Timestamps (`createdAt`, `deletedAt`): ISO8601 with optional fractional seconds
- Custom decoders handle both formats in Transaction.swift and Budget.swift

**Actual Calculation:**
- Backend returns transactions but NOT pre-calculated `actual` amounts
- iOS calculates actuals client-side in `BudgetItem.calculateActual(isIncomeCategory:)`
- For income categories: income adds, expense subtracts
- For expense categories: expense adds, income subtracts
- Includes both direct transactions and split transactions

**PostgreSQL Numeric Handling:**
- PostgreSQL returns numeric fields as strings
- All amount fields use custom decoding: `Decimal(string: amountString) ?? 0`

**Auth Token Timing:**
- `BudgetAppApp.swift` uses `isAuthReady` state to prevent API calls before token is set
- Shows "Preparing..." while fetching token after Clerk login

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

### API Server Routes (packages/server/src/routes/)
All API routes have been migrated from Next.js `app/api/` to the standalone Hono server:
- `budgets.ts` - GET (auto-create + recurring sync), PUT (buffer), POST `/copy`, POST `/reset`
- `budget-categories.ts` - POST (create), DELETE (cascade)
- `budget-items.ts` - POST/PUT/DELETE, PUT `/reorder`
- `transactions.ts` - CRUD + PATCH (restore) + POST `/split` + GET/DELETE `/split` + POST `/batch-assign`
- `recurring-payments.ts` - CRUD + POST `/contribute` + POST `/reset`
- `teller.ts` - GET/POST/DELETE `/accounts`, GET/POST `/sync`
- `csv.ts` - GET/POST/PUT/DELETE `/accounts`, POST `/preview`, POST/PUT `/import`
- `onboarding.ts` - GET/POST/PUT/PATCH
- `auth.ts` - GET/POST (claim-data)
- `database.ts` - GET/POST (no auth)

### API Server Infrastructure (packages/server/src/)
- `index.ts` - Hono server entry point, route mounting, auth middleware ordering
- `types.ts` - `AppEnv` type with `Variables: { userId: string }`
- `middleware/auth.ts` - Dual-mode auth (local: implicit user, remote: JWT)
- `lib/helpers.ts` - Shared `getMonthlyContribution()` + `CATEGORY_TYPES`
- `lib/teller.ts` - Teller API client with mTLS
- `lib/csvParser.ts` - CSV parsing and column mapping utilities

### Utilities (lib/)
- `api-client.ts` - Centralized typed API client (`api.budget.*`, `api.transaction.*`, etc.)
- `budgetHelpers.ts` - `transformDbBudgetToAppBudget()` transforms DB data to app types
- `auth.ts` - Authentication helpers (`requireAuth()`, `isAuthError()`) — legacy, used by middleware.ts only

### Root Files
- `middleware.ts` - Clerk middleware for route protection

### Types (types/)
- `budget.ts` - All TypeScript interfaces (Budget, BudgetItem, Transaction, etc.)

## Important Code Patterns

### API Route Authentication (Hono Server)
All Hono API routes use middleware-injected auth:
```typescript
import { getUserId } from '../middleware/auth';
import type { AppEnv } from '../types';

const route = new Hono<AppEnv>();

route.get('/', async (c) => {
  const userId = getUserId(c);
  const db = await getDb();

  const data = await db.query.budgets.findFirst({
    where: and(eq(budgets.userId, userId), eq(budgets.month, month)),
  });
  return c.json(data);
});
```
- Auth middleware (`requireAuth()`) is applied globally to `/api/*` in `index.ts`
- Database route is mounted BEFORE auth middleware (no auth required)
- Local mode: implicit 'local' user ID; Remote mode: JWT Bearer token

### Client-Side API Calls
All client files use the centralized API client (`lib/api-client.ts`) — no raw `fetch()` calls:
```typescript
import { api } from '@/lib/api-client';

// Budget
const data = await api.budget.get(month, year);

// Transactions
await api.transaction.create({ budgetItemId, date, description, amount, type });
await api.transaction.batchAssign([{ transactionId, budgetItemId }]);

// Splits
const splits = await api.split.list(transactionId);
await api.split.save(transactionId, splits);

// CSV (file uploads use FormData)
const formData = new FormData();
formData.append('file', file);
const preview = await api.csv.uploadPreview(formData);
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
In `packages/server/src/routes/budgets.ts` GET handler:
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
- **Custom budget categories** — user-created categories with name + emoji, deletable, carry over on copy
- Transaction management (add, edit, soft delete, restore)
- Split transactions across multiple budget items
- **Edit existing splits** by clicking split transactions (from Item Detail, Tracked tab, or BudgetSection dropdown)
- Bank integration via Teller
- Recurring payments with linking to budget items
- **Recurring payment auto-reset** — due dates auto-advance and funded amounts reset when period passes
- Budget item detail view in sidebar
- Monthly report with Buffer Flow (including "Left to Budget") and empty-state handling
- Copy budget from previous month (including custom categories)
- **Insights charts** — Budget vs Actual (bar), Spending Trends (line), Cash Flow (Sankey)
- **Accounts grouped by institution** on settings page

### Potential Future Work
- Could add ability to edit recurring payment from budget item detail view
- Cross-chart filtering (click category to filter all charts)
- Export charts as PNG/SVG
- Custom date range selector for trends (6 months, 1 year)

## Development Commands

```bash
# Client + Server (both needed for full app)
pnpm dev             # Start Next.js client on :3000
pnpm server:dev      # Start Hono API server (port from API_PORT env, default 3001)

# Database
npm run db:push      # Push schema changes to Supabase PostgreSQL
npm run db:studio    # Open Drizzle Studio to view/edit data

# Build
npm run build        # Production build (Next.js client)
pnpm server:build    # Build API server

# Mobile
npm run cap:sync     # Sync Capacitor
npm run cap:ios      # Build + open Xcode
npm run cap:android  # Build + open Android Studio

# Health check
curl http://localhost:3001/health
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

## Recent Changes (v1.5.0)

### Interactive Insights Charts
- **Dependencies:** Added `d3`, `d3-sankey`, `@types/d3`, `@types/d3-sankey`
- **Chart infrastructure:**
  - `lib/chartColors.ts` — category color mapping (`getCategoryColor`, `getCategoryLightColor`, `getCategoryEmoji`)
  - `lib/chartHelpers.ts` — data transformation utilities for all 3 chart types
  - `types/chart.ts` — TypeScript interfaces (`CategoryChartData`, `MonthlyTrendData`, `FlowNode`, `FlowLink`, `FlowData`, `TooltipData`)
  - `components/charts/ChartTooltip.tsx` — shared fixed-position tooltip
  - `components/charts/ChartEmptyState.tsx` — shared empty state with icon/title/message/action

### Budget vs Actual Chart (`components/charts/BudgetVsActualChart.tsx`)
- Horizontal grouped bar chart: planned (gray) vs actual (category color)
- Over-budget bars turn red with glow shadow
- Hover tooltips show exact amounts and over/under difference
- Uses `d3.scaleBand()` + `d3.scaleLinear()`

### Spending Trends Chart (`components/charts/SpendingTrendsChart.tsx`)
- Multi-line chart with one line per expense category
- Interactive legend: click category to toggle visibility (`visibleCategories` Set)
- Smooth curves via `d3.curveMonotoneX`
- Dot markers on data points with hover tooltips
- Requires 2+ months of data (shows empty state otherwise)

### Cash Flow Diagram (`components/charts/FlowDiagram.tsx`)
- 3-column Sankey: Sources → Categories → Budget Items
- Sources: Buffer (gray) and Income (emerald), shown when they have values
- Gradient-colored links from source color to category color
- Node hover highlights connected links, dims others to 0.15 opacity
- Detailed tooltips show constituent line items on source/category nodes
- Column headers: SOURCES / CATEGORIES / BUDGET ITEMS
- Amount labels on bars tall enough to fit text
- Uses `d3-sankey` with `.nodeId()` for string-based node identification

### Insights Page (`app/insights/page.tsx`)
- Multi-month data fetching: loads current + 2 previous months of budgets
- `budgets` array (oldest→newest) for trends, `currentBudget` for bar/flow charts
- Refresh button with loading spinner
- Max width increased from `max-w-4xl` to `max-w-6xl`
- Replaced "Coming Soon" placeholder cards with live charts

### Data Transformation Details (`lib/chartHelpers.ts`)
- `transformBudgetToCategoryData(budget)` — aggregates planned/actual per category
- `transformBudgetsToTrendData(budgets)` — time series with month/year/date per budget
- `transformBudgetToFlowData(budget)` — 3-column Sankey data:
  - Distributes income proportionally across expense categories
  - Includes `lineItems` on source and category nodes for hover detail
  - Returns empty data when no income or no expenses
- `hasTransactionData(budget)` — checks if any category has actual spending
- `hasIncomeAndExpenses(budget)` — checks for both income and expenses (flow diagram requirement)

### D3 + React Integration Pattern
- React controls: component lifecycle, DOM structure, state (tooltips, legend)
- D3 handles: scales, axes, paths, layout calculations
- `useRef` for SVG elements, `useEffect` for D3 rendering, `useMemo` for data transforms
- Responsive via `viewBox` + `preserveAspectRatio="xMidYMid meet"`

## Recent Changes (v1.7.0)

### Custom Budget Categories
- **"Add Group" button** now functional — opens modal with name input and searchable emoji picker (130+ emojis in 12 groups)
- `CategoryType` changed from fixed union to `string`; `Budget.categories` is now `Record<string, BudgetCategory>`
- Custom categories rendered dynamically: income first → defaults → custom → saving last
- Custom categories show delete button on hover (cascade deletes items + transactions)
- Custom categories carry over via "Copy from previous month" (not auto-created in new months)
- DB schema: added `emoji` (text, nullable) and `categoryOrder` (integer) columns to `budget_categories`
- New API: `POST /api/budget-categories` (create), `DELETE /api/budget-categories?id=X` (delete)
- Chart helpers/colors updated to support dynamic categories with hash-based color assignment

### Recurring Payment Auto-Reset
- In `budgets/route.ts` GET handler: checks each active recurring payment's `nextDueDate`
- If due date has passed, advances it by one frequency period (loops until future date)
- Resets `fundedAmount` to `'0'` so progress bar starts fresh
- Monthly payments already had dynamic funded amount (from current month transactions), but DB value now stays consistent

### Buffer Flow: Left to Budget
- `MonthlyReportModal.tsx` — added "Left to Budget" row: `max(0, buffer + totalPlannedIncome - allPlannedExpenses)`
- Projected buffer formula: `Underspent - Overspent + Left to Budget`

### Accounts Grouped by Institution
- `settings/page.tsx` — linked bank accounts grouped by institution name using `reduce`

### Key Files Modified
- `db/schema.ts` — emoji + categoryOrder columns
- `types/budget.ts` — CategoryType → string, Budget.categories → Record, DefaultCategoryType union, DEFAULT_CATEGORIES array
- `types/chart.ts` — string keys instead of CategoryType import
- `lib/budgetHelpers.ts` — dynamic category initialization from DB data
- `lib/chartColors.ts` — DefaultCategoryType, custom color palette, hash-based color index
- `lib/chartHelpers.ts` — dynamic category key derivation
- `app/api/budget-categories/route.ts` — NEW (POST/DELETE)
- `app/api/budgets/route.ts` — recurring auto-reset logic
- `app/api/budgets/copy/route.ts` — custom category creation in target
- `app/page.tsx` — dynamic category rendering, Add Group modal, emoji picker
- `app/settings/page.tsx` — institution grouping
- `components/BudgetSection.tsx` — stored emoji support
- `components/MonthlyReportModal.tsx` — Left to Budget + stored emoji
- `components/charts/SpendingTrendsChart.tsx` — dynamic category keys

## Recent Changes (v1.6.0)

### Tablet Responsiveness & Mobile Block Screen
- **Mobile block screen** (`components/MobileBlockScreen.tsx`) — full-screen overlay on screens < 768px telling users to use a tablet or larger device
- **DashboardLayout** — added `MobileBlockScreen`, main layout uses `hidden md:flex` (hidden < 768px)
- **Sidebar auto-collapse** — defaults to collapsed on screens < 1024px via `window.matchMedia` listener
- **Summary sidebar toggle drawer** — on tablet (md–lg), right sidebar is a floating drawer toggled by a FAB button; on lg+ it's always visible
- **Responsive padding** — insights, recurring, settings pages use `p-4 lg:p-8`

### Month/Year Selection Persistence
- Selected month/year persists across page navigations via URL search params
- Sidebar navigation links include current `?month=X&year=Y` query params

### Transaction Categorization Suggestions
- Merchant-based suggestion badges on uncategorized transactions
- Backend: `GET /api/teller/sync` returns `suggestedBudgetItemId` based on most frequent historical merchant→budgetItem pairing
- Frontend: clickable badge on each transaction for one-tap categorization

### Transaction Display Improvements
- Show all transactions regardless of date, grouped by month
- Transactions limited to ±7 days of current budget month boundaries
- Uncategorized count updates to match filtered transactions

### Monthly Report Buffer Fix
- Removed `incomeVariance` from buffer projection (planned income is adjusted on the fly)
- Removed "Current Buffer" row from Buffer Flow UI — projection is now simply `underspent - overspent`

### Split Transaction Actual Calculation Fix
- Fixed `budgetHelpers.ts` to correctly calculate split transaction actuals by checking `parentTransaction.type`
- Income splits reduce expense category actuals; expense splits increase them

### Vercel Deployment Fix
- Excluded `scripts/` directory from `tsconfig.json` to prevent build failure from old SQLite migration scripts importing `better-sqlite3`

### New Files
- `components/MobileBlockScreen.tsx` — mobile block screen component

### Key File Changes
- `components/DashboardLayout.tsx` — MobileBlockScreen + hidden md:flex
- `components/Sidebar.tsx` — auto-collapse on tablet via matchMedia
- `app/page.tsx` — summary sidebar toggle drawer for tablet
- `app/insights/page.tsx` — responsive padding
- `app/recurring/page.tsx` — responsive padding
- `app/settings/page.tsx` — responsive padding
- `components/MonthlyReportModal.tsx` — simplified buffer projection formula
- `lib/budgetHelpers.ts` — split transaction actual calculation fix
- `app/api/teller/sync/route.ts` — merchant-based suggestions
- `tsconfig.json` — exclude scripts directory

## Recent Changes (v1.8.0)

### Empty Budget Detection Fix
- **Problem:** Recurring payment items were auto-created in GET `/api/budgets`, so new months never showed the "Hey there, looks like you need a budget" empty state
- **Fix:** Moved recurring item creation from GET `/api/budgets` to POST `/api/budgets/copy`
- Recurring due-date auto-advance still happens on GET (to keep dates current)
- Recurring budget items now only created when user clicks "Start Planning for [month]"

### Copy Budget: No More Duplicate Recurring Items
- When copying from previous month, items linked to recurring payments (`recurringPaymentId`) are skipped
- The recurring sync that runs after copying creates them fresh with proper linking
- Prevents duplicate items (e.g., "Rent" appearing twice — once from copy, once from recurring)

### Reset Budget Feature
- **New button:** "Reset Budget" below "Add Group" (dotted red border)
- **Modal:** Two-step flow with confirmation
  1. Choose: "Zero out all planned amounts" or "Replace with last month's budget"
  2. Confirm: Shows description of action with Back/Confirm buttons
- **Zero out:** Sets all planned amounts to $0.00, keeps categories/items/transactions
- **Replace:** Deletes current items, copies from previous month + syncs recurring payments

### New Files
- `app/api/budgets/reset/route.ts` — POST endpoint for budget reset (modes: 'zero', 'replace')

### Key File Changes
- `app/api/budgets/route.ts` — removed recurring item creation, kept due-date auto-advance
- `app/api/budgets/copy/route.ts` — added recurring item sync, skip items with `recurringPaymentId` during copy
- `app/page.tsx` — added Reset Budget button + modal with two-step confirmation

## Recent Changes (v1.9.0)

### Native iOS App (SwiftUI)
- **New iOS app** in `ios/BudgetApp/` — full SwiftUI implementation targeting iOS 17+
- **MVVM architecture** with ViewModels for each major view
- **Clerk iOS SDK** integration for authentication
- **Tab-based navigation:** Budget, Transactions, Accounts, Insights
- **Full budget viewing** with categories, items, and transactions
- **Month/year picker** for navigating between budget periods

### Key Fixes During Development
1. **Auth token timing race condition** — Added `isAuthReady` state to ensure token is set before API calls
2. **0-indexed month mismatch** — Converted iOS to use 0-indexed months to match web app's JavaScript `Date.getMonth()`
3. **Transaction date parsing** — Custom decoder for "YYYY-MM-DD" format (not full ISO8601)
4. **Actual amount calculation** — Client-side calculation from transactions matching web app's `budgetHelpers.ts` logic
5. **PostgreSQL numeric strings** — Custom Decimal decoding for all amount fields
6. **ISO8601 fractional seconds** — Flexible date parsing for `createdAt` and `deletedAt` timestamps

### New Files (iOS)
- `ios/BudgetApp/` — Complete Xcode project
- 28 Swift files covering Models, Services, ViewModels, and Views
- See "iOS App (SwiftUI)" section above for full structure

## Session Handoff Notes

Last session (2026-02-07) completed **Phases 1, 2, and 3** of client-server separation:

### Completed
1. **Phase 1: Monorepo structure** with pnpm workspaces
2. **Phase 1: Shared package** (`packages/shared/`) with types, schema, and db utilities
3. **Phase 2: Hono API server** (`packages/server/`) with health endpoint and auth middleware
4. **Phase 2: Centralized API client** (`lib/api-client.ts`) with typed methods for all endpoints
5. **Phase 2: All client files migrated** — zero raw `fetch('/api/...')` calls remain in components/pages
6. **Phase 3: All 20 Next.js API routes migrated** to 10 Hono route files (45+ HTTP handlers)
7. **Phase 3: Next.js `app/api/` directory deleted** — clean break, all API served by Hono

### Phase 3 Details (Completed 2026-02-07)
- **10 Hono route files** created in `packages/server/src/routes/`
- **3 server lib files** created: `helpers.ts`, `teller.ts`, `csvParser.ts`
- **Infrastructure:** `types.ts` (AppEnv), auth middleware updated with typed context
- **Bug fix:** Copy route now uses `fromMonth/fromYear/toMonth/toYear` (was `sourceMonth/sourceYear/targetMonth/targetYear`) to match api-client
- **Shared helpers:** `getMonthlyContribution()` and `CATEGORY_TYPES` extracted from 3 duplicate definitions into `lib/helpers.ts`
- **Auth middleware ordering:** Database route mounted before `requireAuth()` (no auth); all other `/api/*` routes require auth
- **Port config:** Server uses `API_PORT` env var (default 3001), loaded from `.env.local` via `--env-file` flag

### Next Steps
- Phase 4: Create embedded server manager for local mode
- Phase 5: Implement Clerk JWT verification for remote mode
- Phase 6: Update build scripts and installer

### Test Commands
```bash
pnpm server:dev    # Start Hono server (port from API_PORT in .env.local)
pnpm dev           # Start Next.js client on :3000
curl http://localhost:3401/health   # Verify server is running
```

---

## Client-Server Separation (v2.0.0)

### Goal
Split the app into 3 decoupled parts:
1. **Client** - Next.js frontend with configurable SERVER_URI
2. **API Server** - Standalone Hono server that can run embedded (local) or remote
3. **Database** - PGlite (local) or Supabase (cloud)

### Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    SERVER_URI Config                         │
│  localhost/127.0.0.1 → Embedded    Other → Remote HTTP      │
└─────────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
┌─────────────────┐                  ┌─────────────────┐
│ Client spawns   │                  │ Client calls    │
│ local API server│                  │ remote server   │
│ as child process│                  │ directly        │
└────────┬────────┘                  └────────┬────────┘
         │                                    │
         ▼                                    ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Server (Hono)                       │
│  - 10 route files, 45+ HTTP handlers                        │
│  - Auth middleware (local: implicit, remote: JWT)           │
│  - Teller mTLS client                                       │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                        Database                              │
│  PGlite (local file) ←──or──→ Supabase (cloud PostgreSQL)   │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure
```
budget-app/
├── packages/
│   ├── shared/                    # Shared code (types, schema, db)
│   │   ├── src/
│   │   │   ├── types/             # TypeScript interfaces
│   │   │   ├── db/                # PGlite and cloud connections
│   │   │   ├── schema.ts          # Drizzle schema
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── server/                    # Standalone Hono API server
│       ├── src/
│       │   ├── index.ts           # Entry point, route mounting, CORS
│       │   ├── types.ts           # AppEnv type
│       │   ├── middleware/auth.ts # Dual-mode auth (local/remote)
│       │   ├── lib/
│       │   │   ├── helpers.ts     # Shared helpers (getMonthlyContribution, CATEGORY_TYPES)
│       │   │   ├── teller.ts      # Teller API mTLS client
│       │   │   └── csvParser.ts   # CSV parsing utilities
│       │   └── routes/            # 10 route files (all API handlers)
│       │       ├── budgets.ts     # GET/PUT + /copy + /reset
│       │       ├── budget-categories.ts
│       │       ├── budget-items.ts  # CRUD + /reorder
│       │       ├── transactions.ts  # CRUD + /split + /batch-assign
│       │       ├── recurring-payments.ts  # CRUD + /contribute + /reset
│       │       ├── teller.ts      # /accounts + /sync
│       │       ├── csv.ts         # /accounts + /preview + /import
│       │       ├── onboarding.ts
│       │       ├── auth.ts        # claim-data
│       │       └── database.ts    # No auth
│       └── package.json
│
├── lib/
│   └── api-client.ts              # Centralized typed API client
│
├── pnpm-workspace.yaml            # Workspace config
└── ... (Next.js client app — no more app/api/)
```

### Key Files
- `packages/shared/src/types/` — Budget, Transaction, RecurringPayment, etc.
- `packages/shared/src/db/` — getDb(), getLocalDb(), getCloudDb()
- `packages/shared/src/schema.ts` — Drizzle schema
- `packages/server/src/index.ts` — Hono server entry point
- `packages/server/src/middleware/auth.ts` — Dual-mode auth (local/remote)
- `lib/api-client.ts` — Typed API client with all endpoint methods

### Environment Variables
```env
# Client
NEXT_PUBLIC_SERVER_URI=http://localhost:3401  # API server URL (or remote)
SERVER_PORT=3400                              # Next.js client port

# Server
API_PORT=3401                                 # Hono API server port (default 3001)
PGLITE_DB_LOCATION=./data/budget-local       # Local database path
DATABASE_URL=postgresql://...                 # For cloud sync
TELLER_CERTIFICATE_PATH=./certificates/certificate.pem
TELLER_PRIVATE_KEY_PATH=./certificates/private_key.pem
CLERK_SECRET_KEY=sk_test_...                  # Remote mode only
```

### Confirmed Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| API Framework | **Hono** | Web-standard Request/Response, tiny bundle, TypeScript-first |
| Codebase Structure | **Monorepo** | packages/client, packages/server, packages/shared |
| Migration Strategy | **Clean break** | Remove Next.js API routes after migrating to Hono |
| Package Manager | **pnpm** | Efficient, good monorepo support |
| Auth Token | **Clerk JWT** | Already integrated, proven |

---

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

### Phase 2: Add PGlite Local Database Layer ✅ COMPLETE
**Goal:** Add PGlite as the local database using the same schema as cloud.

**Completed work:**
- Installed `@electric-sql/pglite`
- Created `db/local.ts` - PGlite connection with file system persistence (IndexedDB planned for browser)
- Created `db/cloud.ts` - Cloud connection for sync
- Updated `db/index.ts` - Exports local DB as primary via `getDb()`
- Added HMR stability fix using `globalThis` to persist connection across hot reloads in dev mode
- Added backup/restore system (`createBackup()`, `restoreFromBackup()`, `listBackups()`)
- Added database status helpers (`getDbStatus()`, `isDbInitialized()`, `resetDbError()`)

**Key files:**
- `db/local.ts` - PGlite singleton with global state for dev mode HMR stability
- `db/cloud.ts` - Supabase PostgreSQL connection
- `db/index.ts` - Re-exports `getLocalDb` as `getDb`

**Environment variable:** `PGLITE_DB_LOCATION` (default: `./data/budget-local`)

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

---

## Bug Fixes (2026-02-06)

### Recurring Income Display Fix
**Problem:** Bi-weekly income (e.g., "Biztech") was showing `$3,897.27 of $1,937.62` in February instead of `$0 of $3,875.24`.

**Root causes:**
1. January transactions were being summed across all months (should only show current month for income)
2. Target amount was using per-paycheck amount ($1,937.62) instead of monthly equivalent ($3,875.24)

**Fix:**
- Added `displayTarget` field to `RecurringPayment` type — monthly equivalent for income, cycle total for expenses
- Added `getMonthlyEquivalent()` helper: weekly × 4, bi-weekly × 2, monthly × 1, quarterly ÷ 3, etc.
- Changed condition from `if (isMonthly)` to `if (isMonthly || isIncome)` when filtering transactions
- Updated UI to show `displayTarget` instead of `amount`
- Removed filter excluding "income" from recurring payment category dropdown

**Files modified:**
- `types/budget.ts` — added `displayTarget` field
- `app/api/recurring-payments/route.ts` — income-aware logic + `getMonthlyEquivalent()`
- `app/api/budgets/copy/route.ts` — added weekly/bi-weekly to `getMonthlyContribution()`
- `app/recurring/page.tsx` — display `displayTarget`, allow income category

**Note:** Weekly/bi-weekly multipliers use simple approximations (×4, ×2) rather than precise annual averages (52/12, 26/12). This matches user expectations and treats "extra" paychecks as buffer.

### PGlite HMR Corruption Fix
**Problem:** Database corruption ("Aborted()") after editing budget items in dev mode, requiring restore from backup.

**Root cause:** Next.js HMR creates new module instances, but PGlite connections from previous instances aren't properly closed, leaving the database in an inconsistent state.

**Fix:** Added global state (`globalThis.__pgliteClient`, etc.) to persist the PGlite connection across HMR reloads in development mode. Production continues to use module-level state.

**Files modified:**
- `db/local.ts` — added `globalThis` accessors for dev mode, helper functions (`getPgliteClient`, `setPgliteClient`, etc.)
