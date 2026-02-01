import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { budgetCategories, budgetItems, transactions, splitTransactions, budgets } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const body = await request.json();
  const { budgetId, name, emoji } = body;

  if (!budgetId || !name?.trim() || !emoji) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Verify budget ownership
  const budget = await db.query.budgets.findFirst({
    where: and(eq(budgets.id, budgetId), eq(budgets.userId, userId)),
    with: { categories: true },
  });

  if (!budget) {
    return NextResponse.json({ error: 'Budget not found' }, { status: 404 });
  }

  const categoryType = slugify(name);

  // Check for duplicate categoryType in this budget
  const existing = budget.categories.find(c => c.categoryType === categoryType);
  if (existing) {
    return NextResponse.json({ error: 'A category with this name already exists' }, { status: 409 });
  }

  // Determine order (after all existing categories)
  const maxOrder = budget.categories.length > 0
    ? Math.max(...budget.categories.map(c => c.categoryOrder ?? 0))
    : -1;

  const [newCategory] = await db.insert(budgetCategories).values({
    budgetId,
    categoryType,
    name: name.trim(),
    emoji,
    categoryOrder: maxOrder + 1,
  }).returning();

  return NextResponse.json(newCategory);
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const searchParams = request.nextUrl.searchParams;
  const id = parseInt(searchParams.get('id') || '');

  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid category id' }, { status: 400 });
  }

  // Verify ownership through budget
  const category = await db.query.budgetCategories.findFirst({
    where: eq(budgetCategories.id, id),
    with: {
      budget: true,
      items: true,
    },
  });

  if (!category || category.budget.userId !== userId) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  }

  // Don't allow deleting default categories
  const defaultTypes = ['income', 'giving', 'household', 'transportation', 'food', 'personal', 'insurance', 'saving'];
  if (defaultTypes.includes(category.categoryType)) {
    return NextResponse.json({ error: 'Cannot delete default categories' }, { status: 400 });
  }

  // Cascade delete: get item IDs, delete split transactions, transactions, items, then category
  if (category.items.length > 0) {
    const itemIds = category.items.map(i => i.id);

    // Delete split transactions referencing these items
    await db.delete(splitTransactions).where(inArray(splitTransactions.budgetItemId, itemIds));

    // Delete transactions referencing these items (set null handled by FK, but clean up direct ones)
    await db.update(transactions).set({ budgetItemId: null }).where(inArray(transactions.budgetItemId, itemIds));

    // Delete budget items (cascade from category delete will handle this, but be explicit)
    await db.delete(budgetItems).where(inArray(budgetItems.id, itemIds));
  }

  // Delete the category
  await db.delete(budgetCategories).where(eq(budgetCategories.id, id));

  return NextResponse.json({ success: true });
}
