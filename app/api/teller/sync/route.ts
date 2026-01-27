import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { linkedAccounts, transactions, splitTransactions } from '@/db/schema';
import { eq, and, isNull, notInArray } from 'drizzle-orm';
import { createTellerClient, TellerTransaction } from '@/lib/teller';
import { requireAuth, isAuthError } from '@/lib/auth';

// POST - Sync transactions from linked accounts
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const { accountId, startDate, endDate } = body;

    // Get linked accounts to sync (scoped to user)
    let accountsToSync;
    if (accountId) {
      // Sync specific account (verify ownership)
      accountsToSync = await db
        .select()
        .from(linkedAccounts)
        .where(and(eq(linkedAccounts.id, parseInt(accountId)), eq(linkedAccounts.userId, userId)));
    } else {
      // Sync all user's accounts
      accountsToSync = await db.select().from(linkedAccounts).where(eq(linkedAccounts.userId, userId));
    }

    if (accountsToSync.length === 0) {
      return NextResponse.json({ error: 'No linked accounts found' }, { status: 404 });
    }

    const results = {
      synced: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const account of accountsToSync) {
      try {
        const tellerClient = createTellerClient(account.accessToken);

        // Fetch transactions from Teller
        const tellerTransactions: TellerTransaction[] = await tellerClient.listTransactions(
          account.tellerAccountId,
          {
            count: 500, // Max transactions to fetch
            startDate,
            endDate,
          }
        );

        for (const txn of tellerTransactions) {
          // Parse amount - Teller returns negative for debits, positive for credits
          const amount = Math.abs(parseFloat(txn.amount));
          const type: 'income' | 'expense' = parseFloat(txn.amount) > 0 ? 'income' : 'expense';

          // Check if transaction already exists
          const existing = await db
            .select()
            .from(transactions)
            .where(eq(transactions.tellerTransactionId, txn.id))
            .limit(1);

          if (existing.length > 0) {
            const existingTxn = existing[0];

            // Check if we need to update (status changed or amount changed)
            const statusChanged = existingTxn.status !== txn.status;
            const amountChanged = Math.abs(existingTxn.amount - amount) > 0.001;

            if (statusChanged || amountChanged) {
              await db
                .update(transactions)
                .set({
                  status: txn.status,
                  amount: amount,
                  // Update description/merchant in case they changed too
                  description: txn.description,
                  merchant: txn.details?.counterparty?.name || existingTxn.merchant,
                })
                .where(eq(transactions.id, existingTxn.id));

              results.updated++;
            } else {
              results.skipped++;
            }
            continue;
          }

          // Insert new transaction (uncategorized - no budgetItemId)
          await db.insert(transactions).values({
            budgetItemId: null, // Uncategorized
            linkedAccountId: account.id, // Link to the account
            date: txn.date,
            description: txn.description,
            amount,
            type,
            merchant: txn.details?.counterparty?.name || null,
            tellerTransactionId: txn.id,
            tellerAccountId: account.tellerAccountId,
            status: txn.status,
          });

          results.synced++;
        }

        // Update last synced timestamp
        await db
          .update(linkedAccounts)
          .set({ lastSyncedAt: new Date() })
          .where(eq(linkedAccounts.id, account.id));

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`Account ${account.accountName}: ${errorMsg}`);
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error syncing transactions:', error);
    return NextResponse.json({ error: 'Failed to sync transactions' }, { status: 500 });
  }
}

// GET - Get uncategorized transactions (not assigned to any budget item)
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult.error;
    const { userId } = authResult;

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const year = searchParams.get('year');

    // Get user's linked account IDs for filtering
    const userAccounts = await db
      .select({ id: linkedAccounts.id })
      .from(linkedAccounts)
      .where(eq(linkedAccounts.userId, userId));
    const userAccountIds = userAccounts.map(a => a.id);

    if (userAccountIds.length === 0) {
      return NextResponse.json([]);
    }

    // Get IDs of transactions that have been split (these should not appear as uncategorized)
    const splitParentIds = await db
      .selectDistinct({ parentId: splitTransactions.parentTransactionId })
      .from(splitTransactions);
    const splitParentIdList = splitParentIds.map(s => s.parentId);

    // Get transactions that:
    // - Belong to user's linked accounts
    // - Have no budgetItemId (uncategorized)
    // - Are not deleted
    // - Are not split
    const uncategorizedTransactions = await db.query.transactions.findMany({
      where: and(
        isNull(transactions.budgetItemId),
        isNull(transactions.deletedAt),
        splitParentIdList.length > 0
          ? notInArray(transactions.id, splitParentIdList)
          : undefined
      ),
      with: {
        linkedAccount: true,
      },
    });

    // Filter to only user's transactions
    const userTransactions = uncategorizedTransactions.filter(
      txn => txn.linkedAccount && userAccountIds.includes(txn.linkedAccount.id)
    );

    // Filter by month/year if provided
    let filtered = userTransactions;
    if (month !== null && year !== null) {
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      filtered = userTransactions.filter(txn => {
        // Parse date as local time to avoid timezone shift (YYYY-MM-DD format)
        const [txnYear, txnMonth] = txn.date.split('-').map(Number);
        return (txnMonth - 1) === monthNum && txnYear === yearNum;
      });
    }

    // Map to simpler format
    const result = filtered.map(txn => ({
      id: txn.id,
      budgetItemId: txn.budgetItemId,
      linkedAccountId: txn.linkedAccountId,
      date: txn.date,
      description: txn.description,
      amount: txn.amount,
      type: txn.type,
      merchant: txn.merchant,
      tellerTransactionId: txn.tellerTransactionId,
      tellerAccountId: txn.tellerAccountId,
      status: txn.status,
      deletedAt: txn.deletedAt,
      createdAt: txn.createdAt,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching uncategorized transactions:', error);
    return NextResponse.json({ error: 'Failed to fetch uncategorized transactions' }, { status: 500 });
  }
}
