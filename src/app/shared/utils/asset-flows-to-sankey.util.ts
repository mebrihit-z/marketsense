/* eslint-disable */
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
interface RawAssetFlowRecord {
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

function unwrapDate(d: string | { $date: string } | undefined | null): string | undefined {
  if (d === undefined || d === null) return undefined;
  if (typeof d === 'string') return d;
  if (typeof d === 'object' && d !== null && '$date' in d) {
    const dateVal = (d as { $date: string }).$date;
    return typeof dateVal === 'string' ? dateVal : undefined;
  }
  return undefined;
}

function getStr(r: Record<string, unknown>, snake: string, pascal: string): string {
  const v = r[snake] ?? r[pascal];
  return typeof v === 'string' ? v : '';
}

function getStrOpt(r: Record<string, unknown>, snake: string, pascal: string): string | undefined {
  const v = r[snake] ?? r[pascal];
  return typeof v === 'string' ? v : undefined;
}

/**
 * Normalizes a raw asset flow record from JSON (snake_case, $date/$numberLong) to AssetFlowRecord.
 * Handles both MongoDB-style (snake_case + $date/$numberLong) and already-normalized records.
 */
export function normalizeAssetFlowRecord(raw: RawAssetFlowRecord | AssetFlowRecord): AssetFlowRecord {
  const r = raw as Record<string, unknown>;
  const assetFlowDateRaw = r['asset_flow_date'] ?? r['Asset_Flow_Date'];
  const assetFlowValueRaw = r['asset_flow_value'] ?? r['Asset_Flow_Value'];
  const dateUnwrapped = unwrapDate(assetFlowDateRaw as string | { $date: string } | undefined);
  const dateFinal = dateUnwrapped ?? (typeof assetFlowDateRaw === 'string' ? assetFlowDateRaw : undefined);
  const valueUnwrapped = unwrapValue(assetFlowValueRaw as number | { $numberLong: string } | undefined);
  const valueFinal = valueUnwrapped !== 0 ? valueUnwrapped : (typeof assetFlowValueRaw === 'number' ? assetFlowValueRaw : 0);

  const nClientsRaw = r['n_clients'] ?? r['N_Clients'];
  let nClients: number | undefined;
  if (typeof nClientsRaw === 'number' && Number.isFinite(nClientsRaw)) {
    nClients = Math.max(0, Math.round(nClientsRaw));
  } else if (nClientsRaw !== undefined && nClientsRaw !== null) {
    const u = unwrapValue(nClientsRaw as number | { $numberLong: string });
    if (Number.isFinite(u) && u >= 0) nClients = Math.round(u);
  }

  const uFcst = r['fcst_flow_upper'] ?? r['Fcst_Flow_Upper'];
  const lFcst = r['fcst_flow_lower'] ?? r['Fcst_Flow_Lower'];
  let fcstUpper: number | undefined;
  let fcstLower: number | undefined;
  if (uFcst !== undefined && uFcst !== null && lFcst !== undefined && lFcst !== null) {
    fcstUpper = unwrapValue(uFcst as number | { $numberLong: string });
    fcstLower = unwrapValue(lFcst as number | { $numberLong: string });
  }

  return {
    Model_Run_Date: (r['model_run_date'] ?? r['Model_Run_Date']) as string | undefined,
    Model_Version: (r['model_version'] ?? r['Model_Version']) as string | undefined,
    Model_Type: getStrOpt(r, 'model_type', 'Model_Type'),
    Load_Date:
      unwrapDate((r['load_date'] ?? r['Load_Date']) as string | { $date: string } | undefined) ??
      (r['load_date'] ?? r['Load_Date']) as string | undefined,
    Latest: getStrOpt(r, 'latest', 'Latest'),
    Investor_Region: getStr(r, 'investor_region', 'Investor_Region'),
    Plan_Type: getStrOpt(r, 'plan_type', 'Plan_Type') ?? getStrOpt(r, 'Investor_Types', 'Investor_Types'),
    Investor_Types: getStrOpt(r, 'plan_type', 'Plan_Type') ?? getStrOpt(r, 'Investor_Types', 'Investor_Types'),
    Sec_Type: (r['sec_type'] ?? r['Sec_Type']) as string | undefined,
    Product_Region: getStrOpt(r, 'product_region', 'Product_Region'),
    Product_Type: getStr(r, 'product_type', 'Product_Type'),
    Product_Sub_Type: getStr(r, 'product_sub_type', 'Product_Sub_Type'),
    Asset_Flow_Date: dateFinal,
    Asset_Flow_Value: valueFinal,
    ...(nClients !== undefined ? { N_Clients: nClients } : {}),
    ...(fcstUpper !== undefined && fcstLower !== undefined
      ? { Fcst_Flow_Upper: fcstUpper, Fcst_Flow_Lower: fcstLower }
      : {}),
  };
}

/**
 * Normalizes an array of raw asset flow records (e.g. from asset-flows-data.json).
 */
export function normalizeAssetFlowsData(raw: (RawAssetFlowRecord | AssetFlowRecord)[]): AssetFlowRecord[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map(normalizeAssetFlowRecord)
    .filter((row) => (row.Latest ?? '').trim().toUpperCase() === 'Y');
}

/** Saved views / UI data mode; row sets are not split by `Model_Type` (historic vs forecast). */
export type AssetFlowDataTypeFilter = 'historical' | 'forecasted';

/**
 * Returns `data` unchanged. `Model_Type` is ignored so historic and forecast quarters contribute alike
 * to aggregations; the time window and dimension filters define which rows are used.
 */
export function filterAssetFlowsByDataType(
  data: AssetFlowRecord[],
  _dataType: AssetFlowDataTypeFilter
): AssetFlowRecord[] {
  if (!data?.length) return data;
  return data;
}

/**
 * Returns `data` unchanged. Does not split rows by anchor month vs `Model_Type`.
 */
export function filterAssetFlowsByDataTypeResolvingSpan(
  data: AssetFlowRecord[],
  _dataType: AssetFlowDataTypeFilter,
  _timeHorizonStart: string | null | undefined,
  _timeHorizonEnd: string | null | undefined,
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
  /** Sum of {@link AssetFlowRecord.N_Clients} for rows represented by this link (when known). */
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
 * Convert asset flows data to Sankey diagram format
 * Default mapping:
 * - Investor_Region -> superparent
 * - Product_Type -> parent
 * - Product_Sub_Type -> subasset
 * - Asset_Flow_Value -> link value in USD (negative = outflow, positive = inflow)
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

  // Helper to safely read configured fields, falling back to "Unknown" when missing
  const getField = (r: AssetFlowRecord, field: AssetFlowDimensionField): string => {
    const value = (r as any)[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    return 'Unknown';
  };

  type ExtendedRow = AssetFlowRecord & {
    __super: string;
    __parent: string;
    __sub: string;
  };

  const skipSubLevel = config.subField === 'none';

  const extendedRows: ExtendedRow[] = rowsNz.map((r) => {
    const er = r as ExtendedRow;
    er.__super = getField(r, config.superField);
    er.__parent = getField(r, config.parentField);
    er.__sub = skipSubLevel ? '' : getField(r, config.subField as AssetFlowDimensionField);
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

  function add(name: string): void {
    if (!names.has(name)) {
      names.add(name);
      nodes.push({ name });
    }
  }

  // Reallocation Pool is per SuperParent (no shared pool)
  function poolName(sp: string): string {
    return `${sp}: Reallocation Pool`;
  }

  // Helpers to scope nodes by SuperParent so regions don't merge
  function parentStartName(sp: string, p: string): string {
    return `${sp}: ${p} (Start)`;
  }

  function parentEndName(sp: string, p: string): string {
    return `${sp}: ${p} (End)`;
  }

  function subSourceName(sp: string, sub: string): string {
    return `${sp}: ${sub} (Source)`;
  }

  function subDestName(sp: string, sub: string): string {
    return `${sp}: ${sub} (Destination)`;
  }

  const parentsNeg = Array.from(
    new Set(neg.map(r => `${r.__super}|${r.__parent}`))
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
    new Set(pos.map(r => `${r.__super}|${r.__parent}`))
  )
    .map(key => {
      const [sp, p] = key.split('|');
      return { sp, p };
    })
    .sort((a, b) => {
      if (a.sp !== b.sp) return a.sp.localeCompare(b.sp);
      return a.p.localeCompare(b.p);
    });

  const superNeg = Array.from(new Set(neg.map(r => r.__super))).sort();
  const superPos = Array.from(new Set(pos.map(r => r.__super))).sort();
  const superAll = Array.from(
    new Set([...superNeg, ...superPos])
  ).sort();

  // Create a pool node for each superparent
  for (const sp of superAll) {
    add(poolName(sp));
  }

  // SuperParent (Start) / SuperParent (End)
  // Create Super Start for all regions that have any activity (both inflows and outflows)
  // Create Super End for all regions that have any activity (both inflows and outflows)
  for (const sp of superAll) {
    add(`${sp} (Super Start)`);
    add(`${sp} (Super End)`);
  }

  // Parent (Start) / Parent (End) (scoped by SuperParent)
  for (const { sp, p } of parentsNeg) {
    add(parentStartName(sp, p));
  }
  for (const { sp, p } of parentsPos) {
    add(parentEndName(sp, p));
  }

  // Sub-asset Source/Destination nodes (scoped by SuperParent) — only when not skipSubLevel
  if (!skipSubLevel) {
    for (const r of neg) {
      add(subSourceName(r.__super, r.__sub));
    }
    for (const r of pos) {
      add(subDestName(r.__super, r.__sub));
    }
  }

  // Build links
  const links: SankeyLink[] = [];
  const rowNc = (r: AssetFlowRecord): number => Math.max(0, r.N_Clients ?? 0);

  // 0) SuperParent(Start) -> Parent(Start)
  const superParentOut: { [key: string]: number } = {};
  const superParentOutNc: { [key: string]: number } = {};
  for (const r of neg) {
    const key = `${r.__super}|${r.__parent}`;
    superParentOut[key] = (superParentOut[key] || 0) + Math.abs(r.Asset_Flow_Value);
    superParentOutNc[key] = (superParentOutNc[key] || 0) + rowNc(r);
  }
  for (const [key, total] of Object.entries(superParentOut)) {
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
  }

  if (skipSubLevel) {
    // Parent(Start) -> Pool (aggregated by sp, parent)
    for (const [key, total] of Object.entries(superParentOut)) {
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
    }
  } else {
    // 1) Parent(Start) -> Sub(Source)
    for (const r of neg) {
      const nc = rowNc(r);
      links.push({
        source: parentStartName(r.__super, r.__parent),
        target: subSourceName(r.__super, r.__sub),
        value: Math.abs(r.Asset_Flow_Value),
        date: r.Asset_Flow_Date,
        ...(nc > 0 ? { nClientsTotal: nc } : {}),
      });
    }

    // 2) Sub(Source) -> Pool (per SuperParent)
    for (const r of neg) {
      const nc = rowNc(r);
      links.push({
        source: subSourceName(r.__super, r.__sub),
        target: poolName(r.__super),
        value: Math.abs(r.Asset_Flow_Value),
        ...(nc > 0 ? { nClientsTotal: nc } : {}),
      });
    }
  }

  // 3) Capital Out / Capital In (PER SUPERPARENT)
  const netBySp: { [key: string]: number } = {};

  for (const r of pos) {
    netBySp[r.__super] = (netBySp[r.__super] || 0) + r.Asset_Flow_Value;
  }
  for (const r of neg) {
    netBySp[r.__super] = (netBySp[r.__super] || 0) - Math.abs(r.Asset_Flow_Value);
  }

  for (const [sp, net] of Object.entries(netBySp).sort()) {
    if (net > 1e-9) {
      const nnName = `Capital In (${sp})`;
      add(nnName);

      // SuperParent -> Capital Out
      links.push({
        source: `${sp} (Super Start)`,
        target: nnName,
        value: net,
      });

      // Capital Out -> Pool
      links.push({
        source: nnName,
        target: poolName(sp),
        value: net,
      });
    } else if (net < -1e-9) {
      const wdName = `Capital Out (${sp})`;
      add(wdName);

      // Pool -> Capital In
      links.push({
        source: poolName(sp),
        target: wdName,
        value: Math.abs(net),
      });

      // Capital In -> Super End (to complete the flow)
      links.push({
        source: wdName,
        target: `${sp} (Super End)`,
        value: Math.abs(net),
      });
    }
  }

  if (skipSubLevel) {
    // Pool -> Parent(End) (aggregated by sp, parent)
    const superParentInAgg: { [key: string]: number } = {};
    const superParentInAggNc: { [key: string]: number } = {};
    for (const r of pos) {
      const key = `${r.__super}|${r.__parent}`;
      superParentInAgg[key] = (superParentInAgg[key] || 0) + r.Asset_Flow_Value;
      superParentInAggNc[key] = (superParentInAggNc[key] || 0) + rowNc(r);
    }
    for (const [key, total] of Object.entries(superParentInAgg)) {
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
    }
  } else {
    // 4) Pool -> Sub(Destination) (per SuperParent)
    for (const r of pos) {
      const nc = rowNc(r);
      links.push({
        source: poolName(r.__super),
        target: subDestName(r.__super, r.__sub),
        value: r.Asset_Flow_Value,
        ...(nc > 0 ? { nClientsTotal: nc } : {}),
      });
    }

    // 5) Sub(Destination) -> Parent(End)
    for (const r of pos) {
      const nc = rowNc(r);
      links.push({
        source: subDestName(r.__super, r.__sub),
        target: parentEndName(r.__super, r.__parent),
        value: r.Asset_Flow_Value,
        date: r.Asset_Flow_Date,
        ...(nc > 0 ? { nClientsTotal: nc } : {}),
      });
    }
  }

  // 6) Parent(End) -> SuperParent(End)
  const superParentIn: { [key: string]: number } = {};
  const superParentInNc: { [key: string]: number } = {};
  for (const r of pos) {
    const key = `${r.__super}|${r.__parent}`;
    superParentIn[key] = (superParentIn[key] || 0) + r.Asset_Flow_Value;
    superParentInNc[key] = (superParentInNc[key] || 0) + rowNc(r);
  }
  for (const [key, total] of Object.entries(superParentIn)) {
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
  }

  // ------- Summary statistics -------
  const totalNeg = neg.reduce((sum, r) => sum + r.Asset_Flow_Value, 0); // negative number

  const parentFlows: { [key: string]: { outflow: number; inflow: number } } = {};

  for (const r of neg) {
    const key = `${r.__super}|${r.__parent}`;
    if (!parentFlows[key]) {
      parentFlows[key] = { outflow: 0, inflow: 0 };
    }
    parentFlows[key].outflow += Math.abs(r.Asset_Flow_Value);
  }
  for (const r of pos) {
    const key = `${r.__super}|${r.__parent}`;
    if (!parentFlows[key]) {
      parentFlows[key] = { outflow: 0, inflow: 0 };
    }
    parentFlows[key].inflow += r.Asset_Flow_Value;
  }

  const parentsSummary: ParentSummary[] = [];
  for (const [key, stats] of Object.entries(parentFlows).sort()) {
    const [sp, p] = key.split('|');
    parentsSummary.push({
      superparent: sp,
      parent: p,
      outflow: stats.outflow,
      inflow: stats.inflow,
      net: stats.inflow - stats.outflow,
    });
  }

  const superparentFlows: { [key: string]: { outflow: number; inflow: number } } = {};

  for (const r of neg) {
    if (!superparentFlows[r.__super]) {
      superparentFlows[r.__super] = { outflow: 0, inflow: 0 };
    }
    superparentFlows[r.__super].outflow += Math.abs(r.Asset_Flow_Value);
  }
  for (const r of pos) {
    if (!superparentFlows[r.__super]) {
      superparentFlows[r.__super] = { outflow: 0, inflow: 0 };
    }
    superparentFlows[r.__super].inflow += r.Asset_Flow_Value;
  }

  const superparentsSummary: SuperParentSummary[] = [];
  for (const [sp, stats] of Object.entries(superparentFlows).sort()) {
    superparentsSummary.push({
      superparent: sp,
      outflow: stats.outflow,
      inflow: stats.inflow,
      net: stats.inflow - stats.outflow,
    });
  }

  const superparentNetNew: SuperParentNetNew[] = [];
  for (const [sp, net] of Object.entries(netBySp).sort()) {
    superparentNetNew.push({
      superparent: sp,
      net_new_capital: net,
    });
  }

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

