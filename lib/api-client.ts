/**
 * Centralized API client for Budget App
 *
 * Provides typed methods for all API endpoints.
 * Automatically handles:
 * - Base URL configuration (local vs remote server)
 * - Authentication headers (when using remote server)
 * - Error handling and response parsing
 */

import type {
  Budget,
  Transaction,
  SplitTransaction,
  RecurringPayment,
  CategoryType,
  RecurringFrequency,
} from '@/types/budget';

// API Error class for structured error handling
export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body?: unknown
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}

// Get the API base URL from environment or default to relative path (same origin)
function getBaseUrl(): string {
  // In browser, check for environment variable
  if (typeof window !== 'undefined') {
    const envUrl = process.env.NEXT_PUBLIC_SERVER_URI;
    if (envUrl) {
      return envUrl;
    }
  }
  // Default to same origin (Next.js API routes during migration)
  return '';
}

// Auth token storage (used for remote server mode)
let authToken: string | null = null;

/**
 * Set the authentication token for remote API calls.
 * Not needed for local mode.
 */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

/**
 * Get current auth token.
 */
export function getAuthToken(): string | null {
  return authToken;
}

/**
 * Check if we're in local mode (no auth needed).
 */
export function isLocalMode(): boolean {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return true; // Same origin = local
  try {
    const url = new URL(baseUrl);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return true;
  }
}

/**
 * Make an API request with proper headers and error handling.
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add auth header for remote mode
  if (!isLocalMode() && authToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text();
    }
    throw new ApiError(response.status, response.statusText, body);
  }

  // Handle empty responses
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

// ============================================================================
// BUDGET API
// ============================================================================

export const budgetApi = {
  /**
   * Get budget for a specific month/year.
   * Creates a new budget if one doesn't exist.
   */
  async get(month: number, year: number): Promise<unknown> {
    return request(`/api/budgets?month=${month}&year=${year}`);
  },

  /**
   * Update budget (currently just buffer).
   */
  async update(id: string, data: { buffer?: number }): Promise<unknown> {
    return request('/api/budgets', {
      method: 'PUT',
      body: JSON.stringify({ id, ...data }),
    });
  },

  /**
   * Copy budget from a previous month.
   */
  async copy(fromMonth: number, fromYear: number, toMonth: number, toYear: number): Promise<unknown> {
    return request('/api/budgets/copy', {
      method: 'POST',
      body: JSON.stringify({ fromMonth, fromYear, toMonth, toYear }),
    });
  },

  /**
   * Reset budget (zero out or replace with previous month).
   */
  async reset(budgetId: string, mode: 'zero' | 'replace'): Promise<unknown> {
    return request('/api/budgets/reset', {
      method: 'POST',
      body: JSON.stringify({ budgetId, mode }),
    });
  },
};

// ============================================================================
// BUDGET CATEGORIES API
// ============================================================================

export const categoryApi = {
  /**
   * Create a new custom category.
   */
  async create(budgetId: string, name: string, emoji: string): Promise<unknown> {
    return request('/api/budget-categories', {
      method: 'POST',
      body: JSON.stringify({ budgetId, name, emoji }),
    });
  },

  /**
   * Delete a custom category.
   */
  async delete(id: string): Promise<void> {
    return request(`/api/budget-categories?id=${id}`, {
      method: 'DELETE',
    });
  },
};

// ============================================================================
// BUDGET ITEMS API
// ============================================================================

export const itemApi = {
  /**
   * Create a new budget item.
   */
  async create(categoryId: string, name: string, planned?: number): Promise<unknown> {
    return request('/api/budget-items', {
      method: 'POST',
      body: JSON.stringify({ categoryId, name, planned }),
    });
  },

  /**
   * Update a budget item.
   */
  async update(id: string, data: { name?: string; planned?: number }): Promise<unknown> {
    return request('/api/budget-items', {
      method: 'PUT',
      body: JSON.stringify({ id, ...data }),
    });
  },

  /**
   * Delete a budget item.
   */
  async delete(id: string): Promise<void> {
    return request(`/api/budget-items?id=${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Reorder items within a category.
   */
  async reorder(categoryId: string, itemIds: string[]): Promise<void> {
    return request('/api/budget-items/reorder', {
      method: 'POST',
      body: JSON.stringify({ categoryId, itemIds }),
    });
  },
};

// ============================================================================
// TRANSACTIONS API
// ============================================================================

export const transactionApi = {
  /**
   * Get all transactions (optionally filtered).
   */
  async list(filters?: { budgetItemId?: string }): Promise<Transaction[]> {
    const params = new URLSearchParams();
    if (filters?.budgetItemId) {
      params.set('budgetItemId', filters.budgetItemId);
    }
    const query = params.toString();
    return request(`/api/transactions${query ? `?${query}` : ''}`);
  },

  /**
   * Create a new transaction.
   */
  async create(data: {
    budgetItemId?: string;
    date: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    merchant?: string;
  }): Promise<Transaction> {
    return request('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update a transaction.
   */
  async update(id: string, data: Partial<{
    budgetItemId: string | null;
    date: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    merchant: string;
  }>): Promise<Transaction> {
    return request('/api/transactions', {
      method: 'PUT',
      body: JSON.stringify({ id, ...data }),
    });
  },

  /**
   * Soft delete a transaction.
   */
  async delete(id: string): Promise<void> {
    return request(`/api/transactions?id=${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Restore a soft-deleted transaction.
   */
  async restore(id: string): Promise<void> {
    return request('/api/transactions', {
      method: 'PATCH',
      body: JSON.stringify({ id, action: 'restore' }),
    });
  },

  /**
   * Batch assign transactions to a budget item.
   */
  async batchAssign(transactionIds: string[], budgetItemId: string): Promise<void> {
    return request('/api/transactions/batch-assign', {
      method: 'POST',
      body: JSON.stringify({ transactionIds, budgetItemId }),
    });
  },
};

// ============================================================================
// SPLIT TRANSACTIONS API
// ============================================================================

export const splitApi = {
  /**
   * Get splits for a transaction.
   */
  async list(parentTransactionId: string): Promise<SplitTransaction[]> {
    return request(`/api/transactions/split?parentTransactionId=${parentTransactionId}`);
  },

  /**
   * Create/update splits for a transaction.
   */
  async save(parentTransactionId: string, splits: { budgetItemId: string; amount: number; description?: string }[]): Promise<void> {
    return request('/api/transactions/split', {
      method: 'POST',
      body: JSON.stringify({ parentTransactionId, splits }),
    });
  },

  /**
   * Delete all splits for a transaction (unsplit).
   */
  async delete(parentTransactionId: string): Promise<void> {
    return request(`/api/transactions/split?parentTransactionId=${parentTransactionId}`, {
      method: 'DELETE',
    });
  },
};

// ============================================================================
// RECURRING PAYMENTS API
// ============================================================================

export const recurringApi = {
  /**
   * List all recurring payments.
   */
  async list(): Promise<RecurringPayment[]> {
    return request('/api/recurring-payments');
  },

  /**
   * Create a new recurring payment.
   */
  async create(data: {
    name: string;
    amount: string;
    frequency: RecurringFrequency;
    nextDueDate: string;
    categoryType?: CategoryType;
    budgetItemId?: string;
  }): Promise<RecurringPayment> {
    return request('/api/recurring-payments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update a recurring payment.
   */
  async update(id: string, data: Partial<{
    name: string;
    amount: string;
    frequency: RecurringFrequency;
    nextDueDate: string;
    categoryType: CategoryType;
  }>): Promise<RecurringPayment> {
    return request('/api/recurring-payments', {
      method: 'PUT',
      body: JSON.stringify({ id, ...data }),
    });
  },

  /**
   * Delete a recurring payment.
   */
  async delete(id: string): Promise<void> {
    return request(`/api/recurring-payments?id=${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Record a contribution to a recurring payment.
   */
  async contribute(id: string, amount: number): Promise<void> {
    return request('/api/recurring-payments/contribute', {
      method: 'POST',
      body: JSON.stringify({ id, amount }),
    });
  },

  /**
   * Reset a recurring payment (advance due date, clear funded amount).
   */
  async reset(id: string): Promise<void> {
    return request('/api/recurring-payments/reset', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  },
};

// ============================================================================
// TELLER (BANK INTEGRATION) API
// ============================================================================

export const tellerApi = {
  /**
   * List linked bank accounts.
   */
  async listAccounts(): Promise<unknown[]> {
    return request('/api/teller/accounts');
  },

  /**
   * Link a new bank account.
   */
  async linkAccount(enrollmentId: string, accessToken: string, accounts: unknown[]): Promise<void> {
    return request('/api/teller/accounts', {
      method: 'POST',
      body: JSON.stringify({ enrollmentId, accessToken, accounts }),
    });
  },

  /**
   * Unlink a bank account.
   */
  async unlinkAccount(id: string): Promise<void> {
    return request(`/api/teller/accounts?id=${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Get uncategorized transactions from linked accounts.
   */
  async getTransactions(month: number, year: number): Promise<unknown> {
    return request(`/api/teller/sync?month=${month}&year=${year}`);
  },

  /**
   * Sync transactions from linked accounts.
   */
  async syncTransactions(): Promise<unknown> {
    return request('/api/teller/sync', {
      method: 'POST',
    });
  },
};

// ============================================================================
// CSV IMPORT API
// ============================================================================

export const csvApi = {
  /**
   * List CSV accounts.
   */
  async listAccounts(): Promise<unknown[]> {
    return request('/api/csv/accounts');
  },

  /**
   * Create a CSV account.
   */
  async createAccount(data: {
    institutionName: string;
    accountName: string;
    accountType: string;
    accountSubtype: string;
  }): Promise<unknown> {
    return request('/api/csv/accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Preview CSV file.
   */
  async preview(accountId: string, csvText: string): Promise<unknown> {
    return request('/api/csv/preview', {
      method: 'POST',
      body: JSON.stringify({ accountId, csvText }),
    });
  },

  /**
   * Import transactions from CSV.
   */
  async import(accountId: string, csvText: string, mapping: unknown): Promise<unknown> {
    return request('/api/csv/import', {
      method: 'POST',
      body: JSON.stringify({ accountId, csvText, mapping }),
    });
  },
};

// ============================================================================
// ONBOARDING API
// ============================================================================

export const onboardingApi = {
  /**
   * Get onboarding status.
   */
  async getStatus(): Promise<{ completed: boolean; currentStep: number } | null> {
    return request('/api/onboarding');
  },

  /**
   * Initialize onboarding for new user.
   */
  async initialize(): Promise<void> {
    return request('/api/onboarding', {
      method: 'POST',
    });
  },

  /**
   * Update current step.
   */
  async updateStep(step: number): Promise<void> {
    return request('/api/onboarding', {
      method: 'PUT',
      body: JSON.stringify({ step }),
    });
  },

  /**
   * Complete or skip onboarding.
   */
  async finish(action: 'complete' | 'skip'): Promise<void> {
    return request('/api/onboarding', {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    });
  },
};

// ============================================================================
// DATABASE MANAGEMENT API
// ============================================================================

export const databaseApi = {
  /**
   * Get database status.
   */
  async getStatus(): Promise<{
    initialized: boolean;
    hasError: boolean;
    errorMessage: string | null;
    dbPath: string;
    backups: { path: string; timestamp: string }[];
  }> {
    return request('/api/database');
  },

  /**
   * Create a database backup.
   */
  async backup(): Promise<{ backupPath: string }> {
    return request('/api/database', {
      method: 'POST',
      body: JSON.stringify({ action: 'backup' }),
    });
  },

  /**
   * Restore from a backup.
   */
  async restore(backupPath: string): Promise<void> {
    return request('/api/database', {
      method: 'POST',
      body: JSON.stringify({ action: 'restore', backupPath }),
    });
  },

  /**
   * Delete the local database.
   */
  async delete(): Promise<{ backupPath: string }> {
    return request('/api/database', {
      method: 'DELETE',
    });
  },

  /**
   * Delete a specific backup.
   */
  async deleteBackup(backupPath: string): Promise<void> {
    return request('/api/database', {
      method: 'POST',
      body: JSON.stringify({ action: 'deleteBackup', backupPath }),
    });
  },
};

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * All API modules combined for easy import.
 * Usage: import { api } from '@/lib/api-client';
 *        await api.budget.get(0, 2026);
 */
export const api = {
  budget: budgetApi,
  category: categoryApi,
  item: itemApi,
  transaction: transactionApi,
  split: splitApi,
  recurring: recurringApi,
  teller: tellerApi,
  csv: csvApi,
  onboarding: onboardingApi,
  database: databaseApi,
};

export default api;
