import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * Get the current user's ID from Clerk auth
 * Returns null if not authenticated
 */
export async function getAuthUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

/**
 * Require authentication for an API route
 * Returns { userId } if authenticated, or a 401 response if not
 */
export async function requireAuth(): Promise<{ userId: string } | { error: NextResponse }> {
  const { userId } = await auth();

  if (!userId) {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    };
  }

  return { userId };
}

/**
 * Type guard to check if requireAuth result is an error
 */
export function isAuthError(
  result: { userId: string } | { error: NextResponse }
): result is { error: NextResponse } {
  return 'error' in result;
}
