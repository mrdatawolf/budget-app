/**
 * Shared helper functions used across multiple route handlers.
 * Extracted to avoid duplication.
 */
/**
 * Default budget category types with display names.
 * Used when creating new budgets or ensuring all default categories exist.
 */
export declare const CATEGORY_TYPES: {
    type: string;
    name: string;
}[];
/**
 * Calculate monthly contribution based on payment frequency.
 * Used by budgets, copy, and reset routes to determine planned amounts
 * for recurring payment budget items.
 */
export declare function getMonthlyContribution(amount: string | number, frequency: string): string;
