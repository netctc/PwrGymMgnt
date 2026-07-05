/**
 * Unified date formatting for the entire application.
 * Standard display format: dd/MM/yyyy (e.g. 05/07/2026)
 * Standard datetime format: dd/MM/yyyy HH:mm (e.g. 05/07/2026 14:30)
 */

import { format as fnsFormat, parseISO } from 'date-fns';

/**
 * Parse a date value (string or Date) into a Date object.
 * Returns null for invalid values.
 */
function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = parseISO(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  // Fallback: try native Date constructor
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Format a date as dd/MM/yyyy (e.g. 05/07/2026)
 */
export function formatDate(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '—';
  return fnsFormat(date, 'dd/MM/yyyy');
}

/**
 * Format a datetime as dd/MM/yyyy HH:mm (e.g. 05/07/2026 14:30)
 */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '—';
  return fnsFormat(date, 'dd/MM/yyyy HH:mm');
}

/**
 * Format a time as HH:mm (e.g. 14:30)
 */
export function formatTime(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '—';
  return fnsFormat(date, 'HH:mm');
}

/**
 * Format a date as dd/MM/yyyy hh:mm a (e.g. 05/07/2026 02:30 PM)
 */
export function formatDateTime12h(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '—';
  return fnsFormat(date, 'dd/MM/yyyy hh:mm a');
}

/**
 * Format a time as hh:mm a (e.g. 02:30 PM)
 */
export function formatTime12h(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '—';
  return fnsFormat(date, 'hh:mm a');
}

/**
 * Format a short date display like "Mon, 05/07" for calendar headers.
 */
export function formatShortDate(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '—';
  return fnsFormat(date, 'EEE, dd/MM');
}

/**
 * Format the day number only (for calendar grids).
 */
export function formatDayNumber(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '';
  return fnsFormat(date, 'dd');
}

/**
 * Format the day-of-week abbreviation (for calendar headers).
 */
export function formatDayOfWeek(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '';
  return fnsFormat(date, 'EEE');
}

/**
 * Format a date range like "05/07/2026 – 11/07/2026"
 */
export function formatDateRange(from: string | Date | null | undefined, to: string | Date | null | undefined): string {
  return `${formatDate(from)} – ${formatDate(to)}`;
}
