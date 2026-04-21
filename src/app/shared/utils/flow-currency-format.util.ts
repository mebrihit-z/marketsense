/* eslint-disable */

const COMPACT_SCALE_EPS = 1e-6;

/**
 * Scaled mantissa for SI-style compact currency (base 1000): exactly **one** fraction digit.
 * If half-up rounding would imply more dollars than {@link absDollars}, uses floor at
 * 1 decimal instead so values like 999,950 do not become $1,000K.
 */
function formatCompactUsdMantissa(absDollars: number, divisor: number, suffix: string): string {
  const scaled = absDollars / divisor;
  const quantum = 10;
  let mantissa = Math.round(scaled * quantum) / quantum;
  if (mantissa * divisor > absDollars + COMPACT_SCALE_EPS) {
    mantissa = Math.floor(scaled * quantum + 1e-9) / quantum;
  }
  const num = mantissa.toLocaleString('en-US', {
    useGrouping: false,
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `$${num}${suffix}`;
}

/**
 * Formats a USD amount with $K / $M / $B / $T for large magnitudes; smaller amounts stay as plain dollars.
 * Negative values (e.g. outflows) render as -$XM.
 */
export function formatFlowCurrencyUsd(valueDollars: number): string {
  if (valueDollars == null || !Number.isFinite(valueDollars)) return '$0';
  if (valueDollars === 0) return '$0';
  const sign = valueDollars < 0 ? '-' : '';
  const abs = Math.abs(valueDollars);
  let core: string;
  if (abs >= 1_000_000_000_000) {
    core = formatCompactUsdMantissa(abs, 1_000_000_000_000, 'T');
  } else if (abs >= 1_000_000_000) {
    core = formatCompactUsdMantissa(abs, 1_000_000_000, 'B');
  } else if (abs >= 1_000_000) {
    core = formatCompactUsdMantissa(abs, 1_000_000, 'M');
  } else if (abs >= 1_000) {
    core = formatCompactUsdMantissa(abs, 1_000, 'K');
  } else {
    const formatted = abs.toLocaleString('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    core = `$${formatted}`;
  }
  return sign + core;
}

/**
 * Full grouped USD string (tooltips). {@link valueDollars} is the raw amount in dollars — no scaling.
 */
export function formatFlowCurrencyUsdFull(valueDollars: number): string {
  if (valueDollars == null || !Number.isFinite(valueDollars)) return '$0';
  const sign = valueDollars < 0 ? '-' : '';
  const abs = Math.abs(valueDollars);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 20,
  });
  return `${sign}$${formatted}`;
}

/**
 * @deprecated Prefer {@link formatFlowCurrencyUsd} with dollar amounts, or {@link formatFlowCurrencyUsdFull} for tooltips.
 * Kept for callers that still hold values in billions USD.
 */
export function formatFlowCurrencyFromBillions(billions: number): string {
  if (billions == null || !Number.isFinite(billions)) return '$0';
  return formatFlowCurrencyUsd(billions * 1_000_000_000);
}

/**
 * @deprecated Prefer {@link formatFlowCurrencyUsdFull} with dollar amounts.
 */
export function formatFlowCurrencyFromBillionsFull(valueBillions: number): string {
  if (valueBillions == null || !Number.isFinite(valueBillions)) return '$0';
  return formatFlowCurrencyUsdFull(valueBillions * 1_000_000_000);
}

/**
 * Parses compact currency display strings to **dollars** (signed). Plain numbers (no K/M/B/T) are dollars.
 */
export function parseFlowDisplayValueToDollars(valueStr: string): number {
  if (valueStr == null || typeof valueStr !== 'string') return NaN;
  let s = valueStr.trim();
  let sign = 1;
  if (s.startsWith('-')) {
    sign = -1;
    s = s.slice(1).trim();
  }
  s = s.replace(/^\$/, '').replace(/,/g, '').trim();
  if (!s) return NaN;
  const upper = s.toUpperCase();
  const suffixLetter = /[TBMK]$/i.test(upper) ? upper.slice(-1) : '';
  const numPart = suffixLetter ? upper.slice(0, -1).trim() : upper;
  const n = parseFloat(numPart);
  if (!Number.isFinite(n)) return NaN;
  let dollars: number;
  switch (suffixLetter) {
    case 'T':
      dollars = n * 1_000_000_000_000;
      break;
    case 'B':
      dollars = n * 1_000_000_000;
      break;
    case 'M':
      dollars = n * 1_000_000;
      break;
    case 'K':
      dollars = n * 1_000;
      break;
    default:
      dollars = n;
      break;
  }
  return sign * dollars;
}

/**
 * Parses display strings to billions USD (signed). Same as {@link parseFlowDisplayValueToDollars} / 1e9.
 */
export function parseFlowDisplayValueToBillions(valueStr: string): number {
  return parseFlowDisplayValueToDollars(valueStr) / 1_000_000_000;
}
