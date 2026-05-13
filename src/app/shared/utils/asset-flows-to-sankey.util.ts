/* eslint-disable max-lines -- Sankey pipeline kept in one module; split is a larger refactor */
/* eslint-disable max-lines-per-function -- convertAssetFlowsToSankey is one sequential graph build */
/**
 * Utility to convert asset-flows-data.json format to Sankey diagram data
 */

export interface AssetFlowRecord {
  Model_Run_Date?: string;
  Model_Version?: string;
  /** From `model_type` in source JSON (e.g. Historic, Forecast). */
  Model_Type?: string;
  Load_Date?: string;
  Latest?: string;
  Investor_Region: string;
  /** @deprecated Use Plan_Type (from plan_type in JSON) */
  Investor_Types?: string;
  Plan_Type?: string;
  Sec_Type?: string;
  Product_Region?: string;
  Product_Type: string;
  Product_Sub_Type: string;
  Asset_Flow_Date?: string;
  /** Flow magnitude in USD (same numeric unit end-to-end; compact K/M/B/T is display-only). */
  Asset_Flow_Value: number;
  /** Client count for this row (from `n_clients` in source JSON). */
  N_Clients?: number;
  /** Forecast prediction interval (USD), when present in source data. */
  Fcst_Flow_Upper?: number;
  Fcst_Flow_Lower?: number;
}

// Supported fields that can be used as Sankey dimensions
export type AssetFlowDimensionField =
  | 'Investor_Region'
  | 'Plan_Type'
  | 'Product_Region'
  | 'Product_Type'
  | 'Product_Sub_Type';

// Configuration for which fields drive the Sankey hierarchy
export interface SankeyDimensionConfig {
  /**
   * Top-level grouping (e.g. Investor_Region or Plan_Type)
   */
  superField: AssetFlowDimensionField;
  /**
   * Mid-level grouping (e.g. Product_Type or Product_Region)
   */
  parentField: AssetFlowDimensionField;
  /**
   * Leaf grouping (e.g. Product_Sub_Type). Use 'none' for super + parent only (no leaf nodes).
   */
  subField: AssetFlowDimensionField | 'none';
}

/** Raw record shape from asset-flows-data.json (snake_case, MongoDB-style $date/$numberLong) */
export interface RawAssetFlowRecord {
  latest?: string;
  investor_region?: string;
  plan_type?: string;
  product_region?: string;
  product_type?: string;
  product_sub_type?: string;
  asset_flow_date?: string | { $date: string };
  asset_flow_value?: number | { $numberLong: string };
  [key: string]: unknown;
}

/**
 * Unwraps a numeric value that may be a plain `number` or a MongoDB-style
 * `{ $numberLong: string }` envelope. Returns 0 for nullish or invalid input.
 *
 * @param {number | { $numberLong: string } | undefined | null} v Raw value from JSON.
 * @returns {number} A finite number, or 0 when the input is missing or unparseable.
 */
function unwrapValue(v: number | { $numberLong: string } | undefined | null): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'object' && v !== null && '$numberLong' in v) {
    const val = (v as { $numberLong: string }).$numberLong;
    const n = typeof val === 'string' ? Number(val) : Number.NaN;
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

/**
 * Unwraps a date that may be a plain ISO string or a MongoDB-style
 * `{ $date: string }` envelope.
 *
 * @param {string | { $date: string } | undefined | null} d Raw date value from JSON.
 * @returns {string | undefined} ISO date string, or `undefined` when missing/invalid.
 */
function unwrapDate(d: string | { $date: string } | undefined | null): string | undefined {
  if (d === undefined || d === null) return undefined;
  if (typeof d === 'string') return d;
  if (typeof d === 'object' && d !== null && '$date' in d) {
    const dateVal = (d as { $date: string }).$date;
    return typeof dateVal === 'string' ? dateVal : undefined;
  }
  return undefined;
}

/**
 * Reads a required string field from a record, accepting either `snake_case` or
 * `PascalCase` keys (snake_case takes precedence).
 *
 * @param {Object} r Source record (raw or normalized).
 * @param {string} snake snake_case key (preferred lookup).
 * @param {string} pascal PascalCase key (fallback lookup).
 * @returns {string} The matched string value, or an empty string when absent/non-string.
 */
function getStr(r: Record<string, unknown>, snake: string, pascal: string): string {
  const v = r[snake] ?? r[pascal];
  return typeof v === 'string' ? v : '';
}

/**
 * Reads an optional string field from a record, accepting either `snake_case` or
 * `PascalCase` keys (snake_case takes precedence).
 *
 * @param {Object} r Source record (raw or normalized).
 * @param {string} snake snake_case key (preferred lookup).
 * @param {string} pascal PascalCase key (fallback lookup).
 * @returns {string | undefined} The matched string value, or `undefined` when absent/non-string.
 */
function getStrOpt(r: Record<string, unknown>, snake: string, pascal: string): string | undefined {
  const v = r[snake] ?? r[pascal];
  return typeof v === 'string' ? v : undefined;
}

/**
 * Resolves `Asset_Flow_Date` and `Asset_Flow_Value` from a raw record, unwrapping
 * MongoDB-style `{ $date }` / `{ $numberLong }` envelopes and falling back to
 * already-primitive values when the envelope is absent.
 *
 * @param {Object} r Source record (PascalCase or snake_case keys accepted).
 * @returns {{ dateFinal: (string | undefined), valueFinal: number }} Resolved values.
 */
function extractAssetFlowDateAndValue(
  r: Record<string, unknown>
): { dateFinal: string | undefined; valueFinal: number } {
  const dateRaw = r['asset_flow_date'] ?? r['Asset_Flow_Date'];
  const valueRaw = r['asset_flow_value'] ?? r['Asset_Flow_Value'];

  let dateFinal = unwrapDate(dateRaw as string | { $date: string } | undefined);
  if (dateFinal === undefined && typeof dateRaw === 'string') {
    dateFinal = dateRaw;
  }

  let valueFinal = unwrapValue(valueRaw as number | { $numberLong: string } | undefined);
  if (valueFinal === 0 && typeof valueRaw === 'number') {
    valueFinal = valueRaw;
  }

  return { dateFinal, valueFinal };
}

/**
 * Resolves `Load_Date` from a raw record, unwrapping MongoDB-style `{ $date }`
 * envelopes and falling back to already-primitive strings.
 *
 * @param {Object} r Source record.
 * @returns {string | undefined} Load date string, or `undefined` when missing.
 */
function extractLoadDate(r: Record<string, unknown>): string | undefined {
  const raw = r['load_date'] ?? r['Load_Date'];
  const unwrapped = unwrapDate(raw as string | { $date: string } | undefined);
  if (unwrapped !== undefined) return unwrapped;
  return typeof raw === 'string' ? raw : undefined;
}

/**
 * Resolves the per-row client count from a raw record. Accepts plain numbers and
 * MongoDB-style `{ $numberLong }` envelopes; clamps to a non-negative integer.
 *
 * @param {Object} r Source record.
 * @returns {number | undefined} Client count, or `undefined` when unknown.
 */
function extractNClients(r: Record<string, unknown>): number | undefined {
  const raw = r['n_clients'] ?? r['N_Clients'];
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.round(raw));
  }
  if (raw === undefined || raw === null) return undefined;
  const u = unwrapValue(raw as number | { $numberLong: string });
  return Number.isFinite(u) && u >= 0 ? Math.round(u) : undefined;
}

/**
 * Resolves the forecast prediction interval (upper/lower) from a raw record. Returns
 * `null` when either bound is missing so callers can omit the fields entirely.
 *
 * @param {Object} r Source record.
 * @returns {{ fcstUpper: number, fcstLower: number } | null} Interval, or `null`.
 */
function extractFcstInterval(
  r: Record<string, unknown>
): { fcstUpper: number; fcstLower: number } | null {
  const u = r['fcst_flow_upper'] ?? r['Fcst_Flow_Upper'];
  const l = r['fcst_flow_lower'] ?? r['Fcst_Flow_Lower'];
  if (u === undefined || u === null || l === undefined || l === null) return null;
  return {
    fcstUpper: unwrapValue(u as number | { $numberLong: string }),
    fcstLower: unwrapValue(l as number | { $numberLong: string }),
  };
}

/**
 * Normalizes a raw asset flow record from JSON (snake_case, `$date`/`$numberLong`) to
 * an `AssetFlowRecord`. Handles both MongoDB-style payloads and already-normalized
 * records (so calling this twice is idempotent).
 *
 * @param {import('./asset-flows-to-sankey.util').RawAssetFlowRecord | import('./asset-flows-to-sankey.util').AssetFlowRecord} raw Raw or already-normalized record.
 * @returns {import('./asset-flows-to-sankey.util').AssetFlowRecord} Canonical record with PascalCase keys and unwrapped values.
 */
export function normalizeAssetFlowRecord(raw: RawAssetFlowRecord | AssetFlowRecord): AssetFlowRecord {
  const r = raw as Record<string, unknown>;
  const { dateFinal, valueFinal } = extractAssetFlowDateAndValue(r);
  const nClients = extractNClients(r);
  const fcst = extractFcstInterval(r);
  const planType =
    getStrOpt(r, 'plan_type', 'Plan_Type') ?? getStrOpt(r, 'Investor_Types', 'Investor_Types');

  return {
    Model_Run_Date: (r['model_run_date'] ?? r['Model_Run_Date']) as string | undefined,
    Model_Version: (r['model_version'] ?? r['Model_Version']) as string | undefined,
    Model_Type: getStrOpt(r, 'model_type', 'Model_Type'),
    Load_Date: extractLoadDate(r),
    Latest: getStrOpt(r, 'latest', 'Latest'),
    Investor_Region: getStr(r, 'investor_region', 'Investor_Region'),
    Plan_Type: planType,
    Investor_Types: planType,
    Sec_Type: (r['sec_type'] ?? r['Sec_Type']) as string | undefined,
    Product_Region: getStrOpt(r, 'product_region', 'Product_Region'),
    Product_Type: getStr(r, 'product_type', 'Product_Type'),
    Product_Sub_Type: getStr(r, 'product_sub_type', 'Product_Sub_Type'),
    Asset_Flow_Date: dateFinal,
    Asset_Flow_Value: valueFinal,
    ...(nClients !== undefined ? { N_Clients: nClients } : {}),
    ...(fcst ? { Fcst_Flow_Upper: fcst.fcstUpper, Fcst_Flow_Lower: fcst.fcstLower } : {}),
  };
}

/**
 * Normalizes an array of raw asset flow records (e.g. from `asset-flows-data.json`)
 * and keeps only the rows flagged as the latest snapshot (`Latest === 'Y'`).
 *
 * @param {(import('./asset-flows-to-sankey.util').RawAssetFlowRecord | import('./asset-flows-to-sankey.util').AssetFlowRecord)[]} raw Source rows to normalize.
 * @returns {import('./asset-flows-to-sankey.util').AssetFlowRecord[]} Normalized rows, filtered to the latest snapshot.
 */
export function normalizeAssetFlowsData(raw: (RawAssetFlowRecord | AssetFlowRecord)[]): AssetFlowRecord[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map(normalizeAssetFlowRecord)
    .filter((row) => (row.Latest ?? '').trim().toUpperCase() === 'Y');
}

/**
 * Parses an ISO date string to a millisecond timestamp.
 *
 * @param {string | undefined} iso ISO date string.
 * @returns {number} Millisecond timestamp, or 0 when the input is missing/invalid.
 */
function parseAssetFlowTimestamp(iso?: string): number {
  if (!iso || typeof iso !== 'string') return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** Footer copy for disclosure / information modals: same source row for date and version. */
export interface AssetFlowDisclosureMeta {
  loadDate: string | null;
  modelVersion: string | null;
}

/** Alias for UI components (same shape as `AssetFlowDisclosureMeta`). */
export type DisclosureFooterData = AssetFlowDisclosureMeta;

/**
 * Computes the disclosure-ranking score for a row (the greatest known timestamp
 * across `Load_Date`, `Model_Run_Date`, and `Asset_Flow_Date`).
 *
 * @param {import('./asset-flows-to-sankey.util').AssetFlowRecord} r Row to score.
 * @returns {number} Score in milliseconds; 0 when no timestamp is parseable.
 */
function disclosureRowScore(r: AssetFlowRecord): number {
  return Math.max(
    parseAssetFlowTimestamp(r.Load_Date),
    parseAssetFlowTimestamp(r.Model_Run_Date),
    parseAssetFlowTimestamp(r.Asset_Flow_Date)
  );
}

/**
 * Picks the most representative row for disclosure copy. Prefers rows marked
 * `Latest === 'Y'`, then chooses the one with the greatest `Load_Date`,
 * `Model_Run_Date`, or `Asset_Flow_Date` timestamp.
 *
 * @param {import('./asset-flows-to-sankey.util').AssetFlowRecord[]} records Normalized rows to consider.
 * @returns {import('./asset-flows-to-sankey.util').AssetFlowRecord | null} The best row, or `null` when `records` is empty.
 */
function pickBestAssetFlowRowForDisclosure(records: AssetFlowRecord[]): AssetFlowRecord | null {
  if (!Array.isArray(records) || records.length === 0) return null;

  const latestRows = records.filter((r) => (r.Latest ?? '').trim().toUpperCase() === 'Y');
  const pool = latestRows.length > 0 ? latestRows : records;
  if (pool.length === 0) return null;

  return pool.reduce<AssetFlowRecord>(
    (best, cur) => (disclosureRowScore(cur) > disclosureRowScore(best) ? cur : best),
    pool[0] as AssetFlowRecord
  );
}

/**
 * Extracts `Load_Date` and `Model_Version` from normalized asset flow rows for
 * disclosure/footer copy. Prefers rows marked `Latest === 'Y'`, then the row with
 * the greatest `Load_Date`, `Model_Run_Date`, or `Asset_Flow_Date`.
 *
 * @param {import('./asset-flows-to-sankey.util').AssetFlowRecord[]} records Normalized rows to inspect.
 * @returns {import('./asset-flows-to-sankey.util').AssetFlowDisclosureMeta} Disclosure meta with `loadDate` and `modelVersion`
 *   (each `null` when unknown).
 */
export function pickAssetFlowDisclosureMeta(records: AssetFlowRecord[]): AssetFlowDisclosureMeta {
  const row = pickBestAssetFlowRowForDisclosure(records);
  if (!row) return { loadDate: null, modelVersion: null };
  const loadDate = row.Load_Date?.trim() || null;
  const modelVersion = row.Model_Version?.trim() || null;
  return { loadDate, modelVersion };
}

/** Saved views / UI data mode; row sets are not split by `Model_Type` (historic vs forecast). */
export type AssetFlowDataTypeFilter = 'historical' | 'forecasted';

/**
 * Returns `data` unchanged. `Model_Type` is ignored so historic and forecast quarters
 * contribute alike to aggregations; the time window and dimension filters decide which
 * rows are used.
 *
 * @param {import('./asset-flows-to-sankey.util').AssetFlowRecord[]} data - Rows to return unchanged.
 * @param {import('./asset-flows-to-sankey.util').AssetFlowDataTypeFilter} _dataType - Saved-view data mode (unused; kept for API stability).
 * @returns {import('./asset-flows-to-sankey.util').AssetFlowRecord[]} The input array, unchanged.
 */
export function filterAssetFlowsByDataType(
  data: AssetFlowRecord[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- API stability
  _dataType: AssetFlowDataTypeFilter
): AssetFlowRecord[] {
  if (!data?.length) return data;
  return data;
}

/**
 * Returns `data` unchanged. Does not split rows by anchor month vs `Model_Type`.
 *
 * @param {import('./asset-flows-to-sankey.util').AssetFlowRecord[]} data - Rows to return unchanged.
 * @param {import('./asset-flows-to-sankey.util').AssetFlowDataTypeFilter} _dataType - Saved-view data mode (unused; kept for API stability).
 * @param {string | null | undefined} _timeHorizonStart - Start of the active time window (unused).
 * @param {string | null | undefined} _timeHorizonEnd - End of the active time window (unused).
 * @param {string | null | undefined} _anchorYearMonth - Anchor year-month, `YYYY-MM` (unused).
 * @returns {import('./asset-flows-to-sankey.util').AssetFlowRecord[]} The input array, unchanged.
 */
export function filterAssetFlowsByDataTypeResolvingSpan(
  data: AssetFlowRecord[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- API stability
  _dataType: AssetFlowDataTypeFilter,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- API stability
  _timeHorizonStart: string | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- API stability
  _timeHorizonEnd: string | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- API stability
  _anchorYearMonth: string | null | undefined
): AssetFlowRecord[] {
  if (!data?.length) return data;
  return data;
}

export interface SankeyNode {
  name: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
  date?: string;
  /** Sum of `N_Clients` on contributing rows for this link (when known). */
  nClientsTotal?: number;
}

interface ParentSummary {
  superparent: string;
  parent: string;
  outflow: number;
  inflow: number;
  net: number;
}

interface SuperParentSummary {
  superparent: string;
  outflow: number;
  inflow: number;
  net: number;
}

interface SuperParentNetNew {
  superparent: string;
  net_new_capital: number;
}

export interface SankeySummary {
  total_positive: number;
  total_negative: number;
  total_negative_abs: number;
  net_new_capital: number;
  superparent_net_new: SuperParentNetNew[];
  superparents: SuperParentSummary[];
  parents: ParentSummary[];
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
  summary: SankeySummary;
}

/**
 * Converts asset-flow rows into Sankey diagram data (nodes, links, summary).
 *
 * Default mapping:
 * - `Investor_Region` -> superparent
 * - `Product_Type` -> parent
 * - `Product_Sub_Type` -> sub-asset
 * - `Asset_Flow_Value` -> link value in USD (negative = outflow, positive = inflow)
 *
 * @param {import('./asset-flows-to-sankey.util').AssetFlowRecord[]} assetFlows Normalized rows to aggregate into Sankey nodes/links.
 * @param {import('./asset-flows-to-sankey.util').SankeyDimensionConfig} [dimensionConfig] Optional override for the super/parent/sub fields.
 *   When omitted the default mapping above is used. Set `subField: 'none'` to skip leaf nodes.
 * @returns {import('./asset-flows-to-sankey.util').SankeyData} `{ nodes, links, summary }` ready for a d3-sankey diagram.
 */
export function convertAssetFlowsToSankey(
  assetFlows: AssetFlowRecord[],
  dimensionConfig?: SankeyDimensionConfig
): SankeyData {
  const config: SankeyDimensionConfig = dimensionConfig ?? {
    superField: 'Investor_Region',
    parentField: 'Product_Type',
    subField: 'Product_Sub_Type',
  };

  // Validate input
  if (!assetFlows || assetFlows.length === 0) {
    return {
      nodes: [],
      links: [],
      summary: {
        total_positive: 0,
        total_negative: 0,
        total_negative_abs: 0,
        net_new_capital: 0,
        superparent_net_new: [],
        superparents: [],
        parents: []
      }
    };
  }

  // Shallow copy rows so extended-row mutation does not alter caller's objects
  const rowsNz = assetFlows
    .filter((r) => Math.abs(r.Asset_Flow_Value) > 1e-9)
    .map((r) => ({ ...r }));
  
  // If no valid data after filtering, return empty structure
  if (rowsNz.length === 0) {
    return {
      nodes: [],
      links: [],
      summary: {
        total_positive: 0,
        total_negative: 0,
        total_negative_abs: 0,
        net_new_capital: 0,
        superparent_net_new: [],
        superparents: [],
        parents: []
      }
    };
  }

  /**
   * Safely reads a configured dimension field from a row, falling back to
   * `'Unknown'` when the value is missing or blank.
   *
   * @param {import('./asset-flows-to-sankey.util').AssetFlowRecord} r Row to read.
   * @param {import('./asset-flows-to-sankey.util').AssetFlowDimensionField} field Field name to extract.
   * @returns {string} Trimmed field value, or `'Unknown'`.
   */
  const getField = (r: AssetFlowRecord, field: AssetFlowDimensionField): string => {
    const value = r[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    return 'Unknown';
  };

  type ExtendedRow = AssetFlowRecord & {
    sankeySuper: string;
    sankeyParent: string;
    sankeySub: string;
  };

  const skipSubLevel = config.subField === 'none';

  const extendedRows: ExtendedRow[] = rowsNz.map((r) => {
    const er = r as ExtendedRow;
    er.sankeySuper = getField(r, config.superField);
    er.sankeyParent = getField(r, config.parentField);
    er.sankeySub = skipSubLevel ? '' : getField(r, config.subField as AssetFlowDimensionField);
    return er;
  });

  // Separate negative (outflows/sources) and positive (inflows/destinations)
  const neg = extendedRows.filter(r => r.Asset_Flow_Value < 0); // selling (sources) - negative values
  const pos = extendedRows.filter(r => r.Asset_Flow_Value > 0); // buying (destinations) - positive values

  // Capital Out
  const totalNegAbs = neg.reduce((sum, r) => sum + Math.abs(r.Asset_Flow_Value), 0);
  const totalPos = pos.reduce((sum, r) => sum + r.Asset_Flow_Value, 0);
  const netNew = totalPos - totalNegAbs;

  // Build nodes
  const nodes: SankeyNode[] = [];
  const names = new Set<string>();

  /**
   * Adds a node to the Sankey graph if it isn't already present.
   *
   * @param {string} name Node identifier (also the display label).
   * @returns {void}
   */
  function add(name: string): void {
    if (!names.has(name)) {
      names.add(name);
      nodes.push({ name });
    }
  }

  /**
   * Builds the per-SuperParent reallocation-pool node name. Each superparent has its
   * own pool so regions don't merge.
   *
   * @param {string} sp SuperParent value.
   * @returns {string} Pool node name for `sp`.
   */
  function poolName(sp: string): string {
    return `${sp}: Reallocation Pool`;
  }

  /**
   * Builds the dedicated "Capital In (Super)" terminal so Capital In can render on
   * its own structural branch, separate from regular super start/end flow trunks.
   *
   * @param {string} sp SuperParent value.
   * @returns {string} Capital-In super terminal node name.
   */
  function capitalInSuperName(sp: string): string {
    return `${sp}: Capital In (Super)`;
  }

  /**
   * Builds the dedicated "Capital Out (Super)" terminal so Capital Out can render on
   * its own structural branch, separate from regular super start/end flow trunks.
   *
   * @param {string} sp SuperParent value.
   * @returns {string} Capital-Out super terminal node name.
   */
  function capitalOutSuperName(sp: string): string {
    return `${sp}: Capital Out (Super)`;
  }

  /**
   * Builds a parent-start node name scoped by SuperParent so identical parent
   * categories across regions do not merge.
   *
   * @param {string} sp SuperParent value.
   * @param {string} p Parent value.
   * @returns {string} Parent-start node name.
   */
  function parentStartName(sp: string, p: string): string {
    return `${sp}: ${p} (Start)`;
  }

  /**
   * Builds a parent-end node name scoped by SuperParent so identical parent
   * categories across regions do not merge.
   *
   * @param {string} sp SuperParent value.
   * @param {string} p Parent value.
   * @returns {string} Parent-end node name.
   */
  function parentEndName(sp: string, p: string): string {
    return `${sp}: ${p} (End)`;
  }

  /**
   * Builds a sub-asset "source" node name scoped by SuperParent (outflow side).
   *
   * @param {string} sp SuperParent value.
   * @param {string} sub Sub-asset value.
   * @returns {string} Sub-asset source node name.
   */
  function subSourceName(sp: string, sub: string): string {
    return `${sp}: ${sub} (Source)`;
  }

  /**
   * Builds a sub-asset "destination" node name scoped by SuperParent (inflow side).
   *
   * @param {string} sp SuperParent value.
   * @param {string} sub Sub-asset value.
   * @returns {string} Sub-asset destination node name.
   */
  function subDestName(sp: string, sub: string): string {
    return `${sp}: ${sub} (Destination)`;
  }

  const parentsNeg = Array.from(
    new Set(neg.map(r => `${r.sankeySuper}|${r.sankeyParent}`))
  )
    .map(key => {
      const [sp, p] = key.split('|');
      return { sp, p };
    })
    .sort((a, b) => {
      if (a.sp !== b.sp) return a.sp.localeCompare(b.sp);
      return a.p.localeCompare(b.p);
    });

  const parentsPos = Array.from(
    new Set(pos.map(r => `${r.sankeySuper}|${r.sankeyParent}`))
  )
    .map(key => {
      const [sp, p] = key.split('|');
      return { sp, p };
    })
    .sort((a, b) => {
      if (a.sp !== b.sp) return a.sp.localeCompare(b.sp);
      return a.p.localeCompare(b.p);
    });

  const superNeg = Array.from(new Set(neg.map(r => r.sankeySuper))).sort();
  const superPos = Array.from(new Set(pos.map(r => r.sankeySuper))).sort();
  const superAll = Array.from(
    new Set([...superNeg, ...superPos])
  ).sort();

  // Create a pool node for each superparent
  superAll.forEach((sp) => {
    add(poolName(sp));
  });

  // SuperParent (Start) / SuperParent (End)
  // Create Super Start for all regions that have any activity (both inflows and outflows)
  // Create Super End for all regions that have any activity (both inflows and outflows)
  superAll.forEach((sp) => {
    add(`${sp} (Super Start)`);
    add(`${sp} (Super End)`);
  });

  // Parent (Start) / Parent (End) (scoped by SuperParent)
  parentsNeg.forEach(({ sp, p }) => {
    add(parentStartName(sp, p));
  });
  parentsPos.forEach(({ sp, p }) => {
    add(parentEndName(sp, p));
  });

  // Sub-asset Source/Destination nodes (scoped by SuperParent) — only when not skipSubLevel
  if (!skipSubLevel) {
    neg.forEach((r) => {
      add(subSourceName(r.sankeySuper, r.sankeySub));
    });
    pos.forEach((r) => {
      add(subDestName(r.sankeySuper, r.sankeySub));
    });
  }

  // Build links
  const links: SankeyLink[] = [];
  /**
   * Safely reads `N_Clients` from a row, clamped to non-negative.
   *
   * @param {import('./asset-flows-to-sankey.util').AssetFlowRecord} r Row to read.
   * @returns {number} Non-negative client count (0 when missing).
   */
  const rowNc = (r: AssetFlowRecord): number => Math.max(0, r.N_Clients ?? 0);

  // 0) SuperParent(Start) -> Parent(Start)
  const superParentOut: { [key: string]: number } = {};
  const superParentOutNc: { [key: string]: number } = {};
  neg.forEach((r) => {
    const key = `${r.sankeySuper}|${r.sankeyParent}`;
    superParentOut[key] = (superParentOut[key] || 0) + Math.abs(r.Asset_Flow_Value);
    superParentOutNc[key] = (superParentOutNc[key] || 0) + rowNc(r);
  });
  Object.entries(superParentOut).forEach(([key, total]) => {
    if (total > 0) {
      const [sp, p] = key.split('|');
      const nc = superParentOutNc[key] || 0;
      links.push({
        source: `${sp} (Super Start)`,
        target: parentStartName(sp, p),
        value: total,
        ...(nc > 0 ? { nClientsTotal: nc } : {}),
      });
    }
  });

  if (skipSubLevel) {
    // Parent(Start) -> Pool (aggregated by sp, parent)
    Object.entries(superParentOut).forEach(([key, total]) => {
      if (total > 0) {
        const [sp, p] = key.split('|');
        const nc = superParentOutNc[key] || 0;
        links.push({
          source: parentStartName(sp, p),
          target: poolName(sp),
          value: total,
          ...(nc > 0 ? { nClientsTotal: nc } : {}),
        });
      }
    });
  } else {
    // Aggregate parallel leaf edges by (source, target). One link per raw row made link counts
    // equal to row count (×2 per side), which froze the browser with d3-sankey + cascade prune.
    type LeafEdgeAgg = {
      value: number;
      nClientsTotal: number;
      date?: string;
      hasDateConflict: boolean;
    };
    /**
     * Composes a stable map key from `source` and `target` node names. A NUL byte
     * separator avoids collisions with any character that may appear in node names.
     *
     * @param {string} source Source node name.
     * @param {string} target Target node name.
     * @returns {string} Composite key suitable for use in a Map.
     */
    const leafEdgeKey = (source: string, target: string) => `${source}\0${target}`;
    /**
     * Adds a row's contribution to an aggregated leaf edge. Sums `value` and
     * `nClientsTotal` and tracks `date` only while it is unambiguous (clears it
     * on conflict so it doesn't lie about a single-date provenance).
     *
     * @param {Object} map Aggregator keyed by `leafEdgeKey`.
     * @param {string} source Source node name.
     * @param {string} target Target node name.
     * @param {number} value Magnitude to add (already positive).
     * @param {number} nc Client count to add (0 to ignore).
     * @param {string | undefined} [date] Row's `Asset_Flow_Date`, when available.
     * @returns {void}
     */
    const bumpLeafEdge = (
      map: Map<string, LeafEdgeAgg>,
      source: string,
      target: string,
      value: number,
      nc: number,
      date?: string
    ): void => {
      const k = leafEdgeKey(source, target);
      const cur = map.get(k) ?? {
        value: 0,
        nClientsTotal: 0,
        hasDateConflict: false,
      };
      cur.value += value;
      if (nc > 0) {
        cur.nClientsTotal += nc;
      }
      if (date) {
        if (cur.date === undefined) {
          cur.date = date;
        } else if (cur.date !== date) {
          cur.hasDateConflict = true;
          cur.date = undefined;
        }
      }
      map.set(k, cur);
    };
    /**
     * Emits aggregated leaf edges into the outer `links` array.
     *
     * @param {Object} map Aggregator produced by `bumpLeafEdge`.
     * @param {boolean} includeDate When true, copy the unambiguous `date` to the link.
     * @returns {void}
     */
    const flushLeafEdges = (map: Map<string, LeafEdgeAgg>, includeDate: boolean): void => {
      map.forEach((a, k) => {
        const sep = k.indexOf('\0');
        const source = k.slice(0, sep);
        const target = k.slice(sep + 1);
        const rec: SankeyLink = {
          source,
          target,
          value: a.value,
        };
        if (a.nClientsTotal > 0) {
          rec.nClientsTotal = a.nClientsTotal;
        }
        if (includeDate && a.date && !a.hasDateConflict) {
          rec.date = a.date;
        }
        links.push(rec);
      });
    };

    const negStartToSub = new Map<string, LeafEdgeAgg>();
    const negSubToPool = new Map<string, LeafEdgeAgg>();
    neg.forEach((r) => {
      const nc = rowNc(r);
      const v = Math.abs(r.Asset_Flow_Value);
      bumpLeafEdge(
        negStartToSub,
        parentStartName(r.sankeySuper, r.sankeyParent),
        subSourceName(r.sankeySuper, r.sankeySub),
        v,
        nc,
        r.Asset_Flow_Date
      );
      bumpLeafEdge(negSubToPool, subSourceName(r.sankeySuper, r.sankeySub), poolName(r.sankeySuper), v, nc);
    });
    flushLeafEdges(negStartToSub, true);
    flushLeafEdges(negSubToPool, false);
  }

  // 3) Capital Out / Capital In (PER SUPERPARENT)
  const netBySp: { [key: string]: number } = {};

  pos.forEach((r) => {
    netBySp[r.sankeySuper] = (netBySp[r.sankeySuper] || 0) + r.Asset_Flow_Value;
  });
  neg.forEach((r) => {
    netBySp[r.sankeySuper] = (netBySp[r.sankeySuper] || 0) - Math.abs(r.Asset_Flow_Value);
  });

  Object.entries(netBySp)
    .sort()
    .forEach(([sp, net]) => {
    if (net > 1e-9) {
      const nnName = `Capital In (${sp})`;
      const capInSuper = capitalInSuperName(sp);
      add(capInSuper);
      add(nnName);

      // Dedicated Capital In super -> Capital In
      links.push({
        source: capInSuper,
        target: nnName,
        value: net,
      });

      // Capital In -> Pool
      links.push({
        source: nnName,
        target: poolName(sp),
        value: net,
      });
    } else if (net < -1e-9) {
      const wdName = `Capital Out (${sp})`;
      const capOutSuper = capitalOutSuperName(sp);
      add(wdName);
      add(capOutSuper);

      // Pool -> Capital Out
      links.push({
        source: poolName(sp),
        target: wdName,
        value: Math.abs(net),
      });

      // Capital Out -> dedicated Capital Out super
      links.push({
        source: wdName,
        target: capOutSuper,
        value: Math.abs(net),
      });
    }
  });

  if (skipSubLevel) {
    // Pool -> Parent(End) (aggregated by sp, parent)
    const superParentInAgg: { [key: string]: number } = {};
    const superParentInAggNc: { [key: string]: number } = {};
    pos.forEach((r) => {
      const key = `${r.sankeySuper}|${r.sankeyParent}`;
      superParentInAgg[key] = (superParentInAgg[key] || 0) + r.Asset_Flow_Value;
      superParentInAggNc[key] = (superParentInAggNc[key] || 0) + rowNc(r);
    });
    Object.entries(superParentInAgg).forEach(([key, total]) => {
      if (total > 0) {
        const [sp, p] = key.split('|');
        const nc = superParentInAggNc[key] || 0;
        links.push({
          source: poolName(sp),
          target: parentEndName(sp, p),
          value: total,
          ...(nc > 0 ? { nClientsTotal: nc } : {}),
        });
      }
    });
  } else {
    type LeafEdgeAgg = {
      value: number;
      nClientsTotal: number;
      date?: string;
      hasDateConflict: boolean;
    };
    /**
     * Composes a stable map key from `source` and `target` node names. A NUL byte
     * separator avoids collisions with any character that may appear in node names.
     *
     * @param {string} source Source node name.
     * @param {string} target Target node name.
     * @returns {string} Composite key suitable for use in a Map.
     */
    const leafEdgeKey = (source: string, target: string) => `${source}\0${target}`;
    /**
     * Adds a row's contribution to an aggregated leaf edge (inflow side). Sums
     * `value` and `nClientsTotal` and tracks `date` only while it is unambiguous.
     *
     * @param {Object} map Aggregator keyed by `leafEdgeKey`.
     * @param {string} source Source node name.
     * @param {string} target Target node name.
     * @param {number} value Magnitude to add (already positive).
     * @param {number} nc Client count to add (0 to ignore).
     * @param {string | undefined} [date] Row's `Asset_Flow_Date`, when available.
     * @returns {void}
     */
    const bumpLeafEdge = (
      map: Map<string, LeafEdgeAgg>,
      source: string,
      target: string,
      value: number,
      nc: number,
      date?: string
    ): void => {
      const k = leafEdgeKey(source, target);
      const cur = map.get(k) ?? {
        value: 0,
        nClientsTotal: 0,
        hasDateConflict: false,
      };
      cur.value += value;
      if (nc > 0) {
        cur.nClientsTotal += nc;
      }
      if (date) {
        if (cur.date === undefined) {
          cur.date = date;
        } else if (cur.date !== date) {
          cur.hasDateConflict = true;
          cur.date = undefined;
        }
      }
      map.set(k, cur);
    };
    /**
     * Emits aggregated leaf edges into the outer `links` array.
     *
     * @param {Object} map Aggregator produced by `bumpLeafEdge`.
     * @param {boolean} includeDate When true, copy the unambiguous `date` to the link.
     * @returns {void}
     */
    const flushLeafEdges = (map: Map<string, LeafEdgeAgg>, includeDate: boolean): void => {
      map.forEach((a, k) => {
        const sep = k.indexOf('\0');
        const source = k.slice(0, sep);
        const target = k.slice(sep + 1);
        const rec: SankeyLink = {
          source,
          target,
          value: a.value,
        };
        if (a.nClientsTotal > 0) {
          rec.nClientsTotal = a.nClientsTotal;
        }
        if (includeDate && a.date && !a.hasDateConflict) {
          rec.date = a.date;
        }
        links.push(rec);
      });
    };

    const posPoolToSub = new Map<string, LeafEdgeAgg>();
    const posSubToEnd = new Map<string, LeafEdgeAgg>();
    pos.forEach((r) => {
      const nc = rowNc(r);
      const v = r.Asset_Flow_Value;
      bumpLeafEdge(posPoolToSub, poolName(r.sankeySuper), subDestName(r.sankeySuper, r.sankeySub), v, nc);
      bumpLeafEdge(
        posSubToEnd,
        subDestName(r.sankeySuper, r.sankeySub),
        parentEndName(r.sankeySuper, r.sankeyParent),
        v,
        nc,
        r.Asset_Flow_Date
      );
    });
    flushLeafEdges(posPoolToSub, false);
    flushLeafEdges(posSubToEnd, true);
  }

  // 6) Parent(End) -> SuperParent(End)
  const superParentIn: { [key: string]: number } = {};
  const superParentInNc: { [key: string]: number } = {};
  pos.forEach((r) => {
    const key = `${r.sankeySuper}|${r.sankeyParent}`;
    superParentIn[key] = (superParentIn[key] || 0) + r.Asset_Flow_Value;
    superParentInNc[key] = (superParentInNc[key] || 0) + rowNc(r);
  });
  Object.entries(superParentIn).forEach(([key, total]) => {
    if (total > 0) {
      const [sp, p] = key.split('|');
      const nc = superParentInNc[key] || 0;
      links.push({
        source: parentEndName(sp, p),
        target: `${sp} (Super End)`,
        value: total,
        ...(nc > 0 ? { nClientsTotal: nc } : {}),
      });
    }
  });

  // ------- Summary statistics -------
  const totalNeg = neg.reduce((sum, r) => sum + r.Asset_Flow_Value, 0); // negative number

  const parentFlows: { [key: string]: { outflow: number; inflow: number } } = {};

  neg.forEach((r) => {
    const key = `${r.sankeySuper}|${r.sankeyParent}`;
    if (!parentFlows[key]) {
      parentFlows[key] = { outflow: 0, inflow: 0 };
    }
    parentFlows[key].outflow += Math.abs(r.Asset_Flow_Value);
  });
  pos.forEach((r) => {
    const key = `${r.sankeySuper}|${r.sankeyParent}`;
    if (!parentFlows[key]) {
      parentFlows[key] = { outflow: 0, inflow: 0 };
    }
    parentFlows[key].inflow += r.Asset_Flow_Value;
  });

  const parentsSummary: ParentSummary[] = [];
  Object.entries(parentFlows)
    .sort()
    .forEach(([key, stats]) => {
    const [sp, p] = key.split('|');
    parentsSummary.push({
      superparent: sp,
      parent: p,
      outflow: stats.outflow,
      inflow: stats.inflow,
      net: stats.inflow - stats.outflow,
    });
  });

  const superparentFlows: { [key: string]: { outflow: number; inflow: number } } = {};

  neg.forEach((r) => {
    if (!superparentFlows[r.sankeySuper]) {
      superparentFlows[r.sankeySuper] = { outflow: 0, inflow: 0 };
    }
    superparentFlows[r.sankeySuper].outflow += Math.abs(r.Asset_Flow_Value);
  });
  pos.forEach((r) => {
    if (!superparentFlows[r.sankeySuper]) {
      superparentFlows[r.sankeySuper] = { outflow: 0, inflow: 0 };
    }
    superparentFlows[r.sankeySuper].inflow += r.Asset_Flow_Value;
  });

  const superparentsSummary: SuperParentSummary[] = [];
  Object.entries(superparentFlows)
    .sort()
    .forEach(([sp, stats]) => {
    superparentsSummary.push({
      superparent: sp,
      outflow: stats.outflow,
      inflow: stats.inflow,
      net: stats.inflow - stats.outflow,
    });
  });

  const superparentNetNew: SuperParentNetNew[] = [];
  Object.entries(netBySp)
    .sort()
    .forEach(([sp, net]) => {
    superparentNetNew.push({
      superparent: sp,
      net_new_capital: net,
    });
  });

  const summary: SankeySummary = {
    total_positive: totalPos,
    total_negative: totalNeg,
    total_negative_abs: totalNegAbs,
    net_new_capital: netNew,
    superparent_net_new: superparentNetNew,
    superparents: superparentsSummary,
    parents: parentsSummary,
  };

  return { nodes, links, summary };
}

