/* eslint-disable */

/**
 * Formats a USD amount with $K / $M / $B for large magnitudes; smaller amounts stay as plain dollars.
 * Negative values (e.g. outflows) render as -$XM.
 */
export function formatFlowCurrencyUsd(valueDollars: number): string {
  if (valueDollars == null || !Number.isFinite(valueDollars)) return '$0';
  const sign = valueDollars < 0 ? '-' : '';
  const abs = Math.abs(valueDollars);
  let core: string;
  if (abs >= 1_000_000_000) {
    core = `$${(abs / 1_000_000_000).toFixed(1)}B`;
  } else if (abs >= 1_000_000) {
    core = `$${(abs / 1_000_000).toFixed(1)}M`;
  } else if (abs >= 1_000) {
    core = `$${(abs / 1_000).toFixed(1)}K`;
  } else {
    const formatted = Number.isInteger(abs)
      ? abs.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : abs.toLocaleString(undefined, { maximumFractionDigits: 2 });
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
