/* eslint-disable */
/**
 * Browser-compatible utility to convert Excel files to Sankey diagram data
 */

import * as XLSX from 'xlsx';

interface CSVRow {
  superparent: string;
  parent: string;
  subasset: string;
  value: number;
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

interface ExcelOptions {
  superparentCol: string;
  parentCol: string;
  subassetCol: string;
  valueCol: string;
  sheetName?: string; // Optional sheet name, defaults to first sheet
}

/**
 * Build Sankey diagram data structure from CSV rows
 */
function buildSankeyFromRows(rows: CSVRow[]): SankeyData {
  // Filter out exact zeros
  const rowsNz = rows.filter(r => Math.abs(r.value) > 1e-9);

  const neg = rowsNz.filter(r => r.value < 0); // selling (sources)
  const pos = rowsNz.filter(r => r.value > 0); // buying (destinations)

  // Net New Capital
  const totalNegAbs = neg.reduce((sum, r) => sum + Math.abs(r.value), 0);
  const totalPos = pos.reduce((sum, r) => sum + r.value, 0);
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
    new Set(neg.map(r => `${r.superparent}|${r.parent}`))
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
    new Set(pos.map(r => `${r.superparent}|${r.parent}`))
  )
    .map(key => {
      const [sp, p] = key.split('|');
      return { sp, p };
    })
    .sort((a, b) => {
      if (a.sp !== b.sp) return a.sp.localeCompare(b.sp);
      return a.p.localeCompare(b.p);
    });

  const superNeg = Array.from(new Set(neg.map(r => r.superparent))).sort();
  const superPos = Array.from(new Set(pos.map(r => r.superparent))).sort();
  const superAll = Array.from(
    new Set([...superNeg, ...superPos])
  ).sort();

  // Create a pool node for each superparent
  for (const sp of superAll) {
    add(poolName(sp));
  }

  // SuperParent (Start) / SuperParent (End)
  for (const sp of superNeg) {
    add(`${sp} (Super Start)`);
  }
  for (const sp of superPos) {
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
    add(subSourceName(r.superparent, r.subasset));
  }
  for (const r of pos) {
    add(subDestName(r.superparent, r.subasset));
  }

  // Build links
  const links: SankeyLink[] = [];

  // 0) SuperParent(Start) -> Parent(Start)
  const superParentOut: { [key: string]: number } = {};
  for (const r of neg) {
    const key = `${r.superparent}|${r.parent}`;
    superParentOut[key] = (superParentOut[key] || 0) + Math.abs(r.value);
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
      source: parentStartName(r.superparent, r.parent),
      target: subSourceName(r.superparent, r.subasset),
      value: Math.abs(r.value),
    });
  }

  // 2) Sub(Source) -> Pool (per SuperParent)
  for (const r of neg) {
    links.push({
      source: subSourceName(r.superparent, r.subasset),
      target: poolName(r.superparent),
      value: Math.abs(r.value),
    });
  }

  // 3) Net New Capital / Withdrawals (PER SUPERPARENT)
  const netBySp: { [key: string]: number } = {};

  for (const r of pos) {
    netBySp[r.superparent] = (netBySp[r.superparent] || 0) + r.value;
  }
  for (const r of neg) {
    netBySp[r.superparent] = (netBySp[r.superparent] || 0) - Math.abs(r.value);
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
    }
  }

  // 4) Pool -> Sub(Destination) (per SuperParent)
  for (const r of pos) {
    links.push({
      source: poolName(r.superparent),
      target: subDestName(r.superparent, r.subasset),
      value: r.value,
    });
  }

  // 5) Sub(Destination) -> Parent(End)
  for (const r of pos) {
    links.push({
      source: subDestName(r.superparent, r.subasset),
      target: parentEndName(r.superparent, r.parent),
      value: r.value,
    });
  }

  // 6) Parent(End) -> SuperParent(End)
  const superParentIn: { [key: string]: number } = {};
  for (const r of pos) {
    const key = `${r.superparent}|${r.parent}`;
    superParentIn[key] = (superParentIn[key] || 0) + r.value;
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
  const totalNeg = neg.reduce((sum, r) => sum + r.value, 0); // negative number

  const parentFlows: { [key: string]: { outflow: number; inflow: number } } = {};

  for (const r of neg) {
    const key = `${r.superparent}|${r.parent}`;
    if (!parentFlows[key]) {
      parentFlows[key] = { outflow: 0, inflow: 0 };
    }
    parentFlows[key].outflow += Math.abs(r.value);
  }
  for (const r of pos) {
    const key = `${r.superparent}|${r.parent}`;
    if (!parentFlows[key]) {
      parentFlows[key] = { outflow: 0, inflow: 0 };
    }
    parentFlows[key].inflow += r.value;
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
    if (!superparentFlows[r.superparent]) {
      superparentFlows[r.superparent] = { outflow: 0, inflow: 0 };
    }
    superparentFlows[r.superparent].outflow += Math.abs(r.value);
  }
  for (const r of pos) {
    if (!superparentFlows[r.superparent]) {
      superparentFlows[r.superparent] = { outflow: 0, inflow: 0 };
    }
    superparentFlows[r.superparent].inflow += r.value;
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

/**
 * Read Excel file and convert to CSV rows
 */
function readExcelRows(
  workbook: XLSX.WorkBook,
  options: ExcelOptions
): CSVRow[] {
  // Get the sheet (use provided sheet name or first sheet)
  const sheetName = options.sheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  if (!sheet) {
    throw new Error(`Sheet '${sheetName}' not found in workbook`);
  }

  // Convert sheet to JSON array
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
  
  if (jsonData.length === 0) {
    throw new Error('Excel sheet is empty');
  }

  // Get headers from first row
  const headerRow = jsonData[0].map((h: any) => String(h).trim());
  
  // Normalize header map: lowercased header -> actual header
  const headerMap: { [key: string]: string } = {};
  headerRow.forEach(h => {
    if (h) {
      headerMap[h.toLowerCase()] = h;
    }
  });

  function resolve(colName: string): string {
    const key = colName.trim().toLowerCase();
    if (!(key in headerMap)) {
      throw new Error(
        `Column '${colName}' not found in Excel headers. Available headers: ${JSON.stringify(headerRow)}`
      );
    }
    return headerMap[key];
  }

  const superparentKey = resolve(options.superparentCol);
  const parentKey = resolve(options.parentCol);
  const subassetKey = resolve(options.subassetCol);
  const valueKey = resolve(options.valueCol);

  // Find column indices
  const superparentIdx = headerRow.indexOf(superparentKey);
  const parentIdx = headerRow.indexOf(parentKey);
  const subassetIdx = headerRow.indexOf(subassetKey);
  const valueIdx = headerRow.indexOf(valueKey);

  // Parse data rows
  const rows: CSVRow[] = [];
  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) {
      continue; // Skip empty rows
    }

    const superparent = String(row[superparentIdx] || '').trim();
    const parent = String(row[parentIdx] || '').trim();
    const sub = String(row[subassetIdx] || '').trim();
    const valRaw = String(row[valueIdx] || '').trim();

    if (!valRaw) {
      continue;
    }

    const val = parseFloat(valRaw);
    if (isNaN(val)) {
      continue;
    }

    rows.push({ superparent, parent, subasset: sub, value: val });
  }

  return rows;
}

/**
 * Convert Excel file (as ArrayBuffer) to Sankey data
 */
export function convertExcelToSankey(
  arrayBuffer: ArrayBuffer,
  options: Partial<ExcelOptions> = {}
): SankeyData {
  const defaultOptions: ExcelOptions = {
    superparentCol: 'SuperParent',
    parentCol: 'Parent',
    subassetCol: 'SubAsset',
    valueCol: 'Value',
  };

  const finalOptions: ExcelOptions = { ...defaultOptions, ...options };

  // Parse Excel file
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  
  // Read rows from Excel
  const rows = readExcelRows(workbook, finalOptions);
  
  // Build Sankey data
  const data = buildSankeyFromRows(rows);
  
  return data;
}

