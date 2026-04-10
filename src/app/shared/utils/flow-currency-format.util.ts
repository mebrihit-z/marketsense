/* eslint-disable */

/**
 * Formats a USD amount with $K / $M / $B / $T for large magnitudes; smaller amounts stay as plain dollars.
 * Negative values (e.g. outflows) render as -$XM.
 */
export function formatFlowCurrencyUsd(valueDollars: number): string {
  if (valueDollars == null || !Number.isFinite(valueDollars)) return '$0';
  const sign = valueDollars < 0 ? '-' : '';
  const abs = Math.abs(valueDollars);
  /** Compact suffix (T/B/M/K) with thousands separators when the scaled value is large enough. */
  const fmtScaled = (scaled: number, suffix: string) =>
    `$${scaled.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}${suffix}`;
  let core: string;
  if (abs >= 1_000_000_000_000) {
    core = fmtScaled(abs / 1_000_000_000_000, 'T');
  } else if (abs >= 1_000_000_000) {
    core = fmtScaled(abs / 1_000_000_000, 'B');
  } else if (abs >= 1_000_000) {
    core = fmtScaled(abs / 1_000_000, 'M');
  } else if (abs >= 1_000) {
    core = fmtScaled(abs / 1_000, 'K');
  } else {
    const formatted = Number.isInteger(abs)
      ? abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
      : abs.toLocaleString('en-US', { maximumFractionDigits: 2 });
    core = `$${formatted}`;
  }
  return sign + core;
}

/**
 * Asset flow / Sankey / Treemap pipeline stores flow magnitudes in billions (see {@link convertAssetFlowsToSankey}).
 * Converts to dollars then applies {@link formatFlowCurrencyUsd}.
 */
export function formatFlowCurrencyFromBillions(billions: number): string {
  if (billions == null || !Number.isFinite(billions)) return '$0';
  return formatFlowCurrencyUsd(billions * 1_000_000_000);
}

/**
 * Formats flow value in billions as full USD with grouping — no compact $T/$B/$M rounding.
 * Intended for tooltips where the exact amount should be visible.
 */
export function formatFlowCurrencyFromBillionsFull(valueBillions: number): string {
  if (valueBillions == null || !Number.isFinite(valueBillions)) return '$0';
  const dollars = valueBillions * 1_000_000_000;
  const sign = dollars < 0 ? '-' : '';
  const abs = Math.abs(dollars);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 20,
  });
  return `${sign}$${formatted}`;
}

/**
 * Parses strings from {@link formatFlowCurrencyFromBillions} / {@link formatFlowCurrencyUsd} back to billions (signed).
 * Suffixes: T (trillion USD), B (billion USD), M, K; no suffix treats the number as plain USD.
 */
export function parseFlowDisplayValueToBillions(valueStr: string): number {
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
  let billions: number;
  switch (suffixLetter) {
    case 'T':
      billions = n * 1000;
      break;
    case 'B':
      billions = n;
      break;
    case 'M':
      billions = n / 1000;
      break;
    case 'K':
      billions = n / 1_000_000;
      break;
    default:
      billions = n / 1_000_000_000;
      break;
  }
  return sign * billions;
}
