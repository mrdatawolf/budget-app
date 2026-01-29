/**
 * Migration script: SQLite → Supabase PostgreSQL
 *
 * Reads all data from local budget.db and inserts into Supabase.
 * Respects foreign key order. Resets PostgreSQL sequences after insert.
 *
 * Usage: npx tsx scripts/migrate-data.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import Database from 'better-sqlite3';
import postgres from 'postgres';

const sqlite = new Database('budget.db', { readonly: true });
const pg = postgres(process.env.DATABASE_URL!, { prepare: false });

interface SQLiteRow {
  [key: string]: unknown;
}

// Convert Unix timestamp (seconds) to ISO string, or null
function timestampToISO(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  // SQLite timestamps from Drizzle are in milliseconds
  if (num > 1e12) return new Date(num).toISOString();
  // Could also be seconds
  return new Date(num * 1000).toISOString();
}

// Convert SQLite integer boolean to actual boolean
function intToBool(val: unknown): boolean {
  return val === 1 || val === true;
}

async function migrate() {
  console.log('Starting migration from SQLite to PostgreSQL...\n');

  // 1. Budgets
  const budgets = sqlite.prepare('SELECT * FROM budgets').all() as SQLiteRow[];
  console.log(`Migrating ${budgets.length} budgets...`);
  for (const row of budgets) {
    await pg`INSERT INTO budgets (id, user_id, month, year, buffer, created_at, updated_at)
      VALUES (${row.id as number}, ${row.user_id as string}, ${row.month as number}, ${row.year as number},
              ${String(row.buffer)}, ${timestampToISO(row.created_at)}, ${timestampToISO(row.updated_at)})`;
  }

  // 2. Budget categories
  const categories = sqlite.prepare('SELECT * FROM budget_categories').all() as SQLiteRow[];
  console.log(`Migrating ${categories.length} budget categories...`);
  for (const row of categories) {
    await pg`INSERT INTO budget_categories (id, budget_id, category_type, name)
      VALUES (${row.id as number}, ${row.budget_id as number}, ${row.category_type as string}, ${row.name as string})`;
  }

  // 3. Linked accounts (before transactions, since transactions reference them)
  const accounts = sqlite.prepare('SELECT * FROM linked_accounts').all() as SQLiteRow[];
  console.log(`Migrating ${accounts.length} linked accounts...`);
  for (const row of accounts) {
    await pg`INSERT INTO linked_accounts (id, user_id, teller_account_id, teller_enrollment_id, access_token,
              institution_name, institution_id, account_name, account_type, account_subtype, last_four, status,
              last_synced_at, created_at)
      VALUES (${row.id as number}, ${row.user_id as string}, ${row.teller_account_id as string},
              ${row.teller_enrollment_id as string}, ${row.access_token as string}, ${row.institution_name as string},
              ${row.institution_id as string}, ${row.account_name as string}, ${row.account_type as string},
              ${row.account_subtype as string}, ${row.last_four as string}, ${row.status as string},
              ${timestampToISO(row.last_synced_at)}, ${timestampToISO(row.created_at)})`;
  }

  // 4. Recurring payments (before budget items, since items reference them)
  const recurring = sqlite.prepare('SELECT * FROM recurring_payments').all() as SQLiteRow[];
  console.log(`Migrating ${recurring.length} recurring payments...`);
  for (const row of recurring) {
    await pg`INSERT INTO recurring_payments (id, user_id, name, amount, frequency, next_due_date, funded_amount,
              category_type, is_active, created_at, updated_at)
      VALUES (${row.id as number}, ${row.user_id as string}, ${row.name as string}, ${String(row.amount)},
              ${row.frequency as string}, ${row.next_due_date as string}, ${String(row.funded_amount)},
              ${row.category_type as string | null}, ${intToBool(row.is_active)},
              ${timestampToISO(row.created_at)}, ${timestampToISO(row.updated_at)})`;
  }

  // 5. Budget items
  const items = sqlite.prepare('SELECT * FROM budget_items').all() as SQLiteRow[];
  console.log(`Migrating ${items.length} budget items...`);
  for (const row of items) {
    await pg`INSERT INTO budget_items (id, category_id, name, planned, "order", recurring_payment_id, created_at)
      VALUES (${row.id as number}, ${row.category_id as number}, ${row.name as string}, ${String(row.planned)},
              ${(row.order as number) ?? 0}, ${row.recurring_payment_id as number | null}, ${timestampToISO(row.created_at)})`;
  }

  // 6. Transactions
  const transactions = sqlite.prepare('SELECT * FROM transactions').all() as SQLiteRow[];
  console.log(`Migrating ${transactions.length} transactions...`);
  for (const row of transactions) {
    await pg`INSERT INTO transactions (id, budget_item_id, linked_account_id, date, description, amount, type,
              merchant, check_number, teller_transaction_id, teller_account_id, status, deleted_at, created_at)
      VALUES (${row.id as number}, ${row.budget_item_id as number | null}, ${row.linked_account_id as number | null},
              ${row.date as string}, ${row.description as string}, ${String(row.amount)}, ${row.type as string},
              ${row.merchant as string | null}, ${row.check_number as string | null},
              ${row.teller_transaction_id as string | null}, ${row.teller_account_id as string | null},
              ${row.status as string | null}, ${timestampToISO(row.deleted_at)}, ${timestampToISO(row.created_at)})`;
  }

  // 7. Split transactions
  const splits = sqlite.prepare('SELECT * FROM split_transactions').all() as SQLiteRow[];
  console.log(`Migrating ${splits.length} split transactions...`);
  for (const row of splits) {
    await pg`INSERT INTO split_transactions (id, parent_transaction_id, budget_item_id, amount, description, created_at)
      VALUES (${row.id as number}, ${row.parent_transaction_id as number}, ${row.budget_item_id as number},
              ${String(row.amount)}, ${row.description as string | null}, ${timestampToISO(row.created_at)})`;
  }

  // 8. User onboarding
  const onboarding = sqlite.prepare('SELECT * FROM user_onboarding').all() as SQLiteRow[];
  console.log(`Migrating ${onboarding.length} onboarding records...`);
  for (const row of onboarding) {
    await pg`INSERT INTO user_onboarding (id, user_id, current_step, completed_at, skipped_at, created_at)
      VALUES (${row.id as number}, ${row.user_id as string}, ${row.current_step as number},
              ${timestampToISO(row.completed_at)}, ${timestampToISO(row.skipped_at)}, ${timestampToISO(row.created_at)})`;
  }

  // 9. Reset PostgreSQL sequences
  console.log('\nResetting sequences...');
  const tables = [
    'budgets', 'budget_categories', 'budget_items', 'transactions',
    'split_transactions', 'linked_accounts', 'recurring_payments', 'user_onboarding'
  ];
  for (const table of tables) {
    await pg`SELECT setval(pg_get_serial_sequence(${table}, 'id'), COALESCE((SELECT MAX(id) FROM ${pg(table)}), 0) + 1, false)`;
  }

  console.log('\nMigration complete!');
  console.log(`  Budgets: ${budgets.length}`);
  console.log(`  Categories: ${categories.length}`);
  console.log(`  Linked accounts: ${accounts.length}`);
  console.log(`  Recurring payments: ${recurring.length}`);
  console.log(`  Budget items: ${items.length}`);
  console.log(`  Transactions: ${transactions.length}`);
  console.log(`  Split transactions: ${splits.length}`);
  console.log(`  Onboarding records: ${onboarding.length}`);

  sqlite.close();
  await pg.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  sqlite.close();
  pg.end().then(() => process.exit(1));
});
