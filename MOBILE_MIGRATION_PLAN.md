# Budget App: Supabase + Capacitor Migration Plan

## Overview
Migrate from SQLite to Supabase (PostgreSQL) for multi-device sync, then add Capacitor for iOS/Android. All API logic will move to Supabase Edge Functions.

**Architecture:**
- Web + Mobile → Supabase Edge Functions → PostgreSQL
- Teller bank sync: server-side only (via Edge Functions)

---

## Phase 1: Supabase Project Setup

### Tasks
1. Create Supabase project at supabase.com
2. Note credentials: project URL, anon key, service role key, database URL
3. Create `.env.local` with:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
   DATABASE_URL=postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres
   SUPABASE_SERVICE_ROLE_KEY=xxx
   ```

### Verification
- Can access Supabase dashboard and SQL editor

---

## Phase 2: Update Dependencies

### Files to modify
- `package.json`

### Changes
**Add:**
- `@supabase/supabase-js` - Supabase client
- `postgres` - PostgreSQL driver for Drizzle

**Remove:**
- `better-sqlite3`
- `@types/better-sqlite3`

### Commands
```bash
npm install @supabase/supabase-js postgres
npm uninstall better-sqlite3 @types/better-sqlite3
```

---

## Phase 3: Convert Database Layer to PostgreSQL

### Files to modify
1. `drizzle.config.ts` - Change dialect to `postgresql`
2. `db/index.ts` - Switch to `postgres` driver
3. `db/schema.ts` - Convert all types to PostgreSQL

### Schema Type Conversions
| SQLite | PostgreSQL |
|--------|------------|
| `sqliteTable` | `pgTable` |
| `integer().primaryKey({ autoIncrement: true })` | `serial().primaryKey()` |
| `integer({ mode: 'timestamp' })` | `timestamp({ withTimezone: true })` |
| `integer({ mode: 'boolean' })` | `boolean()` |
| `real()` for money | `numeric({ precision: 10, scale: 2 })` |

### Key Changes in db/index.ts
```typescript
// FROM:
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
const sqlite = new Database('budget.db');
export const db = drizzle(sqlite, { schema });

// TO:
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
const client = postgres(process.env.DATABASE_URL!, { prepare: false });
export const db = drizzle(client, { schema });
```

### Verification
```bash
npm run db:push  # Push schema to Supabase
# Check Supabase dashboard → Table Editor
```

---

## Phase 4: Migrate Existing Data

### Create migration script
- `scripts/migrate-data.ts` (new file)

### Migration order (respects foreign keys)
1. budgets
2. budget_categories
3. linked_accounts
4. recurring_payments
5. budget_items
6. transactions
7. split_transactions

### Data transformations
- Unix timestamps → ISO strings
- Integer booleans (0/1) → true/false
- Reset PostgreSQL sequences after insert

### Verification
- Run migration script
- Navigate through app, verify all data appears
- Keep `budget.db` as backup until verified

---

## Phase 5: Migrate API Routes to Supabase Edge Functions

### Current API routes to migrate (11 files, 26 handlers)

| Route | Methods | Edge Function |
|-------|---------|---------------|
| `/api/budgets` | GET, PUT | `budgets` |
| `/api/budgets/copy` | POST | `budgets-copy` |
| `/api/budget-items` | POST, PUT, DELETE | `budget-items` |
| `/api/budget-items/reorder` | PUT | `budget-items-reorder` |
| `/api/transactions` | GET, POST, PUT, DELETE, PATCH | `transactions` |
| `/api/transactions/split` | GET, POST, DELETE | `transactions-split` |
| `/api/recurring-payments` | GET, POST, PUT, DELETE | `recurring-payments` |
| `/api/recurring-payments/contribute` | POST | `recurring-payments-contribute` |
| `/api/recurring-payments/reset` | POST | `recurring-payments-reset` |
| `/api/teller/accounts` | GET, POST, DELETE | `teller-accounts` |
| `/api/teller/sync` | GET, POST | `teller-sync` |

### Edge Functions directory structure
```
supabase/
  functions/
    budgets/index.ts
    budget-items/index.ts
    transactions/index.ts
    recurring-payments/index.ts
    teller-accounts/index.ts
    teller-sync/index.ts
    _shared/
      db.ts          # Shared database connection
      cors.ts        # CORS headers
```

### Key considerations
- Edge Functions use Deno, not Node.js
- Drizzle ORM works with Deno
- Teller certificates: store as Supabase secrets, load at runtime
- Each function handles multiple HTTP methods via request.method

### Create Supabase client helper
- `lib/supabase.ts` (new file)

```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

### Update frontend to call Edge Functions
Replace all `fetch('/api/...')` calls with Supabase function invocations:
```typescript
// FROM:
const res = await fetch('/api/budgets?month=1&year=2026');

// TO:
const { data, error } = await supabase.functions.invoke('budgets', {
  body: { month: 1, year: 2026 }
});
```

### Files requiring fetch updates
- `app/page.tsx`
- `components/BudgetSection.tsx`
- `components/BudgetSummary.tsx`
- `components/AddTransactionModal.tsx`
- `components/SplitTransactionModal.tsx`
- `app/recurring/page.tsx`
- `app/settings/page.tsx`
- `app/insights/page.tsx`
- `lib/budgetHelpers.ts`

### Verification
```bash
supabase functions serve  # Test locally
supabase functions deploy # Deploy all functions
# Test each endpoint via app
```

---

## Phase 6: Add Capacitor

### Install Capacitor
```bash
npm install @capacitor/core @capacitor/cli
npx cap init "Budget App" com.yourname.budgetapp
```

### Create capacitor.config.ts
```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yourname.budgetapp',
  appName: 'Budget App',
  webDir: 'out',
  ios: { contentInset: 'automatic' },
  android: {}
};

export default config;
```

### Update Next.js for static export
In `next.config.ts`:
```typescript
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};
```

### Verification
```bash
npm run build  # Creates /out directory
npx cap sync   # Copies to native projects
```

---

## Phase 7: Configure iOS & Android

### Add platforms
```bash
npm install @capacitor/ios @capacitor/android
npx cap add ios
npx cap add android
```

### iOS setup
- Opens Xcode project in `ios/` directory
- Set bundle ID, minimum iOS version (14.0+)
- Configure signing for App Store

### Android setup
- Opens Android Studio project in `android/` directory
- Set applicationId, minSdk (22+)
- Configure signing for Play Store

### Add npm scripts to package.json
```json
{
  "scripts": {
    "cap:sync": "npx cap sync",
    "cap:ios": "npm run build && npx cap sync ios && npx cap open ios",
    "cap:android": "npm run build && npx cap sync android && npx cap open android"
  }
}
```

### Verification
```bash
npm run cap:ios     # Build and open Xcode
npm run cap:android # Build and open Android Studio
# Run on simulator/emulator
```

---

## Phase 8: Mobile UI Adjustments

### Safe area handling
In `app/globals.css`:
```css
:root {
  --safe-area-top: env(safe-area-inset-top);
  --safe-area-bottom: env(safe-area-inset-bottom);
}

body {
  padding-top: var(--safe-area-top);
  padding-bottom: var(--safe-area-bottom);
}
```

### Optional Capacitor plugins
```bash
npm install @capacitor/keyboard @capacitor/status-bar @capacitor/splash-screen
npx cap sync
```

### Touch target sizing
Ensure buttons/interactive elements are at least 44x44px for mobile.

### Verification
- Test on physical device or simulator with notch
- Verify keyboard doesn't obscure inputs
- Check status bar appearance

---

## Summary: Files to Modify/Create

### Modify
- `package.json` - Dependencies
- `drizzle.config.ts` - PostgreSQL dialect
- `db/index.ts` - PostgreSQL client
- `db/schema.ts` - PostgreSQL types
- `next.config.ts` - Static export
- `app/globals.css` - Safe areas
- All components with fetch calls (listed in Phase 5)

### Create
- `.env.local` - Environment variables
- `capacitor.config.ts` - Capacitor config
- `lib/supabase.ts` - Supabase client
- `scripts/migrate-data.ts` - Data migration
- `supabase/functions/` - All Edge Functions

### Delete (after migration complete)
- `budget.db` - SQLite database file
- `app/api/` - API routes (replaced by Edge Functions)

---

## Actual Migration Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Supabase Setup | ✅ Done | Project created, credentials configured |
| Phase 2: Dependencies | ✅ Done | `postgres` added, `better-sqlite3` removed |
| Phase 3: PostgreSQL Schema | ✅ Done | All tables converted, numeric type fixes applied |
| Phase 4: Data Migration | ✅ Done | `scripts/migrate-data.ts` — all 7 tables migrated |
| Phase 5: Edge Functions | ⏭️ Skipped | Not needed — Next.js API routes work directly with Supabase PostgreSQL via Drizzle. Deno conversion would add complexity with no benefit. Teller mTLS certs would need special handling. |
| Phase 6: Capacitor | ✅ Done | Live server mode (wraps deployed URL, no static export) |
| Phase 7: iOS/Android | ⏳ Deferred | `@capacitor/ios` and `@capacitor/android` not yet installed |
| Phase 8: Mobile UI | ⏳ Deferred | Waiting on Phase 7 |

## Verification Checklist

- [x] Supabase project created with all tables
- [x] Existing data migrated successfully
- [x] ~~Edge Functions deployed~~ Skipped — using Next.js API routes directly
- [x] Web app works with new backend
- [ ] iOS app builds and runs (Phase 7 deferred)
- [ ] Android app builds and runs (Phase 7 deferred)
- [x] Bank sync works (via Next.js API routes → Supabase)
- [ ] All CRUD operations work on mobile (pending Phase 7)
- [ ] UI looks correct on mobile (pending Phase 8)
