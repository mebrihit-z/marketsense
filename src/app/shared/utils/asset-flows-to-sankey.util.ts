/* eslint-disable */
/**
 * Utility to convert asset-flows-data.json format to Sankey diagram data
 */

export interface AssetFlowRecord {
  Model_Run_Date?: string;
  Model_Version?: string;
  Investor_Region: string;
  Investor_Types?: string;
  Plan_Type?: string;
  Sec_Type?: string;
  Product_Region?: string;
  Product_Type: string;
  Product_Sub_Type: string;
  Asset_Flow_Date?: string;
  Asset_Flow_Value: number;
}

export interface SankeyNode {
  name: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
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
 * Maps:
 * - Investor_Region -> superparent
 * - Product_Type -> parent
 * - Product_Sub_Type -> subasset
 * - Asset_Flow_Value -> value (negative = outflow, positive = inflow)
 */
export function convertAssetFlowsToSankey(
  assetFlows: AssetFlowRecord[]
): SankeyData {
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

  // Convert values from thousands to billions (divide by 1,000,000)
  const convertedFlows = assetFlows.map(r => ({
    ...r,
    Asset_Flow_Value: r.Asset_Flow_Value / 1000000
  }));
  
  // Filter out exact zeros
  const rowsNz = convertedFlows.filter(r => Math.abs(r.Asset_Flow_Value) > 1e-9);
  
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

  // Separate negative (outflows/sources) and positive (inflows/destinations)
  const neg = rowsNz.filter(r => r.Asset_Flow_Value < 0); // selling (sources) - negative values
  const pos = rowsNz.filter(r => r.Asset_Flow_Value > 0); // buying (destinations) - positive values

  // Net New Capital
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
    new Set(neg.map(r => `${r.Investor_Region}|${r.Product_Type}`))
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
    new Set(pos.map(r => `${r.Investor_Region}|${r.Product_Type}`))
  )
    .map(key => {
      const [sp, p] = key.split('|');
      return { sp, p };
    })
    .sort((a, b) => {
      if (a.sp !== b.sp) return a.sp.localeCompare(b.sp);
      return a.p.localeCompare(b.p);
    });

  const superNeg = Array.from(new Set(neg.map(r => r.Investor_Region))).sort();
  const superPos = Array.from(new Set(pos.map(r => r.Investor_Region))).sort();
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

  // Sub-asset Source/Destination nodes (scoped by SuperParent)
  for (const r of neg) {
    add(subSourceName(r.Investor_Region, r.Product_Sub_Type));
  }
  for (const r of pos) {
    add(subDestName(r.Investor_Region, r.Product_Sub_Type));
  }

  // Build links
  const links: SankeyLink[] = [];

  // 0) SuperParent(Start) -> Parent(Start)
  const superParentOut: { [key: string]: number } = {};
  for (const r of neg) {
    const key = `${r.Investor_Region}|${r.Product_Type}`;
    superParentOut[key] = (superParentOut[key] || 0) + Math.abs(r.Asset_Flow_Value);
  }
  for (const [key, total] of Object.entries(superParentOut)) {
    if (total > 0) {
      const [sp, p] = key.split('|');
      links.push({
        source: `${sp} (Super Start)`,
        target: parentStartName(sp, p),
        value: total,
      });
    }
  }

  // 1) Parent(Start) -> Sub(Source)
  for (const r of neg) {
    links.push({
      source: parentStartName(r.Investor_Region, r.Product_Type),
      target: subSourceName(r.Investor_Region, r.Product_Sub_Type),
      value: Math.abs(r.Asset_Flow_Value),
    });
  }

  // 2) Sub(Source) -> Pool (per SuperParent)
  for (const r of neg) {
    links.push({
      source: subSourceName(r.Investor_Region, r.Product_Sub_Type),
      target: poolName(r.Investor_Region),
      value: Math.abs(r.Asset_Flow_Value),
    });
  }

  // 3) Net New Capital / Withdrawals (PER SUPERPARENT)
  const netBySp: { [key: string]: number } = {};

  for (const r of pos) {
    netBySp[r.Investor_Region] = (netBySp[r.Investor_Region] || 0) + r.Asset_Flow_Value;
  }
  for (const r of neg) {
    netBySp[r.Investor_Region] = (netBySp[r.Investor_Region] || 0) - Math.abs(r.Asset_Flow_Value);
  }

  for (const [sp, net] of Object.entries(netBySp).sort()) {
    if (net > 1e-9) {
      const nnName = `Net New Capital (${sp})`;
      add(nnName);

      // SuperParent -> Net New Capital
      links.push({
        source: `${sp} (Super Start)`,
        target: nnName,
        value: net,
      });

      // Net New Capital -> Pool
      links.push({
        source: nnName,
        target: poolName(sp),
        value: net,
      });
    } else if (net < -1e-9) {
      const wdName = `Capital Withdrawn (${sp})`;
      add(wdName);

      // Pool -> Capital Withdrawn
      links.push({
        source: poolName(sp),
        target: wdName,
        value: Math.abs(net),
      });

      // Capital Withdrawn -> Super End (to complete the flow)
      links.push({
        source: wdName,
        target: `${sp} (Super End)`,
        value: Math.abs(net),
      });
    }
  }

  // 4) Pool -> Sub(Destination) (per SuperParent)
  for (const r of pos) {
    links.push({
      source: poolName(r.Investor_Region),
      target: subDestName(r.Investor_Region, r.Product_Sub_Type),
      value: r.Asset_Flow_Value,
    });
  }

  // 5) Sub(Destination) -> Parent(End)
  for (const r of pos) {
    links.push({
      source: subDestName(r.Investor_Region, r.Product_Sub_Type),
      target: parentEndName(r.Investor_Region, r.Product_Type),
      value: r.Asset_Flow_Value,
    });
  }

  // 6) Parent(End) -> SuperParent(End)
  const superParentIn: { [key: string]: number } = {};
  for (const r of pos) {
    const key = `${r.Investor_Region}|${r.Product_Type}`;
    superParentIn[key] = (superParentIn[key] || 0) + r.Asset_Flow_Value;
  }
  for (const [key, total] of Object.entries(superParentIn)) {
    if (total > 0) {
      const [sp, p] = key.split('|');
      links.push({
        source: parentEndName(sp, p),
        target: `${sp} (Super End)`,
        value: total,
      });
    }
  }

  // ------- Summary statistics -------
  const totalNeg = neg.reduce((sum, r) => sum + r.Asset_Flow_Value, 0); // negative number

  const parentFlows: { [key: string]: { outflow: number; inflow: number } } = {};

  for (const r of neg) {
    const key = `${r.Investor_Region}|${r.Product_Type}`;
    if (!parentFlows[key]) {
      parentFlows[key] = { outflow: 0, inflow: 0 };
    }
    parentFlows[key].outflow += Math.abs(r.Asset_Flow_Value);
  }
  for (const r of pos) {
    const key = `${r.Investor_Region}|${r.Product_Type}`;
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
    if (!superparentFlows[r.Investor_Region]) {
      superparentFlows[r.Investor_Region] = { outflow: 0, inflow: 0 };
    }
    superparentFlows[r.Investor_Region].outflow += Math.abs(r.Asset_Flow_Value);
  }
  for (const r of pos) {
    if (!superparentFlows[r.Investor_Region]) {
      superparentFlows[r.Investor_Region] = { outflow: 0, inflow: 0 };
    }
    superparentFlows[r.Investor_Region].inflow += r.Asset_Flow_Value;
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

