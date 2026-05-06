/**
 * Minimum drawable width / horizontal scroll-host floor for flow charts (Sankey, Treemap)
 * driven by Dimension 3 (leaf Source–Destination tier). Keeps dashboards consistent.
 */
export const FLOW_CHART_MIN_WIDTH_DIM3_NONE_PX = 960;
export const FLOW_CHART_MIN_WIDTH_DIM3_LEAF_PX = 1420;

/**
 * Viewport width (px) at and above which Sankey / Treemap use larger label typography.
 * Must stay aligned with `sankey.component.scss` `@media (min-width: 1921px)`.
 */
export const FLOW_CHART_LARGE_VIEWPORT_MIN_WIDTH_PX = 1921;
