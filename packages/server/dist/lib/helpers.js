/**
 * Shared helper functions used across multiple route handlers.
 * Extracted to avoid duplication.
 */
/**
 * Default budget category types with display names.
 * Used when creating new budgets or ensuring all default categories exist.
 */
export const CATEGORY_TYPES = [
    { type: 'income', name: 'Income' },
    { type: 'giving', name: 'Giving' },
    { type: 'household', name: 'Household' },
    { type: 'transportation', name: 'Transportation' },
    { type: 'food', name: 'Food' },
    { type: 'personal', name: 'Personal' },
    { type: 'insurance', name: 'Insurance' },
    { type: 'saving', name: 'Saving' },
];
/**
 * Calculate monthly contribution based on payment frequency.
 * Used by budgets, copy, and reset routes to determine planned amounts
 * for recurring payment budget items.
 */
export function getMonthlyContribution(amount, frequency) {
    const amt = typeof amount === 'string' ? parseFloat(amount) : amount;
    switch (frequency) {
        case 'weekly': return String(amt * 4);
        case 'bi-weekly': return String(amt * 2);
        case 'monthly': return String(amt);
        case 'quarterly': return String(amt / 3);
        case 'semi-annually': return String(amt / 6);
        case 'annually': return String(amt / 12);
        default: return String(amt);
    }
}
