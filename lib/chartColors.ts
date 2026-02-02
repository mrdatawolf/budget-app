import { DefaultCategoryType } from '@/types/budget';

// Category color mapping using design system colors
const categoryColorMap: Record<DefaultCategoryType, string> = {
  income: '#059669',        // primary
  giving: '#9333ea',        // accent-purple
  household: '#2563eb',     // info
  transportation: '#0891b2', // cyan-600
  food: '#16a34a',          // success
  personal: '#f97316',      // accent-orange
  insurance: '#eab308',     // warning
  saving: '#10b981',        // emerald-500
};

// Light color variants for backgrounds and highlights
const categoryLightMap: Record<DefaultCategoryType, string> = {
  income: '#ecfdf5',        // primary-light
  giving: '#faf5ff',        // accent-purple-light
  household: '#eff6ff',     // info-light
  transportation: '#ecfeff', // cyan-50
  food: '#f0fdf4',          // success-light
  personal: '#fff7ed',      // accent-orange-light
  insurance: '#fefce8',     // warning-light
  saving: '#d1fae5',        // emerald-100
};

// Category emoji mapping (for default categories)
const categoryEmojiMap: Record<DefaultCategoryType, string> = {
  income: '💰',
  giving: '🤲',
  household: '🏠',
  transportation: '🚗',
  food: '🍽️',
  personal: '👤',
  insurance: '🛡️',
  saving: '💵',
};

// Fallback colors for custom categories (cycle through these)
const CUSTOM_COLORS = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#ef4444', // red
  '#84cc16', // lime
];

const CUSTOM_LIGHT_COLORS = [
  '#eef2ff', '#fdf2f8', '#f0fdfa', '#fffbeb',
  '#f5f3ff', '#ecfeff', '#fef2f2', '#f7fee7',
];

function isDefaultCategory(key: string): key is DefaultCategoryType {
  return key in categoryColorMap;
}

function getCustomColorIndex(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % CUSTOM_COLORS.length;
}

/**
 * Get the primary color for a category
 */
export function getCategoryColor(categoryKey: string): string {
  if (isDefaultCategory(categoryKey)) return categoryColorMap[categoryKey];
  return CUSTOM_COLORS[getCustomColorIndex(categoryKey)];
}

/**
 * Get the light variant color for a category
 */
export function getCategoryLightColor(categoryKey: string): string {
  if (isDefaultCategory(categoryKey)) return categoryLightMap[categoryKey];
  return CUSTOM_LIGHT_COLORS[getCustomColorIndex(categoryKey)];
}

/**
 * Get the emoji for a category (uses stored emoji for custom, map for defaults)
 */
export function getCategoryEmoji(categoryKey: string, storedEmoji?: string | null): string {
  if (storedEmoji) return storedEmoji;
  if (isDefaultCategory(categoryKey)) return categoryEmojiMap[categoryKey];
  return '📋';
}
