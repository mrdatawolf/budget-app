import { Hono } from 'hono';
import { getDb, getDbStatus, resetDbError, listBackups, createBackup, deleteLocalDb, restoreFromBackup, deleteBackup, getCloudDb, } from '@budget-app/shared/db';
import { budgets, budgetCategories, budgetItems, transactions, splitTransactions, linkedAccounts, recurringPayments, userOnboarding, } from '@budget-app/shared/schema';
const route = new Hono();
// GET /database - Returns database status and available backups
route.get('/', (c) => {
    const status = getDbStatus();
    const backups = listBackups();
    const hasCloudConnection = !!process.env.DATABASE_URL;
    return c.json({
        status,
        backups,
        hasCloudConnection,
    });
});
// POST /database - Database management operations
route.post('/', async (c) => {
    try {
        const body = await c.req.json();
        const { action, backupPath } = body;
        switch (action) {
            case 'backup': {
                const newBackupPath = createBackup();
                if (newBackupPath) {
                    return c.json({
                        success: true,
                        message: 'Backup created successfully',
                        backupPath: newBackupPath,
                    });
                }
                else {
                    return c.json({
                        success: false,
                        message: 'No database to backup or backup failed',
                    }, 400);
                }
            }
            case 'retry': {
                resetDbError();
                try {
                    await getDb();
                    return c.json({
                        success: true,
                        message: 'Database initialized successfully',
                    });
                }
                catch (error) {
                    return c.json({
                        success: false,
                        message: error instanceof Error ? error.message : 'Failed to initialize database',
                    }, 500);
                }
            }
            case 'delete': {
                const newBackupPath = await deleteLocalDb();
                return c.json({
                    success: true,
                    message: 'Database deleted successfully',
                    backupPath: newBackupPath,
                });
            }
            case 'restore': {
                if (!backupPath) {
                    return c.json({
                        success: false,
                        message: 'backupPath is required',
                    }, 400);
                }
                await restoreFromBackup(backupPath);
                try {
                    await getDb();
                    return c.json({
                        success: true,
                        message: 'Database restored successfully',
                    });
                }
                catch (error) {
                    return c.json({
                        success: false,
                        message: `Database restored but failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    }, 500);
                }
            }
            case 'deleteBackup': {
                if (!backupPath) {
                    return c.json({
                        success: false,
                        message: 'backupPath is required',
                    }, 400);
                }
                deleteBackup(backupPath);
                return c.json({
                    success: true,
                    message: 'Backup deleted successfully',
                });
            }
            case 'syncFromCloud': {
                const cloudDb = getCloudDb();
                if (!cloudDb) {
                    return c.json({
                        success: false,
                        message: 'Cloud database is not configured. Set DATABASE_URL in your environment.',
                    }, 400);
                }
                await deleteLocalDb();
                const localDb = await getDb();
                try {
                    // Sync tables in FK dependency order
                    const cloudBudgets = await cloudDb.select().from(budgets);
                    if (cloudBudgets.length > 0) {
                        await localDb.insert(budgets).values(cloudBudgets);
                    }
                    const cloudCategories = await cloudDb.select().from(budgetCategories);
                    if (cloudCategories.length > 0) {
                        await localDb.insert(budgetCategories).values(cloudCategories);
                    }
                    const cloudAccounts = await cloudDb.select().from(linkedAccounts);
                    if (cloudAccounts.length > 0) {
                        await localDb.insert(linkedAccounts).values(cloudAccounts);
                    }
                    const cloudRecurring = await cloudDb.select().from(recurringPayments);
                    if (cloudRecurring.length > 0) {
                        await localDb.insert(recurringPayments).values(cloudRecurring);
                    }
                    const cloudItems = await cloudDb.select().from(budgetItems);
                    if (cloudItems.length > 0) {
                        await localDb.insert(budgetItems).values(cloudItems);
                    }
                    const cloudTransactions = await cloudDb.select().from(transactions);
                    if (cloudTransactions.length > 0) {
                        await localDb.insert(transactions).values(cloudTransactions);
                    }
                    const cloudSplits = await cloudDb.select().from(splitTransactions);
                    if (cloudSplits.length > 0) {
                        await localDb.insert(splitTransactions).values(cloudSplits);
                    }
                    const cloudOnboarding = await cloudDb.select().from(userOnboarding);
                    if (cloudOnboarding.length > 0) {
                        await localDb.insert(userOnboarding).values(cloudOnboarding);
                    }
                    const totalRecords = cloudBudgets.length +
                        cloudCategories.length +
                        cloudAccounts.length +
                        cloudRecurring.length +
                        cloudItems.length +
                        cloudTransactions.length +
                        cloudSplits.length +
                        cloudOnboarding.length;
                    return c.json({
                        success: true,
                        message: `Synced ${totalRecords} records from cloud`,
                        counts: {
                            budgets: cloudBudgets.length,
                            categories: cloudCategories.length,
                            accounts: cloudAccounts.length,
                            recurringPayments: cloudRecurring.length,
                            items: cloudItems.length,
                            transactions: cloudTransactions.length,
                            splitTransactions: cloudSplits.length,
                            onboarding: cloudOnboarding.length,
                        },
                    });
                }
                catch (syncError) {
                    return c.json({
                        success: false,
                        message: `Sync failed: ${syncError instanceof Error ? syncError.message : 'Unknown error'}`,
                    }, 500);
                }
            }
            default:
                return c.json({
                    success: false,
                    message: `Unknown action: ${action}`,
                }, 400);
        }
    }
    catch (error) {
        return c.json({
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error',
        }, 500);
    }
});
// DELETE /database - Delete the local database (creates backup first)
route.delete('/', async (c) => {
    try {
        const newBackupPath = await deleteLocalDb();
        return c.json({
            success: true,
            message: 'Database deleted successfully',
            backupPath: newBackupPath,
        });
    }
    catch (error) {
        return c.json({
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error',
        }, 500);
    }
});
export default route;
