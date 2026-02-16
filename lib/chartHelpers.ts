import { Budget } from '@/types/budget';
import { CategoryChartData, MonthlyTrendData, FlowData, FlowNode, FlowLink } from '@/types/chart';
import { getCategoryColor, getCategoryEmoji } from './chartColors';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Get expense category keys (everything except income) from a budget */
function getExpenseCategoryKeys(budget: Budget): string[] {
  return Object.keys(budget.categories).filter(key => key !== 'income');
}

/**
 * Transform a budget into category-level chart data
 * Excludes income category for expense-focused charts
 */
export function transformBudgetToCategoryData(budget: Budget | null): CategoryChartData[] {
  if (!budget) return [];

  return getExpenseCategoryKeys(budget).map((key) => {
    const category = budget.categories[key];
    const planned = category.items.reduce((sum, item) => sum + item.planned, 0);
    const actual = category.items.reduce((sum, item) => sum + item.actual, 0);

    return {
      key,
      name: category.name,
      emoji: getCategoryEmoji(key, category.emoji),
      planned,
      actual,
      color: getCategoryColor(key),
    };
  });
}

/**
 * Transform multiple budgets into time-series trend data
 * Returns monthly data points with spending per category
 */
export function transformBudgetsToTrendData(budgets: Budget[]): MonthlyTrendData[] {
  if (!budgets || budgets.length === 0) return [];

  return budgets.map((budget) => {
    const categories: Record<string, number> = {};

    getExpenseCategoryKeys(budget).forEach((key) => {
      const category = budget.categories[key];
      categories[key] = category.items.reduce((sum, item) => sum + item.actual, 0);
    });

    return {
      month: MONTH_NAMES[budget.month],
      year: budget.year,
      date: new Date(budget.year, budget.month, 1),
      categories,
    };
  });
}

/**
 * Transform multiple budgets into discretionary-only trend data
 * Excludes budget items linked to recurring payments
 */
export function transformBudgetsToDiscretionaryTrendData(budgets: Budget[]): MonthlyTrendData[] {
  if (!budgets || budgets.length === 0) return [];

  return budgets.map((budget) => {
    const categories: Record<string, number> = {};

    getExpenseCategoryKeys(budget).forEach((key) => {
      const category = budget.categories[key];
      categories[key] = category.items
        .filter((item) => !item.recurringPaymentId)
        .reduce((sum, item) => sum + item.actual, 0);
    });

    return {
      month: MONTH_NAMES[budget.month],
      year: budget.year,
      date: new Date(budget.year, budget.month, 1),
      categories,
    };
  });
}

/**
 * Transform a budget into 3-column flow diagram data (Sankey)
 */
export function transformBudgetToFlowData(budget: Budget | null): FlowData {
  if (!budget) {
    return { nodes: [], links: [] };
  }

  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];

  // --- Column 1: Income Sources ---
  const bufferAmount = budget.buffer || 0;
  const incomeCategory = budget.categories.income;
  const incomeItems = incomeCategory ? incomeCategory.items.filter((item) => item.actual > 0) : [];
  const totalIncome = incomeItems.reduce((sum, item) => sum + item.actual, 0);

  if (bufferAmount > 0) {
    nodes.push({
      id: 'source-buffer',
      label: '💼 Buffer',
      color: '#6b7280',
      column: 'source',
      lineItems: [{ name: 'Carried over', amount: bufferAmount }],
    });
  }

  if (totalIncome > 0) {
    nodes.push({
      id: 'source-income',
      label: '💰 Income',
      color: getCategoryColor('income'),
      column: 'source',
      lineItems: incomeItems.map((item) => ({ name: item.name, amount: item.actual })),
    });
  }

  const totalSources = bufferAmount + totalIncome;
  if (totalSources === 0) {
    return { nodes: [], links: [] };
  }

  // --- Column 2: Expense Categories ---
  const expenseKeys = getExpenseCategoryKeys(budget);

  const categoriesWithSpending = expenseKeys
    .map((key) => ({
      key,
      category: budget.categories[key],
      total: budget.categories[key].items.reduce((sum, item) => sum + item.actual, 0),
      items: budget.categories[key].items.filter((item) => item.actual > 0),
    }))
    .filter((c) => c.total > 0);

  if (categoriesWithSpending.length === 0) {
    return { nodes: [], links: [] };
  }

  categoriesWithSpending.forEach(({ key, category, items }) => {
    nodes.push({
      id: `category-${key}`,
      label: `${getCategoryEmoji(key, category.emoji)} ${category.name}`,
      color: getCategoryColor(key),
      column: 'category',
      lineItems: items.map((item) => ({ name: item.name, amount: item.actual })),
    });
  });

  // --- Column 3: Budget Items ---
  categoriesWithSpending.forEach(({ key, items }) => {
    items.forEach((item) => {
      nodes.push({
        id: `item-${item.id}`,
        label: item.name,
        color: getCategoryColor(key),
        column: 'item',
      });
    });
  });

  // --- Links: Sources → Categories ---
  const totalExpenses = categoriesWithSpending.reduce((sum, c) => sum + c.total, 0);
  const sourceNodes = nodes.filter((n) => n.column === 'source');

  sourceNodes.forEach((sourceNode) => {
    const sourceAmount = sourceNode.id === 'source-buffer' ? bufferAmount : totalIncome;

    categoriesWithSpending.forEach(({ key, total }) => {
      const proportion = total / totalExpenses;
      const flowAmount = Math.min(sourceAmount * proportion, total);

      if (flowAmount > 0.01) {
        links.push({
          source: sourceNode.id,
          target: `category-${key}`,
          value: flowAmount,
          color: getCategoryColor(key),
        });
      }
    });
  });

  // --- Links: Categories → Items ---
  categoriesWithSpending.forEach(({ key, items }) => {
    items.forEach((item) => {
      links.push({
        source: `category-${key}`,
        target: `item-${item.id}`,
        value: item.actual,
        color: getCategoryColor(key),
      });
    });
  });

  return { nodes, links };
}

/**
 * Transform a budget into discretionary-only flow diagram data (Sankey)
 * Excludes budget items linked to recurring payments (bills)
 * Source amounts are reduced by recurring spending to show only discretionary pool
 */
export function transformBudgetToDiscretionaryFlowData(budget: Budget | null): FlowData {
  if (!budget) {
    return { nodes: [], links: [] };
  }

  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];

  // Calculate total recurring spending to subtract from sources
  const expenseKeys = getExpenseCategoryKeys(budget);
  let totalRecurringSpending = 0;
  expenseKeys.forEach((key) => {
    budget.categories[key].items.forEach((item) => {
      if (item.recurringPaymentId && item.actual > 0) {
        totalRecurringSpending += item.actual;
      }
    });
  });

  // --- Column 1: Sources (net of recurring bills) ---
  const bufferAmount = budget.buffer || 0;
  const incomeCategory = budget.categories.income;
  const incomeItems = incomeCategory ? incomeCategory.items.filter((item) => item.actual > 0) : [];
  const totalIncome = incomeItems.reduce((sum, item) => sum + item.actual, 0);
  const totalSources = bufferAmount + totalIncome;

  if (totalSources === 0) {
    return { nodes: [], links: [] };
  }

  // Subtract recurring spending proportionally from sources
  const discretionaryPool = Math.max(0, totalSources - totalRecurringSpending);
  if (discretionaryPool === 0) {
    return { nodes: [], links: [] };
  }

  const recurringRatio = discretionaryPool / totalSources;
  const discretionaryBuffer = bufferAmount * recurringRatio;
  const discretionaryIncome = totalIncome * recurringRatio;

  if (discretionaryBuffer > 0.01) {
    nodes.push({
      id: 'source-buffer',
      label: '💼 Buffer',
      color: '#6b7280',
      column: 'source',
      lineItems: [{ name: 'After recurring bills', amount: discretionaryBuffer }],
    });
  }

  if (discretionaryIncome > 0.01) {
    nodes.push({
      id: 'source-income',
      label: '💰 Income',
      color: getCategoryColor('income'),
      column: 'source',
      lineItems: [{ name: 'After recurring bills', amount: discretionaryIncome }],
    });
  }

  // --- Column 2: Expense Categories (discretionary items only) ---
  const categoriesWithSpending = expenseKeys
    .map((key) => {
      const discretionaryItems = budget.categories[key].items.filter(
        (item) => !item.recurringPaymentId && item.actual > 0
      );
      return {
        key,
        category: budget.categories[key],
        total: discretionaryItems.reduce((sum, item) => sum + item.actual, 0),
        items: discretionaryItems,
      };
    })
    .filter((c) => c.total > 0);

  if (categoriesWithSpending.length === 0) {
    return { nodes: [], links: [] };
  }

  categoriesWithSpending.forEach(({ key, category, items }) => {
    nodes.push({
      id: `category-${key}`,
      label: `${getCategoryEmoji(key, category.emoji)} ${category.name}`,
      color: getCategoryColor(key),
      column: 'category',
      lineItems: items.map((item) => ({ name: item.name, amount: item.actual })),
    });
  });

  // --- Column 3: Budget Items ---
  categoriesWithSpending.forEach(({ key, items }) => {
    items.forEach((item) => {
      nodes.push({
        id: `item-${item.id}`,
        label: item.name,
        color: getCategoryColor(key),
        column: 'item',
      });
    });
  });

  // --- Links: Sources → Categories ---
  const totalDiscretionaryExpenses = categoriesWithSpending.reduce((sum, c) => sum + c.total, 0);
  const sourceNodes = nodes.filter((n) => n.column === 'source');

  sourceNodes.forEach((sourceNode) => {
    const sourceAmount = sourceNode.id === 'source-buffer' ? discretionaryBuffer : discretionaryIncome;

    categoriesWithSpending.forEach(({ key, total }) => {
      const proportion = total / totalDiscretionaryExpenses;
      const flowAmount = Math.min(sourceAmount * proportion, total);

      if (flowAmount > 0.01) {
        links.push({
          source: sourceNode.id,
          target: `category-${key}`,
          value: flowAmount,
          color: getCategoryColor(key),
        });
      }
    });
  });

  // --- Links: Categories → Items ---
  categoriesWithSpending.forEach(({ key, items }) => {
    items.forEach((item) => {
      links.push({
        source: `category-${key}`,
        target: `item-${item.id}`,
        value: item.actual,
        color: getCategoryColor(key),
      });
    });
  });

  return { nodes, links };
}

/**
 * Check if budget has discretionary spending (non-recurring items with actuals)
 */
export function hasDiscretionarySpending(budget: Budget | null): boolean {
  if (!budget) return false;
  return getExpenseCategoryKeys(budget).some((key) => {
    return budget.categories[key].items.some(
      (item) => !item.recurringPaymentId && item.actual > 0
    );
  });
}

/**
 * Check if budget has sufficient transaction data
 */
export function hasTransactionData(budget: Budget | null): boolean {
  if (!budget) return false;
  return getExpenseCategoryKeys(budget).some((key) => {
    return budget.categories[key].items.some((item) => item.actual > 0);
  });
}

/**
 * Check if budget has both income and expenses (for flow diagram)
 */
export function hasIncomeAndExpenses(budget: Budget | null): boolean {
  if (!budget) return false;
  const incomeCategory = budget.categories.income;
  const hasIncome = incomeCategory ? incomeCategory.items.some((item) => item.actual > 0) : false;
  const hasExpenses = getExpenseCategoryKeys(budget).some((key) => {
    return budget.categories[key].items.some((item) => item.actual > 0);
  });
  return hasIncome && hasExpenses;
}
