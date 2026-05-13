/* eslint-disable max-lines */
/**
 * Utility functions for extracting data from Sankey diagram data structures
 */

import type { SankeyData, SankeyLink, SankeyNode, SankeySummary } from './asset-flows-to-sankey.util';

// Re-export for backward compatibility
export type { SankeyData, SankeyLink };
export type SankeyDataNode = SankeyNode;

/**
 * One product type bucket with its component sub-types (filters / UI).
 *
 * @property {string} productType - Product type label
 * @property {string[]} subTypes - Sorted unique sub-type labels under this type
 */
export interface ProductTypeGroup {
  productType: string;
  subTypes: string[];
}

/**
 * Extracts unique product sub-types from Sankey data nodes.
 * Product sub-types are identified by nodes that contain "(Source)" or "(Destination)" in their names.
 * The function extracts the product sub-type name by removing the region prefix and the "(Source)" or "(Destination)" suffix.
 *
 * @param {import('./asset-flows-to-sankey.util').SankeyData} data - The Sankey data object containing nodes array
 * @returns {string[]} Array of unique product sub-type names, sorted alphabetically
 * 
 * @example
 * const subTypes = extractProductSubTypes(sankeyData);
 * // Returns: ["Bank Deposits / CDs", "Convertible", "Global Equity", ...]
 */
export function extractProductSubTypes(data: SankeyData): string[] {
  if (!data || !data.nodes || !Array.isArray(data.nodes)) {
    return [];
  }

  const subTypes = new Set<string>();

  data.nodes.forEach(node => {
    const name = node.name;
    
    // Check if node contains (Source) or (Destination)
    if (name.includes('(Source)') || name.includes('(Destination)')) {
      // Extract the product sub-type by matching the pattern:
      // "Region: Product Sub-Type (Source/Destination)"
      const match = name.match(/:\s*(.+?)\s*\((Source|Destination)\)/);
      
      if (match && match[1]) {
        subTypes.add(match[1].trim());
      }
    }
  });

  // Return sorted array of unique product sub-types
  return Array.from(subTypes).sort();
}

/**
 * Extracts product types from Sankey data nodes.
 * Product types are identified by nodes that contain "(End)" in their names.
 *
 * @param {import('./asset-flows-to-sankey.util').SankeyData} data - The Sankey data object containing nodes array
 * @returns {string[]} Array of unique product type names, sorted alphabetically
 * 
 * @example
 * const productTypes = extractProductTypes(sankeyData);
 * // Returns: ["Cash", "Equity", "Fixed Income", "Multi-Asset", ...]
 */
export function extractProductTypes(data: SankeyData): string[] {
  if (!data || !data.nodes || !Array.isArray(data.nodes)) {
    return [];
  }

  const productTypes = new Set<string>();

  data.nodes.forEach(node => {
    const name = node.name;
    
    // Check if node contains (End) which represents a product type
    if (name.includes('(End)')) {
      // Extract the product type by matching the pattern:
      // "Region: Product Type (End)"
      const match = name.match(/:\s*(.+?)\s*\(End\)/);
      
      if (match && match[1]) {
        productTypes.add(match[1].trim());
      }
    }
  });

  // Return sorted array of unique product types
  return Array.from(productTypes).sort();
}

/**
 * Builds maps from Start/End node display names to their product type labels.
 *
 * @param {Array<import('./asset-flows-to-sankey.util').SankeyNode>} nodes - All Sankey nodes from diagram data
 * @returns {{ startNodeToProductType: Map<string, string>; endNodeToProductType: Map<string, string> }}
 *   Maps keyed by full node name (`Region: Type (Start|End)`)
 */
function collectStartAndEndNodeProductTypes(nodes: SankeyNode[]): {
  startNodeToProductType: Map<string, string>;
  endNodeToProductType: Map<string, string>;
} {
  const startNodeToProductType = new Map<string, string>();
  const endNodeToProductType = new Map<string, string>();
  nodes.forEach(node => {
    const name = node.name;
    if (name.includes('(Start)')) {
      const match = name.match(/:\s*(.+?)\s*\(Start\)/);
      if (match?.[1]) {
        startNodeToProductType.set(name, match[1].trim());
      }
    } else if (name.includes('(End)')) {
      const match = name.match(/:\s*(.+?)\s*\(End\)/);
      if (match?.[1]) {
        endNodeToProductType.set(name, match[1].trim());
      }
    }
  });
  return { startNodeToProductType, endNodeToProductType };
}

/**
 * Maps product sub-types (Destination nodes) to product types via links to End nodes.
 *
 * @param {ReadonlyArray<import('./asset-flows-to-sankey.util').SankeyLink>} links - Sankey links
 * @param {Map<string, string>} endNodeToProductType - End node name → product type
 * @param {Map<string, string>} subTypeToProductType - Map to mutate (sub-type → product type)
 * @returns {void}
 */
function mergeDestinationSubTypeMappings(
  links: readonly SankeyLink[],
  endNodeToProductType: Map<string, string>,
  subTypeToProductType: Map<string, string>
): void {
  links.forEach(link => {
    const source = typeof link.source === 'string' ? link.source : '';
    const target = typeof link.target === 'string' ? link.target : '';
    if (source.includes('(Destination)') && endNodeToProductType.has(target)) {
      const match = source.match(/:\s*(.+?)\s*\(Destination\)/);
      if (match?.[1]) {
        const subType = match[1].trim();
        const productType = endNodeToProductType.get(target);
        if (productType !== undefined) {
          subTypeToProductType.set(subType, productType);
        }
      }
    }
  });
}

/**
 * Maps product sub-types (Source nodes) to product types via links from Start nodes.
 * Does not overwrite entries already set from destination-side mapping.
 *
 * @param {ReadonlyArray<import('./asset-flows-to-sankey.util').SankeyLink>} links - Sankey links
 * @param {Map<string, string>} startNodeToProductType - Start node name → product type
 * @param {Map<string, string>} subTypeToProductType - Map to mutate (sub-type → product type)
 * @returns {void}
 */
function mergeSourceSubTypeMappings(
  links: readonly SankeyLink[],
  startNodeToProductType: Map<string, string>,
  subTypeToProductType: Map<string, string>
): void {
  links.forEach(link => {
    const source = typeof link.source === 'string' ? link.source : '';
    const target = typeof link.target === 'string' ? link.target : '';
    if (target.includes('(Source)') && startNodeToProductType.has(source)) {
      const match = target.match(/:\s*(.+?)\s*\(Source\)/);
      if (match?.[1]) {
        const subType = match[1].trim();
        const productType = startNodeToProductType.get(source);
        if (productType !== undefined && !subTypeToProductType.has(subType)) {
          subTypeToProductType.set(subType, productType);
        }
      }
    }
  });
}

/**
 * Groups sub-type labels under product types and sorts for stable UI ordering.
 *
 * @param {Map<string, string>} subTypeToProductType - Product sub-type → product type
 * @returns {Array<{productType: string, subTypes: string[]}>} Sorted groups with sorted `subTypes` arrays
 */
function productTypeGroupsFromSubTypeMap(subTypeToProductType: Map<string, string>): ProductTypeGroup[] {
  const groupedMap = new Map<string, Set<string>>();
  Array.from(subTypeToProductType.entries()).forEach(([subType, productType]) => {
    let subTypesSet = groupedMap.get(productType);
    if (!subTypesSet) {
      subTypesSet = new Set();
      groupedMap.set(productType, subTypesSet);
    }
    subTypesSet.add(subType);
  });
  return Array.from(groupedMap.entries())
    .map(([productType, subTypesSet]) => ({
      productType,
      subTypes: Array.from(subTypesSet).sort()
    }))
    .sort((a, b) => a.productType.localeCompare(b.productType));
}

/**
 * Groups product sub-types by their product types using the links in the Sankey data.
 * This function traces the relationships:
 * - Destination nodes -> End nodes (direct mapping)
 * - Source nodes -> Start nodes (which have the same product type as End nodes)
 *
 * @param {import('./asset-flows-to-sankey.util').SankeyData} data - The Sankey data object containing nodes and links
 * @returns {Array<{productType: string, subTypes: string[]}>} Array of product-type groups, each with a type and its sub-types
 *
 * @example
 * const groups = extractProductSubTypesByType(sankeyData);
 * // Returns: [
 * //   { productType: "Cash", subTypes: ["Bank Deposits / CDs", "Money Market Funds", ...] },
 * //   { productType: "Equity", subTypes: ["Global Equity", "Emerging Markets", ...] },
 * //   ...
 * // ]
 */
export function extractProductSubTypesByType(data: SankeyData): ProductTypeGroup[] {
  if (!data?.nodes || !Array.isArray(data.nodes) || !data.links || !Array.isArray(data.links)) {
    return [];
  }
  const { startNodeToProductType, endNodeToProductType } = collectStartAndEndNodeProductTypes(data.nodes);
  const subTypeToProductType = new Map<string, string>();
  mergeDestinationSubTypeMappings(data.links, endNodeToProductType, subTypeToProductType);
  mergeSourceSubTypeMappings(data.links, startNodeToProductType, subTypeToProductType);
  return productTypeGroupsFromSubTypeMap(subTypeToProductType);
}

/**
 * Extracts unique investor regions from Sankey data summary.
 * Investor regions are identified from the summary.superparents array.
 *
 * @param {import('./asset-flows-to-sankey.util').SankeyData} data - The Sankey data object containing summary with superparents array
 * @returns {string[]} Array of unique investor region names, sorted alphabetically
 *
 * @example
 * const investorRegions = extractInvestorRegions(sankeyData);
 * // Returns: ["United Kingdom", "United States"]
 */
export function extractInvestorRegions(data: SankeyData): string[] {
  if (!data || !data.summary || !data.summary.superparents || !Array.isArray(data.summary.superparents)) {
    return [];
  }

  const regions = new Set<string>();

  data.summary.superparents.forEach((item: SankeySummary['superparents'][number]) => {
    if (item && item.superparent && typeof item.superparent === 'string') {
      regions.add(item.superparent.trim());
    }
  });

  // Return sorted array of unique investor regions
  return Array.from(regions).sort();
}

/**
 * Extracts the investor region from a node name.
 * Node names have the format: "Region: ..." or "Capital In (Region)"
 *
 * @param {string} nodeName - The node name to extract the region from
 * @returns {string | null} The investor region name, or null if not found
 */
export function extractRegionFromNodeName(nodeName: string): string | null {
  // Check for "Capital In (Region)" format
  const netNewCapitalMatch = nodeName.match(/Capital In \((.+?)\)/);
  if (netNewCapitalMatch && netNewCapitalMatch[1]) {
    return netNewCapitalMatch[1].trim();
  }

  // Check for "Capital Out (Region)" format
  const capitalWithdrawnMatch = nodeName.match(/Capital Out \((.+?)\)/);
  if (capitalWithdrawnMatch && capitalWithdrawnMatch[1]) {
    return capitalWithdrawnMatch[1].trim();
  }

  // Check for "Region: ..." format
  const colonMatch = nodeName.match(/^(.+?):/);
  if (colonMatch && colonMatch[1]) {
    return colonMatch[1].trim();
  }
  
  // Check for "Region (Super Start)" or "Region (Super End)" format
  const superMatch = nodeName.match(/^(.+?)\s*\(Super (Start|End)\)/);
  if (superMatch && superMatch[1]) {
    return superMatch[1].trim();
  }
  
  return null;
}

/**
 * Extracts the product type from a node name.
 * Product types are found in nodes with "(End)" or "(Start)" suffixes.
 *
 * @param {string} nodeName - The node name to extract the product type from
 * @returns {string | null} The product type name, or null if not found
 */
export function extractProductTypeFromNodeName(nodeName: string): string | null {
  // Check for "Region: ProductType (End)" or "Region: ProductType (Start)" format
  const match = nodeName.match(/:\s*(.+?)\s*\((End|Start)\)/);
  if (match && match[1]) {
    return match[1].trim();
  }
  
  return null;
}

/**
 * Extracts the product sub-type from a node name.
 * Product sub-types are found in nodes with "(Source)" or "(Destination)" suffixes.
 *
 * @param {string} nodeName - The node name to extract the product sub-type from
 * @returns {string | null} The product sub-type name, or null if not found
 */
export function extractProductSubTypeFromNodeName(nodeName: string): string | null {
  // Check for "Region: ProductSubType (Source)" or "Region: ProductSubType (Destination)" format
  const match = nodeName.match(/:\s*(.+?)\s*\((Source|Destination)\)/);
  if (match && match[1]) {
    return match[1].trim();
  }
  
  return null;
}

type SankeyNodeFilterContext = {
  hasInvestorRegionFilter: boolean;
  regionsToFilter: string[];
  hasProductTypeFilter: boolean;
  selectedProductTypes: string[];
  hasProductSubTypeFilter: boolean;
  selectedProductSubTypes: string[];
};

function sankeyNodePassesRegionAndProductFilters(
  ctx: SankeyNodeFilterContext,
  nodeName: string,
  checkProductType: boolean,
  checkProductSubType: boolean
): boolean {
  if (ctx.hasInvestorRegionFilter) {
    const region = extractRegionFromNodeName(nodeName);
    if (!region || !ctx.regionsToFilter.includes(region)) {
      return false;
    }
  }
  if (
    checkProductType &&
    ctx.hasProductTypeFilter &&
    (nodeName.includes('(Start)') || nodeName.includes('(End)'))
  ) {
    const productType = extractProductTypeFromNodeName(nodeName);
    if (!productType || !ctx.selectedProductTypes.includes(productType)) {
      return false;
    }
  }
  if (
    checkProductSubType &&
    ctx.hasProductSubTypeFilter &&
    (nodeName.includes('(Source)') || nodeName.includes('(Destination)'))
  ) {
    const productSubType = extractProductSubTypeFromNodeName(nodeName);
    if (!productSubType || !ctx.selectedProductSubTypes.includes(productSubType)) {
      return false;
    }
  }
  return true;
}

function addSankeyNodesFromDirectFilterPass(
  nodes: SankeyNode[],
  ctx: SankeyNodeFilterContext,
  out: Set<string>
): void {
  nodes.forEach(node => {
    const nodeName = node.name;
    let matches = true;
    if (ctx.hasInvestorRegionFilter) {
      const region = extractRegionFromNodeName(nodeName);
      if (!region || !ctx.regionsToFilter.includes(region)) {
        matches = false;
      }
    }
    if (
      matches &&
      ctx.hasProductTypeFilter &&
      (nodeName.includes('(Start)') || nodeName.includes('(End)'))
    ) {
      const productType = extractProductTypeFromNodeName(nodeName);
      if (!productType || !ctx.selectedProductTypes.includes(productType)) {
        matches = false;
      }
    }
    if (
      matches &&
      ctx.hasProductSubTypeFilter &&
      (nodeName.includes('(Source)') || nodeName.includes('(Destination)'))
    ) {
      const productSubType = extractProductSubTypeFromNodeName(nodeName);
      if (!productSubType || !ctx.selectedProductSubTypes.includes(productSubType)) {
        matches = false;
      }
    }
    if (matches) {
      out.add(nodeName);
    }
  });
}

function addSankeyStructuralNodesForFilteredRegions(
  nodes: SankeyNode[],
  ctx: SankeyNodeFilterContext,
  out: Set<string>
): void {
  nodes.forEach(node => {
    const nodeName = node.name;
    const region = extractRegionFromNodeName(nodeName);
    if (!region || !ctx.regionsToFilter.includes(region)) {
      return;
    }
    if (
      nodeName.includes('Super Start') ||
      nodeName.includes('Super End') ||
      nodeName.includes('Reallocation Pool') ||
      nodeName.includes('Capital In') ||
      nodeName.includes('Capital Out')
    ) {
      out.add(nodeName);
    }
    if (!ctx.hasProductTypeFilter && !ctx.hasProductSubTypeFilter) {
      if (nodeName.includes('(Start)') || nodeName.includes('(End)')) {
        out.add(nodeName);
      }
      if (nodeName.includes('(Source)') || nodeName.includes('(Destination)')) {
        out.add(nodeName);
      }
    }
  });
}

function collectSankeyDirectlyMatchingNodeNames(
  data: SankeyData,
  ctx: SankeyNodeFilterContext
): Set<string> {
  const directlyMatchingNodes = new Set<string>();
  addSankeyNodesFromDirectFilterPass(data.nodes, ctx, directlyMatchingNodes);
  if (ctx.hasInvestorRegionFilter) {
    addSankeyStructuralNodesForFilteredRegions(data.nodes, ctx, directlyMatchingNodes);
  }
  return directlyMatchingNodes;
}

function sankeyExpansionTargetAllowed(ctx: SankeyNodeFilterContext, target: string): boolean {
  if (
    target.includes('Reallocation Pool') ||
    target.includes('Capital In') ||
    target.includes('Capital Out') ||
    target.includes('Super Start') ||
    target.includes('Super End')
  ) {
    return sankeyNodePassesRegionAndProductFilters(ctx, target, false, false);
  }
  if (target.includes('(Start)') || target.includes('(End)')) {
    return sankeyNodePassesRegionAndProductFilters(ctx, target, true, false);
  }
  if (target.includes('(Source)') || target.includes('(Destination)')) {
    return sankeyNodePassesRegionAndProductFilters(ctx, target, false, true);
  }
  return false;
}

function sankeyExpansionSourceAllowed(ctx: SankeyNodeFilterContext, source: string): boolean {
  if (
    source.includes('Reallocation Pool') ||
    source.includes('Capital In') ||
    source.includes('Capital Out') ||
    source.includes('Super Start') ||
    source.includes('Super End')
  ) {
    return sankeyNodePassesRegionAndProductFilters(ctx, source, false, false);
  }
  if (source.includes('(Start)') || source.includes('(End)')) {
    return sankeyNodePassesRegionAndProductFilters(ctx, source, true, false);
  }
  if (source.includes('(Source)') || source.includes('(Destination)')) {
    return sankeyNodePassesRegionAndProductFilters(ctx, source, false, true);
  }
  return false;
}

function expandSankeyFilterNodesFromLinks(
  seedNames: Set<string>,
  links: SankeyLink[],
  ctx: SankeyNodeFilterContext,
  maxIterations: number
): Set<string> {
  const nodesToInclude = new Set<string>(seedNames);
  let changed = true;
  let iterations = 0;
  while (changed && iterations < maxIterations) {
    changed = false;
    iterations += 1;
    for (let li = 0; li < links.length; li += 1) {
      const link = links[li];
      const source = typeof link.source === 'string' ? link.source : '';
      const target = typeof link.target === 'string' ? link.target : '';
      if (nodesToInclude.has(source) && !nodesToInclude.has(target)) {
        if (sankeyExpansionTargetAllowed(ctx, target)) {
          nodesToInclude.add(target);
          changed = true;
        }
      }
      if (nodesToInclude.has(target) && !nodesToInclude.has(source)) {
        if (sankeyExpansionSourceAllowed(ctx, source)) {
          nodesToInclude.add(source);
          changed = true;
        }
      }
    }
  }
  return nodesToInclude;
}

/**
 * Filters Sankey data based on selected investor regions, product types, and product sub-types.
 * Only nodes and links that match the selected filters are included in the result.
 *
 * @param {import('./asset-flows-to-sankey.util').SankeyData} data - The Sankey data object to filter
 * @param {string[]} [selectedInvestorRegions] - Selected investor region names (empty means all regions)
 * @param {string[]} [selectedProductTypes] - Selected product type names (empty means all types)
 * @param {string[]} [selectedProductSubTypes] - Selected product sub-type names (empty means all sub-types)
 * @returns {import('./asset-flows-to-sankey.util').SankeyData} Filtered Sankey data object
 */
export function filterSankeyData(
  data: SankeyData,
  selectedInvestorRegions: string[] = [],
  selectedProductTypes: string[] = [],
  selectedProductSubTypes: string[] = []
): SankeyData {
  if (!data || !data.nodes || !Array.isArray(data.nodes)) {
    return data;
  }
  const regionsToFilter = selectedInvestorRegions || [];
  const ctx: SankeyNodeFilterContext = {
    hasInvestorRegionFilter: regionsToFilter.length > 0,
    regionsToFilter,
    hasProductTypeFilter: selectedProductTypes.length > 0,
    selectedProductTypes,
    hasProductSubTypeFilter: selectedProductSubTypes.length > 0,
    selectedProductSubTypes
  };
  if (!ctx.hasInvestorRegionFilter && !ctx.hasProductTypeFilter && !ctx.hasProductSubTypeFilter) {
    return data;
  }
  const direct = collectSankeyDirectlyMatchingNodeNames(data, ctx);
  const nodesToInclude = expandSankeyFilterNodesFromLinks(direct, data.links || [], ctx, 10);
  const filteredNodes = data.nodes.filter(node => nodesToInclude.has(node.name));
  const filteredNodeNames = new Set(filteredNodes.map(node => node.name));
  const filteredLinks = (data.links || []).filter(link => {
    const source = typeof link.source === 'string' ? link.source : '';
    const target = typeof link.target === 'string' ? link.target : '';
    return filteredNodeNames.has(source) && filteredNodeNames.has(target);
  });
  return {
    ...data,
    nodes: filteredNodes,
    links: filteredLinks
  };
}

/**
 * True if either endpoint is a Capital In or Capital Out structural node.
 *
 * @param {string} source - Link source node name
 * @param {string} target - Link target node name
 * @returns {boolean} Whether the link touches net-new or withdrawal structural nodes
 */
function linkTouchesNetNewOrWithdrawn(source: string, target: string): boolean {
  const touches = (name: string) =>
    name.includes('Capital In') || name.includes('Capital Out');
  return touches(source) || touches(target);
}

function buildSankeyTopologyDegreeMaps(
  fullTopologyLinks: readonly { source: string; target: string }[]
): {
  inDegree: Map<string, number>;
  outDegree: Map<string, number>;
  allNames: Set<string>;
} {
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const allNames = new Set<string>();
  fullTopologyLinks.forEach(l => {
    const s = typeof l.source === 'string' ? l.source : '';
    const t = typeof l.target === 'string' ? l.target : '';
    if (s) {
      allNames.add(s);
      outDegree.set(s, (outDegree.get(s) ?? 0) + 1);
    }
    if (t) {
      allNames.add(t);
      inDegree.set(t, (inDegree.get(t) ?? 0) + 1);
    }
  });
  return { inDegree, outDegree, allNames };
}

function collectZeroInDegreeNodeNames(
  allNames: Set<string>,
  inDegree: Map<string, number>
): Set<string> {
  const seeds = new Set<string>();
  allNames.forEach(n => {
    if ((inDegree.get(n) ?? 0) === 0) {
      seeds.add(n);
    }
  });
  return seeds;
}

function collectZeroOutDegreeNodeNames(
  allNames: Set<string>,
  outDegree: Map<string, number>
): Set<string> {
  const sinks = new Set<string>();
  allNames.forEach(n => {
    if ((outDegree.get(n) ?? 0) === 0) {
      sinks.add(n);
    }
  });
  return sinks;
}

function forwardReachableAlongSankeyRows(
  rows: readonly { source: string; target: string }[],
  seeds: Set<string>
): Set<string> {
  const reachable = new Set<string>(seeds);
  let growing = true;
  while (growing) {
    growing = false;
    for (let ri = 0; ri < rows.length; ri += 1) {
      const r = rows[ri];
      const s = typeof r.source === 'string' ? r.source : '';
      const t = typeof r.target === 'string' ? r.target : '';
      if (s && t && reachable.has(s) && !reachable.has(t)) {
        reachable.add(t);
        growing = true;
      }
    }
  }
  return reachable;
}

function backwardReachableToSinksAlongSankeyRows(
  rows: readonly { source: string; target: string }[],
  sinks: Set<string>
): Set<string> {
  const canReachSink = new Set<string>(sinks);
  let reverseGrowing = true;
  while (reverseGrowing) {
    reverseGrowing = false;
    for (let ri = 0; ri < rows.length; ri += 1) {
      const r = rows[ri];
      const s = typeof r.source === 'string' ? r.source : '';
      const t = typeof r.target === 'string' ? r.target : '';
      if (s && t && canReachSink.has(t) && !canReachSink.has(s)) {
        canReachSink.add(s);
        reverseGrowing = true;
      }
    }
  }
  return canReachSink;
}

function partitionSankeyRowsByReachability<T extends { source: string; target: string }>(
  rows: readonly T[],
  reachable: Set<string>,
  canReachSink: Set<string>
): { next: T[]; anyRemoved: boolean } {
  const next: T[] = [];
  let anyRemoved = false;
  for (let ri = 0; ri < rows.length; ri += 1) {
    const r = rows[ri];
    const s = typeof r.source === 'string' ? r.source : '';
    const t = typeof r.target === 'string' ? r.target : '';
    if (s && t && reachable.has(s) && canReachSink.has(t)) {
      next.push(r);
    } else {
      anyRemoved = true;
    }
  }
  return { next, anyRemoved };
}

/**
 * Nodes with no incoming edges in the **full** Sankey topology are the only true flow sources
 * (e.g. `… (Super Start)`). After per-link value-range filtering, interior nodes can incorrectly
 * remain if they still have an unmuted **outgoing** link (e.g. sub-asset → pool) while every
 * **incoming** link was pruned — which looks like flows from nowhere. This pass drops any kept
 * link whose source is not reachable from those fixed sources along **kept** links, and repeats
 * until stable, so downstream rows under a pruned parent chain are removed together.
 *
 * @template T - Row type extending `{ source: string; target: string }`
 * @param {Array<{source: string, target: string}>} fullTopologyLinks - Full graph edges for seed/sink detection
 * @param {Array<T>} rows - Link rows to prune (subset topology)
 * @returns {T[]} Rows that lie on some path from a zero-in-degree seed to a zero-out-degree sink in the kept subgraph
 */
export function cascadePruneSankeyLinkRows<T extends { source: string; target: string }>(
  fullTopologyLinks: readonly { source: string; target: string }[],
  rows: readonly T[]
): T[] {
  if (!rows?.length || !fullTopologyLinks?.length) {
    return rows?.length ? [...rows] : [];
  }
  const { inDegree, outDegree, allNames } = buildSankeyTopologyDegreeMaps(fullTopologyLinks);
  const seeds = collectZeroInDegreeNodeNames(allNames, inDegree);
  const sinks = collectZeroOutDegreeNodeNames(allNames, outDegree);
  if (seeds.size === 0 || sinks.size === 0) {
    return [...rows];
  }
  let current = [...rows];
  let changed = true;
  while (changed) {
    changed = false;
    const reachable = forwardReachableAlongSankeyRows(current, seeds);
    const canReachSink = backwardReachableToSinksAlongSankeyRows(current, sinks);
    const { next, anyRemoved } = partitionSankeyRowsByReachability(current, reachable, canReachSink);
    if (anyRemoved) {
      changed = true;
    }
    current = next;
  }
  return current;
}

/**
 * Key for parallel Sankey links that share the same source and target node names.
 *
 * @param {string} source - Source node name
 * @param {string} target - Target node name
 * @returns {string} Delimiter-separated pair key safe for `Map`
 */
export function sankeyLinkPairKey(source: string, target: string): string {
  return `${source}\0${target}`;
}

/**
 * Sum of each link's numeric `value` (USD) for each distinct (source, target) pair.
 * Asset-flow data often emits multiple rows per edge; the value-range filter should use this total
 * so a band like ≥ $10M keeps the edge when the combined flow qualifies, not only when each row does.
 *
 * @param {(ReadonlyArray<import('./asset-flows-to-sankey.util').SankeyLink>|undefined)} links - Sankey links (parallel rows per edge allowed)
 * @returns {Map<string, number>} Map from delimiter-separated (source, target) keys to summed USD value
 */
export function buildSankeySourceTargetPairSumDollars(
  links: readonly SankeyLink[] | undefined
): Map<string, number> {
  const m = new Map<string, number>();
  if (!links?.length) return m;
  links.forEach(link => {
    const source = typeof link.source === 'string' ? link.source : '';
    const target = typeof link.target === 'string' ? link.target : '';
    const k = sankeyLinkPairKey(source, target);
    const v = link.value;
    const add = v != null && Number.isFinite(v) ? v : 0;
    m.set(k, (m.get(k) ?? 0) + add);
  });
  return m;
}

/**
 * Whether a link's `valueDollars` lies within the value-range rail (bounds in **billions USD**).
 * `valueDollars` should be the **total USD across all parallel links** with the same source/target
 * (see `buildSankeySourceTargetPairSumDollars`), not a single row's value, when those parallels exist.
 * Same rules as `filterSankeyDataByFlowValueRange`; use for Sankey visual/prune logic.
 *
 * @param {string} source - Link source node name
 * @param {string} target - Link target node name
 * @param {number | undefined} valueDollars - Flow magnitude in USD (often pair total across parallel links)
 * @param {number} minValueBillions - Lower bound in billions USD (0 means no minimum)
 * @param {number | null | undefined} maxValueBillions - Upper bound in billions USD (`null`/`undefined` means no maximum)
 * @param {boolean} exemptNetNewAndWithdrawnFromFlowValueFilter - When true, links touching Capital In/Out always pass
 * @returns {boolean} Whether the link passes the configured value band
 */
export function linkPassesFlowValueRangeFilter(
  source: string,
  target: string,
  valueDollars: number | undefined,
  minValueBillions: number,
  maxValueBillions: number | null | undefined,
  exemptNetNewAndWithdrawnFromFlowValueFilter: boolean
): boolean {
  const hasMin = minValueBillions > 0;
  const hasMax = maxValueBillions != null && Number.isFinite(maxValueBillions as number);
  if (!hasMin && !hasMax) {
    return true;
  }
  if (
    exemptNetNewAndWithdrawnFromFlowValueFilter &&
    linkTouchesNetNewOrWithdrawn(source, target)
  ) {
    return true;
  }
  const BILLIONS_TO_DOLLARS = 1_000_000_000;
  const minDollars = hasMin ? minValueBillions * BILLIONS_TO_DOLLARS : 0;
  const maxDollars = hasMax ? (maxValueBillions as number) * BILLIONS_TO_DOLLARS : Infinity;
  const v = valueDollars ?? 0;
  if (hasMin && v < minDollars) return false;
  if (hasMax && v > maxDollars) return false;
  return true;
}

function filterSankeyLinksByValueRangeRail(
  links: SankeyLink[],
  minValue: number,
  maxValue: number | null | undefined,
  exemptNetNewAndWithdrawnFromFlowValueFilter: boolean
): SankeyLink[] {
  const pairTotals = buildSankeySourceTargetPairSumDollars(links);
  return links.filter(link => {
    const source = typeof link.source === 'string' ? link.source : '';
    const target = typeof link.target === 'string' ? link.target : '';
    const pairTotal = pairTotals.get(sankeyLinkPairKey(source, target)) ?? link.value ?? 0;
    return linkPassesFlowValueRangeFilter(
      source,
      target,
      pairTotal,
      minValue,
      maxValue,
      exemptNetNewAndWithdrawnFromFlowValueFilter
    );
  });
}

function sankeyDataEmptyAfterFlowFilter(data: SankeyData): SankeyData {
  return {
    ...data,
    nodes: [],
    links: [],
    ...(data.summary
      ? {
          summary: {
            ...data.summary,
            superparents: [],
            parents: [],
            superparent_net_new: []
          }
        }
      : {})
  };
}

function sankeyDataWithPrunedLinks(data: SankeyData, filteredLinks: SankeyLink[]): SankeyData {
  const nodeNames = new Set<string>();
  filteredLinks.forEach(link => {
    const source = typeof link.source === 'string' ? link.source : '';
    const target = typeof link.target === 'string' ? link.target : '';
    if (source) nodeNames.add(source);
    if (target) nodeNames.add(target);
  });
  const filteredNodes = (data.nodes || []).filter(node => nodeNames.has(node.name));
  return {
    ...data,
    nodes: filteredNodes,
    links: filteredLinks
  };
}

/**
 * Filters Sankey links by optional lower and upper bounds.
 * `minValue` / `maxValue` are expressed in **billions USD** (filter rail);
 * each (source, target) pair is tested using the **sum** of link `value` in dollars
 * across all parallel links (same as the Sankey chart prune step).
 *
 * @param {import('./asset-flows-to-sankey.util').SankeyData} data - Sankey diagram payload (`nodes`, `links`, `summary`)
 * @param {number} minValue - Minimum total flow per (source, target) in billions USD (0 skips minimum)
 * @param {number | null | undefined} maxValue - Maximum in billions USD (`null`/`undefined` skips maximum)
 * @param {boolean} [exemptNetNewAndWithdrawnFromFlowValueFilter=false] - Exempt Capital In/Out edges from the band
 * @returns {import('./asset-flows-to-sankey.util').SankeyData} Copy with `links` (and `nodes`) reduced to the surviving subgraph; empty links returns cleared structure
 */
export function filterSankeyDataByFlowValueRange(
  data: SankeyData,
  minValue: number,
  maxValue: number | null | undefined,
  exemptNetNewAndWithdrawnFromFlowValueFilter = false
): SankeyData {
  if (!data || !data.links || !Array.isArray(data.links)) {
    return data;
  }
  const hasMin = minValue > 0;
  const hasMax = maxValue != null && Number.isFinite(maxValue as number);
  if (!hasMin && !hasMax) {
    return data;
  }
  const valueRangeLinks = filterSankeyLinksByValueRangeRail(
    data.links,
    minValue,
    maxValue,
    exemptNetNewAndWithdrawnFromFlowValueFilter
  );
  const filteredLinks = cascadePruneSankeyLinkRows(data.links, valueRangeLinks);
  if (filteredLinks.length === 0) {
    return sankeyDataEmptyAfterFlowFilter(data);
  }
  return sankeyDataWithPrunedLinks(data, filteredLinks);
}

/**
 * Filters Sankey data by a minimum flow value (e.g. only show links with value >= minValue in billions).
 * Removes links below the threshold and any nodes that are no longer connected.
 *
 * @param {import('./asset-flows-to-sankey.util').SankeyData} data - The Sankey data object to filter
 * @param {number} minValue - Minimum link value in billions USD on the rail (e.g. 0.5 for $0.5B). Use 0 or less to skip filtering.
 * @returns {import('./asset-flows-to-sankey.util').SankeyData} Filtered Sankey data with only links >= minValue and their connected nodes
 */
export function filterSankeyDataByMinValue(
  data: SankeyData,
  minValue: number
): SankeyData {
  if (!data || !data.links || !Array.isArray(data.links) || minValue <= 0) {
    return data;
  }
  return filterSankeyDataByFlowValueRange(data, minValue, null);
}

