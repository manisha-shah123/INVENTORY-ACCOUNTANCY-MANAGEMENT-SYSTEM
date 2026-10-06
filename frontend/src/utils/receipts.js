// Round to 2 decimals (the trailing "+ 0" turns -0 into 0).
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100 + 0;

// 25086 -> "25,086.00"
export const formatAmount = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Preview of how a lump-sum payment is spread over unpaid invoices, oldest
 * first. This mirrors backend/src/utils/receiptAllocation.js so the form can
 * show the result live — the server always does the real calculation.
 *
 * @param {Array<{id: string, due: number}>} invoices oldest-first, due > 0
 * @param {number} amount
 */
export const allocateFIFO = (invoices, amount) => {
  let remaining = round2(amount);
  const lines = [];

  for (const inv of invoices) {
    if (remaining < 0.01) break;

    const dueBefore = round2(inv.due);
    if (dueBefore < 0.01) continue;

    const pay = round2(Math.min(remaining, dueBefore));
    lines.push({
      id: inv.id,
      dueBefore,
      amount: pay,
      dueAfter: round2(dueBefore - pay),
    });
    remaining = round2(remaining - pay);
  }

  return lines;
};

// "#1001" for one invoice, "#1001 (20,000.00), #1002 (30,000.00)" for several.
export const describeAppliedTo = (appliedTo = []) => {
  if (appliedTo.length === 0) return "—";
  if (appliedTo.length === 1) return `#${appliedTo[0].invoiceNumber}`;
  return appliedTo
    .map((a) => `#${a.invoiceNumber} (${formatAmount(a.amount)})`)
    .join(", ");
};
