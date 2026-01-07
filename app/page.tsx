'use client';

import { useState } from 'react';
import BudgetHeader from '@/components/BudgetHeader';
import BudgetSection from '@/components/BudgetSection';
import BudgetSummary from '@/components/BudgetSummary';
import { Budget } from '@/types/budget';

export default function Home() {
  const currentDate = new Date();
  const [budget, setBudget] = useState<Budget>({
    month: currentDate.getMonth(),
    year: currentDate.getFullYear(),
    categories: {
      income: { id: 'income', name: 'Income', items: [] },
      giving: { id: 'giving', name: 'Giving', items: [] },
      household: { id: 'household', name: 'Household', items: [] },
      transportation: { id: 'transportation', name: 'Transportation', items: [] },
      food: { id: 'food', name: 'Food', items: [] },
      personal: { id: 'personal', name: 'Personal', items: [] },
      insurance: { id: 'insurance', name: 'Insurance', items: [] },
      saving: { id: 'saving', name: 'Saving', items: [] },
    },
  });

  const handleMonthChange = (month: number, year: number) => {
    setBudget({ ...budget, month, year });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <BudgetHeader
          month={budget.month}
          year={budget.year}
          onMonthChange={handleMonthChange}
        />

        <div className="mt-8 space-y-6">
          <BudgetSection
            category={budget.categories.income}
            setBudget={setBudget}
            budget={budget}
            isIncome={true}
          />

          <BudgetSection
            category={budget.categories.giving}
            setBudget={setBudget}
            budget={budget}
          />

          <BudgetSection
            category={budget.categories.household}
            setBudget={setBudget}
            budget={budget}
          />

          <BudgetSection
            category={budget.categories.transportation}
            setBudget={setBudget}
            budget={budget}
          />

          <BudgetSection
            category={budget.categories.food}
            setBudget={setBudget}
            budget={budget}
          />

          <BudgetSection
            category={budget.categories.personal}
            setBudget={setBudget}
            budget={budget}
          />

          <BudgetSection
            category={budget.categories.insurance}
            setBudget={setBudget}
            budget={budget}
          />

          <BudgetSection
            category={budget.categories.saving}
            setBudget={setBudget}
            budget={budget}
          />

          <BudgetSummary budget={budget} />
        </div>
      </div>
    </div>
  );
}