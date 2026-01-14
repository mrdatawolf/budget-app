import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transactions } from '@/db/schema';
import { eq, isNotNull } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { budgetItemId, date, description, amount, type, merchant, account, checkNumber } = body;

  if (!budgetItemId || !date || !description || amount === undefined || !type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const [transaction] = await db
    .insert(transactions)
    .values({
      budgetItemId: parseInt(budgetItemId),
      date,
      description,
      amount,
      type,
      merchant: merchant || null,
      account: account || null,
      checkNumber: checkNumber || null,
    })
    .returning();

  return NextResponse.json(transaction);
}

// PUT - Update transaction (for assigning to budget item)
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, budgetItemId } = body;

  if (!id) {
    return NextResponse.json({ error: 'Missing transaction id' }, { status: 400 });
  }

  const [updated] = await db
    .update(transactions)
    .set({
      budgetItemId: budgetItemId ? parseInt(budgetItemId) : null,
    })
    .where(eq(transactions.id, parseInt(id)))
    .returning();

  return NextResponse.json(updated);
}

// DELETE - Soft delete a transaction
export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing transaction id' }, { status: 400 });
  }

  // Soft delete by setting deletedAt timestamp
  await db
    .update(transactions)
    .set({ deletedAt: new Date() })
    .where(eq(transactions.id, parseInt(id)));

  return NextResponse.json({ success: true });
}

// GET - Get deleted transactions for a month/year
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const month = searchParams.get('month');
  const year = searchParams.get('year');
  const deleted = searchParams.get('deleted');

  // Only return deleted transactions if explicitly requested
  if (deleted === 'true') {
    const deletedTransactions = await db
      .select()
      .from(transactions)
      .where(isNotNull(transactions.deletedAt));

    // Filter by month/year if provided
    let filtered = deletedTransactions;
    if (month !== null && year !== null) {
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      filtered = deletedTransactions.filter(txn => {
        const [txnYear, txnMonth] = txn.date.split('-').map(Number);
        return (txnMonth - 1) === monthNum && txnYear === yearNum;
      });
    }

    return NextResponse.json(filtered);
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
}

// PATCH - Restore a soft-deleted transaction
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: 'Missing transaction id' }, { status: 400 });
  }

  // Restore by clearing deletedAt
  const [restored] = await db
    .update(transactions)
    .set({ deletedAt: null })
    .where(eq(transactions.id, parseInt(id)))
    .returning();

  return NextResponse.json(restored);
}