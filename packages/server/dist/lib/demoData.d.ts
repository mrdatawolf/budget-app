/**
 * Demo data for populating a sample budget during onboarding.
 *
 * Designed as a realistic mid-month snapshot:
 * - Buffer ($500) + Income ($5,000) = Total Available ($5,500)
 * - Total Planned Expenses = $5,500 (zero-based balanced)
 * - Mix of fully-spent, partially-spent, and untouched items
 * - Transaction dates spread across the 1st–18th of the month
 */
interface DemoTransaction {
    day: number;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    merchant?: string;
}
interface DemoItem {
    name: string;
    planned: number;
    transactions: DemoTransaction[];
}
export declare const DEMO_BUFFER = 500;
export declare const DEMO_DATA: Record<string, DemoItem[]>;
export {};
