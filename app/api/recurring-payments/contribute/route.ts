import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { recurringPayments } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth';

// POST /api/recurring-payments/contribute
// Adds a contribution to a recurring payment's funded amount
export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const body = await request.json();
  const { id, amount } = body;

  if (!id || amount === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Get current payment and verify ownership
  const payment = await db.query.recurringPayments.findFirst({
    where: and(eq(recurringPayments.id, parseInt(id)), eq(recurringPayments.userId, userId)),
  });

  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  // Add contribution to funded amount
  const newFundedAmount = Math.max(0, parseFloat(String(payment.fundedAmount)) + parseFloat(amount));

  const [updated] = await db
    .update(recurringPayments)
    .set({
      fundedAmount: String(newFundedAmount),
      updatedAt: new Date(),
    })
    .where(eq(recurringPayments.id, parseInt(id)))
    .returning();

  return NextResponse.json({
    success: true,
    payment: updated,
  });
}
