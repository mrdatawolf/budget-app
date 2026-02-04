import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as fs from 'fs';
import * as path from 'path';
import * as schema from './schema';

// PGlite storage location - configurable via environment variable
// - In Node.js (API routes): uses file system
// - In browser (future static build): will use IndexedDB
const DB_PATH = process.env.PGLITE_DB_LOCATION || './data/budget-local';

// Track initialization state
let pgliteClient: PGlite | null = null;
let localDbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let initializationPromise: Promise<ReturnType<typeof drizzle<typeof schema>>> | null = null;
let initializationError: Error | null = null;

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
 * Create a backup of the database directory.
 * Returns the backup path if successful, null if failed.
 */
function createBackup(): string | null {
  if (!fs.existsSync(DB_PATH)) {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${DB_PATH}-backup-${timestamp}`;

  try {
    // Copy the database directory recursively
    fs.cpSync(DB_PATH, backupPath, { recursive: true });
    console.log(`Database backup created at: ${backupPath}`);
    return backupPath;
  } catch (error) {
    console.error('Failed to create database backup:', error);
    return null;
  }
}

/**
 * Internal initialization function - only called once.
 * IMPORTANT: Never destroys user data. Fails gracefully with clear error message.
 */
async function initializeLocalDb(): Promise<ReturnType<typeof drizzle<typeof schema>>> {
  ensureDataDirectory();

  try {
    pgliteClient = new PGlite(DB_PATH);
    await pgliteClient.waitReady;
  } catch (error) {
    // Create a backup before reporting the error
    const backupPath = createBackup();

    const errorMessage = error instanceof Error ? error.message : String(error);
    const fullError = new Error(
      `PGlite database initialization failed. Your data has NOT been deleted.\n` +
      `Database location: ${DB_PATH}\n` +
      (backupPath ? `Backup created at: ${backupPath}\n` : '') +
      `Original error: ${errorMessage}\n\n` +
      `Possible solutions:\n` +
      `1. Check if another process is using the database\n` +
      `2. Verify the database directory has correct permissions\n` +
      `3. If the database is corrupted, you can manually delete ${DB_PATH} to start fresh\n` +
      `4. Set PGLITE_DB_LOCATION in .env to use a different location`
    );

    initializationError = fullError;
    pgliteClient = null;
    throw fullError;
  }

  const db = drizzle(pgliteClient, { schema });

  // Initialize schema on first connection
  try {
    await initializeSchema(pgliteClient);
  } catch (schemaError) {
    // Schema initialization failed - this is recoverable, don't destroy data
    const errorMessage = schemaError instanceof Error ? schemaError.message : String(schemaError);
    const fullError = new Error(
      `Database schema initialization failed. Your data has NOT been deleted.\n` +
      `Database location: ${DB_PATH}\n` +
      `Original error: ${errorMessage}\n\n` +
      `This may be a migration issue. Please check the console for details.`
    );

    initializationError = fullError;
    // Close the client since we can't use it properly
    await pgliteClient.close();
    pgliteClient = null;
    throw fullError;
  }

  localDbInstance = db;
  initializationError = null;
  return db;
}

/**
 * Get the local Drizzle database instance.
 * Uses promise-based singleton to handle concurrent requests safely.
 */
export async function getLocalDb() {
  // If already initialized, return immediately
  if (localDbInstance) {
    return localDbInstance;
  }

  // If there was a previous initialization error, throw it immediately
  // This prevents repeated failed attempts while showing the user the error
  if (initializationError) {
    throw initializationError;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    return initializationPromise;
  }

  // Start initialization and store the promise so concurrent callers can wait
  initializationPromise = initializeLocalDb();

  try {
    return await initializationPromise;
  } catch (error) {
    // Keep the error for future calls, but reset promise so state is clear
    initializationPromise = null;
    throw error;
  }
}

/**
 * Get the current database initialization error, if any.
 * Useful for displaying error state in the UI.
 */
export function getDbInitError(): Error | null {
  return initializationError;
}

/**
 * Get the configured database path.
 */
export function getDbPath(): string {
  return DB_PATH;
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
      account_source TEXT NOT NULL DEFAULT 'teller',
      teller_account_id TEXT UNIQUE,
      teller_enrollment_id TEXT,
      access_token TEXT,
      institution_name TEXT NOT NULL,
      institution_id TEXT,
      account_name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      account_subtype TEXT NOT NULL,
      last_four TEXT,
      status TEXT NOT NULL,
      last_synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      csv_column_mapping TEXT
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

    -- CSV import hashes table (for deduplication)
    CREATE TABLE IF NOT EXISTS csv_import_hashes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      linked_account_id UUID NOT NULL REFERENCES linked_accounts(id) ON DELETE CASCADE,
      hash TEXT NOT NULL,
      transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Add columns to existing tables if they don't exist (for existing databases)
  // This handles the case where the database was created before these columns were added
  await client.exec(`
    -- Add account_source column if it doesn't exist
    ALTER TABLE linked_accounts ADD COLUMN IF NOT EXISTS account_source TEXT NOT NULL DEFAULT 'teller';
    ALTER TABLE linked_accounts ADD COLUMN IF NOT EXISTS csv_column_mapping TEXT;
  `).catch(() => {
    // Ignore errors if columns already exist
  });

  // Make Teller-specific columns nullable if they aren't already (separate try/catch for each)
  const alterCommands = [
    'ALTER TABLE linked_accounts ALTER COLUMN teller_account_id DROP NOT NULL',
    'ALTER TABLE linked_accounts ALTER COLUMN teller_enrollment_id DROP NOT NULL',
    'ALTER TABLE linked_accounts ALTER COLUMN access_token DROP NOT NULL',
    'ALTER TABLE linked_accounts ALTER COLUMN institution_id DROP NOT NULL',
    'ALTER TABLE linked_accounts ALTER COLUMN last_four DROP NOT NULL',
  ];
  for (const cmd of alterCommands) {
    await client.exec(cmd).catch(() => {
      // Ignore errors if already nullable
    });
  }
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
    initializationPromise = null;
  }
}

// Export schema for use with the database
export { schema };
