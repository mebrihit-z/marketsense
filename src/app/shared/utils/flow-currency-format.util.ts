/* eslint-disable */

/**
 * Formats a USD amount with $K / $M / $B for large magnitudes; smaller amounts stay as plain dollars.
 * Negative values (e.g. outflows) render as -$XM.
 */
export function formatFlowCurrencyUsd(valueDollars: number): string {
  if (valueDollars == null || !Number.isFinite(valueDollars)) return '$0';
  const sign = valueDollars < 0 ? '-' : '';
  const abs = Math.abs(valueDollars);
  /** Compact suffix (B/M/K) with thousands separators when the scaled value is large enough. */
  const fmtScaled = (scaled: number, suffix: string) =>
    `$${scaled.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}${suffix}`;
  let core: string;
  if (abs >= 1_000_000_000) {
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
 * Formats flow value in billions as full USD with grouping — no compact $B/$M rounding.
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
