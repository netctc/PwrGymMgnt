import { minorToMoney, moneyToMinor } from "./money";

export const PAYMENT_EVENT_TYPES = ["payment", "waive", "refund", "reversal"] as const;
export type PaymentEventType = typeof PAYMENT_EVENT_TYPES[number];

export type PaymentEvent = {
  type: PaymentEventType;
  amount: unknown;
};

export type InvoicePaymentSummary = {
  total: string;
  grossPaid: string;
  refunded: string;
  reversed: string;
  netPaid: string;
  waived: string;
  balanceDue: string;
  status: "pending" | "partial" | "paid" | "overdue" | "waived" | "refunded";
};

function positiveMinor(value: unknown) {
  const amount = moneyToMinor(value);
  if (amount <= 0n) throw new Error("PAYMENT_AMOUNT_MUST_BE_POSITIVE");
  return amount;
}

export function deriveInvoicePaymentSummary(input: {
  total: unknown;
  dueDate: string;
  today: string;
  events?: PaymentEvent[];
}): InvoicePaymentSummary {
  const total = moneyToMinor(input.total);
  if (total < 0n) throw new Error("INVOICE_TOTAL_CANNOT_BE_NEGATIVE");

  let grossPaid = 0n;
  let refunded = 0n;
  let reversed = 0n;
  let waived = 0n;
  for (const event of input.events || []) {
    const amount = positiveMinor(event.amount);
    if (event.type === "payment") grossPaid += amount;
    else if (event.type === "refund") refunded += amount;
    else if (event.type === "reversal") reversed += amount;
    else waived += amount;
  }
  if (refunded > grossPaid) throw new Error("REFUND_EXCEEDS_COLLECTED_AMOUNT");
  if (refunded + reversed > grossPaid) throw new Error("PAYMENT_ADJUSTMENTS_EXCEED_COLLECTED_AMOUNT");
  const netPaid = grossPaid - refunded - reversed;
  if (netPaid + waived > total) throw new Error("SETTLEMENT_EXCEEDS_INVOICE_TOTAL");
  const balanceDue = total - netPaid - waived;

  let status: InvoicePaymentSummary["status"];
  if (grossPaid > 0n && refunded === grossPaid && waived === 0n) status = "refunded";
  else if (balanceDue === 0n && waived > 0n) status = "waived";
  else if (balanceDue === 0n) status = "paid";
  else if (input.today > input.dueDate) status = "overdue";
  else if (netPaid + waived > 0n) status = "partial";
  else status = "pending";

  return {
    total: minorToMoney(total),
    grossPaid: minorToMoney(grossPaid),
    refunded: minorToMoney(refunded),
    reversed: minorToMoney(reversed),
    netPaid: minorToMoney(netPaid),
    waived: minorToMoney(waived),
    balanceDue: minorToMoney(balanceDue),
    status,
  };
}
