const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseBusinessDate(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("INVALID_BUSINESS_DATE");
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
  }
  const text = String(value ?? "").slice(0, 10);
  const match = ISO_DATE.exec(text);
  if (!match) throw new Error("INVALID_BUSINESS_DATE");
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) {
    throw new Error("INVALID_BUSINESS_DATE");
  }
  return text;
}

export function formatDisplayDate(value: unknown): string {
  const [year, month, day] = parseBusinessDate(value).split("-");
  return `${day}/${month}/${year}`;
}

export function compareBusinessDates(left: unknown, right: unknown): number {
  return parseBusinessDate(left).localeCompare(parseBusinessDate(right));
}

export function assertExpectedPaymentDate(expected: unknown, periodStart: unknown, periodEnd: unknown): string {
  const paymentDate = parseBusinessDate(expected);
  if (compareBusinessDates(paymentDate, periodStart) < 0 || compareBusinessDates(paymentDate, periodEnd) > 0) {
    throw new Error("EXPECTED_PAYMENT_DATE_OUTSIDE_PERIOD");
  }
  return paymentDate;
}
