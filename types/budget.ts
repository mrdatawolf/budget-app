export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  budgetItemId: string;
}

export interface BudgetItem {
  id: string;
  name: string;
  planned: number;
  actual: number;
  transactions: Transaction[];
}

export interface BudgetCategory {
  id: string;
  name: string;
  items: BudgetItem[];
}

export type CategoryType =
  | 'income'
  | 'giving'
  | 'household'
  | 'transportation'
  | 'food'
  | 'personal'
  | 'insurance'
  | 'saving';

export interface Budget {
  month: number;
  year: number;
  categories: {
    income: BudgetCategory;
    giving: BudgetCategory;
    household: BudgetCategory;
    transportation: BudgetCategory;
    food: BudgetCategory;
    personal: BudgetCategory;
    insurance: BudgetCategory;
    saving: BudgetCategory;
  };
}