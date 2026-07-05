export type DateRangeValidationOptions = {
  maxDays?: number;
  allowEmpty?: boolean;
};

export type DateRangeValidationResult = {
  valid: boolean;
  message?: string;
  days?: number;
};

function parseDateOnly(value: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function daysBetweenInclusive(from: string, to: string): number | null {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  if (!start || !end) return null;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function validateDateRange(
  from: string,
  to: string,
  options: DateRangeValidationOptions = {},
): DateRangeValidationResult {
  const maxDays = options.maxDays ?? 366;
  if (!from || !to) {
    return options.allowEmpty
      ? { valid: true }
      : { valid: false, message: 'Select both From and To dates.' };
  }

  const days = daysBetweenInclusive(from, to);
  if (days === null) return { valid: false, message: 'Use valid dates in YYYY-MM-DD format.' };
  if (days <= 0) return { valid: false, message: 'The From date must be before or equal to the To date.' };
  if (days > maxDays) return { valid: false, message: `Date range cannot exceed ${maxDays} days.` };

  return { valid: true, days };
}

export function coerceDateInput(value: string, fallback: string): string {
  return parseDateOnly(value) ? value : fallback;
}
