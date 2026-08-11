const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

function validDateParts(year: number, month: number, day: number) {
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

/**
 * Formats any visible business date as dd/mm/yyyy.
 * API payloads and native date inputs continue using yyyy-mm-dd.
 */
export function formatDisplayDate(value?: string | Date | null): string {
  if (value === null || value === undefined || value === "") return "—";

  if (typeof value === "string") {
    const match = ISO_DATE_PREFIX.exec(value);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (!validDateParts(year, month, day)) return "—";
      return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
    }
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return `${String(parsed.getDate()).padStart(2, "0")}/${String(
    parsed.getMonth() + 1,
  ).padStart(2, "0")}/${parsed.getFullYear()}`;
}
