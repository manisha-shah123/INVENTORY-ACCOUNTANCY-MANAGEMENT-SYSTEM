import { BS_MONTHS, adToBsSafe, bsToAdSafe, todayAdIso } from "./bsDate";

const pad = (n) => String(n).padStart(2, "0");

// BS month numbers in fiscal-year order: Shrawan .. Chaitra, Baishakh .. Ashadh
const FISCAL_MONTH_NUMBERS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];


const bsYearOf = (startYear, position) =>
  position < 9 ? startYear : startYear + 1;

export const monthName = (position) =>
  BS_MONTHS[FISCAL_MONTH_NUMBERS[position] - 1];

// Adds whole days to a YYYY-MM-DD string, in UTC so time zones can't shift it.
export const addDaysIso = (iso, days) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const quarter = (n) => {
  const from = (n - 1) * 3;
  return {
    value: `q${n}`,
    group: "quarter",
    label: `Quarter ${n}`,
    sub: `${monthName(from)} – ${monthName(from + 2)}`,
    from,
    to: from + 2,
  };
};

export const PERIOD_OPTIONS = [
  { value: "year", group: "year", label: "Full Year", sub: "", from: 0, to: 11 },
  quarter(1),
  quarter(2),
  quarter(3),
  quarter(4),
  ...Array.from({ length: 12 }, (_, position) => ({
    value: `m${position + 1}`,
    group: "month",
    label: monthName(position),
    sub: "",
    from: position,
    to: position,
  })),
];

export const fiscalYearLabel = (startYear) =>
  `${startYear}/${String(startYear + 1).slice(-2)}`;

// First day (AD) of the month at `position` of the fiscal year that starts in
// BS year `startYear`.
const monthStartAd = (startYear, position) =>
  bsToAdSafe(
    `${bsYearOf(startYear, position)}-${pad(FISCAL_MONTH_NUMBERS[position])}-01`,
  );

// Last day (AD) of the month at `position`: the day before the next month
// starts. Works for every month length without needing a calendar table.
const monthEndAd = (startYear, position) => {
  const nextStart =
    position === 11
      ? bsToAdSafe(`${startYear + 1}-04-01`)
      : monthStartAd(startYear, position + 1);
  return nextStart ? addDaysIso(nextStart, -1) : null;
};

// The BS year the current fiscal year started in.
export const currentFiscalStartYear = (todayIso = todayAdIso()) => {
  const bs = adToBsSafe(todayIso);
  if (!bs) return new Date(todayIso).getFullYear() + 57;
  const [year, month] = bs.split("-").map(Number);
  return month >= 4 ? year : year - 1;
};

export const fiscalYearOptions = (count = 8, todayIso = todayAdIso()) => {
  const current = currentFiscalStartYear(todayIso);
  return Array.from({ length: count }, (_, i) => {
    const startYear = current - i;
    return { value: startYear, label: fiscalYearLabel(startYear) };
  });
};

/**
 * @returns { ok: false, problem } when the period can't be shown, otherwise
 *   { ok: true, option, fyStart, periodStart, periodEnd, asOf, isPartial,
 *     prevAsOf, prevFyStart }
 *
 * `asOf` is the day the sheet is "as at". For a period that hasn't finished
 * yet it is today, since nothing later has been recorded.
 * `prevAsOf` / `prevFyStart` describe the period right before this one (null
 * when it can't be worked out); they feed the comparison column.
 */
export const resolvePeriod = (startYear, periodValue, todayIso = todayAdIso()) => {
  const option =
    PERIOD_OPTIONS.find((p) => p.value === periodValue) || PERIOD_OPTIONS[0];

  const fyStart = monthStartAd(startYear, 0);
  const periodStart = monthStartAd(startYear, option.from);
  const periodEnd = monthEndAd(startYear, option.to);

  if (!fyStart || !periodStart || !periodEnd) {
    return { ok: false, problem: "That fiscal year is outside the supported date range." };
  }
  if (periodStart > todayIso) {
    return { ok: false, problem: "This period has not started yet." };
  }

  const isPartial = periodEnd > todayIso;
  const asOf = isPartial ? todayIso : periodEnd;

  // The previous period ends the day before this one starts. It belongs to the
  // same fiscal year unless this period begins the fiscal year.
  const prevAsOf = addDaysIso(periodStart, -1);
  const prevFyStart =
    option.from === 0 ? monthStartAd(startYear - 1, 0) : fyStart;

  return {
    ok: true,
    option,
    fyStart,
    periodStart,
    periodEnd,
    asOf,
    isPartial,
    prevAsOf: prevFyStart ? prevAsOf : null,
    prevFyStart: prevFyStart || null,
  };
};
