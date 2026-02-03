import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as fs from 'fs';
import * as path from 'path';
import * as schema from './schema';

// PGlite storage location
// - In Node.js (API routes): uses file system
// - In browser (future static build): will use IndexedDB
const DB_PATH = './data/budget-local';

let pgliteClient: PGlite | null = null;
let localDbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Ensure the data directory exists.
 */
function ensureDataDirectory(): void {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Get or create the PGlite client instance.
 * Uses singleton pattern to avoid multiple connections.
 */
async function getPGliteClient(): Promise<PGlite> {
  if (!pgliteClient) {
    ensureDataDirectory();
    pgliteClient = new PGlite(DB_PATH);
    await pgliteClient.waitReady;
  }
  return pgliteClient;
}

/**
 * Get the local Drizzle database instance.
 * Initializes PGlite and creates schema if needed.
 */
export async function getLocalDb() {
  if (!localDbInstance) {
    const client = await getPGliteClient();
    localDbInstance = drizzle(client, { schema });

    // Initialize schema on first connection
    await initializeSchema(client);
  }
  return localDbInstance;
}

/**
 * Initialize the database schema.
 * Creates tables if they don't exist.
 */
async function initializeSchema(client: PGlite): Promise<void> {
  // Create tables in FK dependency order
  await client.exec(`
    -- Budgets table
    CREATE TABLE IF NOT EXISTS budgets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL DEFAULT '',
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      buffer NUMERIC(10, 2) NOT NULL DEFAULT '0',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Budget categories table
    CREATE TABLE IF NOT EXISTS budget_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
      category_type TEXT NOT NULL,
      name TEXT NOT NULL,
      emoji TEXT,
      category_order INTEGER NOT NULL DEFAULT 0
    );

    -- Linked accounts table (needed before transactions)
    CREATE TABLE IF NOT EXISTS linked_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL DEFAULT '',
      teller_account_id TEXT NOT NULL UNIQUE,
      teller_enrollment_id TEXT NOT NULL,
      access_token TEXT NOT NULL,
      institution_name TEXT NOT NULL,
      institution_id TEXT NOT NULL,
      account_name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      account_subtype TEXT NOT NULL,
      last_four TEXT NOT NULL,
      status TEXT NOT NULL,
      last_synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Recurring payments table
    CREATE TABLE IF NOT EXISTS recurring_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      amount NUMERIC(10, 2) NOT NULL,
      frequency TEXT NOT NULL,
      next_due_date TEXT NOT NULL,
      funded_amount NUMERIC(10, 2) NOT NULL DEFAULT '0',
      category_type TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Budget items table
    CREATE TABLE IF NOT EXISTS budget_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id UUID NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      planned NUMERIC(10, 2) NOT NULL DEFAULT '0',
      "order" INTEGER NOT NULL DEFAULT 0,
      recurring_payment_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Transactions table
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      budget_item_id UUID REFERENCES budget_items(id) ON DELETE SET NULL,
      linked_account_id UUID REFERENCES linked_accounts(id),
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount NUMERIC(10, 2) NOT NULL,
      type TEXT NOT NULL,
      merchant TEXT,
      check_number TEXT,
      teller_transaction_id TEXT UNIQUE,
      teller_account_id TEXT,
      status TEXT,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Split transactions table
    CREATE TABLE IF NOT EXISTS split_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      parent_transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      budget_item_id UUID NOT NULL REFERENCES budget_items(id) ON DELETE CASCADE,
      amount NUMERIC(10, 2) NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- User onboarding table
    CREATE TABLE IF NOT EXISTS user_onboarding (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL UNIQUE,
      current_step INTEGER NOT NULL DEFAULT 1,
      completed_at TIMESTAMPTZ,
      skipped_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

/**
 * Close the PGlite connection.
 * Call this when shutting down the app.
 */
export async function closeLocalDb(): Promise<void> {
  if (pgliteClient) {
    await pgliteClient.close();
    pgliteClient = null;
    localDbInstance = null;
  }
}

// Export schema for use with the database
export { schema };
