import Database from 'better-sqlite3';
const db = new Database('budget.db');

// Check columns exist
const budgetCols = db.prepare('PRAGMA table_info(budgets)').all() as { name: string }[];
const linkedCols = db.prepare('PRAGMA table_info(linked_accounts)').all() as { name: string }[];
const recurringCols = db.prepare('PRAGMA table_info(recurring_payments)').all() as { name: string }[];

console.log('budgets has user_id:', budgetCols.some(c => c.name === 'user_id'));
console.log('linked_accounts has user_id:', linkedCols.some(c => c.name === 'user_id'));
console.log('recurring_payments has user_id:', recurringCols.some(c => c.name === 'user_id'));

// Count records needing userId
const budgetCount = (db.prepare("SELECT COUNT(*) as count FROM budgets WHERE user_id = ''").get() as { count: number }).count;
const linkedCount = (db.prepare("SELECT COUNT(*) as count FROM linked_accounts WHERE user_id = ''").get() as { count: number }).count;
const recurringCount = (db.prepare("SELECT COUNT(*) as count FROM recurring_payments WHERE user_id = ''").get() as { count: number }).count;

console.log('\nRecords needing userId:');
console.log('  Budgets:', budgetCount);
console.log('  Linked accounts:', linkedCount);
console.log('  Recurring payments:', recurringCount);

db.close();
