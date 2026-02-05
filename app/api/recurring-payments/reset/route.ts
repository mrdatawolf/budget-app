import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { recurringPayments } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { RecurringFrequency } from '@/types/budget';
import { requireAuth, isAuthError } from '@/lib/auth';

// Helper to calculate next due date based on frequency
// Parse YYYY-MM-DD as local date to avoid UTC shift
function getNextDueDate(currentDueDate: string, frequency: RecurringFrequency): string {
  const [y, m, d] = currentDueDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);

  switch (frequency) {
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'semi-annually':
      date.setMonth(date.getMonth() + 6);
      break;
    case 'annually':
      date.setFullYear(date.getFullYear() + 1);
      break;
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// POST /api/recurring-payments/reset
// Marks a payment as paid and resets for the next cycle
export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const db = await getDb();
  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: 'Missing payment id' }, { status: 400 });
  }

  // Get current payment and verify ownership
  const payment = await db.query.recurringPayments.findFirst({
    where: and(eq(recurringPayments.id, id), eq(recurringPayments.userId, userId)),
  });

  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  // Calculate next due date and reset funded amount
  const nextDueDate = getNextDueDate(payment.nextDueDate, payment.frequency as RecurringFrequency);

  const [updated] = await db
    .update(recurringPayments)
    .set({
      nextDueDate,
      fundedAmount: '0',
      updatedAt: new Date(),
    })
    .where(eq(recurringPayments.id, id))
    .returning();

  return NextResponse.json({
    success: true,
    payment: updated,
  });
}
