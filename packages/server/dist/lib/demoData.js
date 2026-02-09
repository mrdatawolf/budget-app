/**
 * Demo data for populating a sample budget during onboarding.
 *
 * Designed as a realistic mid-month snapshot:
 * - Buffer ($500) + Income ($5,000) = Total Available ($5,500)
 * - Total Planned Expenses = $5,500 (zero-based balanced)
 * - Mix of fully-spent, partially-spent, and untouched items
 * - Transaction dates spread across the 1st–18th of the month
 */
export const DEMO_BUFFER = 500;
export const DEMO_DATA = {
    income: [
        {
            name: 'Paycheck',
            planned: 5000,
            transactions: [
                { day: 1, description: 'Paycheck - Direct Deposit', amount: 2500, type: 'income', merchant: 'Employer' },
                { day: 15, description: 'Paycheck - Direct Deposit', amount: 2500, type: 'income', merchant: 'Employer' },
            ],
        },
    ],
    giving: [
        {
            name: 'Charity',
            planned: 100,
            transactions: [
                { day: 5, description: 'Monthly donation - Habitat for Humanity', amount: 100, type: 'expense', merchant: 'Habitat for Humanity' },
            ],
        },
    ],
    household: [
        {
            name: 'Rent',
            planned: 1500,
            transactions: [
                { day: 1, description: 'Rent Payment - Oakwood Apartments', amount: 1500, type: 'expense', merchant: 'Oakwood Apartments' },
            ],
        },
        {
            name: 'Utilities',
            planned: 250,
            transactions: [
                { day: 8, description: 'Electric Bill - City Power', amount: 125, type: 'expense', merchant: 'City Power' },
                { day: 10, description: 'Water & Sewer - Municipal', amount: 62.50, type: 'expense', merchant: 'Municipal Water' },
            ],
        },
        {
            name: 'Internet',
            planned: 75,
            transactions: [
                { day: 12, description: 'Internet - Comcast', amount: 75, type: 'expense', merchant: 'Comcast' },
            ],
        },
        {
            name: 'Phone',
            planned: 85,
            transactions: [
                { day: 18, description: 'Cell Phone - T-Mobile', amount: 85, type: 'expense', merchant: 'T-Mobile' },
            ],
        },
    ],
    transportation: [
        {
            name: 'Gas',
            planned: 150,
            transactions: [
                { day: 3, description: 'Shell Gas Station', amount: 42.50, type: 'expense', merchant: 'Shell' },
                { day: 14, description: 'BP Gas Station', amount: 38.75, type: 'expense', merchant: 'BP' },
            ],
        },
        {
            name: 'Car Insurance',
            planned: 200,
            transactions: [
                { day: 15, description: 'Auto Insurance - GEICO', amount: 200, type: 'expense', merchant: 'GEICO' },
            ],
        },
        {
            name: 'Maintenance',
            planned: 50,
            transactions: [],
        },
    ],
    food: [
        {
            name: 'Groceries',
            planned: 500,
            transactions: [
                { day: 2, description: 'Kroger', amount: 127.43, type: 'expense', merchant: 'Kroger' },
                { day: 9, description: 'Walmart Grocery', amount: 89.67, type: 'expense', merchant: 'Walmart' },
                { day: 16, description: 'Aldi', amount: 63.21, type: 'expense', merchant: 'Aldi' },
            ],
        },
        {
            name: 'Restaurants',
            planned: 150,
            transactions: [
                { day: 4, description: 'Chipotle', amount: 14.25, type: 'expense', merchant: 'Chipotle' },
                { day: 11, description: 'Olive Garden', amount: 52.80, type: 'expense', merchant: 'Olive Garden' },
            ],
        },
        {
            name: 'Coffee',
            planned: 40,
            transactions: [
                { day: 3, description: 'Starbucks', amount: 6.45, type: 'expense', merchant: 'Starbucks' },
                { day: 10, description: 'Starbucks', amount: 5.90, type: 'expense', merchant: 'Starbucks' },
                { day: 17, description: 'Starbucks', amount: 6.45, type: 'expense', merchant: 'Starbucks' },
            ],
        },
    ],
    personal: [
        {
            name: 'Spending Money',
            planned: 150,
            transactions: [
                { day: 6, description: 'Amazon', amount: 34.99, type: 'expense', merchant: 'Amazon' },
                { day: 13, description: 'Target', amount: 22.47, type: 'expense', merchant: 'Target' },
            ],
        },
        {
            name: 'Subscriptions',
            planned: 45,
            transactions: [
                { day: 7, description: 'Netflix', amount: 15.49, type: 'expense', merchant: 'Netflix' },
                { day: 7, description: 'Spotify', amount: 10.99, type: 'expense', merchant: 'Spotify' },
            ],
        },
        {
            name: 'Haircut',
            planned: 30,
            transactions: [],
        },
    ],
    insurance: [
        {
            name: 'Health Insurance',
            planned: 350,
            transactions: [
                { day: 1, description: 'Health Insurance Premium - Blue Cross', amount: 350, type: 'expense', merchant: 'Blue Cross' },
            ],
        },
        {
            name: 'Life Insurance',
            planned: 25,
            transactions: [
                { day: 15, description: 'Term Life - Northwestern Mutual', amount: 25, type: 'expense', merchant: 'Northwestern Mutual' },
            ],
        },
    ],
    saving: [
        {
            name: 'Emergency Fund',
            planned: 500,
            transactions: [
                { day: 1, description: 'Transfer to Savings', amount: 500, type: 'expense', merchant: 'Savings Transfer' },
            ],
        },
        {
            name: 'Vacation Fund',
            planned: 200,
            transactions: [
                { day: 15, description: 'Transfer to Vacation Savings', amount: 200, type: 'expense', merchant: 'Savings Transfer' },
            ],
        },
        {
            name: 'Retirement (401k)',
            planned: 100,
            transactions: [],
        },
    ],
};
