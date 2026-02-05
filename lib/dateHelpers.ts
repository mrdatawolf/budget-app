/**
 * Centralized date helpers to avoid UTC timezone issues.
 *
 * The core problem: `new Date("2026-02-06")` parses as UTC midnight,
 * which shifts to the previous day in timezones behind UTC (e.g., US).
 *
 * All "YYYY-MM-DD" date strings must be parsed as LOCAL dates using
 * `parseLocalDate()` before any display or arithmetic.
 */

/**
 * Parse a "YYYY-MM-DD" string as a LOCAL date (not UTC).
 * This prevents the off-by-one-day bug caused by UTC parsing.
 */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Get today's date as a "YYYY-MM-DD" string in the local timezone.
 * Use this instead of `new Date().toISOString().split('T')[0]` which
 * can return yesterday's date after midnight UTC but before midnight local.
 */
export function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a "YYYY-MM-DD" date string for display: "Feb 06"
 */
export function formatDateShort(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

/**
 * Format a "YYYY-MM-DD" date string for display: "Feb 6, 2026"
 */
export function formatDateLong(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Get the abbreviated month from a "YYYY-MM-DD" date string: "Feb"
 */
export function formatDateMonth(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short' });
}

/**
 * Get the day number from a "YYYY-MM-DD" date string: 6
 */
export function formatDateDay(dateStr: string): number {
  const date = parseLocalDate(dateStr);
  return date.getDate();
}

/**
 * Format a full ISO timestamp (with time) for display in local timezone.
 * Use for fields like `lastSyncedAt`, `createdAt`, etc.
 * Returns "Never" for null/undefined.
 */
export function formatTimestamp(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleString();
}

/**
 * Calculate the number of days between a "YYYY-MM-DD" due date and today.
 * Positive = future, negative = past, 0 = today.
 */
export function daysUntilDate(dateStr: string): number {
  const due = parseLocalDate(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diffTime = due.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Format a "YYYY-MM-DD" date string using the browser's default locale format.
 * Equivalent to `toLocaleDateString()` but timezone-safe.
 */
export function formatDateLocale(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString();
}

/**
 * Convert a Date object to a "YYYY-MM-DD" string using LOCAL date components.
 * Use this instead of `date.toISOString().slice(0, 10)` which can shift the day
 * when the local timezone is behind UTC.
 */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
