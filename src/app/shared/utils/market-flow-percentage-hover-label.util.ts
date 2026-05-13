import type { HistoricDataAnchor } from './historic-time-horizon-anchor.util';
import { formatTimeHorizonSliderHandleDate } from './time-horizon-slider-tooltip-date.util';

/** Fields needed to build the % pill tooltip (cards + detail modal). */
export interface MarketFlowPercentageHoverHorizons {
  timeHorizon: string;
  timeHorizonStart?: string;
  timeHorizonEnd?: string;
}

/**
 * Same copy as the market-flow % pill: “between” dates from the slider, month-end style as
 * handle tooltips. Optional timeHorizonRange matches dashboard range when the card
 * fields are empty (e.g. detail only has range on the parent).
 */
export function buildMarketFlowPercentageHoverLabel(
  h: MarketFlowPercentageHoverHorizons,
  timeHorizonRange: { start: string; end: string } | null | undefined,
  anchor: HistoricDataAnchor | null
): string {
  const fmt = (x: string | undefined) =>
    x?.trim() ? formatTimeHorizonSliderHandleDate(x.trim(), anchor) : '';
  const startRaw =
    h.timeHorizonStart?.trim() || timeHorizonRange?.start?.trim() || undefined;
  const endRaw = h.timeHorizonEnd?.trim() || timeHorizonRange?.end?.trim() || undefined;
  const horizonRaw = (h.timeHorizon ?? '').trim();
  const startPoint = startRaw ? fmt(startRaw) : '';
  const endPoint = endRaw ? fmt(endRaw) : fmt(horizonRaw) || horizonRaw || 'selected';
  if (startPoint) {
    return `% change between ${startPoint} and ${endPoint}.`;
  }
  return `% for the period ending ${endPoint}.`;
}
