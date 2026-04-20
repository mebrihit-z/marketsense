/* eslint-disable */
import { Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TreemapCellModalComponent, TreemapCellData } from '../charts/treemap-cell-modal/treemap-cell-modal.component';
import { TreemapComponent } from '../charts/treemap/treemap.component';
import TitleComponent from '../title/title.component';
import { FlowDimensionsComponent, type FlowDimension } from '../flow-dimensions/flow-dimensions.component';
import {
  convertAssetFlowsToSankey,
  filterAssetFlowsByDataTypeResolvingSpan,
  type AssetFlowRecord,
  type SankeyData,
  type AssetFlowDimensionField,
  type SankeyDimensionConfig,
} from '../../utils/asset-flows-to-sankey.util';
import { AssetFlowsDataService } from '../../../core/services/asset-flows-data.service';
import { AssetFlowHistoricAnchorService } from '../../../core/services/asset-flow-historic-anchor.service';
import type { SavedChartHierarchyDimensions } from '../../../core/services/saved-views.service';
import { filterSankeyData } from '../../utils/sankey-data.utils';
import { ChartsExportModalComponent } from '../charts-export-modal/charts-export-modal.component';
import { jsPDF } from 'jspdf';
import {
  captureChartAreaToPng,
  downloadDataUrlAsPng,
  saveChartAsMultiPagePdf,
} from '../../utils/chart-dom-export.util';
import { assetFlowQuarterInTimeWindow } from '../../utils/asset-flow-time-window.util';

export interface TreemapNode {
  id: string;
  label: string;
  value: number;
  percentage: number;
  color: 'green' | 'red' | 'neutral';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TreemapRegion {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children: TreemapNode[];
}

@Component({
  selector: 'app-asset-allocation',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TreemapCellModalComponent,
    TreemapComponent,
    TitleComponent,
    FlowDimensionsComponent,
    ChartsExportModalComponent,
  ],
  templateUrl: './asset-allocation.component.html',
  styleUrl: './asset-allocation.component.scss'
})
export class AssetAllocationComponent implements OnInit, OnChanges {
  @Input() selectedProductTypes: string[] = [];
  @Input() selectedProductRegions: string[] = [];
  @Input() selectedProductSubTypes: string[] = [];
  @Input() selectedInvestorRegions: string[] = [];
  @Input() selectedInvestorTypes: string[] = [];
  @Input() totalProductTypes: number = 0;
  @Input() totalProductSubTypes: number = 0;
  @Input() totalInvestorRegions: number = 0;
  @Input() totalInvestorTypes: number = 0;
  @Input() totalProductRegions: number = 0;
  @Input() timeHorizon: string = '+9 mo';
  @Input() timeHorizonStart?: string;
  @Input() timeHorizonEnd?: string;
  @Input() dataType: 'historical' | 'forecasted' = 'forecasted';
  @Input() minFlowValue = 0;
  @Input() maxFlowValue: number | null = null;
  @Input() forceCloseDimensionDropdown = 0;
  @Output() pinToggle = new EventEmitter<void>();
  @Output() dimensionDropdownOpened = new EventEmitter<void>();
  @Output() chartDimensionsSnapshot = new EventEmitter<SavedChartHierarchyDimensions>();
  
  // View state
  viewMode: 'treemap' | 'packing-circles' = 'treemap';
  isPinned: boolean = false;
  
  
  // Available dimensions for Dimension 1, 2, and 3 dropdowns (includes Product Region for Dimension 1)
  availableDimensions: FlowDimension[] = [
    { id: 'investor-region', label: 'Investor Region', count: 0, active: true },
    { id: 'product-region', label: 'Product Region', count: 0, active: true },
    { id: 'investor-type', label: 'Investor Type', count: 0, active: true },
    { id: 'product-type', label: 'Product Type', count: 0, active: true },
    { id: 'product-sub-types', label: 'Product Sub-Types', count: 0, active: true },
  ];

  // Selected dimensions for drop zones
  selectedDimension1: FlowDimension | null = null;
  selectedDimension2: FlowDimension | null = null;
  selectedDimension3: FlowDimension | null = null;

  /** Default Dimension 3 — must match synthetic "None" in {@link FlowDimensionsComponent}. */
  private readonly defaultDimension3None: FlowDimension = {
    id: 'none',
    label: 'None',
    count: 0,
    active: true,
  };

  // Modal state
  showCellModal: boolean = false;
  selectedCellData: TreemapCellData | null = null;
  showExportModal: boolean = false;

  @ViewChild('chartExportRoot', { read: ElementRef }) chartExportRoot?: ElementRef<HTMLElement>;
  
  // Treemap data map (similar to asset-flows)
  private treemapDataMap = new Map<string, SankeyData>();
  // Super dimension values per key (Dimension 1 values; passed to treemap for correct filtering)
  private treemapSuperValuesMap = new Map<string, string[]>();
  regionDataArray: Array<{
    key: string;
    data: SankeyData;
    investorRegions: string[];
  }> = [];
  
  // Cached arrays to avoid creating new arrays in template
  cachedSelectedProductTypes: string[] = [];
  cachedSelectedProductSubTypes: string[] = [];
  
  // Data loading
  private rawAssetFlowsData?: AssetFlowRecord[];
  
  // Treemap regions data
  treemapRegions: TreemapRegion[] = [
    {
      id: 'us',
      name: 'United States',
      x: 0.67,
      y: 1.6,
      width: 38.89,
      height: 96.8,
      children: [
        { id: 'us-equity', label: 'Equity', value: 285, percentage: 6.8, color: 'green', x: 1.17, y: 6.6, width: 14.49, height: 95.2 },
        { id: 'us-fixed', label: 'Fixed Income', value: 215, percentage: 3.5, color: 'green', x: 15.66, y: 6.6, width: 9.28, height: 44.45 },
        { id: 'us-private', label: 'Private Equ.', value: 95, percentage: 12.5, color: 'green', x: 15.66, y: 48.95, width: 9.07, height: 49.25 },
        { id: 'us-realestate', label: 'Real Estate', value: 95, percentage: -7.2, color: 'red', x: 24.73, y: 48.95, width: 6.21, height: 30.56 },
        { id: 'us-alternatives', label: 'Alternatives', value: 55, percentage: 9.8, color: 'green', x: 24.73, y: 79.51, width: 6.21, height: 18.69 }
      ]
    },
    {
      id: 'europe',
      name: 'Europe',
      x: 39.56,
      y: 1.6,
      width: 32.63,
      height: 96.8,
      children: [
        { id: 'eu-fixed', label: 'Fixed Income', value: 235, percentage: 4.8, color: 'green', x: 40.06, y: 6.6, width: 11.75, height: 33.73 },
        { id: 'eu-equity', label: 'Equity', value: 195, percentage: 2.5, color: 'green', x: 40.06, y: 40.67, width: 16.07, height: 57.13 },
        { id: 'eu-alternatives', label: 'Alternatives', value: 105, percentage: 9.5, color: 'green', x: 55.87, y: 40.67, width: 10.19, height: 30.22 },
        { id: 'eu-infrastructure', label: 'Infrastruct.', value: 58, percentage: 7.8, color: 'green', x: 55.87, y: 71.11, width: 5.87, height: 27.09 },
        { id: 'eu-realestate', label: 'Real Estate', value: 32, percentage: -4.5, color: 'red', x: 66.06, y: 71.11, width: 5.87, height: 27.09 }
      ]
    },
    {
      id: 'asia',
      name: 'Asia Pacific',
      x: 72.19,
      y: 1.6,
      width: 27.14,
      height: 96.8,
      children: [
        { id: 'asia-equity', label: 'Equity', value: 198, percentage: -0.8, color: 'neutral', x: 72.69, y: 6.6, width: 26.14, height: 34.5 },
        { id: 'asia-fixed', label: 'Fixed Income', value: 168, percentage: 2.2, color: 'green', x: 72.69, y: 41.1, width: 13.97, height: 56.7 },
        { id: 'asia-alternatives', label: 'Alternatives', value: 85, percentage: 6.5, color: 'green', x: 86.33, y: 41.1, width: 12.5, height: 30.96 },
        { id: 'asia-realestate', label: 'Real Estate', value: 69, percentage: -3.2, color: 'red', x: 86.33, y: 72.06, width: 12.5, height: 25.74 }
      ]
    }
  ];

  constructor(
    private assetFlowsData: AssetFlowsDataService,
    private historicAnchor: AssetFlowHistoricAnchorService
  ) {}

  ngOnInit(): void {
    this.updateDimensions();
    // Set default dimensions
    this.selectedDimension1 = this.availableDimensions.find(d => d.id === 'investor-region') || null;
    this.selectedDimension2 = this.availableDimensions.find(d => d.id === 'product-type') || null;
    this.selectedDimension3 = { ...this.defaultDimension3None };
    queueMicrotask(() => this.emitChartDimensionsSnapshot());

    // Load data
    this.loadData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedProductTypes'] || changes['selectedProductRegions'] || changes['selectedProductSubTypes'] ||
        changes['selectedInvestorRegions'] || changes['selectedInvestorTypes'] ||
        changes['totalProductTypes'] || changes['totalProductSubTypes'] ||
        changes['totalInvestorRegions'] || changes['totalInvestorTypes'] ||
        changes['totalProductRegions']) {
      this.updateDimensions();
      this.emitChartDimensionsSnapshot();
    }

    // Handle data updates when filters or time horizon change (match asset-flows / filter bar)
    const filterChanged = changes['selectedInvestorRegions'] ||
      changes['selectedInvestorTypes'] ||
      changes['selectedProductRegions'] ||
      changes['selectedProductTypes'] ||
      changes['selectedProductSubTypes'];
    const timeHorizonChanged = changes['timeHorizon'] || 
                               changes['timeHorizonStart'] || 
                               changes['timeHorizonEnd'];
    const dataTypeChanged = changes['dataType'];
    
    if (filterChanged || timeHorizonChanged || dataTypeChanged) {
      if (this.rawAssetFlowsData) {
        this.updateTreemapData();
      }
    }
  }

  private updateDimensions(): void {
    const productRegionDimension = this.availableDimensions.find(d => d.id === 'product-region');
    if (productRegionDimension) {
      productRegionDimension.count = this.selectedProductRegions.length;
      productRegionDimension.total = this.totalProductRegions;
    }

    const productTypeDimension = this.availableDimensions.find(d => d.id === 'product-type');
    if (productTypeDimension) {
      productTypeDimension.count = this.selectedProductTypes.length;
      productTypeDimension.total = this.totalProductTypes;
    }

    const productSubTypeDimension = this.availableDimensions.find(d => d.id === 'product-sub-types');
    if (productSubTypeDimension) {
      productSubTypeDimension.count = this.selectedProductSubTypes.length;
      productSubTypeDimension.total = this.totalProductSubTypes;
    }

    const investorRegionDimension = this.availableDimensions.find(d => d.id === 'investor-region');
    if (investorRegionDimension) {
      investorRegionDimension.count = this.selectedInvestorRegions.length;
      investorRegionDimension.total = this.totalInvestorRegions;
    }

    const investorTypeDimension = this.availableDimensions.find(d => d.id === 'investor-type');
    if (investorTypeDimension) {
      investorTypeDimension.count = this.selectedInvestorTypes.length;
      investorTypeDimension.total = this.totalInvestorTypes;
    }
  }


  /**
   * Gets the values array for a given dimension ID.
   * @param dimensionId - The dimension ID to get values for.
   * @returns Array of selected values for the dimension.
   */
  getDimensionValues(dimensionId: string | null): string[] {
    if (!dimensionId) return [];
    
    switch (dimensionId) {
      case 'product-region':
        return this.selectedProductRegions;
      case 'product-type':
        return this.selectedProductTypes;
      case 'product-sub-types':
        return this.selectedProductSubTypes;
      case 'investor-region':
        return this.selectedInvestorRegions;
      case 'investor-type':
        return this.selectedInvestorTypes;
      default:
        return [];
    }
  }

  onFlowDimensionChange(event: { selectId: 'dimension1' | 'dimension2' | 'dimension3'; dimension: FlowDimension | null }): void {
    const { selectId, dimension } = event;
    if (selectId === 'dimension1') {
      this.selectedDimension1 = dimension;
    } else if (selectId === 'dimension2') {
      this.selectedDimension2 = dimension;
    } else {
      this.selectedDimension3 = dimension;
    }
    if (this.rawAssetFlowsData) {
      this.updateTreemapData();
    }
    this.emitChartDimensionsSnapshot();
  }

  applySavedHierarchyDimensions(saved: SavedChartHierarchyDimensions | undefined): void {
    if (!saved) return;
    this.selectedDimension1 = this.resolveSavedDimension(saved.dimension1, 'dimension1');
    this.selectedDimension2 = this.resolveSavedDimension(saved.dimension2, 'dimension2');
    this.selectedDimension3 = this.resolveSavedDimension(saved.dimension3, 'dimension3');
    if (this.rawAssetFlowsData) {
      this.updateTreemapData();
    }
    this.emitChartDimensionsSnapshot();
  }

  private resolveSavedDimension(
    id: string | undefined,
    slot: 'dimension1' | 'dimension2' | 'dimension3'
  ): FlowDimension | null {
    const normalized = typeof id === 'string' && id.length > 0 ? id : '';
    if (slot === 'dimension3' && normalized === 'none') {
      return { ...this.defaultDimension3None };
    }
    const found = this.availableDimensions.find((d) => d.id === normalized);
    if (found) {
      return { ...found };
    }
    if (slot === 'dimension1') {
      return this.availableDimensions.find((d) => d.id === 'investor-region') ?? null;
    }
    if (slot === 'dimension2') {
      return this.availableDimensions.find((d) => d.id === 'product-type') ?? null;
    }
    return (
      this.availableDimensions.find((d) => d.id === 'product-sub-types') ?? {
        ...this.defaultDimension3None,
      }
    );
  }

  private emitChartDimensionsSnapshot(): void {
    this.chartDimensionsSnapshot.emit({
      dimension1: this.selectedDimension1?.id || 'investor-region',
      dimension2: this.selectedDimension2?.id || 'product-type',
      dimension3: this.selectedDimension3?.id || 'product-sub-types',
    });
  }

  private mapDimensionIdToField(id: string): AssetFlowDimensionField {
    switch (id) {
      case 'investor-region':
        return 'Investor_Region';
      case 'investor-type':
        return 'Plan_Type';
      case 'product-region':
        return 'Product_Region';
      case 'product-type':
        return 'Product_Type';
      case 'product-sub-types':
        return 'Product_Sub_Type';
      default:
        return 'Product_Type';
    }
  }

  private getSankeyDimensionConfig(): SankeyDimensionConfig {
    const dim1Id = this.selectedDimension1?.id || 'investor-region';
    const dim2Id = this.selectedDimension2?.id || 'product-type';
    const dim3Id = this.selectedDimension3?.id || 'product-sub-types';
    return {
      superField: this.mapDimensionIdToField(dim1Id),
      parentField: this.mapDimensionIdToField(dim2Id),
      subField: dim3Id === 'none' ? 'none' : this.mapDimensionIdToField(dim3Id),
    };
  }

  onPackingCirclesClick(): void {
    this.viewMode = 'packing-circles';
  }

  onDimensionReorder(event: any): void {
    // TODO: Implement drag and drop reordering
  }

  formatCurrency(value: number): string {
    return `$${value}B`;
  }

  formatPercentage(value: number): string {
    return `${value > 0 ? '+' : ''}${value}%`;
  }

  getNodeColor(color: 'green' | 'red' | 'neutral'): string {
    switch (color) {
      case 'green':
        return '#86efac';
      case 'red':
        return '#fca5a5';
      case 'neutral':
        return '#e8e9eb';
      default:
        return '#e8e9eb';
    }
  }

  getNodeBorderColor(color: 'green' | 'red' | 'neutral'): string {
    switch (color) {
      case 'green':
        return '#10b981';
      case 'red':
        return '#ef4444';
      case 'neutral':
        return '#9ca3af';
      default:
        return '#9ca3af';
    }
  }

  onNodeClick(node: TreemapNode): void {
    // TODO: Implement drill-down functionality
  }

  onPinClick(): void {
    this.isPinned = !this.isPinned;
    this.pinToggle.emit();
  }

  onTreemapCellClick(cellData: TreemapCellData): void {
    this.selectedCellData = cellData;
    this.showCellModal = true;
  }

  onCloseModal(): void {
    this.showCellModal = false;
    this.selectedCellData = null;
  }

  onAskAI(): void {
    // TODO: Implement AI chat functionality
    // You can emit an event or navigate to AI chat here
  }

  onOpenExportModal(): void {
    this.showExportModal = true;
  }

  onCloseExportModal(): void {
    this.showExportModal = false;
  }

  async onExportPNG(): Promise<void> {
    await this.waitForChartExportPaint();
    const root = this.chartExportRoot?.nativeElement;
    if (root && this.regionDataArray.length > 0) {
      try {
        const dataUrl = await captureChartAreaToPng(root);
        if (dataUrl) {
          downloadDataUrlAsPng(dataUrl, `${this.getExportBaseName()}-treemap.png`);
          return;
        }
      } catch (e) {
        console.warn('Treemap chart PNG capture failed; falling back to data table', e);
      }
    }
    const rows = this.buildExportRows();
    if (rows.length === 0) {
      return;
    }
    const canvas = this.buildTableCanvas('Asset Allocation - Treemap Export', rows, 35);
    this.downloadCanvasAsPng(canvas, `${this.getExportBaseName()}-treemap.png`);
  }

  async onExportPDF(): Promise<void> {
    await this.waitForChartExportPaint();
    const root = this.chartExportRoot?.nativeElement;
    if (root && this.regionDataArray.length > 0) {
      try {
        const dataUrl = await captureChartAreaToPng(root);
        if (dataUrl) {
          await saveChartAsMultiPagePdf({
            imageDataUrl: dataUrl,
            filename: `${this.getExportBaseName()}-treemap.pdf`,
          });
          return;
        }
      } catch (e) {
        console.warn('Treemap chart PDF capture failed; falling back to data table', e);
      }
    }
    const rows = this.buildExportRows();
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;

    const maxRows = 35;
    const printableRows = rows.slice(0, maxRows);
    const cols = ['Region', 'Source', 'Target', 'Flow ($B)'];
    const colX = [margin, margin + 150, margin + 360, pageWidth - margin - 120];

    pdf.setFontSize(11);
    cols.forEach((col, idx) => pdf.text(col, colX[idx], y));
    y += 12;
    pdf.line(margin, y, pageWidth - margin, y);
    y += 14;
    pdf.setFontSize(9);

    printableRows.forEach((row) => {
      if (y > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(String(row.Region ?? ''), colX[0], y);
      pdf.text(String(row.Source ?? ''), colX[1], y);
      pdf.text(String(row.Target ?? ''), colX[2], y);
      pdf.text(String(row['Flow ($B)'] ?? ''), colX[3], y);
      y += 12;
    });

    if (rows.length > maxRows) {
      y += 8;
      pdf.setFontSize(9);
      pdf.text(`Showing ${maxRows} of ${rows.length} rows. Use XLS for full dataset.`, margin, y);
    }

    pdf.save(`${this.getExportBaseName()}-treemap.pdf`);
  }

  private buildTableCanvas(
    heading: string,
    rows: Array<{ Region: string; Source: string; Target: string; 'Flow ($B)': number }>,
    maxRows: number
  ): HTMLCanvasElement {
    const printableRows = rows.slice(0, maxRows);
    const width = 1400;
    const rowHeight = 28;
    const height = 170 + (printableRows.length * rowHeight) + (rows.length > maxRows ? 40 : 0);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return canvas;
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#00113f';
    ctx.font = 'bold 28px Arial';
    ctx.fillText(heading, 40, 48);
    ctx.font = '16px Arial';
    const horizon = this.timeHorizonStart && this.timeHorizonEnd ? `${this.timeHorizonStart} to ${this.timeHorizonEnd}` : this.timeHorizon;
    ctx.fillText(`Time Horizon: ${horizon}`, 40, 78);

    const colX = [40, 290, 720, 1200];
    const headers = ['Region', 'Source', 'Target', 'Flow ($B)'];
    ctx.font = 'bold 16px Arial';
    headers.forEach((h, idx) => ctx.fillText(h, colX[idx], 115));
    ctx.strokeStyle = '#d1d5db';
    ctx.beginPath();
    ctx.moveTo(40, 126);
    ctx.lineTo(width - 40, 126);
    ctx.stroke();

    ctx.font = '14px Arial';
    printableRows.forEach((row, idx) => {
      const y = 152 + (idx * rowHeight);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(String(row.Region ?? ''), colX[0], y);
      ctx.fillText(String(row.Source ?? ''), colX[1], y);
      ctx.fillText(String(row.Target ?? ''), colX[2], y);
      ctx.fillText(String(row['Flow ($B)'] ?? ''), colX[3], y);
    });

    if (rows.length > maxRows) {
      ctx.fillStyle = '#475569';
      ctx.font = '13px Arial';
      ctx.fillText(`Showing ${maxRows} of ${rows.length} rows.`, 40, height - 18);
    }
    return canvas;
  }

  private downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): void {
    if (canvas.toBlob) {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 'image/png');
      return;
    }
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private buildExportRows(): Array<{ Region: string; Source: string; Target: string; 'Flow ($B)': number }> {
    const rows: Array<{ Region: string; Source: string; Target: string; 'Flow ($B)': number }> = [];
    this.regionDataArray.forEach((regionData) => {
      const region = regionData.key;
      const links = regionData.data?.links ?? [];
      links.forEach((link) => {
        rows.push({
          Region: region,
          Source: link.source,
          Target: link.target,
          'Flow ($B)': Number(link.value ?? 0),
        });
      });
    });
    return rows;
  }

  private getExportBaseName(): string {
    const horizon = (this.timeHorizonStart && this.timeHorizonEnd)
      ? `${this.timeHorizonStart}-to-${this.timeHorizonEnd}`
      : this.timeHorizon;
    return `asset-allocation-${horizon}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  private getExportTimeLine(): string {
    return this.timeHorizonStart && this.timeHorizonEnd
      ? `${this.timeHorizonStart} to ${this.timeHorizonEnd}`
      : this.timeHorizon;
  }

  private async waitForChartExportPaint(): Promise<void> {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    await new Promise((r) => setTimeout(r, 100));
  }

  /**
   * Loads asset flows data from the central data service (JSON or backend API via environment).
   */
  private loadData(): void {
    this.assetFlowsData.getAssetFlows().subscribe({
      next: (assetFlows: AssetFlowRecord[]) => {
        try {
          this.rawAssetFlowsData = assetFlows;
          this.historicAnchor.rebuild(assetFlows);
          this.updateTreemapData();
          this.emitChartDimensionsSnapshot();
        } catch (error: unknown) {
          console.error('Error loading asset flows data:', error);
        }
      },
      error: (error: unknown) => {
        console.error('Error loading asset flows data:', error);
      }
    });
  }

  /**
   * Applies dashboard filter-bar selections to raw rows (same logic as asset-flows Sankey).
   */
  private filterDataByFilterBar(data: AssetFlowRecord[]): AssetFlowRecord[] {
    if (!data || data.length === 0) return data;
    let result = data;

    if (this.selectedInvestorRegions?.length) {
      result = result.filter(r => this.selectedInvestorRegions!.includes(r.Investor_Region));
    }
    if (this.selectedInvestorTypes?.length) {
      result = result.filter(r => {
        const t = r.Plan_Type ?? r.Investor_Types;
        return t && this.selectedInvestorTypes!.includes(t);
      });
    }
    if (this.selectedProductRegions?.length) {
      result = result.filter(
        r => r.Product_Region != null && this.selectedProductRegions!.includes(r.Product_Region)
      );
    }
    if (this.selectedProductTypes?.length) {
      result = result.filter(r => this.selectedProductTypes!.includes(r.Product_Type));
    }
    if (this.selectedProductSubTypes?.length) {
      result = result.filter(r => this.selectedProductSubTypes!.includes(r.Product_Sub_Type));
    }
    return result;
  }

  /**
   * Updates treemap data based on current filters, time horizon, and flow dimensions.
   * Dimension 1 = super, Dimension 2 = parent, Dimension 3 = leaf (or 'none').
   */
  private updateTreemapData(): void {
    if (!this.rawAssetFlowsData) {
      console.warn('AssetAllocation: No raw asset flows data available');
      return;
    }

    // When the Investor Region filter has no selections, clear treemap data entirely.
    if (this.selectedInvestorRegions && this.selectedInvestorRegions.length === 0) {
      this.treemapDataMap.clear();
      this.treemapSuperValuesMap.clear();
      this.regionDataArray = [];
      return;
    }

    let filteredData = this.filterDataByTimeHorizon(this.rawAssetFlowsData);
    filteredData = filterAssetFlowsByDataTypeResolvingSpan(
      filteredData,
      this.dataType,
      this.timeHorizonStart,
      this.timeHorizonEnd,
      this.historicAnchor.getAnchorYearMonth()
    );
    filteredData = this.filterDataByFilterBar(filteredData);
    if (!filteredData || filteredData.length === 0) {
      console.warn('AssetAllocation: No data after time horizon filter');
      this.treemapDataMap.clear();
      this.treemapSuperValuesMap.clear();
      this.regionDataArray = [];
      return;
    }

    const dimensionConfig = this.getSankeyDimensionConfig();
    const isSuperInvestorRegion = this.selectedDimension1?.id === 'investor-region';

    if (!isSuperInvestorRegion) {
      const regionsToUse = (this.selectedInvestorRegions?.length ?? 0) > 0
        ? this.selectedInvestorRegions!
        : [...new Set(filteredData.map((r) => r.Investor_Region))].filter(Boolean).sort();
      filteredData = filteredData.filter((r) => regionsToUse.includes(r.Investor_Region));
      if (filteredData.length === 0) {
        this.treemapDataMap.clear();
        this.treemapSuperValuesMap.clear();
        this.regionDataArray = [];
        return;
      }
      const singleSankeyData = convertAssetFlowsToSankey(filteredData, dimensionConfig);
      this.treemapDataMap.clear();
      this.treemapSuperValuesMap.clear();
      this.treemapDataMap.set('Asset Flows', singleSankeyData);
      this.treemapSuperValuesMap.set('Asset Flows', []);
      this.updateRegionDataArray();
      return;
    }

    const allRegionsSankeyData = convertAssetFlowsToSankey(filteredData, dimensionConfig);
    this.treemapDataMap.clear();
    this.treemapSuperValuesMap.clear();

    // When Dimension 1 is investor region: use selected regions, or all regions present in the data if none selected
    let individualRegions = this.selectedInvestorRegions?.length
      ? this.selectedInvestorRegions
      : (allRegionsSankeyData?.summary?.superparents ?? [])
          .map((sp: { superparent?: string }) => sp.superparent)
          .filter((s): s is string => typeof s === 'string' && s.length > 0);

    if (individualRegions.length > 0) {
      const useProductTypeFilter = this.selectedDimension2?.id === 'product-type';
      const useProductSubTypeFilter = this.selectedDimension3?.id === 'product-sub-types';
      const combinedSankeyData: SankeyData = filterSankeyData(
        allRegionsSankeyData,
        individualRegions,
        useProductTypeFilter ? (this.selectedProductTypes || []) : [],
        useProductSubTypeFilter ? (this.selectedProductSubTypes || []) : []
      );
      const regionsKey = individualRegions.join(', ');
      this.treemapDataMap.set(regionsKey, combinedSankeyData);
      this.treemapSuperValuesMap.set(regionsKey, individualRegions);
    }
    this.updateRegionDataArray();
  }

  /**
   * Update the cached region data array (called only when treemapDataMap changes)
   */
  private updateRegionDataArray(): void {
    const keys: string[] = Array.from(this.treemapDataMap.keys());
    
    // Pass super dimension values (not only investor regions) so treemap filters correctly for any Dimension 1.
    this.regionDataArray = keys.map(key => {
      const data = this.treemapDataMap.get(key);
      if (!data) {
        return null;
      }
      const superValues = this.treemapSuperValuesMap.get(key) ?? [];
      return {
        key,
        data,
        investorRegions: superValues
      };
    }).filter(item => item !== null) as Array<{
      key: string;
      data: SankeyData;
      investorRegions: string[];
    }>;

    const isDefaultParent = !this.selectedDimension2 || this.selectedDimension2.id === 'product-type';
    const isDefaultSub = !this.selectedDimension3 || this.selectedDimension3.id === 'product-sub-types';
    this.cachedSelectedProductTypes = isDefaultParent ? (this.selectedProductTypes || []) : [];
    this.cachedSelectedProductSubTypes = isDefaultSub ? (this.selectedProductSubTypes || []) : [];
  }

  /**
   * TrackBy function for *ngFor to prevent unnecessary re-renders
   */
  trackByRegionKey(index: number, item: { key: string; data: SankeyData; investorRegions: string[] }): string {
    return item.key;
  }

  /**
   * Filters asset flows data based on the selected time horizon range
   * If start and end are provided, filters data between those dates (inclusive)
   * Otherwise, uses the single timeHorizon for backward compatibility
   */
  private filterDataByTimeHorizon(data: AssetFlowRecord[]): AssetFlowRecord[] {
    if (!data || data.length === 0) {
      return data;
    }
    
    let startDate: string | null = null;
    let endDate: string | null = null;
    
    // If range is provided, use both start and end
    if (this.timeHorizonStart && this.timeHorizonEnd) {
      startDate = this.getTargetDateFromTimeHorizon(this.timeHorizonStart);
      endDate = this.getTargetDateFromTimeHorizon(this.timeHorizonEnd);
    } else {
      // Fallback to single time horizon for backward compatibility
      endDate = this.getTargetDateFromTimeHorizon(this.timeHorizon);
    }
    
    if (!endDate) {
      // If time horizon is invalid, return all data
      return data;
    }
    
    return data.filter(record =>
      assetFlowQuarterInTimeWindow(record.Asset_Flow_Date, startDate, endDate)
    );
  }

  /**
   * Converts time horizon string to YYYY-MM using latest Historic quarter as anchor.
   */
  private getTargetDateFromTimeHorizon(horizon?: string): string | null {
    const timeHorizonToUse = horizon || this.timeHorizon;
    if (/^\d{4}-\d{2}$/.test(timeHorizonToUse.trim())) {
      return timeHorizonToUse.trim();
    }
    return this.historicAnchor.horizonToYearMonth(timeHorizonToUse.trim());
  }
}

