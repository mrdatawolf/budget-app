"use client";

import { useState } from "react";
import { Budget, Transaction } from "@/types/budget";
import { FaChartPie, FaReceipt } from "react-icons/fa";

interface BudgetSummaryProps {
  budget: Budget;
}

export default function BudgetSummary({ budget }: BudgetSummaryProps) {
  const [activeTab, setActiveTab] = useState<"summary" | "transactions">(
    "summary"
  );
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
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
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
          <div className="space-y-2">
            {allTransactions.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No transactions yet
              </p>
            ) : (
              allTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="border-b border-gray-100 pb-3 mb-3 last:border-0"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {formatDate(transaction.date)}
                        </span>
                        <span className="text-base font-semibold text-gray-900">
                          {transaction.merchant || transaction.description}
                        </span>
                      </div>
                      {transaction.account && (
                        <div className="text-xs text-gray-500 mt-1">
                          {transaction.account}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-base font-semibold text-gray-900">
                        {transaction.amount < 0 ? "-" : ""}$
                        {Math.abs(transaction.amount).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
