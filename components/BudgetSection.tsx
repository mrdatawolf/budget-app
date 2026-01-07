'use client';

import { useState } from 'react';
import { Budget, BudgetCategory, BudgetItem, Transaction } from '@/types/budget';
import TransactionModal from './TransactionModal';

interface BudgetSectionProps {
  category: BudgetCategory;
  setBudget: React.Dispatch<React.SetStateAction<Budget>>;
  budget: Budget;
  isIncome?: boolean;
}

export default function BudgetSection({ category, setBudget, budget, isIncome = false }: BudgetSectionProps) {
  const [newItemName, setNewItemName] = useState('');
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<BudgetItem | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const addItem = () => {
    if (!newItemName.trim()) return;

    const newItem: BudgetItem = {
      id: `${category.id}-${Date.now()}`,
      name: newItemName,
      planned: 0,
      actual: 0,
      transactions: [],
    };

    setBudget({
      ...budget,
      categories: {
        ...budget.categories,
        [category.id]: {
          ...category,
          items: [...category.items, newItem],
        },
      },
    });

    setNewItemName('');
    setIsAddingItem(false);
  };

  const updateItemPlanned = (itemId: string, value: number) => {
    const updatedItems = category.items.map(item =>
      item.id === itemId ? { ...item, planned: value } : item
    );

    setBudget({
      ...budget,
      categories: {
        ...budget.categories,
        [category.id]: {
          ...category,
          items: updatedItems,
        },
      },
    });
  };

  const addTransaction = (transaction: Omit<Transaction, 'id'>) => {
    const newTransaction: Transaction = {
      ...transaction,
      id: `trans-${Date.now()}`,
    };

    const updatedItems = category.items.map(item => {
      if (item.id === transaction.budgetItemId) {
        const updatedTransactions = [...item.transactions, newTransaction];
        const newActual = updatedTransactions.reduce((sum, t) => sum + t.amount, 0);
        return {
          ...item,
          transactions: updatedTransactions,
          actual: newActual,
        };
      }
      return item;
    });

    setBudget({
      ...budget,
      categories: {
        ...budget.categories,
        [category.id]: {
          ...category,
          items: updatedItems,
        },
      },
    });
  };

  const deleteTransaction = (itemId: string, transactionId: string) => {
    const updatedItems = category.items.map(item => {
      if (item.id === itemId) {
        const updatedTransactions = item.transactions.filter(t => t.id !== transactionId);
        const newActual = updatedTransactions.reduce((sum, t) => sum + t.amount, 0);
        return {
          ...item,
          transactions: updatedTransactions,
          actual: newActual,
        };
      }
      return item;
    });

    setBudget({
      ...budget,
      categories: {
        ...budget.categories,
        [category.id]: {
          ...category,
          items: updatedItems,
        },
      },
    });
  };

  const deleteItem = (itemId: string) => {
    const updatedItems = category.items.filter(item => item.id !== itemId);

    setBudget({
      ...budget,
      categories: {
        ...budget.categories,
        [category.id]: {
          ...category,
          items: updatedItems,
        },
      },
    });
  };

  const openTransactionModal = (item: BudgetItem) => {
    setSelectedItem(item);
    setIsTransactionModalOpen(true);
  };

  const toggleExpanded = (itemId: string) => {
    setExpandedItemId(expandedItemId === itemId ? null : itemId);
  };

  const totalPlanned = category.items.reduce((sum, item) => sum + item.planned, 0);
  const totalActual = category.items.reduce((sum, item) => sum + item.actual, 0);

  const bgColor = isIncome ? 'bg-green-50' : 'bg-white';
  const headerColor = isIncome ? 'bg-green-600' : 'bg-blue-600';

  return (
    <>
      <div className={`${bgColor} rounded-lg shadow-sm overflow-hidden`}>
        <div className={`${headerColor} px-6 py-4 flex items-center justify-between`}>
          <h2 className="text-xl font-semibold text-white">{category.name}</h2>
          <div className="flex gap-8 text-white">
            <div className="text-right">
              <div className="text-sm opacity-90">Planned</div>
              <div className="text-lg font-semibold">${totalPlanned.toFixed(2)}</div>
            </div>
            <div className="text-right">
              <div className="text-sm opacity-90">Actual</div>
              <div className="text-lg font-semibold">${totalActual.toFixed(2)}</div>
            </div>
          </div>
        </div>

        <div className="p-6">
          {category.items.length === 0 && !isAddingItem && (
            <p className="text-gray-500 text-center py-4">No items added yet</p>
          )}

          {category.items.length > 0 && (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-4 text-sm font-semibold text-gray-600 pb-2 border-b">
                <div className="col-span-5">Item</div>
                <div className="col-span-2 text-right">Planned</div>
                <div className="col-span-2 text-right">Actual</div>
                <div className="col-span-2 text-right">Difference</div>
                <div className="col-span-1"></div>
              </div>

              {category.items.map(item => {
                const difference = item.planned - item.actual;
                const isExpanded = expandedItemId === item.id;
                return (
                  <div key={item.id} className="border-b border-gray-100 last:border-0">
                    <div className="grid grid-cols-12 gap-4 items-center py-2 hover:bg-gray-50 rounded">
                      <div className="col-span-5 flex items-center gap-2">
                        {item.transactions.length > 0 && (
                          <button
                            onClick={() => toggleExpanded(item.id)}
                            className="text-gray-500 hover:text-gray-700"
                          >
                            {isExpanded ? '▼' : '▶'}
                          </button>
                        )}
                        <span className="font-medium text-gray-900">{item.name}</span>
                        {item.transactions.length > 0 && (
                          <span className="text-xs text-gray-500">
                            ({item.transactions.length})
                          </span>
                        )}
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          value={item.planned || ''}
                          onChange={(e) => updateItemPlanned(item.id, parseFloat(e.target.value) || 0)}
                          className="w-full text-right px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          step="0.01"
                        />
                      </div>
                      <div className="col-span-2">
                        <div className="text-right px-2 py-1 text-gray-700 font-medium">
                          ${item.actual.toFixed(2)}
                        </div>
                      </div>
                      <div className="col-span-2 text-right">
                        <span className={difference < 0 ? 'text-red-600' : 'text-green-600'}>
                          ${Math.abs(difference).toFixed(2)}
                        </span>
                      </div>
                      <div className="col-span-1 flex items-center justify-end gap-1">
                        <button
                          onClick={() => openTransactionModal(item)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          title="Add transaction"
                        >
                          +$
                        </button>
                        <button
                          onClick={() => deleteItem(item.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Delete item"
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    {isExpanded && item.transactions.length > 0 && (
                      <div className="ml-8 mb-3 bg-gray-50 rounded p-3">
                        <div className="text-xs font-semibold text-gray-600 mb-2">Transactions</div>
                        <div className="space-y-1">
                          {item.transactions.map(transaction => (
                            <div
                              key={transaction.id}
                              className="flex items-center justify-between text-sm py-1 hover:bg-white rounded px-2"
                            >
                              <div className="flex-1">
                                <span className="text-gray-600">
                                  {new Date(transaction.date).toLocaleDateString()}
                                </span>
                                <span className="ml-3 text-gray-900">{transaction.description}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">
                                  ${transaction.amount.toFixed(2)}
                                </span>
                                <button
                                  onClick={() => deleteTransaction(item.id, transaction.id)}
                                  className="text-red-600 hover:text-red-800 text-xs"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {isAddingItem && (
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addItem()}
                placeholder="Item name"
                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                onClick={addItem}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setIsAddingItem(false);
                  setNewItemName('');
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          )}

          {!isAddingItem && (
            <button
              onClick={() => setIsAddingItem(true)}
              className="mt-4 w-full py-2 border-2 border-dashed border-gray-300 rounded text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors"
            >
              + Add Item
            </button>
          )}
        </div>
      </div>

      {selectedItem && (
        <TransactionModal
          isOpen={isTransactionModalOpen}
          onClose={() => {
            setIsTransactionModalOpen(false);
            setSelectedItem(null);
          }}
          onAddTransaction={addTransaction}
          budgetItemId={selectedItem.id}
          budgetItemName={selectedItem.name}
        />
      )}
    </>
  );
}