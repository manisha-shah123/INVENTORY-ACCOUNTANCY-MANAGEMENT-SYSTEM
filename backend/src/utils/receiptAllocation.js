

// Round to 2 decimals. The trailing `+ 0` turns -0 into 0.
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100 + 0;

/**
 * Splits `amount` across invoices, oldest first (first-in-first-out).
 *
 * @param {Array<{id: any, due: number}>} invoices  Already sorted oldest-first.
 *        Only invoices with a positive due amount should be passed in.
 * @param {number} amount  The lump sum being paid.
 * @returns {Array<{id: any, dueBefore: number, amount: number, dueAfter: number}>}
 *          One line per invoice that receives money (invoices that get nothing
 *          are left out).
 */
const allocateFIFO = (invoices, amount) => {
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

module.exports = { round2, allocateFIFO };
