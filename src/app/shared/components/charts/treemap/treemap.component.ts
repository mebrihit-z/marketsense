/* eslint-disable */
import { Component, ElementRef, AfterViewInit, OnDestroy, Input, OnChanges, SimpleChanges, ViewEncapsulation, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import * as d3 from 'd3';
import {
  filterSankeyData,
  filterSankeyDataByFlowValueRange,
  type SankeyData,
  type SankeyLink,
} from '../../../utils/sankey-data.utils';
import { convertAssetFlowsToSankey, type AssetFlowRecord } from '../../../utils/asset-flows-to-sankey.util';
import { AssetFlowsDataService } from '../../../../core/services/asset-flows-data.service';
import { AssetFlowHistoricAnchorService } from '../../../../core/services/asset-flow-historic-anchor.service';
import { formatFlowCurrencyUsd } from '../../../utils/flow-currency-format.util';
import { formatTimeHorizonSliderHandleDate } from '../../../utils/time-horizon-slider-tooltip-date.util';
import { assetFlowQuarterInTimeWindow } from '../../../utils/asset-flow-time-window.util';
import {
  FLOW_CHART_MIN_WIDTH_DIM3_LEAF_PX,
  FLOW_CHART_MIN_WIDTH_DIM3_NONE_PX,
} from '../../../utils/flow-chart-min-width.constants';

interface SankeyDataLocal {
  nodes: Array<{ name: string }>;
  links: Array<{ source: string; target: string; value: number; date?: string; nClientsTotal?: number }>;
  summary?: any;
}

interface TreemapNodeData {
  name: string;
  value?: number;
  trueValue?: number;
  layoutValue?: number;
  group?: string;
  /** Sum of client counts on underlying asset-flow rows represented in this cell (when known). */
  nClientsTotal?: number;
  children?: TreemapNodeData[];
}

interface TreemapHierarchyNode extends d3.HierarchyNode<TreemapNodeData> {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

@Component({
  selector: 'app-treemap',
  standalone: true,
  imports: [],
  templateUrl: './treemap.component.html',
  styleUrl: './treemap.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class TreemapComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() data?: SankeyDataLocal;
  /**
   * Optional URL for loading pre-aggregated treemap/Sankey data.
   * When not provided, the component will load from the central AssetFlowsDataService,
   * which is the single place that knows about environment.dataUrlConfig.assetFlows.
   */
  @Input() dataUrl?: string;
  @Input() selectedInvestorRegions: string[] = [];
  /**
   * When true (default), an empty `selectedInvestorRegions` means “no super slice” and the chart is cleared.
   * When false, empty super list is ignored and `filterSankeyData` runs with no super filter (data is already scoped).
   * Asset allocation uses false when Dimension 1 is not investor region.
   */
  @Input() useSuperListFilter: boolean = true;
  @Input() selectedProductTypes: string[] = [];
  @Input() selectedProductSubTypes: string[] = [];
  /** Minimum flow value in billions ($B); links below this are hidden when greater than 0. */
  @Input() minFlowValue: number = 0;
  /** Maximum flow in billions; links above are hidden when set. Null = no upper cap. */
  @Input() maxFlowValue: number | null = null;
  /**
   * When true, Flow Dimension 3 includes the leaf tier — same horizontal scroll floor as the Sankey
   * (`flow-chart-min-width.constants`).
   */
  @Input() sankeyHasLeafDimension = false;
  /** Minimum share (0..1) of total treemap area per leaf cell. */
  @Input() minCellShare: number = 0.003;
  /** Maximum share (0..1) of total treemap area per leaf cell. */
  @Input() maxCellShare: number = 0.03;
  @Input() timeHorizon: string = 'Today';
  @Input() timeHorizonStart?: string;
  @Input() timeHorizonEnd?: string;

  private loadedData?: SankeyDataLocal;
  private originalData?: SankeyDataLocal;
  private rawAssetFlowsData?: AssetFlowRecord[];
  private resizeObserver?: ResizeObserver;

  private static bodyTooltipIdSeq = 0;
  /** One portal tooltip per instance so multiple treemaps on the page do not clash. */
  private readonly bodyTooltipId = `treemap-body-tt-${++TreemapComponent.bodyTooltipIdSeq}`;

  /** Laid-out treemap width (px); used with treemapScrollHostMinWidthCss for horizontal scroll parity with Sankey. */
  treemapLayoutWidthPx = FLOW_CHART_MIN_WIDTH_DIM3_NONE_PX;

  get treemapScrollHostMinWidthCss(): string {
    const floorPx = this.sankeyHasLeafDimension
      ? FLOW_CHART_MIN_WIDTH_DIM3_LEAF_PX
      : FLOW_CHART_MIN_WIDTH_DIM3_NONE_PX;
    const w = Math.max(this.treemapLayoutWidthPx, floorPx);
    return `max(100%, ${w}px)`;
  }

  constructor(
    private el: ElementRef,
    private http: HttpClient,
    private assetFlowsData: AssetFlowsDataService,
    private historicAnchor: AssetFlowHistoricAnchorService
  ) {}

  /** Read CSS variable from component host first, then :root (tooltip vars live on app-treemap). */
  private getCssVariable(name: string): string {
    const host = this.el?.nativeElement;
    if (host) {
      const value = getComputedStyle(host).getPropertyValue(name).trim();
      if (value) return value;
    }
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  @HostListener('window:blur')
  onWindowBlur(): void {
    this.hideTreemapTooltipAndHighlights();
  }

  private removeBodyTooltipIfPresent(): void {
    document.getElementById(this.bodyTooltipId)?.remove();
  }

  /**
   * True when the hovered cell sits on the right half of the treemap — tooltip opens to the left of the pointer.
   */
  private shouldAnchorTooltipLeftOfPointer(anchorCell: HTMLElement | null): boolean {
    if (!anchorCell) return false;
    const chart = this.el?.nativeElement?.querySelector?.('.chart-container') as HTMLElement | null;
    if (!chart) return false;
    const cr = chart.getBoundingClientRect();
    if (cr.width <= 0) return false;
    const ar = anchorCell.getBoundingClientRect();
    const cellCenterX = ar.left + ar.width / 2;
    const chartMidX = cr.left + cr.width / 2;
    return cellCenterX >= chartMidX;
  }

  /**
   * Places a fixed-position tooltip near the pointer and nudges it so it stays
   * inside the layout viewport (avoids right/bottom clipping from scroll parents).
   * Tooltip is attached to `document.body` to escape `overflow: auto` on treemap parents.
   *
   * @param anchorCell The hovered `.node` (or its wrapper); used to flip tooltip to the left of the cursor on the right side of the chart.
   */
  private positionTreemapTooltipElement(
    tooltipEl: HTMLElement,
    event: MouseEvent,
    anchorCell: HTMLElement | null = null
  ): void {
    const pad = 12;
    const offX = 10;
    const offY = 10;
    const vv = window.visualViewport;
    const vw = (vv?.width ?? window.innerWidth) || 400;
    const vh = (vv?.height ?? window.innerHeight) || 300;
    const maxW = Math.max(100, Math.min(520, vw * 0.9, vw - 2 * pad));
    tooltipEl.style.boxSizing = 'border-box';
    tooltipEl.style.maxWidth = `${maxW}px`;
    tooltipEl.style.wordBreak = 'break-word';
    tooltipEl.style.overflowWrap = 'anywhere';

    const useLeftOfPointer = this.shouldAnchorTooltipLeftOfPointer(anchorCell);

    const measureAndClamp = (clientX: number, clientY: number): void => {
      if (useLeftOfPointer) {
        tooltipEl.style.left = '-9999px';
        tooltipEl.style.top = `${clientY + offY}px`;
        const tw = tooltipEl.getBoundingClientRect().width;
        let left = clientX - offX - tw;
        let top = clientY + offY;
        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
        const r = tooltipEl.getBoundingClientRect();
        if (r.left < pad) {
          left = pad;
        }
        if (r.right > vw - pad) {
          left = vw - pad - r.width;
        }
        top = r.top;
        if (r.bottom > vh - pad) {
          top = vh - pad - r.height;
        }
        if (top < pad) {
          top = pad;
        }
        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
        return;
      }

      tooltipEl.style.left = `${clientX + offX}px`;
      tooltipEl.style.top = `${clientY + offY}px`;
      const r = tooltipEl.getBoundingClientRect();
      let left = r.left;
      let top = r.top;
      if (r.right > vw - pad) {
        left = vw - pad - r.width;
      }
      if (left < pad) {
        left = pad;
      }
      if (r.bottom > vh - pad) {
        top = vh - pad - r.height;
      }
      if (top < pad) {
        top = pad;
      }
      tooltipEl.style.left = `${left}px`;
      tooltipEl.style.top = `${top}px`;
    };

    measureAndClamp(event.clientX, event.clientY);
    const r1 = tooltipEl.getBoundingClientRect();
    if (r1.right > vw - pad + 0.5) {
      tooltipEl.style.maxWidth = `${Math.max(100, Math.floor(vw - 2 * pad - 1))}px`;
      measureAndClamp(event.clientX, event.clientY);
    }
  }

  /**
   * Hides the floating tooltip and clears node highlights. Used as a catch-all when
   * per-cell mouseleave does not run (e.g. parent cells use pointer-events: none) or
   * when the window loses focus (stuck tooltip after Alt-Tab).
   */
  private hideTreemapTooltipAndHighlights(): void {
    const host = this.el?.nativeElement as HTMLElement | undefined;
    if (!host) return;
    const container = host.querySelector('.chart-container') as HTMLElement | null;
    if (!container) return;
    const tip = document.getElementById(this.bodyTooltipId);
    if (tip) {
      tip.style.setProperty('opacity', '0');
      tip.style.setProperty('visibility', 'hidden');
    }
    for (const nodeEl of Array.from(
      container.querySelectorAll<HTMLElement>('div.node')
    )) {
      if (!nodeEl.classList.contains('highlighted')) continue;
      nodeEl.classList.remove('highlighted');
      const depth = parseInt(nodeEl.getAttribute('data-treemap-depth') || '0', 10);
      nodeEl.style.zIndex = String(1000 + depth);
      nodeEl.style.boxShadow = 'none';
      if (depth === 3) {
        nodeEl.style.borderWidth = '2px';
        nodeEl.style.borderColor = '#F5F1EB';
      } else {
        nodeEl.style.borderWidth = '1px';
        nodeEl.style.borderColor = 'rgba(0,0,0,0.12)';
      }
    }
  }

  ngAfterViewInit(): void {
    if (this.data) {
      this.originalData = this.data;
      this.applyFilters();
    } else {
      this.loadDataFromJson();
    }
    this.setupResizeObserver();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Handle data input changes
    if (changes['data'] && this.data) {
      this.originalData = this.data;
      this.applyFilters();
      return;
    }
    
    // Handle filter changes - check if any filter input changed
    const filterChanged = changes['selectedInvestorRegions'] || 
                          changes['useSuperListFilter'] ||
                          changes['selectedProductTypes'] || 
                          changes['selectedProductSubTypes'] ||
                          changes['minFlowValue'] ||
                          changes['maxFlowValue'];
    
    // Handle time horizon changes
    const timeHorizonChanged = changes['timeHorizon'] || 
                                changes['timeHorizonStart'] || 
                                changes['timeHorizonEnd'];

    if (
      changes['sankeyHasLeafDimension'] &&
      !changes['sankeyHasLeafDimension'].firstChange &&
      this.loadedData?.nodes?.length &&
      this.el?.nativeElement
    ) {
      setTimeout(() => this.createTreemap(), 100);
    }
    
    if (filterChanged || timeHorizonChanged) {
      // If filters or time horizon changed, reapply filters and recreate treemap
      // If time horizon changed and we have raw asset flows data, reload with new time horizon
      if (timeHorizonChanged && this.rawAssetFlowsData) {
        this.convertAssetFlowsWithTimeHorizonFilter();
      } else if (filterChanged && this.originalData) {
        // Apply filters if data is already loaded, otherwise filters will be applied when data loads
        this.applyFilters();
      } else if (timeHorizonChanged && !this.rawAssetFlowsData && this.originalData) {
        // If time horizon changed but we don't have raw data (maybe data was passed via @Input),
        // we can't filter by time horizon - log a warning
        console.warn('ReallocationTreemap: Time horizon changed but no raw asset flows data available. Data may have been passed via @Input data property.');
      }
    }
  }

  ngOnDestroy(): void {
    this.removeBodyTooltipIfPresent();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  private loadDataFromJson(): void {
    // Prefer the central AssetFlowsDataService as the single place that
    // knows about environment.dataUrlConfig.assetFlows. Only fall back to
    // direct HTTP loading when an explicit dataUrl is provided.
    if (!this.dataUrl) {
      this.assetFlowsData.getAssetFlows().subscribe({
        next: (assetFlows) => {
          try {
            this.rawAssetFlowsData = assetFlows;
            this.historicAnchor.rebuild(assetFlows);
            this.convertAssetFlowsWithTimeHorizonFilter();
          } catch (error) {
            console.error('Error converting asset flows to treemap data:', error);
          }
        },
        error: (error) => {
          console.error('Error loading asset flows data:', error);
        }
      });
      return;
    }

    // Load JSON file (backward compatibility - assumes it's already in SankeyDataLocal format)
    this.http.get<SankeyDataLocal>(this.dataUrl).subscribe({
      next: (data) => {
        this.originalData = data;
        this.applyFilters();
      },
      error: (error) => {
        console.error('Error loading sankey data:', error);
        console.error('Failed to load from:', this.dataUrl);
      }
    });
  }

  /**
   * Converts asset flows data to Sankey format with time horizon filtering
   */
  private convertAssetFlowsWithTimeHorizonFilter(): void {
    if (!this.rawAssetFlowsData) {
      console.warn('ReallocationTreemap: No raw asset flows data available');
      return;
    }
    // Filter data based on time horizon
    const filteredData = this.filterDataByTimeHorizon(this.rawAssetFlowsData);
    
    // Convert filtered data to Sankey format
    const sankeyData = convertAssetFlowsToSankey(filteredData);
    
    // Map to SankeyDataLocal format
    this.originalData = {
      nodes: sankeyData.nodes,
      links: sankeyData.links,
      summary: sankeyData.summary
    };
    
    // Apply additional filters (investor regions, product types, etc.)
    this.applyFilters();
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

  private applyFilters(): void {
    if (!this.originalData) {
      return;
    }
    // When no super list is selected, treat as no data (unless data is pre-scoped: useSuperListFilter = false).
    if (
      this.useSuperListFilter &&
      this.selectedInvestorRegions &&
      this.selectedInvestorRegions.length === 0
    ) {
      this.loadedData = {
        nodes: [],
        links: [],
        summary: this.originalData.summary
      };
      if (this.el?.nativeElement) {
        setTimeout(() => this.createTreemap(), 100);
      }
      return;
    }
    // Convert to SankeyData format for filtering
    const sankeyData: SankeyData = {
      nodes: this.originalData.nodes,
      links: this.originalData.links,
      summary: this.originalData.summary
    };

    // Apply category filters using the filterSankeyData utility
    let filteredData = filterSankeyData(
      sankeyData,
      this.selectedInvestorRegions,
      this.selectedProductTypes,
      this.selectedProductSubTypes
    );
    const minVal = this.minFlowValue ?? 0;
    const maxVal = this.maxFlowValue;
    if (minVal > 0 || (maxVal != null && Number.isFinite(maxVal))) {
      filteredData = filterSankeyDataByFlowValueRange(filteredData, minVal, maxVal, true);
    }
    // Convert back to local format
    this.loadedData = {
      nodes: filteredData.nodes,
      links: filteredData.links || [],
      summary: filteredData.summary
    };

    if (this.el?.nativeElement) {
      setTimeout(() => this.createTreemap(), 100);
    }
  }

  private setupResizeObserver(): void {
    const element = this.el.nativeElement.querySelector('.reallocation-treemap-container');
    if (element && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        const container = element.querySelector('.chart-container');
        if (container) {
          container.innerHTML = '';
          this.createTreemap();
        }
      });
      this.resizeObserver.observe(element);
    }
  }

  // Helper functions matching Python logic
  private isPool(name: string): boolean {
    return typeof name === 'string' && name.includes('Reallocation Pool');
  }

  private superparentFromPool(poolName: string): string {
    if (typeof poolName !== 'string') return 'Unknown';
    const idx = poolName.indexOf(':');
    if (idx === -1) return 'Unknown';
    return poolName.slice(0, idx).trim();
  }

  private superparentFromNetNew(name: string): string {
    if (typeof name !== 'string') return 'Unknown';
    const m = name.match(/\(([^)]+)\)\s*$/);
    return m ? m[1].trim() : 'Unknown';
  }

  private isNetNew(name: string): boolean {
    return typeof name === 'string' && name.startsWith('Capital In');
  }

  private isWithdrawn(name: string): boolean {
    return typeof name === 'string' && name.startsWith('Capital Out');
  }

  private isSourceNodeName(name: string): boolean {
    return typeof name === 'string' && name.endsWith('(Source)');
  }

  private isDestinationNodeName(name: string): boolean {
    return typeof name === 'string' && name.endsWith('(Destination)');
  }

  private stripSuperPrefix(name: string): string {
    return typeof name === 'string' ? name.replace(/^[^:]+:\s*/, '') : name;
  }

  private stripSuffix(name: string): string {
    return typeof name === 'string'
      ? name.replace(/\s*\((Source|Destination)\)\s*$/, '')
      : name;
  }

  private superFromScoped(name: string): string {
    if (typeof name !== 'string') return 'Unknown';
    const idx = name.indexOf(':');
    if (idx === -1) return 'Unknown';
    return name.slice(0, idx).trim();
  }

  private stripParentSuffix(name: string): string {
    return typeof name === 'string'
      ? name.replace(/\s*\((Start|End)\)\s*$/, '')
      : name;
  }

  private cleanParentName(name: string): string {
    return this.stripParentSuffix(this.stripSuperPrefix(name));
  }

  private formatValue(x: number): string {
    const v = +x || 0;
    return formatFlowCurrencyUsd(v);
  }

  /** Cells below this size cannot display readable text; hide labels and rely on tooltip */
  private isLabelUnreadable(w: number, h: number): boolean {
    return w < 80 || h < 32;
  }

  /**
   * Same calendar dates as the time-horizon slider handles (and Sankey tooltips).
   */
  private getTimeHorizonDisplayString(): string {
    if (this.timeHorizonStart && this.timeHorizonEnd &&
        this.timeHorizonStart.trim() !== '' && this.timeHorizonEnd.trim() !== '') {
      const a = this.historicAnchor.getAnchor();
      const start = formatTimeHorizonSliderHandleDate(this.timeHorizonStart.trim(), a);
      const end = formatTimeHorizonSliderHandleDate(this.timeHorizonEnd.trim(), a);
      return `${start} to ${end}`;
    }
    return formatTimeHorizonSliderHandleDate((this.timeHorizon || '0').trim(), this.historicAnchor.getAnchor());
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Breadcrumb path uses " › "; render each segment on its own line in the tooltip header. */
  private buildTooltipHtml(
    path: string,
    value: string,
    timeHorizonDisplay: string,
    sampleSize?: number
  ): string {
    const segments = path.split(' › ').map(s => s.trim()).filter(s => s.length > 0);
    let headerInner: string;
    if (segments.length === 0) {
      headerInner = path
        ? `<div><strong>${this.escapeHtml(path)}</strong></div>`
        : '';
    } else {
      headerInner = segments
        .map((seg, i) => {
          const display = i === 0 ? seg : `› ${seg}`;
          return `<div><strong>${this.escapeHtml(display)}</strong></div>`;
        })
        .join('');
    }

    const sampleLine =
      sampleSize != null && sampleSize > 0
        ? `<div style="margin-top: 4px; font-size: 13px; opacity: 0.9;">Sample Size: <strong>${this.escapeHtml(sampleSize.toLocaleString('en-US'))}</strong></div>`
        : '';

    return `
      <div style="word-break:break-word;">${headerInner}</div>
      <div style="margin-top: 4px;">Value: <strong>${this.escapeHtml(value)}</strong></div>
      <div style="margin-top: 4px; font-size: 13px; opacity: 0.9;">Time: <strong>${this.escapeHtml(timeHorizonDisplay)}</strong></div>
      ${sampleLine}
    `;
  }

  /** Sum of {@link TreemapNodeData#nClientsTotal} on leaf descendants (treemap leaves are flow slices). */
  private sumNClientsInSubtree(node: TreemapHierarchyNode): number {
    return node.leaves().reduce((sum, leaf) => sum + Math.max(0, leaf.data.nClientsTotal ?? 0), 0);
  }

  private sizeWeight(d: TreemapNodeData): number {
    const SIZE_EXPONENT = 0.35;
    const MIN_SIZE_FLOOR = 0.15;
    const raw = Math.abs(+((d && d.value) || 0));
    const floored = Math.max(raw, MIN_SIZE_FLOOR);
    return Math.pow(floored, SIZE_EXPONENT);
  }

  private collectLeafNodes(node: TreemapNodeData, leaves: TreemapNodeData[]): void {
    if (!node) return;
    if (!node.children || node.children.length === 0) {
      leaves.push(node);
      return;
    }
    for (const child of node.children) this.collectLeafNodes(child, leaves);
  }

  private computeBoundedShares(weights: number[], minShareRaw: number, maxShareRaw: number): number[] {
    const n = weights.length;
    if (n === 0) return [];

    const safeWeights = weights.map(w => (Number.isFinite(w) && w > 0 ? w : 0));
    const total = d3.sum(safeWeights);
    const base = total > 0
      ? safeWeights.map(w => w / total)
      : Array.from({ length: n }, () => 1 / n);

    const minShare = Math.max(0, Math.min(1, minShareRaw ?? 0));
    const maxShare = Math.max(0, Math.min(1, maxShareRaw ?? 1));
    const effectiveMin = Math.min(minShare, 1 / n);
    // Keep the user cap whenever possible; only relax when mathematically infeasible.
    let effectiveMax = maxShare;
    if (effectiveMax < effectiveMin) effectiveMax = effectiveMin;
    if (effectiveMax * n < 1) effectiveMax = 1 / n;

    const shares = Array.from(base);
    const fixedLow = new Set<number>();
    const fixedHigh = new Set<number>();

    for (let iter = 0; iter < 20; iter++) {
      const fixedSum =
        Array.from(fixedLow).length * effectiveMin +
        Array.from(fixedHigh).length * effectiveMax;
      const free = Array.from({ length: n }, (_, i) => i).filter(i => !fixedLow.has(i) && !fixedHigh.has(i));
      if (free.length === 0) break;

      const remaining = Math.max(0, 1 - fixedSum);
      const baseFreeSum = d3.sum(free, i => base[i]);

      for (const i of free) {
        shares[i] = baseFreeSum > 0 ? (base[i] / baseFreeSum) * remaining : remaining / free.length;
      }

      let changed = false;
      for (const i of free) {
        if (shares[i] < effectiveMin) {
          fixedLow.add(i);
          changed = true;
        } else if (shares[i] > effectiveMax) {
          fixedHigh.add(i);
          changed = true;
        }
      }
      if (!changed) break;
    }

    for (let i = 0; i < n; i++) {
      if (fixedLow.has(i)) shares[i] = effectiveMin;
      if (fixedHigh.has(i)) shares[i] = effectiveMax;
    }

    const outSum = d3.sum(shares);
    if (outSum > 0) {
      for (let i = 0; i < n; i++) shares[i] = shares[i] / outSum;
    } else {
      for (let i = 0; i < n; i++) shares[i] = 1 / n;
    }

    return shares;
  }

  private applyCellSizeBounds(hierarchy: TreemapNodeData): void {
    const leaves: TreemapNodeData[] = [];
    this.collectLeafNodes(hierarchy, leaves);
    if (leaves.length === 0) return;

    const weights = leaves.map(d => this.sizeWeight(d));
    const shares = this.computeBoundedShares(weights, this.minCellShare, this.maxCellShare);

    for (let i = 0; i < leaves.length; i++) {
      // D3 treemap uses relative values; normalized shares are sufficient.
      leaves[i].layoutValue = shares[i];
    }
  }

  /**
   * Makes each Dimension-1 (superparent) row the same vertical share of the chart.
   * Otherwise tiny-flow regions get paper-thin bands and headers overlap neighbors.
   * Relative sizes within a region are preserved; only the split between regions changes.
   */
  private equalizeSuperparentBandWeights(hierarchy: TreemapNodeData): void {
    const supers = hierarchy.children;
    if (!supers || supers.length <= 1) return;
    for (const sp of supers) {
      const leaves: TreemapNodeData[] = [];
      this.collectLeafNodes(sp, leaves);
      if (leaves.length === 0) continue;
      let sum = 0;
      for (const L of leaves) {
        sum += Math.max(0, +(L.layoutValue ?? 0));
      }
      if (sum <= 0) {
        const u = 1 / leaves.length;
        for (const L of leaves) {
          L.layoutValue = u;
        }
        continue;
      }
      const scale = 1 / sum;
      for (const L of leaves) {
        L.layoutValue = Math.max(0, +(L.layoutValue ?? 0)) * scale;
      }
    }
  }

  private buildHierarchy(sankeyData: SankeyDataLocal): TreemapNodeData {
    // Map SubAsset -> Parent per SuperParent
    const outParentOf = new Map<string, string>();
    const inParentOf = new Map<string, string>();

    for (const l of (sankeyData.links || [])) {
      const s = l.source as string;
      const t = l.target as string;

      // Parent(Start) -> Sub(Source)
      if (typeof s === 'string' && typeof t === 'string' && s.endsWith('(Start)') && this.isSourceNodeName(t)) {
        const sp = this.superFromScoped(s);
        const parent = this.cleanParentName(s);
        const sub = this.stripSuffix(this.stripSuperPrefix(t));
        outParentOf.set(`${sp}|${sub}`, parent);
        continue;
      }

      // Sub(Destination) -> Parent(End)
      if (typeof s === 'string' && typeof t === 'string' && this.isDestinationNodeName(s) && t.endsWith('(End)')) {
        const sp = this.superFromScoped(t);
        const parent = this.cleanParentName(t);
        const sub = this.stripSuffix(this.stripSuperPrefix(s));
        inParentOf.set(`${sp}|${sub}`, parent);
        continue;
      }
    }

    // Collect leaves per SuperParent
    const bySP = new Map<string, {
      outflows: Array<{ parent: string; name: string; value: number; nClientsTotal: number }>;
      inflows: Array<{ parent: string; name: string; value: number; nClientsTotal: number }>;
      netNew: number;
      withdrawn: number;
    }>();

    const ensureSP = (sp: string) => {
      if (!bySP.has(sp)) {
        bySP.set(sp, {
          outflows: [],
          inflows: [],
          netNew: 0,
          withdrawn: 0
        });
      }
      return bySP.get(sp)!;
    };

    for (const l of (sankeyData.links || [])) {
      const s = l.source as string;
      const t = l.target as string;
      const v = +l.value || 0;
      const linkNc = Math.max(0, (l as SankeyLink).nClientsTotal ?? 0);

      // Capital Out
      if (this.isNetNew(s) && this.isPool(t)) {
        const sp = this.superparentFromPool(t) !== 'Unknown' 
          ? this.superparentFromPool(t) 
          : this.superparentFromNetNew(s);
        ensureSP(sp).netNew += v;
        continue;
      }

      // Capital In
      if (this.isPool(s) && this.isWithdrawn(t)) {
        const sp = this.superparentFromPool(s) !== 'Unknown'
          ? this.superparentFromPool(s)
          : this.superparentFromNetNew(t);
        ensureSP(sp).withdrawn += v;
        continue;
      }

      // Outflows: (Source) -> SP: Reallocation Pool
      if (this.isPool(t) && this.isSourceNodeName(s)) {
        const sp = this.superparentFromPool(t);
        const leafName = this.stripSuffix(this.stripSuperPrefix(s));
        const parent = outParentOf.get(`${sp}|${leafName}`) || '(Unknown Parent)';
        ensureSP(sp).outflows.push({ parent, name: leafName, value: v, nClientsTotal: linkNc });
        continue;
      }

      // Inflows: SP: Reallocation Pool -> (Destination)
      if (this.isPool(s) && this.isDestinationNodeName(t)) {
        const sp = this.superparentFromPool(s);
        const leafName = this.stripSuffix(this.stripSuperPrefix(t));
        const parent = inParentOf.get(`${sp}|${leafName}`) || '(Unknown Parent)';
        ensureSP(sp).inflows.push({ parent, name: leafName, value: v, nClientsTotal: linkNc });
        continue;
      }
    }

    // Two-level (no sub): Parent(Start) -> Pool and Pool -> Parent(End) when there are no (Source)/(Destination) nodes
    const hasSubLevel = (sankeyData.links || []).some((l) => {
      const src = typeof l.source === 'string' ? l.source : '';
      const tgt = typeof l.target === 'string' ? l.target : '';
      return this.isSourceNodeName(src) || this.isSourceNodeName(tgt) || this.isDestinationNodeName(src) || this.isDestinationNodeName(tgt);
    });
    if (!hasSubLevel) {
      for (const l of (sankeyData.links || [])) {
        const s = l.source as string;
        const t = l.target as string;
        const v = +l.value || 0;
        const linkNc = Math.max(0, (l as SankeyLink).nClientsTotal ?? 0);
        if (typeof s !== 'string' || typeof t !== 'string') continue;
        if (s.endsWith('(Start)') && this.isPool(t)) {
          const sp = this.superFromScoped(s);
          const parent = this.cleanParentName(s);
          ensureSP(sp).outflows.push({ parent, name: parent, value: v, nClientsTotal: linkNc });
        }
        if (this.isPool(s) && t.endsWith('(End)')) {
          const sp = this.superparentFromPool(s);
          const parent = this.cleanParentName(t);
          ensureSP(sp).inflows.push({ parent, name: parent, value: v, nClientsTotal: linkNc });
        }
      }
    }

    // Aggregate duplicates
    const aggregateByParent = (
      leaves: Array<{ parent: string; name: string; value: number; nClientsTotal: number }>
    ): TreemapNodeData[] => {
      const parents = new Map<string, Map<string, { value: number; nClientsTotal: number }>>();
      const norm = (s: string) => (s || '').trim();
      for (const d of leaves) {
        const p = d.parent || '(Unknown Parent)';
        if (!parents.has(p)) parents.set(p, new Map());
        const m = parents.get(p)!;
        const prev = m.get(d.name);
        const nextVal = (prev?.value ?? 0) + d.value;
        const nextNc = (prev?.nClientsTotal ?? 0) + (d.nClientsTotal ?? 0);
        m.set(d.name, { value: nextVal, nClientsTotal: nextNc });
      }

      return Array.from(parents, ([parent, nameValueMap]) => {
        const childPairs = Array.from(nameValueMap, ([name, o]) => {
          const cell: TreemapNodeData = { name, value: o.value };
          if (o.nClientsTotal > 0) cell.nClientsTotal = o.nClientsTotal;
          return cell;
        });
        // No third dimension (or sub label equals parent): skip a useless wrapper + inner cell with the same label.
        if (childPairs.length === 1 && norm(childPairs[0].name) === norm(parent)) {
          const only = childPairs[0];
          const node: TreemapNodeData = { name: parent, value: only.value };
          if (only.nClientsTotal != null && only.nClientsTotal > 0) node.nClientsTotal = only.nClientsTotal;
          return node;
        }
        return {
          name: parent,
          children: childPairs,
        };
      });
    };

    const hierarchy: TreemapNodeData = {
      name: 'Reallocation',
      children: []
    };

    for (const [sp, parts] of Array.from(bySP.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const spNode: TreemapNodeData = {
        name: sp,
        children: []
      };

      // Outflows (left)
      spNode.children!.push({
        name: 'Outflows',
        group: 'outflows',
        children: aggregateByParent(parts.outflows)
      });

      // Capital Out (middle)
      if (parts.netNew !== 0) {
        spNode.children!.push({ 
          name: 'Capital In', 
          group: 'netnew', 
          value: parts.netNew 
        });
      }

      // Inflows (right)
      spNode.children!.push({
        name: 'Inflows',
        group: 'inflows',
        children: aggregateByParent(parts.inflows)
      });

      // Capital In (far right)
      if (parts.withdrawn !== 0) {
        spNode.children!.push({ 
          name: 'Capital Out', 
          group: 'withdrawn', 
          value: parts.withdrawn 
        });
      }

      hierarchy.children!.push(spNode);
    }

    // Annotate with true values
    this.annotateTrueValues(hierarchy);

    return hierarchy;
  }

  private annotateTrueValues(node: TreemapNodeData): number {
    if (!node) return 0;
    if (!node.children || node.children.length === 0) {
      node.trueValue = +(node.value ?? 0) || 0;
      return node.trueValue;
    }
    let s = 0;
    for (const c of node.children) s += this.annotateTrueValues(c);
    node.trueValue = s;
    return s;
  }

  private groupOf(node: TreemapHierarchyNode): string {
    if (!node) return 'Other';
    if (node.depth === 2) return node.data.name;
    if (node.depth >= 3) {
      const g = node.ancestors().find(a => a.depth === 2);
      return g ? g.data.name : 'Other';
    }
    return 'Other';
  }

  private nodeColor(node: TreemapHierarchyNode, root: d3.HierarchyNode<TreemapNodeData>): string {
    const g = this.groupOf(node);

    // Shade leaf nodes by magnitude
    if (node && !node.children) {
      const mag = Math.abs(+((node.data && node.data.trueValue) || 0));
      const leaves = root.leaves() as TreemapHierarchyNode[];
      
      const maxOut = d3.max(
        leaves.filter(d => this.groupOf(d) === 'Outflows'),
        d => Math.abs(+((d.data && d.data.trueValue) || 0))
      ) || 1;
      
      const maxIn = d3.max(
        leaves.filter(d => this.groupOf(d) === 'Inflows'),
        d => Math.abs(+((d.data && d.data.trueValue) || 0))
      ) || 1;

      const outflowScale = d3.scaleLinear<string>()
        .domain([0, maxOut])
        .range(['#f7c6c6', '#d62728'])
        .clamp(true);

      const inflowScale = d3.scaleLinear<string>()
        .domain([0, maxIn])
        .range(['#c7e9c0', '#2A6907']) // concentrated cell: $secondary-colors-green-1000
        .clamp(true);

      if (g === 'Outflows') return outflowScale(mag);
      if (g === 'Inflows') return inflowScale(mag);
    }

    // Container nodes
    if (g === 'Inflows') return '#2A6907'; // $secondary-colors-green-1000
    if (g === 'Outflows') return '#d62728';
    if (g === 'Capital In') return '#1f77b4';
    if (g === 'Capital Out') return '#ff7f0e';
    return '#999999';
  }

  private signedValue(d: TreemapHierarchyNode): number {
    const g = this.groupOf(d);
    const tv = +((d && d.data && d.data.trueValue) || 0);
    if (g === 'Outflows') return -Math.abs(tv);
    return tv;
  }

  private createTreemap(): void {
    this.removeBodyTooltipIfPresent();
    const container = this.el.nativeElement.querySelector('.chart-container') as HTMLElement;
    if (!container) {
      console.error('ReallocationTreemap: Chart container not found');
      return;
    }

    // Always clear any existing content first so empty data does not leave stale chart visible.
    container.innerHTML = '';

    if (!this.loadedData || !this.loadedData.nodes || this.loadedData.nodes.length === 0) {
      console.warn('ReallocationTreemap: No data loaded or data is empty');
      this.treemapLayoutWidthPx = this.sankeyHasLeafDimension
        ? FLOW_CHART_MIN_WIDTH_DIM3_LEAF_PX
        : FLOW_CHART_MIN_WIDTH_DIM3_NONE_PX;
      return;
    }

    const hierarchy = this.buildHierarchy(this.loadedData);
    this.applyCellSizeBounds(hierarchy);
    this.equalizeSuperparentBandWeights(hierarchy);
    
    if (!hierarchy.children || hierarchy.children.length === 0) {
      console.warn('ReallocationTreemap: Hierarchy has no children', hierarchy);
      this.treemapLayoutWidthPx = this.sankeyHasLeafDimension
        ? FLOW_CHART_MIN_WIDTH_DIM3_LEAF_PX
        : FLOW_CHART_MIN_WIDTH_DIM3_NONE_PX;
      return;
    }

    const numRegions = hierarchy.children.length;
    const scrollHost = container.parentElement as HTMLElement | null;
    const scrollW =
      scrollHost && scrollHost.clientWidth > 0 ? scrollHost.clientWidth : 0;
    const baseContainerWidth =
      scrollW > 0
        ? scrollW
        : container.offsetWidth ||
          this.el.nativeElement.clientWidth ||
          window.innerWidth ||
          1800;
    const MIN_DRAW_WIDTH_PX = this.sankeyHasLeafDimension
      ? FLOW_CHART_MIN_WIDTH_DIM3_LEAF_PX
      : FLOW_CHART_MIN_WIDTH_DIM3_NONE_PX;
    const flooredBase = Math.floor(baseContainerWidth);
    const width = Math.max(
      320,
      flooredBase,
      flooredBase < MIN_DRAW_WIDTH_PX ? MIN_DRAW_WIDTH_PX : 0
    );
    this.treemapLayoutWidthPx = width;
    // Scale height by number of superparents (Dimension 1). Each band needs a minimum pixel height
    // so region titles stay readable; do not hard-cap too low when there are many regions.
    const baseHeight = Math.round(width * (380 / 1800) + 200);   // ~580px at 1800 width for 1 region
    const perRegionExtra = Math.round(width * (220 / 1800) + 120); // ~340px extra per additional region
    const MIN_SUPERPARENT_BAND_PX = 128;
    const heightFromMinBands = numRegions * MIN_SUPERPARENT_BAND_PX + 48;
    const formulaHeight = Math.max(420, baseHeight + (numRegions - 1) * perRegionExtra);
    const softMaxHeight = Math.min(
      12000,
      Math.round(Math.max(width, flooredBase) * 6)
    );
    const height = Math.min(
      softMaxHeight,
      Math.max(formulaHeight, heightFromMinBands)
    );

    const root = d3.hierarchy(hierarchy)
      .sum(d => (d && !d.children && d.layoutValue != null) ? d.layoutValue : 0);

    const treemap = d3.treemap<TreemapNodeData>()
      .size([width, height])
      .tile((node, x0, y0, x1, y1) => {
        if (node.depth === 0) return d3.treemapSlice(node, x0, y0, x1, y1);
        if (node.depth === 1) return d3.treemapDice(node, x0, y0, x1, y1);
        return d3.treemapSquarify(node, x0, y0, x1, y1);
      })
      .paddingOuter(4)
      .paddingTop((d) => {
        // Reserve a clear strip for the Dimension-1 (superparent) title on each horizontal band
        if (d.depth === 1) return numRegions > 10 ? 38 : 34;
        if (d.depth === 2) return 24;
        // Increase padding for depth 3 nodes with children to accommodate multi-line labels when needed
        if (d.depth === 3) return d.children && d.children.length > 0 ? 45 : 20;
        return 2;
      })
      .paddingInner(2)
      .round(true);

    treemap(root);

    const chartDiv = d3.select(container)
      .style('position', 'relative')
      .style('width', '100%')
      .style('max-width', width + 'px')
      .style('height', height + 'px')
      .style('margin', '0')
      .style('background', 'white')
      // .style('border', '1px solid #e6e6e6')
      // .style('box-shadow', '0 1px 3px rgba(0,0,0,0.06)');

    const tooltipBg =
      this.getCssVariable('--treemap-tooltip-bg') ||
      this.getCssVariable('--bg-white') ||
      '#ffffff';
    const tooltipText =
      this.getCssVariable('--treemap-tooltip-text') ||
      this.getCssVariable('--text-primary') ||
      '#0a0a0a';
    const tooltipBorder =
      this.getCssVariable('--treemap-tooltip-border') || 'rgba(10, 10, 10, 0.12)';
    const tooltip = d3
      .select('body')
      .append('div')
      .attr('id', this.bodyTooltipId)
      .attr('class', 'treemap-floating-tooltip')
      .style('position', 'fixed')
      .style('pointer-events', 'none')
      .style('background-color', tooltipBg)
      .style('color', tooltipText)
      .style('border', `1px solid ${tooltipBorder}`)
      .style('padding', '10px 14px')
      .style('font-size', '14px')
      .style('line-height', '1.45')
      .style('font-family', `'Noto Sans', sans-serif`)
      .style('font-weight', '400')
      .style('box-sizing', 'border-box')
      .style('word-break', 'break-word')
      .style('overflow-wrap', 'anywhere')
      .style(
        'box-shadow',
        '0 4px 16px rgba(15, 23, 42, 0.1), 0 0 0 1px rgba(15, 23, 42, 0.04)'
      )
      .style('opacity', '0')
      .style('visibility', 'hidden')
      .style('transform', 'none')
      .style('max-width', 'min(90vw, 520px)')
      .style('z-index', '998');

    d3.select(container).on('mouseleave.treemap', () => {
      this.hideTreemapTooltipAndHighlights();
    });

    const nodes = chartDiv.selectAll('div.node')
      .data(root.descendants().filter(d => d.depth > 0))
      .enter()
      .append('div')
      .attr('class', 'node')
      .attr('data-treemap-depth', (d) => d.depth)
      .classed('superparent', d => d.depth === 1)
      .classed('group', d => d.depth === 2)
      .classed('parent', d => d.depth === 3 && !!d.children)
      .classed('leaf', d => !d.children)
      .classed('small-leaf', d => {
        // Add class for small leaf nodes to allow CSS targeting
        if (!d.children) {
          const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
          const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
          return w < 60 || h < 25;
        }
        return false;
      })
      .classed('tiny-leaf', d => {
        // Add class for tiny leaf nodes (very small)
        if (!d.children) {
          const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
          const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
          return w < 40 || h < 18;
        }
        return false;
      })
      .classed('unreadable-label', d => {
        if (!d.children) {
          const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
          const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
          return this.isLabelUnreadable(w, h);
        }
        return false;
      })
      .style('position', 'absolute')
      .style('box-sizing', 'border-box')
      .style('overflow', d => {
        // For very small leaf nodes (product sub-types), allow overflow so labels can show
        if (!d.children) {
          const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
          const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
          const isVerySmall = w < 60 || h < 25;
          if (isVerySmall) return 'visible';
        }
        return 'hidden';
      })
      .style('border', d => {
        if (d.depth === 3) return '2px solid #F5F1EB';
        return '1px solid rgba(0,0,0,0.12)';
      })
      .style('display', 'flex')
      .style('flex-direction', 'column')
      .style('pointer-events', d => d.children ? 'none' : 'auto')
      .style('left', d => (d as TreemapHierarchyNode).x0 + 'px')
      .style('top', d => (d as TreemapHierarchyNode).y0 + 'px')
      .style('width', d => Math.max(0, (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0) + 'px')
      .style('height', d => Math.max(0, (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0) + 'px')
      .style('z-index', d => 1000 + d.depth) // inner cells on top so hover hits the actual cell
      .style('background', d => {
        const colorStr = this.nodeColor(d as TreemapHierarchyNode, root);
        const c = d3.color(colorStr) || d3.color('#999');
        if (!c) return '#999999';
        c.opacity = d.children ? 0.14 : 0.80;
        return c.formatRgb();
      });

    // Capture component reference for use in callbacks
    const component = this;

    const labels = nodes.append('div')
      .attr('class', 'label')
      .style('font-size', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isSmall = w < 100 || h < 35;
        const isVerySmall = w < 60 || h < 25;
        const isTiny = w < 40 || h < 18;
        
        if (d.depth === 1) return '15px';
        if (d.depth === 2) return '13px';
        if (d.depth === 3) return '13px';
        // For leaf nodes (product sub-types), adjust font size based on node size
        // Always show labels, even for tiny nodes
        if (isTiny) return '7px';
        if (isVerySmall) return '8px';
        if (isSmall) return '9px';
        return '10px';
      })
      .style('font-weight', d => {
        if (d.depth === 1) return '750';
        if (d.depth === 2) return '750';
        if (d.depth === 3) return '650';
        return '650';
      })
      .style('line-height', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isSmall = w < 60 || h < 25;
        const isTiny = w < 40 || h < 18;
        
        if (d.depth === 1) return '1.30';
        if (d.depth === 3) return '1.30';
        // For very small leaf nodes, use tighter line height
        if (!d.children && isTiny) return '1.0';
        if (!d.children && isSmall) return '1.1';
        return '1.25';
      })
      .style('padding', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isSmall = w < 60 || h < 25;
        const isTiny = w < 40 || h < 18;
        
        // Reduce padding for small leaf nodes to ensure labels fit
        if (!d.children && isTiny) return '1px 2px';
        if (!d.children && isSmall) return '2px 3px';
        return '4px 6px';
      })
      .style('margin', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isSmall = w < 60 || h < 25;
        const isTiny = w < 40 || h < 18;
        
        // Add extra bottom margin for depth 3 nodes with children to prevent overlap when labels wrap
        if (d.depth === 3 && d.children && d.children.length > 0) return '2px 2px 12px 2px';
        // Reduce margin for small leaf nodes
        if (!d.children && isTiny) return '0px';
        if (!d.children && isSmall) return '1px';
        return '2px';
      })
      .style('color', '#00113F') // $text-midnight-blue
      // Keep leaf behavior unchanged, but allow container/parent labels to trigger tooltip.
      .style('pointer-events', d => d.children ? 'auto' : 'none')
      .style('cursor', d => d.children ? 'pointer' : 'default')
      .style('white-space', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isSmall = w < 60 || h < 25;
        
        // Truncate product type (group/parent) labels to fit cell
        if (d.depth === 2 || d.depth === 3) return 'nowrap';
        // For small leaf nodes, allow wrapping to show at least part of the label
        if (!d.children && isSmall) return 'normal';
        return 'nowrap';
      })
      .style('word-break', 'break-word')
      .style('overflow', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isSmall = w < 60 || h < 25;
        
        // For small leaf nodes, use visible overflow to ensure labels show
        if (!d.children && isSmall) return 'visible';
        return 'hidden';
      })
      .style('text-overflow', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isSmall = w < 60 || h < 25;
        
        // Truncate product type (group/parent) labels with ellipsis when longer than cell
        if (d.depth === 2 || d.depth === 3) return 'ellipsis';
        // For small nodes, don't use ellipsis to ensure text shows
        if (!d.children && isSmall) return 'clip';
        return 'ellipsis';
      })
      .style('background', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isTiny = w < 40 || h < 18;
        
        // For tiny nodes, use more opaque background to ensure text is readable
        if (!d.children && isTiny) return 'rgba(255, 255, 255, 0.9)';
        return 'rgba(255, 255, 255, 0.65)';
      })
      .style('border-radius', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isSmall = w < 60 || h < 25;
        const isTiny = w < 40 || h < 18;
        
        // Smaller border radius for small nodes
        if (!d.children && isTiny) return '1px';
        if (!d.children && isSmall) return '2px';
        return '4px';
      })
      .style('flex-shrink', '0') // Prevent labels from shrinking
      .style('flex-grow', '0') // Prevent labels from growing
      .style('display', 'inline-block')
      .style('max-width', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isSmall = w < 60 || h < 25;
        const isTiny = w < 40 || h < 18;
        
        // For small nodes, use more of the available width
        // For tiny nodes, allow full width and even overflow slightly
        if (!d.children && isTiny) return 'none';
        if (!d.children && isSmall) return 'calc(100% - 2px)';
        return 'calc(100% - 8px)';
      })
      .style('min-height', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isTiny = w < 40 || h < 18;
        
        // Ensure labels have minimum height to be visible
        if (!d.children && isTiny) return 'auto';
        return 'auto';
      })
      .text(d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isTiny = w < 40 || h < 18;
        const isSmall = w < 60 || h < 25;
        
        // Hide label for cells too small to read; tooltip shows full info on hover
        if (!d.children && this.isLabelUnreadable(w, h)) {
          return '';
        }
        // Always show labels for all nodes, especially leaf nodes (product sub-types)
        if (d.depth === 2) {
          return d.data.name + ': ' + this.formatValue(this.signedValue(d as TreemapHierarchyNode));
        }
        // Depth 3 container only (has sub-type children). Collapsed depth-3 leaves use leaf labeling below.
        if (d.depth === 3 && d.children) {
          return d.data.name + ': ' + this.formatValue(this.signedValue(d as TreemapHierarchyNode));
        }
        // For very small leaf nodes, include value in label to save space
        if (!d.children && isTiny) {
          const v = this.signedValue(d as TreemapHierarchyNode);
          const name = d.data.name || '';
          // Prioritize showing the name, add value if there's space
          return name ? (name + ' ' + this.formatValue(v)) : this.formatValue(v);
        }
        // For small leaf nodes, show name first, value can be separate
        if (!d.children && isSmall) {
          return d.data.name || '';
        }
        // For leaf nodes (product sub-types), always return the name
        return d.data.name || '';
      })
      .style('display', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        // Hide label for unreadably small cells; rely on tooltip for details
        return (!d.children && this.isLabelUnreadable(w, h)) ? 'none' : 'block';
      })
      .style('visibility', 'visible') // Explicitly make labels visible
      .style('z-index', '10') // Ensure labels are above other elements
      .style('position', 'relative'); // Ensure proper positioning

    // Parent/group/superparent labels can also trigger tooltip (useful when cell content is clipped by children)
    labels
      .filter(d => !!d.children && d.depth !== 1)
      .on('mousemove', function(event: MouseEvent, d) {
        const path = d.ancestors().reverse().map(x => x.data.name).join(' › ');
        const value = component.formatValue(component.signedValue(d as TreemapHierarchyNode));
        const timeHorizonDisplay = component.getTimeHorizonDisplayString();
        const sampleSize = component.sumNClientsInSubtree(d as TreemapHierarchyNode);
        tooltip
          .style('opacity', '1')
          .style('visibility', 'visible')
          .html(component.buildTooltipHtml(path, value, timeHorizonDisplay, sampleSize));
        component.positionTreemapTooltipElement(
          tooltip.node() as HTMLElement,
          event,
          this.parentNode as HTMLElement
        );

        d3.select(this.parentNode as HTMLDivElement)
          .classed('highlighted', true)
          .style('border-width', () => {
            if (d.depth === 3) return '3px';
            return '2px';
          })
          .style('border-color', '#0b41ad')
          .style('box-shadow', '0 0 8px rgba(11, 65, 173, 0.5)')
          .style('z-index', '2000');
      })
      .on('mouseleave', function(event: MouseEvent, d) {
        tooltip.style('opacity', '0').style('visibility', 'hidden');
        d3.select(this.parentNode as HTMLDivElement)
          .classed('highlighted', false)
          .style('border-width', () => {
            if (d.depth === 3) return '2px';
            return '1px';
          })
          .style('border-color', () => {
            if (d.depth === 3) return '#F5F1EB';
            return 'rgba(0,0,0,0.12)';
          })
          .style('box-shadow', 'none')
          .style('z-index', () => String(1000 + d.depth));
      });

    const values = nodes.append('div')
      .attr('class', 'value')
      .style('margin-top', 'auto')
      .style('font-size', '12px')
      .style('font-weight', '600')
      .style('padding', '0 6px 6px 6px')
      .style('color', 'rgba(0, 0, 0, 0.85)')
      .style('pointer-events', 'none')
      .style('display', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        return (!d.children && this.isLabelUnreadable(w, h)) ? 'none' : 'block';
      })
      .text(d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isTiny = w < 40 || h < 18;

        // For unreadably small cells, hide value (tooltip shows it on hover)
        if (!d.children && this.isLabelUnreadable(w, h)) return '';
        // For very small leaf nodes, hide the separate value div since it's included in the label
        if (!d.children && isTiny) return '';

        if (w < 60 || h < 26) return '';

        const v = this.signedValue(d as TreemapHierarchyNode);

        if (!d.children) return this.formatValue(v);

        return '';
      });

    nodes.on('mousemove', function(event: MouseEvent, d) {
      if (d.depth === 1) {
        tooltip.style('opacity', '0').style('visibility', 'hidden');
        return;
      }
      const path = d.ancestors().reverse().map(x => x.data.name).join(' › ');
      const value = component.formatValue(component.signedValue(d as TreemapHierarchyNode));
      const timeHorizonDisplay = component.getTimeHorizonDisplayString();
      const sampleSize = component.sumNClientsInSubtree(d as TreemapHierarchyNode);
      tooltip
        .style('opacity', '1')
        .style('visibility', 'visible')
        .html(component.buildTooltipHtml(path, value, timeHorizonDisplay, sampleSize));
      component.positionTreemapTooltipElement(
        tooltip.node() as HTMLElement,
        event,
        this as HTMLElement
      );
      
      // Highlight the hovered cell
      d3.select(this)
        .classed('highlighted', true)
        .style('border-width', () => {
          if (d.depth === 3) return '3px';
          return '2px';
        })
        .style('border-color', '#0b41ad')
        .style('box-shadow', '0 0 8px rgba(11, 65, 173, 0.5)')
        .style('z-index', '2000');
    });

    nodes.on('mouseleave', function(event: MouseEvent, d) {
      tooltip.style('opacity', '0').style('visibility', 'hidden');
      
      // Remove highlighting from the cell
      d3.select(this)
        .classed('highlighted', false)
        .style('border-width', () => {
          if (d.depth === 3) return '2px';
          return '1px';
        })
        .style('border-color', () => {
          if (d.depth === 3) return '#F5F1EB';
          return 'rgba(0,0,0,0.12)';
        })
        .style('box-shadow', 'none')
        .style('z-index', () => String(1000 + d.depth));
    });
  }
}

