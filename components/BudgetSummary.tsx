"use client";

import { useState, useEffect, useCallback } from "react";
import { Budget, Transaction, BudgetItem } from "@/types/budget";
import { FaChartPie, FaReceipt, FaSync, FaCheck, FaTimes, FaUndo, FaTrash } from "react-icons/fa";

interface BudgetSummaryProps {
  budget: Budget;
  onRefresh?: () => void;
}

interface UncategorizedTransaction {
  id: number;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  merchant: string | null;
  status: string | null;
}

export default function BudgetSummary({ budget, onRefresh }: BudgetSummaryProps) {
  const [activeTab, setActiveTab] = useState<"summary" | "transactions">(
    "summary"
  );
  const [uncategorizedTxns, setUncategorizedTxns] = useState<UncategorizedTransaction[]>([]);
  const [deletedTxns, setDeletedTxns] = useState<UncategorizedTransaction[]>([]);
  const [isLoadingUncategorized, setIsLoadingUncategorized] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [selectedBudgetItemId, setSelectedBudgetItemId] = useState<string>('');
  const [showDeleted, setShowDeleted] = useState(false);

  const buffer = budget.buffer || 0;

  const totalIncome = budget.categories.income.items.reduce(
    (sum, item) => sum + item.planned,
    0
  );

  const totalExpenses = Object.entries(budget.categories)
    .filter(([key]) => key !== "income")
    .reduce((sum, [, category]) => {
      return (
        sum + category.items.reduce((catSum, item) => catSum + item.planned, 0)
      );
    }, 0);

  const totalAvailable = buffer + totalIncome;
  const remainingToBudget = totalAvailable - totalExpenses;
  const isBalanced = Math.abs(remainingToBudget) < 0.01;

  const totalActualIncome = budget.categories.income.items.reduce(
    (sum, item) => sum + item.actual,
    0
  );

  const totalActualExpenses = Object.entries(budget.categories)
    .filter(([key]) => key !== "income")
    .reduce((sum, [, category]) => {
      return (
        sum + category.items.reduce((catSum, item) => catSum + item.actual, 0)
      );
    }, 0);

  const totalActualAvailable = buffer + totalActualIncome;
  const actualRemaining = totalActualAvailable - totalActualExpenses;

  // Collect all transactions from all categories
  const allTransactions: Transaction[] = [];
  Object.entries(budget.categories).forEach(([, category]) => {
    category.items.forEach((item) => {
      item.transactions.forEach((transaction) => {
        allTransactions.push(transaction);
      });
    });
  });

  // Sort transactions by date (most recent first)
  allTransactions.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const formatDate = (dateString: string) => {
    // Parse as local date to avoid timezone shift (YYYY-MM-DD format)
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
  };

  // Fetch uncategorized transactions
  const fetchUncategorized = useCallback(async () => {
    setIsLoadingUncategorized(true);
    try {
      const response = await fetch(`/api/teller/sync?month=${budget.month}&year=${budget.year}`);
      if (response.ok) {
        const data = await response.json();
        setUncategorizedTxns(data);
      }
    } catch (error) {
      console.error('Error fetching uncategorized transactions:', error);
    } finally {
      setIsLoadingUncategorized(false);
    }
  }, [budget.month, budget.year]);

  // Fetch deleted transactions
  const fetchDeleted = useCallback(async () => {
    try {
      const response = await fetch(`/api/transactions?deleted=true&month=${budget.month}&year=${budget.year}`);
      if (response.ok) {
        const data = await response.json();
        setDeletedTxns(data);
      }
    } catch (error) {
      console.error('Error fetching deleted transactions:', error);
    }
  }, [budget.month, budget.year]);

  useEffect(() => {
    fetchUncategorized();
    fetchDeleted();
  }, [fetchUncategorized, fetchDeleted]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/teller/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (response.ok) {
        const result = await response.json();
        alert(`Synced ${result.synced} new transactions`);
        await fetchUncategorized();
      }
    } catch (error) {
      console.error('Error syncing:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAssign = async (transactionId: number) => {
    if (!selectedBudgetItemId) return;

    try {
      const response = await fetch('/api/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: transactionId,
          budgetItemId: selectedBudgetItemId,
        }),
      });

      if (response.ok) {
        setUncategorizedTxns(uncategorizedTxns.filter(t => t.id !== transactionId));
        setAssigningId(null);
        setSelectedBudgetItemId('');
        onRefresh?.();
      }
    } catch (error) {
      console.error('Error assigning transaction:', error);
    }
  };

  const handleDeleteUncategorized = async (transactionId: number) => {
    if (!confirm('Delete this transaction?')) return;

    try {
      const response = await fetch(`/api/transactions?id=${transactionId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Move to deleted list
        const deletedTxn = uncategorizedTxns.find(t => t.id === transactionId);
        if (deletedTxn) {
          setDeletedTxns([...deletedTxns, deletedTxn]);
        }
        setUncategorizedTxns(uncategorizedTxns.filter(t => t.id !== transactionId));
      }
    } catch (error) {
      console.error('Error deleting transaction:', error);
    }
  };

  const handleRestoreTransaction = async (transactionId: number) => {
    try {
      const response = await fetch('/api/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: transactionId }),
      });

      if (response.ok) {
        // Move from deleted to uncategorized
        const restoredTxn = deletedTxns.find(t => t.id === transactionId);
        if (restoredTxn) {
          setUncategorizedTxns([...uncategorizedTxns, restoredTxn]);
        }
        setDeletedTxns(deletedTxns.filter(t => t.id !== transactionId));
        onRefresh?.();
      }
    } catch (error) {
      console.error('Error restoring transaction:', error);
    }
  };

  const handlePermanentDelete = async (transactionId: number) => {
    if (!confirm('Permanently delete this transaction? This cannot be undone.')) return;

    try {
      // For permanent delete, we'd need a separate endpoint, but for now just remove from UI
      // The transaction stays in DB with deletedAt set
      setDeletedTxns(deletedTxns.filter(t => t.id !== transactionId));
    } catch (error) {
      console.error('Error permanently deleting transaction:', error);
    }
  };

  // Get all budget items for the dropdown
  const getAllBudgetItems = (): { category: string; items: BudgetItem[] }[] => {
    const categories = Object.entries(budget.categories).map(([, category]) => ({
      category: category.name,
      items: category.items,
    }));
    return categories.filter(c => c.items.length > 0);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg h-full flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("summary")}
          className={`cursor-pointer flex-1 px-6 py-4 transition-colors flex flex-col items-center gap-2 ${
            activeTab === "summary"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <FaChartPie className="text-2xl" />
          <span className="text-lg font-semibold">Summary</span>
        </button>
        <button
          onClick={() => setActiveTab("transactions")}
          className={`cursor-pointer flex-1 px-6 py-4 transition-colors flex flex-col items-center gap-2 ${
            activeTab === "transactions"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <FaReceipt className="text-2xl" />
          <span className="text-lg font-semibold">Transactions</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar p-6">
        {activeTab === "summary" ? (
          <div className="space-y-8">
            {/* Planned Section */}
            <div>
              <h3 className="text-lg font-semibold text-gray-700 mb-4">
                Planned
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Buffer:</span>
                  <span className="text-lg font-semibold text-purple-600">
                    ${buffer.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Total Income:</span>
                  <span className="text-lg font-semibold text-green-600">
                    ${totalIncome.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Total Expenses:</span>
                  <span className="text-lg font-semibold text-red-600">
                    ${totalExpenses.toFixed(2)}
                  </span>
                </div>
                <div className="border-t-2 border-gray-300 pt-3 mt-3">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-gray-900 text-sm">
                        Remaining:
                      </span>
                      <span
                        className={`text-2xl font-bold ${
                          isBalanced
                            ? "text-green-600"
                            : remainingToBudget > 0
                            ? "text-yellow-600"
                            : "text-red-600"
                        }`}
                      >
                        ${remainingToBudget.toFixed(2)}
                      </span>
                    </div>
                    {isBalanced && (
                      <p className="text-green-600 text-xs text-center">
                        ✓ Budget is balanced!
                      </p>
                    )}
                    {!isBalanced && remainingToBudget > 0 && (
                      <p className="text-yellow-600 text-xs text-center">
                        Unbudgeted income
                      </p>
                    )}
                    {!isBalanced && remainingToBudget < 0 && (
                      <p className="text-red-600 text-xs text-center">
                        Over budget!
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Actual Section */}
            <div>
              <h3 className="text-lg font-semibold text-gray-700 mb-4">
                Actual
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Buffer:</span>
                  <span className="text-lg font-semibold text-purple-600">
                    ${buffer.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Total Income:</span>
                  <span className="text-lg font-semibold text-green-600">
                    ${totalActualIncome.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Total Expenses:</span>
                  <span className="text-lg font-semibold text-red-600">
                    ${totalActualExpenses.toFixed(2)}
                  </span>
                </div>
                <div className="border-t-2 border-gray-300 pt-3 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-900 text-sm">
                      Remaining:
                    </span>
                    <span
                      className={`text-2xl font-bold ${
                        actualRemaining >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      ${actualRemaining.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Uncategorized Section */}
            {uncategorizedTxns.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-orange-600">
                    Uncategorized ({uncategorizedTxns.length})
                  </h4>
                  <button
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-600 disabled:opacity-50"
                  >
                    <FaSync className={isSyncing ? 'animate-spin' : ''} size={10} />
                    Sync
                  </button>
                </div>
                <div className="space-y-2">
                  {uncategorizedTxns.map((txn) => (
                    <div
                      key={txn.id}
                      className="bg-orange-50 border border-orange-100 rounded-lg p-2"
                    >
                      {assigningId === txn.id ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium truncate">{txn.merchant || txn.description}</span>
                            <span className={txn.type === 'income' ? 'text-green-600' : 'text-red-600'}>
                              {txn.type === 'income' ? '+' : '-'}${txn.amount.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <select
                              value={selectedBudgetItemId}
                              onChange={(e) => setSelectedBudgetItemId(e.target.value)}
                              className="flex-1 text-xs border rounded px-1 py-1"
                            >
                              <option value="">Select item...</option>
                              {getAllBudgetItems().map(({ category, items }) => (
                                <optgroup key={category} label={category}>
                                  {items.map(item => (
                                    <option key={item.id} value={item.id}>
                                      {item.name}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                            <button
                              onClick={() => handleAssign(txn.id)}
                              disabled={!selectedBudgetItemId}
                              className="p-1 text-green-600 hover:bg-green-100 rounded disabled:opacity-50"
                            >
                              <FaCheck size={12} />
                            </button>
                            <button
                              onClick={() => {
                                setAssigningId(null);
                                setSelectedBudgetItemId('');
                              }}
                              className="p-1 text-gray-500 hover:bg-gray-200 rounded"
                            >
                              <FaTimes size={12} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-500">{formatDate(txn.date)}</span>
                              {txn.status === 'pending' && (
                                <span className="text-[10px] bg-yellow-200 text-yellow-700 px-1 rounded">pending</span>
                              )}
                            </div>
                            <p className="text-sm text-gray-900 truncate">{txn.merchant || txn.description}</p>
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <span className={`text-sm font-medium ${txn.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                              {txn.type === 'income' ? '+' : '-'}${txn.amount.toFixed(2)}
                            </span>
                            <button
                              onClick={() => setAssigningId(txn.id)}
                              className="px-1.5 py-0.5 text-[10px] text-blue-600 bg-blue-50 hover:bg-blue-100 rounded"
                            >
                              Assign
                            </button>
                            <button
                              onClick={() => handleDeleteUncategorized(txn.id)}
                              className="p-0.5 text-red-400 hover:bg-red-100 rounded"
                            >
                              <FaTimes size={10} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sync button when no uncategorized transactions */}
            {uncategorizedTxns.length === 0 && (
              <div className="flex justify-end mb-2">
                <button
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-600 disabled:opacity-50"
                >
                  <FaSync className={isSyncing ? 'animate-spin' : ''} size={10} />
                  Sync Bank
                </button>
              </div>
            )}

            {/* Categorized Transactions */}
            {allTransactions.length > 0 && (
              <div>
                {uncategorizedTxns.length > 0 && (
                  <h4 className="text-sm font-semibold text-gray-600 mb-3">
                    Categorized ({allTransactions.length})
                  </h4>
                )}
                <div className="space-y-2">
                  {allTransactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="border-b border-gray-100 pb-2 last:border-0"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500">
                              {formatDate(transaction.date)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-900 truncate">
                            {transaction.merchant || transaction.description}
                          </p>
                        </div>
                        <span className="text-sm font-medium text-gray-900 ml-2">
                          ${Math.abs(transaction.amount).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {allTransactions.length === 0 && uncategorizedTxns.length === 0 && !isLoadingUncategorized && (
              <p className="text-gray-500 text-center py-8 text-sm">
                No transactions yet. Click &quot;Sync Bank&quot; to import.
              </p>
            )}

            {isLoadingUncategorized && uncategorizedTxns.length === 0 && allTransactions.length === 0 && (
              <p className="text-gray-500 text-center py-8 text-sm">
                Loading transactions...
              </p>
            )}

            {/* Deleted Transactions Section */}
            {deletedTxns.length > 0 && (
              <div className="mt-6 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowDeleted(!showDeleted)}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  <FaTrash size={12} />
                  <span>Deleted ({deletedTxns.length})</span>
                  <span className="text-xs">{showDeleted ? '▼' : '▶'}</span>
                </button>

                {showDeleted && (
                  <div className="mt-3 space-y-2">
                    {deletedTxns.map((txn) => (
                      <div
                        key={txn.id}
                        className="bg-gray-100 border border-gray-200 rounded-lg p-2 opacity-60"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-400">{formatDate(txn.date)}</span>
                            </div>
                            <p className="text-sm text-gray-500 truncate line-through">
                              {txn.merchant || txn.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <span className="text-sm text-gray-400 line-through">
                              ${txn.amount.toFixed(2)}
                            </span>
                            <button
                              onClick={() => handleRestoreTransaction(txn.id)}
                              className="p-1 text-green-600 hover:bg-green-100 rounded"
                              title="Restore"
                            >
                              <FaUndo size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
