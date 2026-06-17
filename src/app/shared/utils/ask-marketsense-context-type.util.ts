import type {
  MarketFlowCard,
  MarketFlowCardLevel,
} from '../components/market-flows-carousel/market-flow-card/market-flow-card.component';

const AGGREGATION_LEVEL_LABELS: Record<MarketFlowCardLevel, string> = {
  'product-sub-type': 'Product Sub-Type',
  'product-type': 'Product Type',
};

/** Normalizes flow-dimension labels for Ask MarketSense banner copy. */
export function normalizeContextTypeLabel(label: string): string {
  const trimmed = label.trim();
  if (trimmed === 'Product Sub-Types') {
    return 'Product Sub-Type';
  }
  return trimmed;
}

export function contextTypeLabelForAggregationLevel(
  level: MarketFlowCardLevel | undefined
): string | null {
  if (!level) return null;
  return AGGREGATION_LEVEL_LABELS[level] ?? null;
}

export function resolveMarketFlowCardContextTypeLabel(
  card: MarketFlowCard | null | undefined
): string | null {
  if (!card) return null;
  const explicit = card.contextTypeLabel?.trim();
  if (explicit) {
    return normalizeContextTypeLabel(explicit);
  }
  return contextTypeLabelForAggregationLevel(card.aggregationLevel);
}

export function inferSankeyNodeContextTypeLabel(
  nodeName: string,
  dimensionLabels?: {
    dimension1Label?: string;
    dimension2Label?: string;
    dimension3Label?: string;
  }
): string {
  const dimension1 =
    normalizeContextTypeLabel(dimensionLabels?.dimension1Label?.trim() || 'Investor Region');
  const dimension2 =
    normalizeContextTypeLabel(dimensionLabels?.dimension2Label?.trim() || 'Product Type');
  const dimension3 =
    normalizeContextTypeLabel(dimensionLabels?.dimension3Label?.trim() || 'Product Sub-Type');

  if (nodeName.includes('(Super Start)') || nodeName.includes('(Super End)')) {
    return dimension1;
  }
  if (
    (nodeName.includes('(Start)') || nodeName.includes('(End)')) &&
    !nodeName.includes('Super')
  ) {
    return dimension2;
  }
  if (nodeName.includes('(Source)') || nodeName.includes('(Destination)')) {
    return dimension3;
  }
  if (nodeName.includes('Reallocation Pool')) {
    return 'Reallocation';
  }
  if (nodeName.includes('Capital In') || nodeName.includes('Capital Out')) {
    return dimension1;
  }
  return dimension2;
}
