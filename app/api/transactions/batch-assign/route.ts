import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { transactions, budgetItems, linkedAccounts } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth';

interface AssignmentRequest {
  transactionId: string;
  budgetItemId: string;
}

// POST - Batch assign multiple transactions to budget items
export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const db = await getDb();
  const body = await request.json();
  const { assignments } = body as { assignments: AssignmentRequest[] };

  if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
    return NextResponse.json({ error: 'No assignments provided' }, { status: 400 });
  }

  // Get unique budget item IDs and transaction IDs
  const budgetItemIds = [...new Set(assignments.map(a => a.budgetItemId))];
  const transactionIds = [...new Set(assignments.map(a => a.transactionId))];

  // Verify all budget items belong to the user
  const budgetItemsResult = await db.query.budgetItems.findMany({
    where: inArray(budgetItems.id, budgetItemIds),
    with: {
      category: {
        with: { budget: true },
      },
    },
  });

  const ownedBudgetItemIds = new Set(
    budgetItemsResult
      .filter(item => item.category?.budget?.userId === userId)
      .map(item => item.id)
  );

  // Verify all transactions belong to the user (via linked account)
  const userAccounts = await db
    .select({ id: linkedAccounts.id })
    .from(linkedAccounts)
    .where(eq(linkedAccounts.userId, userId));
  const userAccountIds = new Set(userAccounts.map(a => a.id));

  const txnsResult = await db.query.transactions.findMany({
    where: inArray(transactions.id, transactionIds),
    with: {
      linkedAccount: true,
    },
  });

  const ownedTransactionIds = new Set(
    txnsResult
      .filter(txn => txn.linkedAccount && userAccountIds.has(txn.linkedAccount.id))
      .map(txn => txn.id)
  );

  // Filter to only valid assignments (user owns both transaction and budget item)
  const validAssignments = assignments.filter(
    a => ownedTransactionIds.has(a.transactionId) && ownedBudgetItemIds.has(a.budgetItemId)
  );

  if (validAssignments.length === 0) {
    return NextResponse.json({
      error: 'No valid assignments found',
      assigned: 0,
      skipped: assignments.length,
    }, { status: 400 });
  }

  // Perform the batch update
  let assigned = 0;
  const errors: string[] = [];

  for (const assignment of validAssignments) {
    try {
      await db
        .update(transactions)
        .set({ budgetItemId: assignment.budgetItemId })
        .where(eq(transactions.id, assignment.transactionId));
      assigned++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Transaction ${assignment.transactionId}: ${errorMsg}`);
    }
  }

  return NextResponse.json({
    assigned,
    skipped: assignments.length - validAssignments.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
