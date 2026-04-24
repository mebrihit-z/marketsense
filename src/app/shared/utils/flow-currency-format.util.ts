/* eslint-disable */

/** One fraction digit, stable (avoids 184.80000000003-style float rendering). */
function formatOneDecimalString(n: number): string {
  return n.toFixed(1);
}

/**
 * Scaled mantissa for SI-style compact currency (base 1000): **one** fraction digit.
 * When half-up rounding would show **1000.0X** (e.g. 999,950 → $1000.0K), floor to the
 * same precision so the label does not read as the next full unit. We do **not** otherwise
 * cap by {@link absDollars}: e.g. $3.4B is normal rounding of ~$3.39B, not a claim to ≥ $3.4B.
 */
function formatCompactUsdMantissa(absDollars: number, divisor: number, suffix: string): string {
  const scaled = absDollars / divisor;
  const quantum = 10;
  let mantissa = Math.round(scaled * quantum) / quantum;
  if (mantissa >= 1000) {
    mantissa = Math.floor(scaled * quantum + 1e-9) / quantum;
  }
  return `$${formatOneDecimalString(mantissa)}${suffix}`;
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
    const rounded = Number.parseFloat(formatOneDecimalString(abs));
    const formatted = rounded.toLocaleString('en-US', {
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
