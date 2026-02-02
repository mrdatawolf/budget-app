# Local-First Architecture Migration Plan

## Overview

Migrate from cloud-only (Supabase PostgreSQL) to a local-first architecture with optional cloud sync. SQLite becomes the primary database for all app interactions, with Supabase serving as the source of truth for multi-device sync.

**Current State:** Cloud-only (Supabase PostgreSQL)
**Target State:** Local-first (SQLite) with optional cloud sync (Supabase)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    App (Next.js + Capacitor)                    │
│                                                                 │
│   All reads/writes ──────► SQLite (local)                       │
│                                                                 │
│   ┌──────────────┐       Sync Process        ┌───────────────┐  │
│   │    SQLite    │ ◄─────────────────────► │   Supabase    │  │
│   │    (local)   │   (auto when online +    │  (PostgreSQL) │  │
│   │              │    cloud connected)      │    (cloud)    │  │
│   └──────────────┘                           └───────────────┘  │
│                                                                 │
│   No auth locally              Clerk auth for sync              │
│   Single implicit user         userId scopes cloud data         │
└─────────────────────────────────────────────────────────────────┘
```

### Key Principles

| Aspect | Decision |
|--------|----------|
| Primary database | SQLite (all app interactions) |
| Source of truth | Supabase (cloud wins conflicts) |
| Record identity | UUIDs (enables offline creation without collision) |
| Deletes | Soft delete (`deletedAt` timestamp) |
| Local auth | None - single implicit user |
| Cloud auth | Clerk - userId scopes data |
| Sync trigger | Auto-sync when online + cloud connected |
| Cloud setup | Manual via Settings > "Connect to Cloud" |

---

## Phase 1: Schema Migration to UUIDs

### Goal
Convert all tables from auto-increment integer IDs to UUIDs. This is required for sync to work correctly (two devices creating records offline must not collide).

### Files to Modify
- `db/schema.ts` - Change all ID columns and foreign keys

### Schema Changes

**Before (current):**
```typescript
export const budgets = pgTable('budgets', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().default(''),
  // ...
});

export const budgetCategories = pgTable('budget_categories', {
  id: serial('id').primaryKey(),
  budgetId: integer('budget_id').references(() => budgets.id),
  // ...
});
```

**After:**
```typescript
export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().default(''),
  // ...
});

export const budgetCategories = pgTable('budget_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  budgetId: uuid('budget_id').references(() => budgets.id),
  // ...
});
```

### Tables to Update (8 total)

| Table | ID Column | Foreign Keys to Update |
|-------|-----------|------------------------|
| `budgets` | `id` | - |
| `budget_categories` | `id` | `budgetId` |
| `budget_items` | `id` | `categoryId`, `recurringPaymentId` |
| `transactions` | `id` | `budgetItemId`, `linkedAccountId` |
| `split_transactions` | `id` | `parentTransactionId`, `budgetItemId` |
| `recurring_payments` | `id` | - |
| `linked_accounts` | `id` | - |
| `user_onboarding` | `id` | - |

### Migration Script: `scripts/migrate-to-uuid.ts`

The script will:
1. Add new UUID columns (`id_new`, `budget_id_new`, etc.)
2. Generate UUIDs for all existing rows
3. Create mapping table (old int ID → new UUID) for FK updates
4. Update all foreign key references using the mapping
5. Drop old integer columns
6. Rename `_new` columns to original names
7. Reset constraints and indexes

### API Route Updates

All routes that return IDs or accept ID parameters will work unchanged (UUIDs are still strings in JSON). However, need to verify:
- URL params like `/api/budget-items?id=xxx` work with UUIDs
- Any `parseInt()` calls on IDs need removal

### Verification
- [ ] All tables have UUID primary keys
- [ ] All foreign key relationships intact
- [ ] App functions normally with UUID IDs
- [ ] Create/read/update/delete all work

---

## Phase 2: Add PGlite Local Database Layer

### Goal
Add PGlite as the local database. Since PGlite is PostgreSQL, we use the **same schema** for both local and cloud.

### Dependencies to Add
```bash
npm install @electric-sql/pglite
```

### Files to Create

**`db/local.ts`** - Local PGlite connection
```typescript
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from './schema';

// PGlite stores data in IndexedDB (browser) or filesystem (Node)
const client = new PGlite('idb://budget-local'); // IndexedDB for persistence
export const localDb = drizzle(client, { schema });
```

**`db/cloud.ts`** - Cloud PostgreSQL connection (existing, renamed)
```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export function createCloudDb(connectionString: string) {
  const client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema });
}
```

**`db/index.ts`** - Unified database interface
```typescript
import { localDb } from './local';

// All app operations use local database
export const db = localDb;

// Cloud database created on-demand during sync
export { createCloudDb } from './cloud';
```

### Schema Compatibility

**No conversion needed!** PGlite is PostgreSQL, so:
- Same `uuid` type works
- Same `timestamp` type works
- Same `boolean` type works
- Same `numeric` type works
- Same schema file (`db/schema.ts`) used for both

### Verification
- [ ] SQLite database created on first run
- [ ] All CRUD operations work with SQLite
- [ ] App boots without cloud connection

---

## Phase 3: Local-Only Mode

### Goal
App works entirely on SQLite with no authentication required. Single implicit user.

### Changes

**Remove userId from local operations:**
- Local schema has no `userId` column (implicit single user)
- Cloud schema keeps `userId` for multi-user sync
- Sync layer adds `userId` when pushing to cloud

**Bypass auth for local operations:**

**`lib/auth.ts`** - Modify for local-first
```typescript
// For local operations - no auth needed
export function getLocalUser() {
  return { userId: 'local' }; // Implicit single user
}

// For cloud sync - Clerk auth required
export async function requireCloudAuth() {
  // Existing Clerk auth logic
}
```

**API routes update pattern:**
```typescript
// Before (cloud-only):
const { userId } = await requireAuth();
const data = await db.query.budgets.findFirst({
  where: eq(budgets.userId, userId),
});

// After (local-first):
// No auth check needed - single user local DB
const data = await db.query.budgets.findFirst({
  where: eq(budgets.month, month),
});
```

### Files to Modify
- `middleware.ts` - Remove route protection (no auth needed locally)
- All 11 API route files - Remove `requireAuth()` checks
- `lib/auth.ts` - Add local vs cloud auth distinction

### Local Storage for Cloud Connection State

**`lib/cloudConnection.ts`**
```typescript
interface CloudConnection {
  connected: boolean;
  lastSyncAt: string | null;
  userId: string | null;
}

// Stored in SQLite or localStorage
export function getCloudConnection(): CloudConnection;
export function setCloudConnection(conn: CloudConnection): void;
export function clearCloudConnection(): void;
```

### Verification
- [ ] App works with no internet connection
- [ ] No sign-in required to use app
- [ ] All features work locally

---

## Phase 4: Sync Engine

### Goal
Implement bidirectional sync between local SQLite and cloud Supabase.

### Files to Create

**`lib/sync/index.ts`** - Main sync orchestrator
**`lib/sync/pull.ts`** - Cloud → Local sync
**`lib/sync/push.ts`** - Local → Cloud sync
**`lib/sync/conflicts.ts`** - Conflict resolution
**`lib/sync/status.ts`** - Sync status tracking

### Sync Process

```
┌─────────────────────────────────────────────────────────┐
│                     SYNC PROCESS                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. CHECK ONLINE ──► Not online? Exit                   │
│         │                                               │
│         ▼                                               │
│  2. CHECK CLOUD CONNECTION ──► Not connected? Exit      │
│         │                                               │
│         ▼                                               │
│  3. AUTHENTICATE (Clerk)                                │
│         │                                               │
│         ▼                                               │
│  4. PULL (Cloud → Local)                                │
│     • Fetch cloud records for userId                    │
│     • For each table (FK order):                        │
│       - Cloud record exists locally? UPDATE local       │
│       - Cloud record not local? INSERT to local         │
│       - Cloud soft-deleted? Mark local as deleted       │
│         │                                               │
│         ▼                                               │
│  5. PUSH (Local → Cloud)                                │
│     • Find local records not in cloud                   │
│       (by UUID, or by syncedAt = null)                  │
│     • Push to cloud with userId                         │
│     • Mark local records as synced                      │
│         │                                               │
│         ▼                                               │
│  6. UPDATE SYNC STATUS                                  │
│     • Set lastSyncAt timestamp                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Sync Tracking

Add to local schema:
```typescript
// Track sync status per record
syncedAt: integer('synced_at', { mode: 'timestamp' }), // null = never synced
cloudId: text('cloud_id'), // UUID from cloud (same as id after first sync)
```

Or simpler approach - track at table level:
```typescript
export const syncStatus = sqliteTable('sync_status', {
  tableName: text('table_name').primaryKey(),
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp' }),
});
```

### Sync Order (FK dependencies)

**Pull order (parents first):**
1. `budgets`
2. `budget_categories`
3. `linked_accounts`
4. `recurring_payments`
5. `budget_items`
6. `transactions`
7. `split_transactions`
8. `user_onboarding`

**Push order (same):**
Same order - parents must exist in cloud before children reference them.

### Conflict Resolution

**Rule: Cloud always wins**

```typescript
async function resolveConflict(localRecord, cloudRecord) {
  // Cloud wins - overwrite local with cloud data
  return cloudRecord;
}
```

**Identifying "same record":**
- UUID match = same record
- If local record has no matching cloud UUID, it's new local data → push

**Soft deletes:**
- Cloud has `deletedAt` set → mark local as deleted
- Local has `deletedAt` set → push to cloud (cloud will have it too)

### Auto-Sync Trigger

**`lib/sync/autoSync.ts`**
```typescript
// Check online status
const isOnline = navigator.onLine;

// Listen for online/offline events
window.addEventListener('online', () => attemptSync());
window.addEventListener('offline', () => setSyncPaused(true));

// Sync on app open if online
export async function initSync() {
  if (navigator.onLine && isCloudConnected()) {
    await performSync();
  }
}

// Periodic sync while app is open (every 5 min?)
export function startPeriodicSync(intervalMs = 300000) {
  setInterval(() => {
    if (navigator.onLine && isCloudConnected()) {
      performSync();
    }
  }, intervalMs);
}
```

### Sync Status UI

Show sync status in the app:
- "Last synced: 5 minutes ago"
- "Syncing..." with spinner
- "Offline - changes saved locally"
- "Sync error - will retry"

### Verification
- [ ] Pull overwrites local with cloud data
- [ ] Push sends new local records to cloud
- [ ] Soft deletes sync correctly
- [ ] Sync happens automatically when online
- [ ] Sync errors are handled gracefully
- [ ] Sync status visible to user

---

## Phase 5: Cloud Connect Flow

### Goal
Settings page UI to connect local app to cloud account.

### User Flow

```
┌─────────────────────────────────────────────────────────┐
│                   CLOUD CONNECT FLOW                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  User goes to Settings > "Connect to Cloud"             │
│         │                                               │
│         ▼                                               │
│  Show benefits: "Sync across devices, backup data"      │
│         │                                               │
│         ▼                                               │
│  Clerk Sign-In/Sign-Up                                  │
│         │                                               │
│         ▼                                               │
│  Check: Does cloud have data for this user?             │
│         │                                               │
│    ┌────┴────┐                                          │
│    │         │                                          │
│    ▼         ▼                                          │
│  YES        NO                                          │
│    │         │                                          │
│    ▼         ▼                                          │
│  "Found     "No cloud data.                             │
│   existing   Upload local                               │
│   data.      data to cloud?"                            │
│   Restore                                               │
│   from       [Upload & Sync]                            │
│   cloud?"                                               │
│                                                         │
│  [Restore]   [Keep Local Only]                          │
│    │                                                    │
│    ▼                                                    │
│  Pull all cloud data to local                           │
│         │                                               │
│         ▼                                               │
│  Enable auto-sync, save connection state                │
│         │                                               │
│         ▼                                               │
│  "Connected! Syncing automatically."                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Files to Modify

**`app/settings/page.tsx`** - Add Cloud Connection section
```tsx
<section>
  <h2>Cloud Sync</h2>
  {!isCloudConnected ? (
    <CloudConnectButton />
  ) : (
    <CloudStatus
      lastSync={lastSyncAt}
      onDisconnect={handleDisconnect}
    />
  )}
</section>
```

### Components to Create

**`components/CloudConnectButton.tsx`**
**`components/CloudStatus.tsx`**
**`components/CloudRestoreModal.tsx`**

### Disconnect Flow

User can disconnect from cloud:
- Stops auto-sync
- Clears stored credentials
- Local data remains intact
- Can reconnect later

### Verification
- [ ] "Connect to Cloud" button in Settings
- [ ] Clerk auth flow works
- [ ] Existing cloud data detected and offered for restore
- [ ] New user can push local data to cloud
- [ ] Disconnect works, local data preserved
- [ ] Reconnect restores sync

---

## Phase 6: Capacitor Static Build

### Goal
Switch Capacitor from "live server" mode to static export with bundled SQLite.

### Current State
```typescript
// capacitor.config.ts - CURRENT (live server)
server: {
  url: 'https://your-app.vercel.app',
}
```

### Target State
```typescript
// capacitor.config.ts - TARGET (static)
webDir: 'out',
// No server.url - uses bundled static files
```

### Next.js Static Export

**`next.config.ts`**
```typescript
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};
```

### PGlite on Mobile

PGlite uses IndexedDB for persistence in browsers, which works on mobile WebViews:

**`db/local.ts`** - Same for all platforms
```typescript
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

// IndexedDB works in Capacitor WebView
const client = new PGlite('idb://budget-local');
export const localDb = drizzle(client, { schema });
```

No platform-specific code needed - PGlite's IndexedDB storage works across web and Capacitor.

### API Routes → Client-Side

Static export means no server-side API routes. Options:

**Option A: Move all DB logic to client**
- All Drizzle queries run client-side
- Works for local SQLite
- Cloud sync calls Supabase directly (no Next.js API)

**Option B: Keep API routes for development, client-side for mobile**
- Hybrid approach
- More complex

Recommend **Option A** for simplicity.

### Files to Restructure

- Move `app/api/*` logic into `lib/` functions
- Components call `lib/` functions directly
- Functions use local SQLite

Example:
```typescript
// Before: API route
// app/api/budgets/route.ts
export async function GET(request) {
  const data = await db.query.budgets.findFirst(...);
  return Response.json(data);
}

// After: Client-side function
// lib/budgets.ts
export async function getBudget(month: number, year: number) {
  const db = await getLocalDb();
  return db.query.budgets.findFirst(...);
}

// Component calls directly
const budget = await getBudget(1, 2026);
```

### Build Scripts

**`package.json`**
```json
{
  "scripts": {
    "build": "next build",
    "build:mobile": "next build && npx cap sync",
    "cap:ios": "npm run build:mobile && npx cap open ios",
    "cap:android": "npm run build:mobile && npx cap open android"
  }
}
```

### Verification
- [ ] `npm run build` creates `/out` directory
- [ ] App works from static files
- [ ] SQLite works on iOS simulator
- [ ] SQLite works on Android emulator
- [ ] Cloud sync works from mobile app

---

## Migration Path for Existing Users

### Scenario: User has data in Supabase (current cloud)

1. User updates to new version
2. App starts with empty local SQLite
3. User goes to Settings > "Connect to Cloud"
4. Signs in with existing Clerk account
5. App detects existing cloud data
6. Prompts: "Restore from cloud?"
7. User confirms → Pull all cloud data to local
8. Auto-sync enabled, app works normally

### Scenario: User had cloud connection saved on device

If we persist the Clerk session/tokens locally:
1. App detects existing cloud connection on startup
2. Auto-initiates restore from cloud
3. No manual action needed

---

## Summary: Implementation Order

| Phase | Description | Estimated Scope |
|-------|-------------|-----------------|
| 1 | UUID migration | Schema + migration script |
| 2 | Add SQLite layer | New db files, dependencies |
| 3 | Local-only mode | Remove auth, update routes |
| 4 | Sync engine | New sync lib, significant logic |
| 5 | Cloud connect UI | Settings page, modals |
| 6 | Capacitor static | Config, restructure API→client |

### Risk Areas

1. **UUID migration** - Must not lose existing user data
2. **Sync conflicts** - Edge cases in conflict resolution
3. **PGlite IndexedDB** - Test persistence across app restarts on mobile
4. **Static export** - Major architecture shift from API routes

### Testing Strategy

- Keep Supabase data backed up before UUID migration
- Test sync with intentional conflicts
- Test on actual iOS/Android devices, not just simulators
- Test offline scenarios thoroughly

---

## Decisions Made

| Question | Decision |
|----------|----------|
| Local database | **PGlite** (PostgreSQL in browser/Node) - same schema as cloud |
| Sync frequency | Auto-sync on app open + every 5 min (configurable via `SYNC_INTERVAL_MS` env var) |
| Sync scope | **All data** (no partial sync) |
| Teller bank sync | **Only when cloud connected** - requires server-side certs |
| Web deployment | **Keep Vercel** - web + mobile both supported |

### PGlite Benefits
- Same PostgreSQL schema for local and cloud
- No type conversion between SQLite and PostgreSQL
- No separate schema file needed
- `numeric` types behave identically
- Simpler sync logic
