const DECIMAL = /^-?\d+(?:\.(\d{1,2}))?$/;

export function moneyToMinor(value: unknown): bigint {
  const text = String(value ?? "").trim();
  const match = DECIMAL.exec(text);
  if (!match) throw new Error("INVALID_MONEY_VALUE");
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -minor : minor;
}

export function minorToMoney(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

export function subtractMoney(left: unknown, right: unknown): string {
  return minorToMoney(moneyToMinor(left) - moneyToMinor(right));
}
