/* eslint-disable */
/**
 * Utility functions for extracting data from Sankey diagram data structures
 */

import type { SankeyData, SankeyLink, SankeyNode } from './asset-flows-to-sankey.util';

// Re-export for backward compatibility
export type { SankeyData, SankeyLink };
export type SankeyDataNode = SankeyNode;

export interface ProductTypeGroup {
  productType: string;
  subTypes: string[];
}

/**
 * Extracts unique product sub-types from Sankey data nodes.
 * Product sub-types are identified by nodes that contain "(Source)" or "(Destination)" in their names.
 * The function extracts the product sub-type name by removing the region prefix and the "(Source)" or "(Destination)" suffix.
 * 
 * @param data - The Sankey data object containing nodes array
 * @returns Array of unique product sub-type names, sorted alphabetically
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
 * @param data - The Sankey data object containing nodes array
 * @returns Array of unique product type names, sorted alphabetically
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
 * Groups product sub-types by their product types using the links in the Sankey data.
 * This function traces the relationships:
 * - Destination nodes -> End nodes (direct mapping)
 * - Source nodes -> Start nodes (which have the same product type as End nodes)
 * 
 * @param data - The Sankey data object containing nodes and links
 * @returns Array of ProductTypeGroup objects, each containing a product type and its sub-types
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
  if (!data || !data.nodes || !Array.isArray(data.nodes) || !data.links || !Array.isArray(data.links)) {
    return [];
  }

  // Step 1: Extract product types from Start and End nodes
  // Start and End nodes have the format: "Region: ProductType (Start/End)"
  const startNodeToProductType = new Map<string, string>();
  const endNodeToProductType = new Map<string, string>();
  
  data.nodes.forEach(node => {
    const name = node.name;
    
    if (name.includes('(Start)')) {
      const match = name.match(/:\s*(.+?)\s*\(Start\)/);
      if (match && match[1]) {
        startNodeToProductType.set(name, match[1].trim());
      }
    } else if (name.includes('(End)')) {
      const match = name.match(/:\s*(.+?)\s*\(End\)/);
      if (match && match[1]) {
        endNodeToProductType.set(name, match[1].trim());
      }
    }
  });

  // Step 2: Map sub-types to product types
  const subTypeToProductType = new Map<string, string>();
  
  // Process Destination nodes: they link directly to End nodes
  data.links.forEach(link => {
    const source = typeof link.source === 'string' ? link.source : '';
    const target = typeof link.target === 'string' ? link.target : '';
    
    if (source.includes('(Destination)') && endNodeToProductType.has(target)) {
      const match = source.match(/:\s*(.+?)\s*\(Destination\)/);
      if (match && match[1]) {
        const subType = match[1].trim();
        const productType = endNodeToProductType.get(target)!;
        subTypeToProductType.set(subType, productType);
      }
    }
  });
  
  // Process Source nodes: they link from Start nodes
  data.links.forEach(link => {
    const source = typeof link.source === 'string' ? link.source : '';
    const target = typeof link.target === 'string' ? link.target : '';
    
    if (target.includes('(Source)') && startNodeToProductType.has(source)) {
      const match = target.match(/:\s*(.+?)\s*\(Source\)/);
      if (match && match[1]) {
        const subType = match[1].trim();
        const productType = startNodeToProductType.get(source)!;
        // Only add if not already mapped (Destination nodes take precedence for duplicates)
        if (!subTypeToProductType.has(subType)) {
          subTypeToProductType.set(subType, productType);
        }
      }
    }
  });

  // Step 3: Group sub-types by product type
  const groupedMap = new Map<string, Set<string>>();
  
  subTypeToProductType.forEach((productType, subType) => {
    if (!groupedMap.has(productType)) {
      groupedMap.set(productType, new Set());
    }
    groupedMap.get(productType)!.add(subType);
  });

  // Step 4: Convert to array format and sort
  const result: ProductTypeGroup[] = Array.from(groupedMap.entries())
    .map(([productType, subTypesSet]) => ({
      productType,
      subTypes: Array.from(subTypesSet).sort()
    }))
    .sort((a, b) => a.productType.localeCompare(b.productType));

  return result;
}

/**
 * Extracts unique investor regions from Sankey data summary.
 * Investor regions are identified from the summary.superparents array.
 * 
 * @param data - The Sankey data object containing summary with superparents array
 * @returns Array of unique investor region names, sorted alphabetically
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

  data.summary.superparents.forEach((item: any) => {
    if (item && item.superparent && typeof item.superparent === 'string') {
      regions.add(item.superparent.trim());
    }
  });

  // Return sorted array of unique investor regions
  return Array.from(regions).sort();
}

/**
 * Extracts the investor region from a node name.
 * Node names have the format: "Region: ..." or "Net New Capital (Region)"
 * 
 * @param nodeName - The node name to extract the region from
 * @returns The investor region name, or null if not found
 */
export function extractRegionFromNodeName(nodeName: string): string | null {
  // Check for "Net New Capital (Region)" format
  const netNewCapitalMatch = nodeName.match(/Net New Capital \((.+?)\)/);
  if (netNewCapitalMatch && netNewCapitalMatch[1]) {
    return netNewCapitalMatch[1].trim();
  }

  // Check for "Capital Withdrawn (Region)" format
  const capitalWithdrawnMatch = nodeName.match(/Capital Withdrawn \((.+?)\)/);
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
 * @param nodeName - The node name to extract the product type from
 * @returns The product type name, or null if not found
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
 * @param nodeName - The node name to extract the product sub-type from
 * @returns The product sub-type name, or null if not found
 */
export function extractProductSubTypeFromNodeName(nodeName: string): string | null {
  // Check for "Region: ProductSubType (Source)" or "Region: ProductSubType (Destination)" format
  const match = nodeName.match(/:\s*(.+?)\s*\((Source|Destination)\)/);
  if (match && match[1]) {
    return match[1].trim();
  }
  
  return null;
}

/**
 * Filters Sankey data based on selected investor regions, product types, and product sub-types.
 * Only nodes and links that match the selected filters are included in the result.
 * 
 * @param data - The Sankey data object to filter
 * @param selectedInvestorRegions - Array of selected investor region names (empty array means all regions)
 * @param selectedProductTypes - Array of selected product type names (empty array means all types)
 * @param selectedProductSubTypes - Array of selected product sub-type names (empty array means all sub-types)
 * @returns Filtered Sankey data object
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

  // If no filters are selected, return original data
  const hasInvestorRegionFilter = regionsToFilter.length > 0;
  const hasProductTypeFilter = selectedProductTypes.length > 0;
  const hasProductSubTypeFilter = selectedProductSubTypes.length > 0;
  
  if (!hasInvestorRegionFilter && !hasProductTypeFilter && !hasProductSubTypeFilter) {
    return data;
  }

  // First pass: identify nodes that directly match filters
  const directlyMatchingNodes = new Set<string>();
  
  data.nodes.forEach(node => {
    const nodeName = node.name;
    let matches = true;

    // Check investor region filter
    if (hasInvestorRegionFilter) {
      const region = extractRegionFromNodeName(nodeName);
      if (!region || !regionsToFilter.includes(region)) {
        matches = false;
      }
    }

    // Check product type filter (for Start/End nodes)
    if (matches && hasProductTypeFilter && (nodeName.includes('(Start)') || nodeName.includes('(End)'))) {
      const productType = extractProductTypeFromNodeName(nodeName);
      if (!productType || !selectedProductTypes.includes(productType)) {
        matches = false;
      }
    }

    // Check product sub-type filter (for Source/Destination nodes)
    if (matches && hasProductSubTypeFilter && (nodeName.includes('(Source)') || nodeName.includes('(Destination)'))) {
      const productSubType = extractProductSubTypeFromNodeName(nodeName);
      if (!productSubType || !selectedProductSubTypes.includes(productSubType)) {
        matches = false;
      }
    }

    if (matches) {
      directlyMatchingNodes.add(nodeName);
    }
  });

  // When filtering by investor region, always include Super Start/End nodes and Reallocation Pools for those regions
  // This ensures the diagram structure is maintained
  if (hasInvestorRegionFilter) {
    data.nodes.forEach(node => {
      const nodeName = node.name;
      const region = extractRegionFromNodeName(nodeName);
      
      if (region && regionsToFilter.includes(region)) {
        // Always include Super Start, Super End, Reallocation Pool, and Net New Capital for selected regions
        // These are structural nodes that maintain the diagram's visual structure
        if (nodeName.includes('Super Start') || 
            nodeName.includes('Super End') || 
            nodeName.includes('Reallocation Pool') ||
            nodeName.includes('Net New Capital')) {
          directlyMatchingNodes.add(nodeName);
        }
        
        // If only region filter is applied (no product type or sub-type filters), include all nodes for that region
        // This preserves the full structure when filtering by region only
        if (!hasProductTypeFilter && !hasProductSubTypeFilter) {
          // Include all Start/End nodes
          if (nodeName.includes('(Start)') || nodeName.includes('(End)')) {
            directlyMatchingNodes.add(nodeName);
          }
          // Include all Source/Destination nodes
          if (nodeName.includes('(Source)') || nodeName.includes('(Destination)')) {
            directlyMatchingNodes.add(nodeName);
          }
        }
      }
    });
  }

  // Helper function to check if a node passes all applicable filters
  const nodePassesFilters = (nodeName: string, checkProductType: boolean, checkProductSubType: boolean): boolean => {
    // Check investor region filter (applies to all nodes)
    if (hasInvestorRegionFilter) {
      const region = extractRegionFromNodeName(nodeName);
      if (!region || !regionsToFilter.includes(region)) {
        return false;
      }
    }
    
    // Check product type filter (only for Start/End nodes when checkProductType is true)
    if (checkProductType && hasProductTypeFilter && (nodeName.includes('(Start)') || nodeName.includes('(End)'))) {
      const productType = extractProductTypeFromNodeName(nodeName);
      if (!productType || !selectedProductTypes.includes(productType)) {
        return false;
      }
    }
    
    // Check product sub-type filter (only for Source/Destination nodes when checkProductSubType is true)
    if (checkProductSubType && hasProductSubTypeFilter && (nodeName.includes('(Source)') || nodeName.includes('(Destination)'))) {
      const productSubType = extractProductSubTypeFromNodeName(nodeName);
      if (!productSubType || !selectedProductSubTypes.includes(productSubType)) {
        return false;
      }
    }
    
    return true;
  };

  // Multiple passes to include all connected structural nodes
  const nodesToInclude = new Set<string>(directlyMatchingNodes);
  const links = data.links || [];
  let changed = true;
  let iterations = 0;
  const maxIterations = 10; // Safety limit to prevent infinite loops
  
  // Keep iterating until no new nodes are added (to handle multi-level connections)
  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;
    
    links.forEach(link => {
      const source = typeof link.source === 'string' ? link.source : '';
      const target = typeof link.target === 'string' ? link.target : '';
      
      // If source is included, check if we should include target
      if (nodesToInclude.has(source) && !nodesToInclude.has(target)) {
        let shouldInclude = false;
        
        // Structural nodes (don't have product types/sub-types, only check region filter)
        if (target.includes('Reallocation Pool') || 
            target.includes('Net New Capital') || 
            target.includes('Super Start') || 
            target.includes('Super End')) {
          shouldInclude = nodePassesFilters(target, false, false);
        }
        // Start/End nodes (have product types, check product type filter)
        else if (target.includes('(Start)') || target.includes('(End)')) {
          shouldInclude = nodePassesFilters(target, true, false);
        }
        // Source/Destination nodes (have product sub-types, check product sub-type filter)
        else if (target.includes('(Source)') || target.includes('(Destination)')) {
          shouldInclude = nodePassesFilters(target, false, true);
        }
        
        if (shouldInclude) {
          nodesToInclude.add(target);
          changed = true;
        }
      }
      
      // If target is included, check if we should include source
      if (nodesToInclude.has(target) && !nodesToInclude.has(source)) {
        let shouldInclude = false;
        
        // Structural nodes (don't have product types/sub-types, only check region filter)
        if (source.includes('Reallocation Pool') || 
            source.includes('Net New Capital') || 
            source.includes('Super Start') || 
            source.includes('Super End')) {
          shouldInclude = nodePassesFilters(source, false, false);
        }
        // Start/End nodes (have product types, check product type filter)
        else if (source.includes('(Start)') || source.includes('(End)')) {
          shouldInclude = nodePassesFilters(source, true, false);
        }
        // Source/Destination nodes (have product sub-types, check product sub-type filter)
        else if (source.includes('(Source)') || source.includes('(Destination)')) {
          shouldInclude = nodePassesFilters(source, false, true);
        }
        
        if (shouldInclude) {
          nodesToInclude.add(source);
          changed = true;
        }
      }
    });
  }

  // Helper function to check if a node should be included
  const shouldIncludeNode = (nodeName: string): boolean => {
    return nodesToInclude.has(nodeName);
  };

  // Filter nodes
  const filteredNodes = data.nodes.filter(node => shouldIncludeNode(node.name));
  const filteredNodeNames = new Set(filteredNodes.map(node => node.name));

  // Filter links to only include links between filtered nodes
  const filteredLinks = (data.links || []).filter(link => {
    const source = typeof link.source === 'string' ? link.source : '';
    const target = typeof link.target === 'string' ? link.target : '';
    return filteredNodeNames.has(source) && filteredNodeNames.has(target);
  });

  // Return filtered data
  return {
    ...data,
    nodes: filteredNodes,
    links: filteredLinks
  };
}

/**
 * Filters Sankey links by optional lower and upper bounds (values in billions).
 * Removes links outside the range and any nodes that are no longer connected.
 *
 * @param minValue - Use 0 or less to apply no lower bound.
 * @param maxValue - Use null/undefined to apply no upper bound.
 */
export function filterSankeyDataByFlowValueRange(
  data: SankeyData,
  minValue: number,
  maxValue: number | null | undefined
): SankeyData {
  if (!data || !data.links || !Array.isArray(data.links)) {
    return data;
  }

  const hasMin = minValue > 0;
  const hasMax = maxValue != null && Number.isFinite(maxValue as number);
  if (!hasMin && !hasMax) {
    return data;
  }

  const max = hasMax ? (maxValue as number) : Infinity;

  const filteredLinks = data.links.filter((link) => {
    const v = link.value ?? 0;
    if (hasMin && v < minValue) return false;
    if (hasMax && v > max) return false;
    return true;
  });

  if (filteredLinks.length === 0) {
    return {
      ...data,
      nodes: [],
      links: [],
      summary: data.summary
        ? {
            ...data.summary,
            superparents: [],
            parents: [],
            superparent_net_new: []
          }
        : (data as any).summary
    };
  }

  const nodeNames = new Set<string>();
  filteredLinks.forEach((link) => {
    const source = typeof link.source === 'string' ? link.source : '';
    const target = typeof link.target === 'string' ? link.target : '';
    if (source) nodeNames.add(source);
    if (target) nodeNames.add(target);
  });

  const filteredNodes = (data.nodes || []).filter((node) => nodeNames.has(node.name));

  return {
    ...data,
    nodes: filteredNodes,
    links: filteredLinks
  };
}

/**
 * Filters Sankey data by a minimum flow value (e.g. only show links with value >= minValue in billions).
 * Removes links below the threshold and any nodes that are no longer connected.
 *
 * @param data - The Sankey data object to filter
 * @param minValue - Minimum link value in billions (e.g. 0.5 for $0.5B). Use 0 or undefined to skip filtering.
 * @returns Filtered Sankey data with only links >= minValue and their connected nodes
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

