import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { budgets, budgetCategories, budgetItems } from '@/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth';

const CATEGORY_TYPES = [
  { type: 'income', name: 'Income' },
  { type: 'giving', name: 'Giving' },
  { type: 'household', name: 'Household' },
  { type: 'transportation', name: 'Transportation' },
  { type: 'food', name: 'Food' },
  { type: 'personal', name: 'Personal' },
  { type: 'insurance', name: 'Insurance' },
  { type: 'saving', name: 'Saving' },
];

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const db = await getDb();
  const body = await request.json();
  const { sourceMonth, sourceYear, targetMonth, targetYear } = body;

  if (
    sourceMonth === undefined ||
    sourceYear === undefined ||
    targetMonth === undefined ||
    targetYear === undefined
  ) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Fetch source budget with all items
  const sourceBudget = await db.query.budgets.findFirst({
    where: and(eq(budgets.userId, userId), eq(budgets.month, sourceMonth), eq(budgets.year, sourceYear)),
    with: {
      categories: {
        with: {
          items: {
            orderBy: [asc(budgetItems.order)],
          },
        },
      },
    },
  });

  // Get or create target budget (include items to check for duplicates)
  let targetBudget = await db.query.budgets.findFirst({
    where: and(eq(budgets.userId, userId), eq(budgets.month, targetMonth), eq(budgets.year, targetYear)),
    with: {
      categories: {
        with: {
          items: true,
        },
      },
    },
  });

  if (!targetBudget) {
    const [newBudget] = await db.insert(budgets).values({
      userId,
      month: targetMonth,
      year: targetYear,
      buffer: sourceBudget?.buffer || '0',
    }).returning();

    for (const cat of CATEGORY_TYPES) {
      await db.insert(budgetCategories).values({
        budgetId: newBudget.id,
        categoryType: cat.type,
        name: cat.name,
      });
    }

    targetBudget = await db.query.budgets.findFirst({
      where: eq(budgets.id, newBudget.id),
      with: {
        categories: {
          with: {
            items: true,
          },
        },
      },
    });
  }

  if (!targetBudget) {
    return NextResponse.json({ error: 'Failed to create target budget' }, { status: 500 });
  }

  // If no source budget exists, just return success (empty budget was created)
  if (!sourceBudget) {
    return NextResponse.json({ success: true, message: 'No source budget to copy from' });
  }

  // Copy items from source to target
  for (const sourceCategory of sourceBudget.categories) {
    const existingTargetCategory = targetBudget.categories.find(
      (c) => c.categoryType === sourceCategory.categoryType
    );

    let targetCategoryId: string;
    let existingItems: { name: string; recurringPaymentId: string | null }[] = [];

    // Create custom category in target if it doesn't exist
    if (!existingTargetCategory) {
      const [newCat] = await db.insert(budgetCategories).values({
        budgetId: targetBudget.id,
        categoryType: sourceCategory.categoryType,
        name: sourceCategory.name,
        emoji: sourceCategory.emoji,
        categoryOrder: sourceCategory.categoryOrder ?? 0,
      }).returning();
      targetCategoryId = newCat.id;
      // New category has no items, so existingItems stays empty
    } else {
      targetCategoryId = existingTargetCategory.id;
      existingItems = existingTargetCategory.items;
    }

    if (sourceCategory.items.length > 0) {
      for (const item of sourceCategory.items) {
        // Check for duplicate by name or by recurringPaymentId
        const isDuplicate = existingItems.some(existing =>
          existing.name.toLowerCase() === item.name.toLowerCase() ||
          (item.recurringPaymentId && existing.recurringPaymentId === item.recurringPaymentId)
        );

        if (!isDuplicate) {
          await db.insert(budgetItems).values({
            categoryId: targetCategoryId,
            name: item.name,
            planned: item.planned,
            order: item.order,
            recurringPaymentId: item.recurringPaymentId,
          });
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}
