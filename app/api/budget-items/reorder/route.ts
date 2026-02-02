import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { budgetItems, budgetCategories, budgets } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth';

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const body = await request.json();
  const { items } = body;

  if (!items || !Array.isArray(items)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Verify ownership for all items before updating
  for (const item of items) {
    const existingItem = await db.query.budgetItems.findFirst({
      where: eq(budgetItems.id, item.id),
      with: {
        category: {
          with: { budget: true },
        },
      },
    });

    if (!existingItem || existingItem.category.budget.userId !== userId) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
  }

  // Update each item's order
  for (const item of items) {
    await db
      .update(budgetItems)
      .set({ order: item.order })
      .where(eq(budgetItems.id, item.id));
  }

  return NextResponse.json({ success: true });
}