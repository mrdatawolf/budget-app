import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { budgets, linkedAccounts, recurringPayments } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth';

/**
 * POST /api/auth/claim-data
 * Claims all unclaimed data (userId = '') for the current user
 * This is used for migrating existing data to a new user account
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const results = {
    budgets: 0,
    linkedAccounts: 0,
    recurringPayments: 0,
  };

  // Claim unclaimed budgets
  const budgetResult = await db
    .update(budgets)
    .set({ userId })
    .where(eq(budgets.userId, ''))
    .returning({ id: budgets.id });
  results.budgets = budgetResult.length;

  // Claim unclaimed linked accounts
  const accountResult = await db
    .update(linkedAccounts)
    .set({ userId })
    .where(eq(linkedAccounts.userId, ''))
    .returning({ id: linkedAccounts.id });
  results.linkedAccounts = accountResult.length;

  // Claim unclaimed recurring payments
  const recurringResult = await db
    .update(recurringPayments)
    .set({ userId })
    .where(eq(recurringPayments.userId, ''))
    .returning({ id: recurringPayments.id });
  results.recurringPayments = recurringResult.length;

  const totalClaimed = results.budgets + results.linkedAccounts + results.recurringPayments;

  return NextResponse.json({
    success: true,
    message: totalClaimed > 0
      ? `Claimed ${totalClaimed} records for your account`
      : 'No unclaimed data found',
    claimed: results,
  });
}

/**
 * GET /api/auth/claim-data
 * Check if there's unclaimed data available
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;

  // Count unclaimed records
  const unclaimedBudgets = await db.query.budgets.findMany({
    where: eq(budgets.userId, ''),
  });

  const unclaimedAccounts = await db.query.linkedAccounts.findMany({
    where: eq(linkedAccounts.userId, ''),
  });

  const unclaimedRecurring = await db.query.recurringPayments.findMany({
    where: eq(recurringPayments.userId, ''),
  });

  const hasUnclaimed = unclaimedBudgets.length > 0 ||
                       unclaimedAccounts.length > 0 ||
                       unclaimedRecurring.length > 0;

  return NextResponse.json({
    hasUnclaimedData: hasUnclaimed,
    unclaimed: {
      budgets: unclaimedBudgets.length,
      linkedAccounts: unclaimedAccounts.length,
      recurringPayments: unclaimedRecurring.length,
    },
  });
}
