import { Hono } from 'hono';
import { getDb } from '@budget-app/shared/db';
import { budgets, linkedAccounts, recurringPayments } from '@budget-app/shared/schema';
import { eq } from 'drizzle-orm';
import { getUserId } from '../middleware/auth';
const route = new Hono();
// POST /claim-data - Claims all unclaimed data (userId = '') for the current user
route.post('/', async (c) => {
    const userId = getUserId(c);
    const db = await getDb();
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
    return c.json({
        success: true,
        message: totalClaimed > 0
            ? `Claimed ${totalClaimed} records for your account`
            : 'No unclaimed data found',
        claimed: results,
    });
});
// GET /claim-data - Check if there's unclaimed data available
route.get('/', async (c) => {
    const userId = getUserId(c);
    const db = await getDb();
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
    return c.json({
        hasUnclaimedData: hasUnclaimed,
        unclaimed: {
            budgets: unclaimedBudgets.length,
            linkedAccounts: unclaimedAccounts.length,
            recurringPayments: unclaimedRecurring.length,
        },
    });
});
export default route;
