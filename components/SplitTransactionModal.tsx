'use client';

import { useState, useEffect } from 'react';
import { BudgetItem } from '@/types/budget';
import { FaPlus, FaTimes } from 'react-icons/fa';

interface SplitItem {
  budgetItemId: string;
  amount: string;
  description: string;
}

interface SplitTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSplit: (splits: { budgetItemId: number; amount: number; description?: string }[]) => void;
  transactionId: number;
  transactionAmount: number;
  transactionDescription: string;
  budgetItems: { category: string; items: BudgetItem[] }[];
}

export default function SplitTransactionModal({
  isOpen,
  onClose,
  onSplit,
  transactionId,
  transactionAmount,
  transactionDescription,
  budgetItems,
}: SplitTransactionModalProps) {
  const [splits, setSplits] = useState<SplitItem[]>([
    { budgetItemId: '', amount: '', description: '' },
    { budgetItemId: '', amount: '', description: '' },
  ]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSplits([
        { budgetItemId: '', amount: '', description: '' },
        { budgetItemId: '', amount: '', description: '' },
      ]);
    }
  }, [isOpen]);

  const addSplit = () => {
    setSplits([...splits, { budgetItemId: '', amount: '', description: '' }]);
  };

  const removeSplit = (index: number) => {
    if (splits.length > 2) {
      setSplits(splits.filter((_, i) => i !== index));
    }
  };

  const updateSplit = (index: number, field: keyof SplitItem, value: string) => {
    const newSplits = [...splits];
    newSplits[index] = { ...newSplits[index], [field]: value };
    setSplits(newSplits);
  };

  const calculateRemaining = () => {
    const total = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
    return transactionAmount - total;
  };

  const applyRemainder = (index: number) => {
    const remaining = calculateRemaining();
    if (remaining > 0) {
      const currentAmount = parseFloat(splits[index].amount) || 0;
      updateSplit(index, 'amount', (currentAmount + remaining).toFixed(2));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Filter out empty splits and validate
    const validSplits = splits.filter(s => s.budgetItemId && parseFloat(s.amount) > 0);

    if (validSplits.length < 2) {
      alert('Please add at least 2 splits with amounts');
      return;
    }

    const remaining = calculateRemaining();
    if (Math.abs(remaining) > 0.01) {
      alert(`Split amounts must equal the transaction amount. Remaining: $${remaining.toFixed(2)}`);
      return;
    }

    onSplit(
      validSplits.map(s => ({
        budgetItemId: parseInt(s.budgetItemId),
        amount: parseFloat(s.amount),
        description: s.description || undefined,
      }))
    );
  };

  if (!isOpen) return null;

  const remaining = calculateRemaining();
  const isBalanced = Math.abs(remaining) < 0.01;

  return (
    <div className="fixed inset-0 bg-black/15 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Split Transaction</h2>
        <p className="text-gray-600 mb-4">{transactionDescription}</p>
        <div className="bg-gray-100 rounded-lg p-3 mb-6">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Total Amount:</span>
            <span className="text-xl font-bold text-gray-900">${transactionAmount.toFixed(2)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {splits.map((split, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Split {index + 1}</span>
                {splits.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeSplit(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <FaTimes size={14} />
                  </button>
                )}
              </div>

              {/* Budget Item */}
              <select
                value={split.budgetItemId}
                onChange={(e) => updateSplit(index, 'budgetItemId', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                required
              >
                <option value="">Select budget item...</option>
                {budgetItems.map((group) => (
                  <optgroup key={group.category} label={group.category}>
                    {group.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              {/* Amount */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={split.amount}
                    onChange={(e) => updateSplit(index, 'amount', e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    required
                  />
                </div>
                {remaining > 0.01 && (
                  <button
                    type="button"
                    onClick={() => applyRemainder(index)}
                    className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded whitespace-nowrap"
                  >
                    + Remainder
                  </button>
                )}
              </div>

              {/* Description (optional) */}
              <input
                type="text"
                value={split.description}
                onChange={(e) => updateSplit(index, 'description', e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          ))}

          {/* Add split button */}
          <button
            type="button"
            onClick={addSplit}
            className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:text-gray-600 flex items-center justify-center gap-2"
          >
            <FaPlus size={12} />
            Add Another Split
          </button>

          {/* Remaining indicator */}
          <div className={`p-3 rounded-lg ${isBalanced ? 'bg-green-50' : 'bg-yellow-50'}`}>
            <div className="flex justify-between items-center">
              <span className={isBalanced ? 'text-green-700' : 'text-yellow-700'}>
                {isBalanced ? 'Balanced!' : 'Remaining:'}
              </span>
              <span className={`font-bold ${isBalanced ? 'text-green-700' : 'text-yellow-700'}`}>
                ${remaining.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 mt-6">
            <button
              type="submit"
              disabled={!isBalanced}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Split Transaction
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
