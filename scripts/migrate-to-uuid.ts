/**
 * Migration script: Convert all integer IDs to UUIDs
 *
 * This script migrates the Supabase PostgreSQL database from serial integer IDs
 * to UUIDs, which is required for the local-first sync architecture.
 *
 * Run with: npx tsx scripts/migrate-to-uuid.ts
 *
 * IMPORTANT: Back up your database before running this script!
 */

import postgres from 'postgres';
import { config } from 'dotenv';

config({ path: '.env.local' });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in environment');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false });

// Tables in order of dependencies (parents first)
const TABLES_IN_ORDER = [
  'budgets',
  'linked_accounts',
  'recurring_payments',
  'user_onboarding',
  'budget_categories',
  'budget_items',
  'transactions',
  'split_transactions',
];

// Foreign key mappings: table -> { column: referencedTable }
const FOREIGN_KEYS: Record<string, Record<string, string>> = {
  budget_categories: {
    budget_id: 'budgets',
  },
  budget_items: {
    category_id: 'budget_categories',
    recurring_payment_id: 'recurring_payments',
  },
  transactions: {
    budget_item_id: 'budget_items',
    linked_account_id: 'linked_accounts',
  },
  split_transactions: {
    parent_transaction_id: 'transactions',
    budget_item_id: 'budget_items',
  },
};

async function main() {
  console.log('='.repeat(60));
  console.log('UUID Migration Script');
  console.log('='.repeat(60));
  console.log('\nThis script will convert all integer IDs to UUIDs.');
  console.log('Make sure you have a backup before proceeding!\n');

  try {
    // Step 1: Check if migration is needed
    console.log('Step 1: Checking current schema...');
    const columnInfo = await sql`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'id'
        AND table_name = ANY(${TABLES_IN_ORDER})
    `;

    const alreadyUuid = columnInfo.filter(c => c.data_type === 'uuid');
    if (alreadyUuid.length === TABLES_IN_ORDER.length) {
      console.log('All tables already use UUID IDs. Migration not needed.');
      process.exit(0);
    }

    const needsMigration = columnInfo.filter(c => c.data_type === 'integer');
    console.log(`Tables needing migration: ${needsMigration.map(c => c.table_name).join(', ')}`);

    // Step 2: Add UUID extension if not exists
    console.log('\nStep 2: Ensuring uuid-ossp extension...');
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
    console.log('UUID extension ready.');

    // Step 3: Add new UUID columns
    console.log('\nStep 3: Adding UUID columns...');
    for (const table of TABLES_IN_ORDER) {
      // Check if table exists and needs migration
      const exists = await sql`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = ${table} AND column_name = 'id' AND data_type = 'integer'
      `;
      if (exists.length === 0) {
        console.log(`  ${table}: skipping (already migrated or doesn't exist)`);
        continue;
      }

      // Add id_uuid column
      await sql.unsafe(`
        ALTER TABLE ${table}
        ADD COLUMN IF NOT EXISTS id_uuid UUID DEFAULT uuid_generate_v4()
      `);
      console.log(`  ${table}: added id_uuid column`);

      // Add FK UUID columns
      const fks = FOREIGN_KEYS[table] || {};
      for (const [fkCol, _refTable] of Object.entries(fks)) {
        const uuidCol = `${fkCol}_uuid`;
        await sql.unsafe(`
          ALTER TABLE ${table}
          ADD COLUMN IF NOT EXISTS ${uuidCol} UUID
        `);
        console.log(`  ${table}: added ${uuidCol} column`);
      }
    }

    // Step 4: Generate UUIDs for existing rows
    console.log('\nStep 4: Generating UUIDs for existing data...');
    for (const table of TABLES_IN_ORDER) {
      const result = await sql.unsafe(`
        UPDATE ${table}
        SET id_uuid = uuid_generate_v4()
        WHERE id_uuid IS NULL
        RETURNING id
      `);
      console.log(`  ${table}: generated ${result.length} UUIDs`);
    }

    // Step 5: Build ID mapping and update foreign keys
    console.log('\nStep 5: Updating foreign key references...');

    // Create temporary mapping tables
    for (const table of TABLES_IN_ORDER) {
      await sql.unsafe(`
        CREATE TEMP TABLE IF NOT EXISTS ${table}_id_map AS
        SELECT id as old_id, id_uuid as new_id FROM ${table}
      `);
    }

    // Update FK columns using mappings
    for (const [table, fks] of Object.entries(FOREIGN_KEYS)) {
      for (const [fkCol, refTable] of Object.entries(fks)) {
        const uuidCol = `${fkCol}_uuid`;
        await sql.unsafe(`
          UPDATE ${table} t
          SET ${uuidCol} = m.new_id
          FROM ${refTable}_id_map m
          WHERE t.${fkCol} = m.old_id
        `);
        console.log(`  ${table}.${fkCol} -> ${uuidCol}: updated`);
      }
    }

    // Step 6: Drop old columns and rename new ones
    console.log('\nStep 6: Replacing integer columns with UUID columns...');

    // This needs to be done carefully to preserve constraints
    // We'll do it in a transaction
    await sql.begin(async (tx) => {
      for (const table of TABLES_IN_ORDER) {
        // Check if migration needed for this table
        const hasOldId = await tx`
          SELECT 1 FROM information_schema.columns
          WHERE table_name = ${table} AND column_name = 'id' AND data_type = 'integer'
        `;
        if (hasOldId.length === 0) continue;

        // Drop constraints first
        console.log(`  ${table}: dropping constraints...`);

        // Get and drop foreign key constraints that reference this table
        const referencingFks = await tx`
          SELECT tc.constraint_name, tc.table_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND ccu.table_name = ${table}
        `;
        for (const fk of referencingFks) {
          await tx.unsafe(`
            ALTER TABLE ${fk.table_name} DROP CONSTRAINT IF EXISTS ${fk.constraint_name}
          `);
        }

        // Drop primary key
        await tx.unsafe(`
          ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_pkey
        `);

        // Drop old id column
        await tx.unsafe(`ALTER TABLE ${table} DROP COLUMN IF EXISTS id`);

        // Rename id_uuid to id
        await tx.unsafe(`ALTER TABLE ${table} RENAME COLUMN id_uuid TO id`);

        // Add primary key constraint
        await tx.unsafe(`ALTER TABLE ${table} ADD PRIMARY KEY (id)`);

        console.log(`  ${table}: id column migrated to UUID`);
      }

      // Now handle foreign key columns
      for (const [table, fks] of Object.entries(FOREIGN_KEYS)) {
        for (const [fkCol, refTable] of Object.entries(fks)) {
          const uuidCol = `${fkCol}_uuid`;

          // Drop old FK column
          await tx.unsafe(`ALTER TABLE ${table} DROP COLUMN IF EXISTS ${fkCol}`);

          // Rename UUID FK column
          await tx.unsafe(`ALTER TABLE ${table} RENAME COLUMN ${uuidCol} TO ${fkCol}`);

          // Add foreign key constraint
          // Determine ON DELETE behavior
          let onDelete = 'SET NULL';
          if (table === 'budget_categories' && fkCol === 'budget_id') onDelete = 'CASCADE';
          if (table === 'budget_items' && fkCol === 'category_id') onDelete = 'CASCADE';
          if (table === 'split_transactions') onDelete = 'CASCADE';

          if (fkCol === 'recurring_payment_id') {
            // This FK is nullable and has no ON DELETE constraint
            await tx.unsafe(`
              ALTER TABLE ${table}
              ADD CONSTRAINT ${table}_${fkCol}_fkey
              FOREIGN KEY (${fkCol}) REFERENCES ${refTable}(id)
            `);
          } else {
            await tx.unsafe(`
              ALTER TABLE ${table}
              ADD CONSTRAINT ${table}_${fkCol}_fkey
              FOREIGN KEY (${fkCol}) REFERENCES ${refTable}(id) ON DELETE ${onDelete}
            `);
          }

          console.log(`  ${table}.${fkCol}: FK constraint restored`);
        }
      }
    });

    // Step 7: Verify migration
    console.log('\nStep 7: Verifying migration...');
    for (const table of TABLES_IN_ORDER) {
      const info = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = ${table} AND column_name = 'id'
      `;
      if (info.length > 0 && info[0].data_type === 'uuid') {
        const count = await sql.unsafe(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`  ${table}: ✓ UUID (${count[0].count} rows)`);
      } else {
        console.log(`  ${table}: ✗ Migration may have failed`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Migration complete!');
    console.log('='.repeat(60));
    console.log('\nNext steps:');
    console.log('1. Update db/schema.ts to use uuid() instead of serial()');
    console.log('2. Run npm run db:push to verify schema matches');
    console.log('3. Test the application thoroughly');

  } catch (error) {
    console.error('\nMigration failed:', error);
    console.error('\nYou may need to restore from backup.');
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
