/**
 * Utility functions for extracting data from Sankey diagram data structures
 */

export interface SankeyDataNode {
  name: string;
}

export interface SankeyData {
  nodes: SankeyDataNode[];
  links?: Array<{ source: string; target: string; value: number }>;
  summary?: any;
}

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

