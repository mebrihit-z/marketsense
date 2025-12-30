/**
 * TypeScript utility to convert CSV files to Sankey diagram JSON format
 * This is a Node.js script that can be run with ts-node or compiled to JavaScript
 * 
 * Usage:
 *   ts-node csv-to-sankey.ts [csv_file] [options]
 * 
 * Example:
 *   ts-node csv-to-sankey.ts sankey_input_new.csv -o sankey_data.json
 */

import * as fs from 'fs';
import * as path from 'path';

// Types
interface CSVRow {
  superparent: string;
  parent: string;
  subasset: string;
  value: number;
}

interface SankeyNode {
  name: string;
}

interface SankeyLink {
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

interface SankeySummary {
  total_positive: number;
  total_negative: number;
  total_negative_abs: number;
  net_new_capital: number;
  superparent_net_new: SuperParentNetNew[];
  superparents: SuperParentSummary[];
  parents: ParentSummary[];
}

interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
  summary: SankeySummary;
}

interface CSVOptions {
  superparentCol: string;
  parentCol: string;
  subassetCol: string;
  valueCol: string;
}

/**
 * Parse CSV file and return rows as array of tuples
 */
function readCSVRows(
  csvPath: string,
  options: CSVOptions
): CSVRow[] {
  const content = fs.readFileSync(csvPath, 'utf-8-sig' as BufferEncoding);
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);
  
  // Normalize header map: lowercased header -> actual header
  const headerMap: { [key: string]: string } = {};
  headers.forEach(h => {
    headerMap[h.trim().toLowerCase()] = h;
  });

  function resolve(colName: string): string {
    const key = colName.trim().toLowerCase();
    if (!(key in headerMap)) {
      throw new Error(
        `Column '${colName}' not found in CSV headers ${JSON.stringify(headers)}`
      );
    }
    return headerMap[key];
  }

  const superparentKey = resolve(options.superparentCol);
  const parentKey = resolve(options.parentCol);
  const subassetKey = resolve(options.subassetCol);
  const valueKey = resolve(options.valueCol);

  // Parse data rows
  const rows: CSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length !== headers.length) {
      continue; // Skip malformed rows
    }

    const row: { [key: string]: string } = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    const superparent = (row[superparentKey] || '').trim();
    const parent = (row[parentKey] || '').trim();
    const sub = (row[subassetKey] || '').trim();
    const valRaw = (row[valueKey] || '').trim();

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
 * Simple CSV line parser that handles quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = i < line.length - 1 ? line[i + 1] : '';

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Add last field
  result.push(current);
  return result;
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
 * Write JSON output in medium-compact format (one node/link per line)
 */
function writeJSON(data: SankeyData, outputPath: string): void {
  let content = '{\n';
  content += '  "nodes": [\n';
  for (let i = 0; i < data.nodes.length; i++) {
    const comma = i < data.nodes.length - 1 ? ',' : '';
    content += '    ' + JSON.stringify(data.nodes[i]) + comma + '\n';
  }
  content += '  ],\n';
  content += '  "links": [\n';
  for (let i = 0; i < data.links.length; i++) {
    const comma = i < data.links.length - 1 ? ',' : '';
    content += '    ' + JSON.stringify(data.links[i]) + comma + '\n';
  }
  content += '  ],\n';
  content += '  "summary": ';
  content += JSON.stringify(data.summary, null, 2);
  content += '\n}\n';

  fs.writeFileSync(outputPath, content, 'utf-8');
}

/**
 * Print summary statistics to console
 */
function printSummary(summary: SankeySummary): void {
  console.log('=== Summary Statistics ===');
  
  const tp = summary.total_positive;
  const tn = summary.total_negative;
  const tna = summary.total_negative_abs;
  const nn = summary.net_new_capital;
  
  if (tp !== undefined) {
    console.log(`Total positive (buys): ${tp.toFixed(2)}`);
  }
  if (tn !== undefined) {
    console.log(`Total negative (sells): ${tn.toFixed(2)}`);
  }
  if (tna !== undefined) {
    console.log(`Total negative, absolute: ${tna.toFixed(2)}`);
  }
  if (nn !== undefined) {
    console.log(`Net new capital: ${nn.toFixed(2)}`);
  }

  const parents = summary.parents;
  if (parents && parents.length > 0) {
    console.log('\nPer-parent flows:');
    for (const p of parents) {
      console.log(
        `  ${p.superparent}: ${p.parent}: ` +
        `outflow=${p.outflow.toFixed(2)}, ` +
        `inflow=${p.inflow.toFixed(2)}, ` +
        `net=${p.net.toFixed(2)}`
      );
    }
  }

  const supers = summary.superparents;
  if (supers && supers.length > 0) {
    console.log('\nPer-superparent flows:');
    for (const sp of supers) {
      console.log(
        `  ${sp.superparent}: ` +
        `outflow=${sp.outflow.toFixed(2)}, ` +
        `inflow=${sp.inflow.toFixed(2)}, ` +
        `net=${sp.net.toFixed(2)}`
      );
    }
  }

  const spNn = summary.superparent_net_new;
  if (spNn && spNn.length > 0) {
    console.log('\nPer-superparent net new capital:');
    for (const row of spNn) {
      console.log(
        `  ${row.superparent}: net_new_capital=${row.net_new_capital.toFixed(2)}`
      );
    }
  }
  console.log();
}

/**
 * Main function - can be used as a CLI script or imported as a module
 */
export function convertCSVToSankey(
  csvPath: string,
  outputPath: string = 'sankey_data.json',
  options: Partial<CSVOptions> = {}
): void {
  const defaultOptions: CSVOptions = {
    superparentCol: 'SuperParent',
    parentCol: 'Parent',
    subassetCol: 'SubAsset',
    valueCol: 'Value',
  };

  const finalOptions: CSVOptions = { ...defaultOptions, ...options };

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const rows = readCSVRows(csvPath, finalOptions);
  const data = buildSankeyFromRows(rows);

  printSummary(data.summary);
  writeJSON(data, outputPath);
  console.log(`Wrote ${path.resolve(outputPath)}`);
}

// CLI interface (only runs if executed directly)
if (require.main === module) {
  const args = process.argv.slice(2);
  
  let csvFile: string | null = null;
  let outputFile = 'sankey_data.json';
  let superparentCol = 'SuperParent';
  let parentCol = 'Parent';
  let subassetCol = 'SubAsset';
  let valueCol = 'Value';

  // Simple argument parsing
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-o' || arg === '--output') {
      outputFile = args[++i];
    } else if (arg === '--superparent-col') {
      superparentCol = args[++i];
    } else if (arg === '--parent-col') {
      parentCol = args[++i];
    } else if (arg === '--subasset-col') {
      subassetCol = args[++i];
    } else if (arg === '--value-col') {
      valueCol = args[++i];
    } else if (!arg.startsWith('-')) {
      csvFile = arg;
    }
  }

  // Default CSV file if none supplied
  if (!csvFile) {
    csvFile = 'sankey_input_new.csv';
  }

  try {
    convertCSVToSankey(csvFile, outputFile, {
      superparentCol,
      parentCol,
      subassetCol,
      valueCol,
    });
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

