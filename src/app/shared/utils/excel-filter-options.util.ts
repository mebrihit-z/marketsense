/**
 * Utility functions for extracting filter options directly from Excel files
 */

import * as XLSX from 'xlsx';

export interface FilterOptions {
  investorRegions: string[];
  productTypes: string[];
  productSubTypes: ProductSubTypeGroup[];
}

export interface ProductSubTypeGroup {
  productType: string;
  subTypes: string[];
}

interface ExcelFilterOptions {
  superparentCol?: string;
  parentCol?: string;
  subassetCol?: string;
  sheetName?: string;
}

/**
 * Extracts filter options (investor regions, product types, and product sub-types) from an Excel file
 * @param arrayBuffer - The Excel file as an ArrayBuffer
 * @param options - Optional configuration for column names and sheet name
 * @returns FilterOptions object containing unique values for each filter category
 */
export function extractFilterOptionsFromExcel(
  arrayBuffer: ArrayBuffer,
  options: ExcelFilterOptions = {}
): FilterOptions {
  const defaultOptions = {
    superparentCol: 'SuperParent',
    parentCol: 'Parent',
    subassetCol: 'SubAsset',
    sheetName: undefined
  };

  const finalOptions = { ...defaultOptions, ...options };

  // Parse Excel file
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  
  // Get the sheet (use provided sheet name or first sheet)
  const sheetName = finalOptions.sheetName || workbook.SheetNames[0];
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

  const superparentKey = resolve(finalOptions.superparentCol);
  const parentKey = resolve(finalOptions.parentCol);
  const subassetKey = resolve(finalOptions.subassetCol);

  // Find column indices
  const superparentIdx = headerRow.indexOf(superparentKey);
  const parentIdx = headerRow.indexOf(parentKey);
  const subassetIdx = headerRow.indexOf(subassetKey);

  // Extract unique values from data rows
  const investorRegionsSet = new Set<string>();
  const productTypesSet = new Set<string>();
  const productSubTypeMap = new Map<string, Set<string>>(); // productType -> Set<subType>

  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) {
      continue; // Skip empty rows
    }

    const investorRegion = String(row[superparentIdx] || '').trim();
    const productType = String(row[parentIdx] || '').trim();
    const productSubType = String(row[subassetIdx] || '').trim();

    if (investorRegion) {
      investorRegionsSet.add(investorRegion);
    }
    if (productType) {
      productTypesSet.add(productType);
    }
    if (productType && productSubType) {
      if (!productSubTypeMap.has(productType)) {
        productSubTypeMap.set(productType, new Set());
      }
      productSubTypeMap.get(productType)!.add(productSubType);
    }
  }

  // Convert to arrays and sort
  const investorRegions = Array.from(investorRegionsSet).sort();
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
    productTypes,
    productSubTypes
  };
}

