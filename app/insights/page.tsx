'use client';

import { useState, useEffect, useCallback } from 'react';
import { FaChartLine, FaChartBar, FaChartPie } from 'react-icons/fa';
import DashboardLayout from '@/components/DashboardLayout';
import MonthlyReportModal from '@/components/MonthlyReportModal';
import { Budget } from '@/types/budget';
import { transformDbBudgetToAppBudget } from '@/lib/budgetHelpers';

export default function InsightsPage() {
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [budget, setBudget] = useState<Budget | null>(null);

  const fetchCurrentBudget = useCallback(async () => {
    const currentDate = new Date();
    const month = currentDate.getMonth();
    const year = currentDate.getFullYear();

    try {
      const response = await fetch(`/api/budgets?month=${month}&year=${year}`);
      const data = await response.json();
      const transformedBudget = transformDbBudgetToAppBudget(data);
      setBudget(transformedBudget);
    } catch (error) {
      console.error('Error fetching budget:', error);
    }
  }, []);

  useEffect(() => {
    fetchCurrentBudget();
  }, [fetchCurrentBudget]);

  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto bg-surface-secondary p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-text-primary mb-8">Insights</h1>

          {/* Monthly Summary Card */}
          <div className="bg-surface rounded-lg shadow p-6 mb-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-primary-light rounded-full flex items-center justify-center">
                <FaChartPie className="text-primary text-xl" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-text-primary">Monthly Summary</h2>
                <p className="text-text-secondary">Review your budget performance for the month</p>
              </div>
            </div>
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="w-full py-3 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors font-medium"
            >
              View Monthly Report
            </button>
          </div>

          {/* Coming Soon Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-surface rounded-lg shadow p-6 opacity-60">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-success-light rounded-full flex items-center justify-center">
                  <FaChartLine className="text-success text-xl" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">Spending Trends</h2>
                  <p className="text-text-secondary">Track your spending over time</p>
                </div>
              </div>
              <div className="text-center py-8 text-text-tertiary">
                <p className="font-medium">Coming Soon</p>
                <p className="text-sm">Graphs showing spending patterns across months</p>
              </div>
            </div>

            <div className="bg-surface rounded-lg shadow p-6 opacity-60">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-accent-purple-light rounded-full flex items-center justify-center">
                  <FaChartBar className="text-accent-purple text-xl" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">Category Analysis</h2>
                  <p className="text-text-secondary">Deep dive into category spending</p>
                </div>
              </div>
              <div className="text-center py-8 text-text-tertiary">
                <p className="font-medium">Coming Soon</p>
                <p className="text-sm">Detailed breakdowns by category</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Report Modal */}
      {budget && (
        <MonthlyReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          budget={budget}
        />
      )}
    </DashboardLayout>
  );
}
