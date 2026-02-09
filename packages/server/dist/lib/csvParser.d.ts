import { CsvColumnMapping, CsvParseResult, DateFormat } from '@budget-app/shared/types';
/**
 * Parse CSV text into rows of key-value objects
 */
export declare function parseCsvText(csvText: string): {
    headers: string[];
    rows: Record<string, string>[];
};
/**
 * Auto-detect column mapping from headers
 */
export declare function detectColumnMapping(headers: string[]): Partial<CsvColumnMapping>;
/**
 * Detect date format from sample values
 */
export declare function detectDateFormat(samples: string[]): DateFormat | null;
/**
 * Parse a date string according to the specified format
 */
export declare function parseDate(dateStr: string, format: DateFormat): string | null;
/**
 * Parse an amount string, handling various formats
 */
export declare function parseAmount(value: string, options: {
    negativeInParentheses: boolean;
    thousandSeparator: string;
    decimalSeparator: string;
}): number | null;
/**
 * Compute a hash for deduplication
 */
export declare function computeTransactionHash(date: string, amount: number, description: string): string;
/**
 * Parse CSV content using the specified column mapping
 */
export declare function parseCsvWithMapping(csvText: string, mapping: CsvColumnMapping): CsvParseResult;
