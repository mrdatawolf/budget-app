import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transactions } from '@/db/schema';
import { eq, isNotNull } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { budgetItemId, linkedAccountId, date, description, amount, type, merchant, checkNumber } = body;

  if (!budgetItemId || !date || !description || amount === undefined || !type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const [transaction] = await db
    .insert(transactions)
    .values({
      budgetItemId: parseInt(budgetItemId),
      linkedAccountId: linkedAccountId ? parseInt(linkedAccountId) : null,
      date,
      description,
      amount,
      type,
      merchant: merchant || null,
      checkNumber: checkNumber || null,
    })
    .returning();

  return NextResponse.json(transaction);
}

// PUT - Update transaction (full edit or just assign budget item)
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, budgetItemId, linkedAccountId, date, description, amount, type, merchant } = body;

  if (!id) {
    return NextResponse.json({ error: 'Missing transaction id' }, { status: 400 });
  }

  // Build update object with only provided fields
  const updateData: Record<string, unknown> = {};

  if (budgetItemId !== undefined) {
    updateData.budgetItemId = budgetItemId ? parseInt(budgetItemId) : null;
  }
  if (linkedAccountId !== undefined) {
    updateData.linkedAccountId = linkedAccountId ? parseInt(linkedAccountId) : null;
  }
  if (date !== undefined) {
    updateData.date = date;
  }
  if (description !== undefined) {
    updateData.description = description;
  }
  if (amount !== undefined) {
    updateData.amount = amount;
  }
  if (type !== undefined) {
    updateData.type = type;
  }
  if (merchant !== undefined) {
    updateData.merchant = merchant || null;
  }

  const [updated] = await db
    .update(transactions)
    .set(updateData)
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

// GET - Get a single transaction by ID or deleted transactions for a month/year
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');
  const month = searchParams.get('month');
  const year = searchParams.get('year');
  const deleted = searchParams.get('deleted');

  // Fetch single transaction by ID
  if (id) {
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, parseInt(id)));

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: transaction.id.toString(),
      budgetItemId: transaction.budgetItemId?.toString() || null,
      linkedAccountId: transaction.linkedAccountId,
      date: transaction.date,
      description: transaction.description,
      amount: transaction.amount,
      type: transaction.type,
      merchant: transaction.merchant,
    });
  }

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