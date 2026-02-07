import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../schema';

/**
 * Create a cloud database connection to Supabase PostgreSQL.
 * Used for sync operations when cloud is connected.
 *
 * @param connectionString - PostgreSQL connection string (DATABASE_URL)
 * @returns Drizzle database instance
 */
export function createCloudDb(connectionString: string) {
  const client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema });
}

/**
 * Get cloud database using environment variable.
 * Returns null if DATABASE_URL is not set.
 */
export function getCloudDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }
  return createCloudDb(connectionString);
}

export { schema };
