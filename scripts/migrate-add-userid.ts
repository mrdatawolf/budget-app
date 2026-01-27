/**
 * Migration script to add userId columns to existing tables
 * Run with: npx tsx scripts/migrate-add-userid.ts
 */

import Database from 'better-sqlite3';

const db = new Database('budget.db');

console.log('Starting migration: Adding userId columns...\n');

// Helper to check if column exists
function columnExists(table: string, column: string): boolean {
  const result = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return result.some(col => col.name === column);
}

// Add userId to budgets table
if (!columnExists('budgets', 'user_id')) {
  console.log('Adding user_id to budgets table...');
  db.exec(`ALTER TABLE budgets ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`);
  console.log('✓ budgets.user_id added');
} else {
  console.log('✓ budgets.user_id already exists');
}

// Add userId to linked_accounts table
if (!columnExists('linked_accounts', 'user_id')) {
  console.log('Adding user_id to linked_accounts table...');
  db.exec(`ALTER TABLE linked_accounts ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`);
  console.log('✓ linked_accounts.user_id added');
} else {
  console.log('✓ linked_accounts.user_id already exists');
}

// Add userId to recurring_payments table
if (!columnExists('recurring_payments', 'user_id')) {
  console.log('Adding user_id to recurring_payments table...');
  db.exec(`ALTER TABLE recurring_payments ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`);
  console.log('✓ recurring_payments.user_id added');
} else {
  console.log('✓ recurring_payments.user_id already exists');
}

// Show counts of records that need userId assignment
const budgetCount = (db.prepare('SELECT COUNT(*) as count FROM budgets WHERE user_id = ""').get() as { count: number }).count;
const accountCount = (db.prepare('SELECT COUNT(*) as count FROM linked_accounts WHERE user_id = ""').get() as { count: number }).count;
const recurringCount = (db.prepare('SELECT COUNT(*) as count FROM recurring_payments WHERE user_id = ""').get() as { count: number }).count;

console.log('\n--- Migration Summary ---');
console.log(`Budgets needing userId: ${budgetCount}`);
console.log(`Linked accounts needing userId: ${accountCount}`);
console.log(`Recurring payments needing userId: ${recurringCount}`);

if (budgetCount > 0 || accountCount > 0 || recurringCount > 0) {
  console.log('\n⚠️  Existing records have empty userId.');
  console.log('After signing in with Clerk, run the claim script to assign your data to your account.');
}

console.log('\n✓ Migration complete!');

db.close();
