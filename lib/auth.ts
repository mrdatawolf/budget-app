import { NextResponse } from 'next/server';

/**
 * Local user ID used for all local database operations.
 * In local-only mode, there's a single implicit user.
 */
const LOCAL_USER_ID = 'local';

/**
 * Get the local user for local-only mode.
 * Returns a constant userId since there's only one user locally.
 */
export function getLocalUser(): { userId: string } {
  return { userId: LOCAL_USER_ID };
}

/**
 * Require authentication for an API route.
 * In local-only mode, always returns the local user (no auth needed).
 *
 * Note: When cloud sync is enabled (Phase 4+), this will be updated to:
 * - Return local user for local database operations
 * - Use Clerk auth for cloud sync operations
 */
export async function requireAuth(): Promise<{ userId: string } | { error: NextResponse }> {
  // Local-only mode: always return the local user
  return getLocalUser();
}

/**
 * Type guard to check if requireAuth result is an error.
 * In local-only mode, this will always return false.
 */
export function isAuthError(
  result: { userId: string } | { error: NextResponse }
): result is { error: NextResponse } {
  return 'error' in result;
}

// ============================================================================
// Cloud Auth Functions (for future Phase 4+ sync)
// ============================================================================

/**
 * Check if cloud sync is enabled.
 * TODO: Implement in Phase 5 when cloud connect UI is added.
 */
export function isCloudConnected(): boolean {
  // TODO: Check localStorage/database for cloud connection state
  return false;
}

/**
 * Get the cloud user ID from Clerk auth.
 * Only used for cloud sync operations.
 * TODO: Implement in Phase 4 when sync is added.
 */
export async function getCloudUserId(): Promise<string | null> {
  // TODO: Import and use Clerk auth when cloud sync is enabled
  // import { auth } from '@clerk/nextjs/server';
  // const { userId } = await auth();
  // return userId;
  return null;
}

/**
 * Require Clerk authentication for cloud sync operations.
 * TODO: Implement in Phase 4 when sync is added.
 */
export async function requireCloudAuth(): Promise<{ userId: string } | { error: NextResponse }> {
  // TODO: Implement proper Clerk auth for cloud sync
  return {
    error: NextResponse.json(
      { error: 'Cloud sync not enabled' },
      { status: 401 }
    )
  };
}
