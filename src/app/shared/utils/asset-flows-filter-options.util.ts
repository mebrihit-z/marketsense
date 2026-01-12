/* eslint-disable */
/**
 * Utility functions for extracting filter options from asset-flows-data.json
 */

import { type AssetFlowRecord } from './asset-flows-to-sankey.util';

export interface FilterOptions {
  investorRegions: string[];
  investorTypes: string[];
  productRegions: string[];
  productTypes: string[];
  productSubTypes: ProductSubTypeGroup[];
}

export interface ProductSubTypeGroup {
  productType: string;
  subTypes: string[];
}

/**
 * Extracts filter options (investor regions, investor types, product regions, product types, and product sub-types) 
 * from asset flows data
 * @param assetFlows - Array of asset flow records
 * @returns FilterOptions object containing unique values for each filter category
 */
export function extractFilterOptionsFromAssetFlows(
  assetFlows: AssetFlowRecord[]
): FilterOptions {
  const investorRegionsSet = new Set<string>();
  const investorTypesSet = new Set<string>();
  const productRegionsSet = new Set<string>();
  const productTypesSet = new Set<string>();
  const productSubTypeMap = new Map<string, Set<string>>(); // productType -> Set<subType>

  // Extract unique values from all records
  assetFlows.forEach(record => {
    if (record.Investor_Region) {
      investorRegionsSet.add(record.Investor_Region);
    }
    if (record.Investor_Types) {
      investorTypesSet.add(record.Investor_Types);
    }
    if (record.Product_Region) {
      productRegionsSet.add(record.Product_Region);
    }
    if (record.Product_Type) {
      productTypesSet.add(record.Product_Type);
    }
    if (record.Product_Type && record.Product_Sub_Type) {
      if (!productSubTypeMap.has(record.Product_Type)) {
        productSubTypeMap.set(record.Product_Type, new Set());
      }
      productSubTypeMap.get(record.Product_Type)!.add(record.Product_Sub_Type);
    }
  });

  // Convert to arrays and sort
  const investorRegions = Array.from(investorRegionsSet).sort();
  const investorTypes = Array.from(investorTypesSet).sort();
  const productRegions = Array.from(productRegionsSet).sort();
  const productTypes = Array.from(productTypesSet).sort();

  // Group product sub-types by product type
  const productSubTypes: ProductSubTypeGroup[] = Array.from(productSubTypeMap.entries())
    .map(([productType, subTypesSet]) => ({
      productType,
      subTypes: Array.from(subTypesSet).sort()
    }))
    .sort((a, b) => a.productType.localeCompare(b.productType));

  return {
    investorRegions,
    investorTypes,
    productRegions,
    productTypes,
    productSubTypes
  };
}

