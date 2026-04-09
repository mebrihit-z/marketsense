/* eslint-disable */
import { Component, ElementRef, AfterViewInit, OnDestroy, Input, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import * as d3 from 'd3';
import {
  sankey,
  sankeyLinkHorizontal,
  SankeyGraph
} from 'd3-sankey';
import {
  filterSankeyData,
  filterSankeyDataByFlowValueRange,
  extractProductTypeFromNodeName,
  type SankeyData,
} from '../../../utils/sankey-data.utils';
import {
  formatFlowCurrencyFromBillions,
  formatFlowCurrencyFromBillionsFull,
  formatFlowCurrencyUsd,
} from '../../../utils/flow-currency-format.util';
import { formatTimeHorizonSliderHandleDate } from '../../../utils/time-horizon-slider-tooltip-date.util';

// ----------------------
// TypeScript Models
// ----------------------
interface SankeyNodeExtra {
  name: string;
  /** Set by d3-sankey after layout */
  index?: number;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
  sourceLinks?: SankeyLinkExtra[];
  targetLinks?: SankeyLinkExtra[];
}

interface SankeyLinkExtra {
  source: number | SankeyNodeExtra;
  target: number | SankeyNodeExtra;
  value: number;
  /** Original flow value ($B); tooltips and totals use this when set. */
  rawValue?: number;
  color?: string;
  width?: number;
  y0?: number;
  y1?: number;
  date?: string;
  /** Set before layout so we can scale the same logical link across iterations. */
  layoutIndex?: number;
}

interface RegionalSankeyData {
  nodes: Array<{ name: string }>;
  links: Array<{ source: string; target: string; value: number; date?: string }>;
  summary?: any;
}

// ----------------------
// Angular Component
// ----------------------
@Component({
  selector: 'app-sankey',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sankey.component.html',
  styleUrl: './sankey.component.scss',
  providers: []
})
export class SankeyComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() data?: RegionalSankeyData;
  @Input() selectedInvestorRegions: string[] = [];
  @Input() selectedProductTypes: string[] = [];
  @Input() selectedProductSubTypes: string[] = [];
  @Input() timeHorizon?: string;
  @Input() timeHorizonStart?: string;
  @Input() timeHorizonEnd?: string;
  /** When set to 'Global', node labels will have the "Global" prefix removed for display. */
  @Input() regionKey?: string;
  /** Selected flow dimension 2 label (passed from parent for context). */
  @Input() dimension2Label?: string;
  /** Selected flow dimension 1 label (passed from parent for context). */
  @Input() dimension1Label?: string;
  /** Minimum flow value in billions ($B); links below this are hidden when greater than 0. */
  @Input() minFlowValue: number = 0;
  /** Maximum flow value in billions; links above this are hidden when set. Null = no upper cap. */
  @Input() maxFlowValue: number | null = null;
  /**
   * For Net New / Capital Withdrawn links only: floor layout value to this fraction of the
   * largest link value so those nodes stay visible (matches treemap emphasis). Does not change raw $ in tooltips.
   */
  @Input() structuralFlowLayoutFloorFraction: number = 0.02;
  /**
   * For ordinary links: floor layout thickness vs. the largest link so ribbons stay visible.
   * Does not change raw $ in tooltips or totals.
   */
  @Input() linkLayoutVisibilityFloorFraction: number = 0.010;
  /**
   * Target minimum node height in pixels; layout link weights are boosted iteratively until met.
   * Set 0 to disable. Does not change raw $ in tooltips.
   */
  @Input() minNodeHeightPx: number = 2;
  /** Minimum drawn link stroke width in pixels. */
  @Input() minLinkStrokePx: number = 0.5;

  private loadedData?: RegionalSankeyData;
  private lastDataHash: string = '';
  private lastFiltersHash: string = '';
  private tooltipId: string;

  constructor(
    private el: ElementRef,
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {
    // Generate unique tooltip ID for this instance
    this.tooltipId = `sankey-tooltip-${Math.random().toString(36).substr(2, 9)}`;
  }

  private isStructuralCapitalFlowName(name: string): boolean {
    return typeof name === 'string' &&
      (name.includes('Net New Capital') || name.includes('Capital Withdrawn'));
  }

  private layoutValueForLink(
    raw: number,
    maxRaw: number,
    sourceName: string,
    targetName: string
  ): number {
    const structuralFrac = Math.max(0, Math.min(1, this.structuralFlowLayoutFloorFraction ?? 0.06));
    const generalFrac = Math.max(0, Math.min(1, this.linkLayoutVisibilityFloorFraction ?? 0.032));
    const safeMax = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 1;
    const v = Math.max(0, Number.isFinite(raw) ? raw : 0);
    if (v <= 0) return v;

    const boostedLayout = (capFrac: number, valueMultiplier: number, minBoostOfMax: number): number => {
      const cap = safeMax * capFrac;
      const boosted = Math.max(v * valueMultiplier, safeMax * minBoostOfMax);
      return Math.max(v, Math.min(cap, boosted));
    };

    if (this.isStructuralCapitalFlowName(sourceName) || this.isStructuralCapitalFlowName(targetName)) {
      return boostedLayout(structuralFrac, 6, 0.012);
    }
    return boostedLayout(generalFrac, 8, 0.006);
  }

  private linkFlowForTotals(link: SankeyLinkExtra): number {
    return link.rawValue != null ? link.rawValue : link.value;
  }

  /**
   * Per-link layout bump multipliers can make sum(incoming layout value) ≠ sum(outgoing) at a node.
   * d3-sankey then sizes the node from the larger sum; with a shared global ky the shorter stack
   * leaves empty band (one fat inflow vs many outflows looks mismatched). Rebalance layout values
   * with iterative proportional fitting on internal nodes; tooltips still use rawValue.
   */
  private harmonizeInternalNodeLayoutValues(
    graph: SankeyGraph<SankeyNodeExtra, SankeyLinkExtra>
  ): void {
    const internal = graph.nodes.filter(
      n => (n.targetLinks?.length ?? 0) > 0 && (n.sourceLinks?.length ?? 0) > 0
    );
    for (let iter = 0; iter < 48; iter++) {
      let maxRelErr = 0;
      for (const node of internal) {
        const ins = node.targetLinks as SankeyLinkExtra[];
        const outs = node.sourceLinks as SankeyLinkExtra[];
        const si = d3.sum(ins, l => Number(l.value) || 0);
        const so = d3.sum(outs, l => Number(l.value) || 0);
        if (!(si > 1e-12) || !(so > 1e-12)) continue;
        const ratio = so / si;
        maxRelErr = Math.max(maxRelErr, Math.abs(1 - ratio));
        const r = Math.sqrt(ratio);
        ins.forEach(l => {
          l.value *= r;
        });
        outs.forEach(l => {
          l.value /= r;
        });
      }
      if (maxRelErr < 1e-8) break;
    }
  }

  /**
   * When layout boosts make sum(link widths) on one side of a node smaller than that node’s bar
   * height, d3-sankey stacks from the top and leaves empty space. Distribute slack as gaps between
   * ribbons so inflows (targetLinks → y1) and outflows (sourceLinks → y0) each span the full node
   * height — Realloc, regional parents, (Start)/(End), etc. Link thicknesses and tooltips unchanged.
   */
  private spreadHubLinkStacksToNodeHeight(
    graph: SankeyGraph<SankeyNodeExtra, SankeyLinkExtra>
  ): void {
    const spreadSide = (
      yTop: number,
      nodeSpan: number,
      links: SankeyLinkExtra[] | undefined,
      setCenter: (link: SankeyLinkExtra, centerY: number) => void
    ) => {
      if (links == null || links.length === 0) return;
      const totalW = links.reduce((s, l) => s + (Number(l.width) || 0), 0);
      if (!(totalW > 1e-6)) return;
      if (totalW >= nodeSpan - 0.5) return;

      const n = links.length;
      const slack = nodeSpan - totalW;
      const gap = n > 1 ? slack / (n - 1) : 0;
      let y = yTop;
      if (n === 1) {
        y = yTop + slack / 2;
      }
      for (let i = 0; i < n; i++) {
        const link = links[i];
        const w = Number(link.width) || 0;
        setCenter(link, y + w / 2);
        y += w;
        if (i < n - 1) {
          y += gap;
        }
      }
    };

    for (const node of graph.nodes) {
      if (node.y0 === undefined || node.y1 === undefined) continue;
      const nodeSpan = node.y1 - node.y0;
      if (!(nodeSpan > 1e-6)) continue;
      const yTop = node.y0;

      spreadSide(yTop, nodeSpan, node.targetLinks, (link, cy) => {
        link.y1 = cy;
      });
      spreadSide(yTop, nodeSpan, node.sourceLinks, (link, cy) => {
        link.y0 = cy;
      });
    }
  }

  /**
   * Generate a simple hash of data to detect actual changes
   */
  private getDataHash(data: RegionalSankeyData | undefined): string {
    if (!data) return '';
    const nodesCount = data.nodes?.length || 0;
    const linksCount = data.links?.length || 0;
    const firstNode = data.nodes?.[0]?.name || '';
    const lastNode = data.nodes?.[nodesCount - 1]?.name || '';
    return `${nodesCount}-${linksCount}-${firstNode}-${lastNode}`;
  }
  
  /**
   * Generate a hash of filter values to detect actual changes
   */
  private getFiltersHash(): string {
    return `${this.selectedInvestorRegions.join(',')}-${this.selectedProductTypes.join(',')}-${this.selectedProductSubTypes.join(',')}-${this.minFlowValue ?? 0}-${this.maxFlowValue ?? ''}-${this.minNodeHeightPx}-${this.linkLayoutVisibilityFloorFraction}-${this.structuralFlowLayoutFloorFraction}-${this.minLinkStrokePx}`;
  }

  ngAfterViewInit(): void {
    // If data is provided via input, use it; otherwise load from JSON
    if (this.data) {
      this.loadedData = this.data;
      this.lastDataHash = this.getDataHash(this.data);
      this.lastFiltersHash = this.getFiltersHash();
      setTimeout(() => {
        this.createSankey();
      }, 0);
    } else {
      
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    let shouldRecreate = false;
    
    // Check if data actually changed
    if (changes['data'] && this.data) {
      const newDataHash = this.getDataHash(this.data);
      if (newDataHash !== this.lastDataHash) {
        this.loadedData = this.data;
        this.lastDataHash = newDataHash;
        shouldRecreate = true;
      }
    }
    
    // Check if filters actually changed
    if (changes['selectedInvestorRegions'] || 
        changes['selectedProductTypes'] || 
        changes['selectedProductSubTypes'] ||
        changes['minFlowValue'] ||
        changes['maxFlowValue'] ||
        changes['structuralFlowLayoutFloorFraction'] ||
        changes['linkLayoutVisibilityFloorFraction'] ||
        changes['minNodeHeightPx'] ||
        changes['minLinkStrokePx']) {
      const newFiltersHash = this.getFiltersHash();
      if (newFiltersHash !== this.lastFiltersHash) {
        this.lastFiltersHash = newFiltersHash;
        // Only recreate if data is available
        if (this.data || this.loadedData) {
          shouldRecreate = true;
        }
      }
    }

    // Only recreate if something actually changed
    if (shouldRecreate && this.el?.nativeElement) {
      setTimeout(() => {
        this.createSankey();
      }, 0);
    }
  }


  /**
   * Applies filters to the sankey data: category filters (regions, product types, sub-types) and minimum flow value.
   */
  private getFilteredData(): RegionalSankeyData | undefined {
    const dataToUse = this.loadedData || this.data;
    if (!dataToUse) return undefined;

    // When no investor regions are selected, do not render any Sankey data.
    if (this.selectedInvestorRegions && this.selectedInvestorRegions.length === 0) {
      return undefined;
    }

    let result = dataToUse as SankeyData;

    // Apply category filters when any are selected
    const hasCategoryFilters =
      this.selectedInvestorRegions.length > 0 ||
      this.selectedProductTypes.length > 0 ||
      this.selectedProductSubTypes.length > 0;
    if (hasCategoryFilters) {
      result = filterSankeyData(
        result,
        this.selectedInvestorRegions,
        this.selectedProductTypes,
        this.selectedProductSubTypes
      );
    }

    const minVal = this.minFlowValue ?? 0;
    const maxVal = this.maxFlowValue;
    if (minVal > 0 || (maxVal != null && Number.isFinite(maxVal))) {
      result = filterSankeyDataByFlowValueRange(result, minVal, maxVal, true);
    }

    return result as RegionalSankeyData;
  }

    // Helper: read CSS variable from component host first (scoped palette for VDI/local consistency), then :root
    private getCssVariable(name: string): string {
      const el = this.el?.nativeElement;
      if (el) {
        const value = getComputedStyle(el).getPropertyValue(name).trim();
        if (value) return value;
      }
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    // Helper function to format node name for display
    private formatNodeName(name: string): string {
      // Replace "United States" with "U.S" and "United Kingdom" with "U.K"
      let formatted = name.replace(/United States/g, 'U.S');
      formatted = formatted.replace(/United Kingdom/g, 'U.K');
      // Remove (Source), (Destination), (Start), (End), and Super Start/End from display
      formatted = formatted.replace(/\s*\(Source\)\s*$/, '');
      formatted = formatted.replace(/\s*\(Destination\)\s*$/, '');
      formatted = formatted.replace(/\s*\(Start\)\s*$/, '');
      formatted = formatted.replace(/\s*\(End\)\s*$/, '');
      formatted = formatted.replace(/\s*\(Super Start\)\s*$/, '');
      formatted = formatted.replace(/\s*\(Super End\)\s*$/, '');
      // Scoped parent/sub/pool nodes: "Super: Product (…)" → show "Product" / "Reallocation Pool" only;
      // Net New / Withdrawn stay "Net New Capital (…)".
      if (/^.+:\s*.+/.test(formatted) && !/\(Super\s+(Start|End)\)\s*$/.test(name.trim())) {
        formatted = formatted.replace(/^[^:]+:\s*/, '').trim();
      }
      // On global sankey only, remove "Global" prefix from labels (title already says Global)
      if (this.regionKey === 'Global') {
        formatted = formatted.replace(/^Global\s*:\s*/, '').replace(/^Global\s*-\s*/, '').replace(/^Global\s+/, '').trim();
      }
      return formatted;
    }

    /** Formats a date string (ISO or YYYY-MM-DD) to a readable tooltip format e.g. "Mar 31, 2026" */
    private formatDateForTooltip(dateStr: string): string {
      if (!dateStr || typeof dateStr !== 'string') return dateStr ?? '';
      try {
        const d = new Date(dateStr);
        if (Number.isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      } catch {
        return dateStr;
      }
    }

    /** Same dates as the time-horizon slider handle tooltips. */
    private formatHorizonTokenForTooltip(horizon: string): string {
      return formatTimeHorizonSliderHandleDate(horizon.trim());
    }

    private formatTimeInfo(): string {
      if (this.timeHorizonStart && this.timeHorizonEnd) {
        const start = this.formatHorizonTokenForTooltip(this.timeHorizonStart);
        const end = this.formatHorizonTokenForTooltip(this.timeHorizonEnd);
        return `${start} to ${end}`;
      }
      if (this.timeHorizon) {
        return this.formatHorizonTokenForTooltip(this.timeHorizon);
      }
      return '';
    }

  // -----------------------------------------
  // MAIN FUNCTION
  // -----------------------------------------
  private createSankey() {
    const dataToUse = this.getFilteredData();
    const element = this.el.nativeElement.querySelector('.regional-sankey');
    if (!dataToUse) {
      // No data for current filters: clear any existing SVG and tooltip.
      if (element) {
        d3.select(element).select('svg').remove();
      }
      d3.select('body').select(`#${this.tooltipId}`).remove();
      this.cdr.markForCheck();
      return;
    }
    
    // Clear any existing SVG and tooltip for this instance
    d3.select(element).select('svg').remove();
    d3.select('body').select(`#${this.tooltipId}`).remove();
    
    // Get the container width dynamically
    const nativeRect = this.el.nativeElement.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    
    // Use container width; enforce minimum so chart is readable and scrolls horizontally when container is small (like treemap)
    const MIN_CHART_WIDTH = 1200;
    const baseContainerWidth = elementRect.width > 0 ? elementRect.width : 
                          nativeRect.width > 0 ? nativeRect.width : 
                          element.clientWidth || 
                          element.offsetWidth || 
                          this.el.nativeElement.clientWidth || 
                          this.el.nativeElement.offsetWidth ||
                          window.innerWidth || MIN_CHART_WIDTH;
    const width = Math.max(baseContainerWidth, MIN_CHART_WIDTH);
    const baseHeight = elementRect.height > 0 ? elementRect.height : nativeRect.height > 0 ? nativeRect.height : 700;
    const height = Math.max(baseHeight, 320);

    // Create tooltip (append to body for positioning; inline styles required because body is outside component)
    d3.select('body').select(`#${this.tooltipId}`).remove();
    const tooltipBg =
      this.getCssVariable('--sankey-tooltip-bg') ||
      this.getCssVariable('--bg-white') ||
      '#ffffff';
    const tooltipText =
      this.getCssVariable('--sankey-tooltip-text') ||
      this.getCssVariable('--text-primary') ||
      '#0a0a0a';
    const tooltipBorder =
      this.getCssVariable('--sankey-tooltip-border') || 'rgba(10, 10, 10, 0.12)';
    const tooltip = d3.select('body')
      .append('div')
      .attr('id', this.tooltipId)
      .attr('class', 'sankey-tooltip')
      .style('position', 'absolute')
      .style('background-color', tooltipBg)
      .style('color', tooltipText)
      .style('border', `1px solid ${tooltipBorder}`)
      .style('padding', '10px 14px')
      .style('font-size', '14px')
      .style('line-height', '1.45')
      .style('pointer-events', 'none')
      // Below dashboard sticky filters (.dashboard-filters-sticky z-index: 999)
      .style('z-index', '998')
      .style(
        'box-shadow',
        '0 4px 16px rgba(15, 23, 42, 0.1), 0 0 0 1px rgba(15, 23, 42, 0.04)'
      )
      .style('max-width', 'min(90vw, 520px)')
      .style('opacity', '0')
      .style('display', 'none');

    // -----------------------------------------
    // 1. Prepare link layout definitions (indices + boosted base layout values)
    // -----------------------------------------
    const nodeMap = new Map<string, number>();
    dataToUse.nodes.forEach((node, i) => nodeMap.set(node.name, i));

    const maxRawLinkValue = d3.max(dataToUse.links, l => l.value) || 1;

    interface LayoutLinkDef {
      source: number;
      target: number;
      baseLayoutValue: number;
      rawValue: number;
      date?: string;
      layoutIndex: number;
    }

    const layoutLinkDefs: LayoutLinkDef[] = [];
    let defIndex = 0;
    for (const link of dataToUse.links) {
      const sourceIndex = nodeMap.get(link.source);
      const targetIndex = nodeMap.get(link.target);
      if (sourceIndex === undefined || targetIndex === undefined) {
        continue;
      }

      const raw = link.value;
      const linkSrc = link.source;
      const linkTgt = link.target;
      const sourceName = typeof linkSrc === 'string' ? linkSrc : '';
      const targetName = typeof linkTgt === 'string' ? linkTgt : '';
      const layoutValue = this.layoutValueForLink(raw, maxRawLinkValue, sourceName, targetName);

      layoutLinkDefs.push({
        source: sourceIndex,
        target: targetIndex,
        baseLayoutValue: layoutValue,
        rawValue: raw,
        date: link.date,
        layoutIndex: defIndex++,
      });
    }

    const leftMargin = 8;   // Minimal padding so edge labels aren’t clipped
    const rightMargin = 8;
    const topMargin = 15;   // Small padding at top (Outflows/Inflows labels are outside chart)
    const bottomMargin = 50;

    const sankeyGen = sankey<SankeyNodeExtra, SankeyLinkExtra>()
      .nodeWidth(20)
      .nodePadding(10)
      .extent([[leftMargin, topMargin], [width - rightMargin, height - bottomMargin]]);

    const minNodePx = Math.max(0, this.minNodeHeightPx ?? 8);
    let linkMultipliers = layoutLinkDefs.map(() => 1);
    // Assigned on every iteration of the loop below (always runs ≥ once).
    let graph!: SankeyGraph<SankeyNodeExtra, SankeyLinkExtra>;

    const MAX_LAYOUT_ITERATIONS = 32;
    const LAYOUT_BUMP = 1.12;

    for (let attempt = 0; attempt < MAX_LAYOUT_ITERATIONS; attempt++) {
      const sankeyNodes: SankeyNodeExtra[] = dataToUse.nodes.map(n => ({ name: n.name }));
      const sankeyLinks: SankeyLinkExtra[] = layoutLinkDefs.map((def, i) => ({
        source: def.source,
        target: def.target,
        value: def.baseLayoutValue * linkMultipliers[i],
        rawValue: def.rawValue,
        date: def.date,
        layoutIndex: def.layoutIndex,
      }));

      graph = sankeyGen({
        nodes: sankeyNodes,
        links: sankeyLinks,
      });

      if (minNodePx <= 0 || layoutLinkDefs.length === 0) {
        break;
      }

      const hasThinNode = graph.nodes.some(n => {
        const h = (n.y1 ?? 0) - (n.y0 ?? 0);
        return h > 0 && h < minNodePx;
      });

      if (!hasThinNode) {
        break;
      }

      if (attempt === MAX_LAYOUT_ITERATIONS - 1) {
        break;
      }

      const nextMults = linkMultipliers.slice();
      graph.links.forEach(link => {
        const le = link as SankeyLinkExtra;
        const idx = le.layoutIndex;
        if (idx === undefined) return;
        const s = link.source as SankeyNodeExtra;
        const t = link.target as SankeyNodeExtra;
        const sh = (s.y1 ?? 0) - (s.y0 ?? 0);
        const th = (t.y1 ?? 0) - (t.y0 ?? 0);
        if ((sh > 0 && sh < minNodePx) || (th > 0 && th < minNodePx)) {
          nextMults[idx] *= LAYOUT_BUMP;
        }
      });
      linkMultipliers = nextMults;
    }

    this.harmonizeInternalNodeLayoutValues(graph);
    const nodesBalanced: SankeyNodeExtra[] = dataToUse.nodes.map(n => ({ name: n.name }));
    const linksBalanced: SankeyLinkExtra[] = (graph.links as SankeyLinkExtra[]).map(l => {
      const s = l.source as SankeyNodeExtra;
      const t = l.target as SankeyNodeExtra;
      return {
        source: s.index!,
        target: t.index!,
        value: l.value,
        rawValue: l.rawValue,
        date: l.date,
        layoutIndex: l.layoutIndex,
      };
    });
    graph = sankeyGen({
      nodes: nodesBalanced,
      links: linksBalanced,
    });

    this.spreadHubLinkStacksToNodeHeight(graph);

    // -----------------------------------------
    // 2. Create SVG (no zoom – chart at fixed scale for readable labels)
    // -----------------------------------------
    const svg = d3.select(element)
      .append('svg')
      .attr('class', 'sankey-svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height-50}`)
      .attr('preserveAspectRatio', 'none');

    // Chart group – no zoom/pan so labels stay readable
    const chartGroup = svg.append('g')
      .attr('class', 'sankey-chart-group');

    // Helper: map extracted parent type (from any dimension) to our color class
    const parentTypeToColorClass = (parentType: string | null): string | null => {
      if (!parentType) return null;
      const p = parentType.toLowerCase();
      if (p.includes('private equity')) return 'private-markets';
      if (p.includes('equity') && !p.includes('private')) return 'equity';
      if (p.includes('fixed income')) return 'fixed-income';
      if (p.includes('cash')) return 'cash';
      if (p.includes('multi-asset') || p.includes('balanced')) return 'multi-asset';
      if (p.includes('alternatives')) return 'alternatives';
      if (p.includes('other') && (p.includes('specialized') || p.includes('/'))) return 'other-specialized';
      if (p.includes('private markets')) return 'private-markets';
      return null;
    };

    // Build map: subNodeName -> Map<parentName, totalValue> - sum flows per parent, then pick parent with highest total
    type ParentFlowEntry = { parent: SankeyNodeExtra; value: number };
    const subToParentValues = new Map<string, Map<string, ParentFlowEntry>>();
    const addParentFlow = (subName: string, parent: SankeyNodeExtra, value: number) => {
      if (!subToParentValues.has(subName)) {
        subToParentValues.set(subName, new Map<string, ParentFlowEntry>());
      }
      const parentMap = subToParentValues.get(subName)!;
      const key = parent.name;
      const existing = parentMap.get(key);
      const newValue = (existing?.value ?? 0) + value;
      parentMap.set(key, { parent, value: newValue });
    };

    graph.links.forEach(link => {
      const source = link.source as SankeyNodeExtra;
      const target = link.target as SankeyNodeExtra;
      const le = link as SankeyLinkExtra;
      const value = this.linkFlowForTotals(le);
      
      // Start -> Source: parent passes value to sub
      if (source.name && source.name.includes('(Start)') && !source.name.includes('Super Start') && target.name && target.name.includes('(Source)')) {
        addParentFlow(target.name, source, value);
      }
      // Destination -> End: sub passes value to parent
      if (target.name && target.name.includes('(End)') && !target.name.includes('Super End') && source.name && source.name.includes('(Destination)')) {
        addParentFlow(source.name, target, value);
      }
    });

    const leafToParentNodeMap = new Map<string, SankeyNodeExtra>();
    const nodeParentTypeMap = new Map<string, string>();
    subToParentValues.forEach((parentMap, subNodeName) => {
      const entries: ParentFlowEntry[] = Array.from(parentMap.values());
      const bestEntry = entries.length > 0
        ? entries.reduce((a, b) => a.value >= b.value ? a : b)
        : null;
      if (bestEntry && bestEntry.parent.name) {
        leafToParentNodeMap.set(subNodeName, bestEntry.parent);
        const extractedType = extractProductTypeFromNodeName(bestEntry.parent.name);
        const colorClass = parentTypeToColorClass(extractedType);
        if (colorClass) {
          nodeParentTypeMap.set(subNodeName, colorClass);
        }
      }
    });

    // Find the Reallocation Pool node to use as reference point
    const reallocationPoolNode = graph.nodes.find(node => 
      node.name && node.name.includes('Reallocation Pool')
    );
    
    // Get the x position of the Reallocation Pool node (use x0 as reference)
    const reallocationPoolX = reallocationPoolNode?.x0 !== undefined 
      ? reallocationPoolNode.x0 
      : (reallocationPoolNode?.x1 !== undefined ? reallocationPoolNode.x1 : null);

    // Assign link colors based on position relative to Reallocation Pool
    // Links to the right of Reallocation Pool are green, others are red
    // Net New Capital links are always blue; Capital Withdrawn links are orange
    graph.links.forEach(link => {
      const linkExtra = link as SankeyLinkExtra;
      const source = link.source as SankeyNodeExtra;
      const target = link.target as SankeyNodeExtra;
      
      // Check if link is connected to Net New Capital - make it blue
      if ((source.name && source.name.includes('Net New Capital')) || 
          (target.name && target.name.includes('Net New Capital'))) {
        linkExtra.color = this.getCssVariable('--blue-link') || 'rgba(0,100,200,0.7)';
        return;
      }
      
      // Check if link is connected to Capital Withdrawn - use dedicated orange color
      if ((source.name && source.name.includes('Capital Withdrawn')) || 
          (target.name && target.name.includes('Capital Withdrawn'))) {
        linkExtra.color = this.getCssVariable('--capital-withdrawn-link') || '#ff7f0e';
        return;
      }
      
      // If Reallocation Pool position is not found, fall back to midpoint logic
      if (reallocationPoolX === null) {
        const allXPositions: number[] = [];
        graph.nodes.forEach(node => {
          if (node.x0 !== undefined) allXPositions.push(node.x0);
          if (node.x1 !== undefined) allXPositions.push(node.x1);
        });
        const minX = Math.min(...allXPositions);
        const maxX = Math.max(...allXPositions);
        const midX = (minX + maxX) / 2;
        const sourceX = source.x0 !== undefined ? source.x0 : (source.x1 || 0);
        linkExtra.color = sourceX < midX 
          ? 'rgba(245, 189, 189, 0.8)'
          : (this.getCssVariable('--green-link') || '#059669');
        return;
      }
      
      // Get x positions of source and target nodes
      const sourceX = source.x0 !== undefined ? source.x0 : (source.x1 || 0);
      const targetX = target.x0 !== undefined ? target.x0 : (target.x1 || 0);
      
      // Link is green if source or target is to the right of Reallocation Pool
      if (sourceX > reallocationPoolX || targetX > reallocationPoolX) {
        // Links to the right of Reallocation Pool are green
        // linkExtra.color = this.getCssVariable('--green-link') || '#059669';
        linkExtra.color = 'rgba(104, 188, 102, 0.8)';
      } else {
        // Links to the left of Reallocation Pool are outflow (negative flows)
        linkExtra.color = 'rgba(238, 152, 153, 0.8)';
      }
    });

    // -----------------------------------------
    // 4. Draw Links
    // -----------------------------------------
    // Capture component reference for use in callbacks
    const component = this;
    const minLkStroke = Math.max(0.5, this.minLinkStrokePx ?? 1.5);
    const linkRestOpacity = 0.52;
    const linkStrokePx = (link: SankeyLinkExtra) =>
      Math.max(minLkStroke, Number(link.width) || 0);

    chartGroup.append('g')
      .selectAll('path')
      .data(graph.links)
      .enter()
      .append('path')
      .attr('d', sankeyLinkHorizontal())
      .attr('stroke', d => (d as SankeyLinkExtra).color || this.getCssVariable('--default-gray') || '#999')
      .attr('stroke-width', d => linkStrokePx(d as SankeyLinkExtra))
      .attr('stroke-linecap', 'butt')
      .attr('stroke-linejoin', 'miter')
      .attr('fill', 'none')
      .attr('opacity', linkRestOpacity)
      .attr('class', 'sankey-link')
      .on('mouseover', function(event, d) {
        const link = d as SankeyLinkExtra;
        const source = link.source as SankeyNodeExtra;
        const target = link.target as SankeyNodeExtra;
        const value = component.linkFlowForTotals(link);
        const formattedValue = formatFlowCurrencyFromBillionsFull(value);
        
        // Check if this is a subasset link (connected to Source or Destination nodes)
        const isSubassetLink = (source.name && (source.name.includes('(Source)') || source.name.includes('(Destination)'))) ||
                               (target.name && (target.name.includes('(Source)') || target.name.includes('(Destination)')));
        
        let tooltipHtml = `
          <div><strong>${component.formatNodeName(source.name)}</strong> → <strong>${component.formatNodeName(target.name)}</strong></div>
          <div style="margin-top: 4px;">Value: ${formattedValue}</div>
        `;
        
        // For subasset links, show the Asset_Flow_Date if available, otherwise show time horizon
        if (isSubassetLink && link.date) {
          tooltipHtml += `<div style="margin-top: 4px; font-size: 13px; opacity: 0.9;">Date: ${component.formatDateForTooltip(link.date)}</div>`;
        } else {
          const timeInfo = component.formatTimeInfo();
          if (timeInfo) {
            tooltipHtml += `<div style="margin-top: 4px; font-size: 13px; opacity: 0.9;">Time: ${timeInfo}</div>`;
          }
        }
        
        tooltip
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px')
          .style('opacity', '1')
          .style('display', 'block')
          .html(tooltipHtml);
        
        // Highlight the hovered link
        d3.select(this)
          .attr('opacity', 1)
          .attr('stroke-width', (d: any) => {
            return linkStrokePx(d as SankeyLinkExtra) + 3;
          })
          .raise(); // Bring to front
        
        // Dim other links slightly
        chartGroup.selectAll('path')
          .filter(function() { return this !== d3.select(event.currentTarget).node(); })
          .attr('opacity', 0.2);
      })
      .on('mousemove', function(event) {
        tooltip
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', function() {
        tooltip.style('opacity', '0').style('display', 'none');
        d3.select(this)
          .attr('opacity', linkRestOpacity)
          .attr('stroke-width', (d: any) => linkStrokePx(d as SankeyLinkExtra));
        
        // Restore all links opacity
        chartGroup.selectAll('path').attr('opacity', linkRestOpacity);
      });

    // -----------------------------------------
    // 5. Calculate Node Values
    // -----------------------------------------
    const nodeIncoming = new Map<SankeyNodeExtra, number>();
    const nodeOutgoing = new Map<SankeyNodeExtra, number>();
    
    graph.nodes.forEach(node => {
      nodeIncoming.set(node, 0);
      nodeOutgoing.set(node, 0);
    });
    
    graph.links.forEach(link => {
      const source = link.source as SankeyNodeExtra;
      const target = link.target as SankeyNodeExtra;
      const le = link as SankeyLinkExtra;
      const value = this.linkFlowForTotals(le);
      
      nodeOutgoing.set(source, nodeOutgoing.get(source)! + value);
      nodeIncoming.set(target, nodeIncoming.get(target)! + value);
    });
    
    const nodeValues = new Map<SankeyNodeExtra, number>();
    graph.nodes.forEach(node => {
      const incoming = nodeIncoming.get(node) || 0;
      const outgoing = nodeOutgoing.get(node) || 0;
      nodeValues.set(node, Math.max(incoming, outgoing));
    });

    // -----------------------------------------
    // 6. Node color class (colors defined in sankey.component.scss)
    // -----------------------------------------
    const getCssVar = (name: string, fallback: string) => {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value || fallback;
    };

    const getNodeColorClass = (nodeName: string): string => {
      if (nodeName.includes('Reallocation Pool')) return 'reallocation-pool';
      if (nodeName.includes('Net New Capital')) return 'net-new-capital';
      if (nodeName.includes('Capital Withdrawn')) return 'capital-withdrawn';
      if (nodeName.includes('Super Start') || nodeName.includes('Super End')) return 'regions';
      const parentType = nodeParentTypeMap.get(nodeName);
      if (parentType) {
        return parentType;
      }
      if (nodeName.includes('(Start)') || nodeName.includes('(End)')) {
        if (nodeName.includes('Private Equity')) return 'private-markets';
        if (nodeName.includes('Equity')) return 'equity';
        if (nodeName.includes('Fixed Income')) return 'fixed-income';
        if (nodeName.includes('Cash')) return 'cash';
        if (nodeName.includes('Multi-Asset')) return 'multi-asset';
        if (nodeName.includes('Other / Specialized') || nodeName.includes('Other/Specialized')) return 'other-specialized';
        if (nodeName.includes('Private Markets')) return 'private-markets';
        if (nodeName.includes('Alternatives')) return 'alternatives';
      }
      if (nodeName.includes('(Source)') || nodeName.includes('(Destination)')) return 'source-destination';
      return 'default';
    };

    // Unique colors only for parent nodes that don't have existing colors (default type)
    const defaultColorPalette = [
      '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#42d4f4',
      '#f032e6', '#bfef45', '#469990', '#dcbeff', '#9a6324', '#800000', '#aaffc3',
      '#808000', '#ffd8b1', '#000075', '#fabed4', '#fffac8', '#e6beff'
    ];
    const defaultNodes = graph.nodes.filter(n => getNodeColorClass(n.name) === 'default');
    const defaultNodeColorScale = d3.scaleOrdinal<string, string>()
      .domain(defaultNodes.map(n => n.name))
      .range(defaultColorPalette);

    // Leaf nodes (Source/Destination) inherit parent's color
    const getNodeDisplayStyle = (nodeName: string): { class?: string; fill?: string; stroke?: string } => {
      const cls = getNodeColorClass(nodeName);
      const parentNode = leafToParentNodeMap.get(nodeName);
      // For leaf nodes, use parent's color if we have a linked parent
      const effectiveNode = parentNode ? { name: parentNode.name } : { name: nodeName };
      const effectiveCls = parentNode ? getNodeColorClass(parentNode.name) : cls;
      if (effectiveCls === 'default') {
        return { class: 'sankey-node-rect', fill: defaultNodeColorScale(effectiveNode.name), stroke: defaultNodeColorScale(effectiveNode.name) };
      }
      if (effectiveCls === 'source-destination') {
        return { class: `sankey-node-rect sankey-node-${effectiveCls}` };
      }
      return { class: `sankey-node-rect sankey-node-${effectiveCls}` };
    };

    // -----------------------------------------
    // 7. Draw Nodes
    // -----------------------------------------
    chartGroup.append('g')
      .selectAll('rect')
      .data(graph.nodes)
      .enter()
      .append('rect')
      .attr('x', d => d.x0!)
      .attr('y', d => d.y0!)
      .attr('height', d => d.y1! - d.y0!)
      .attr('width', d => d.x1! - d.x0!)
      .attr('class', d => getNodeDisplayStyle(d.name).class || 'sankey-node-rect')
      .attr('fill', d => getNodeDisplayStyle(d.name).fill ?? null)
      .attr('stroke', d => getNodeDisplayStyle(d.name).stroke ?? null)
      .attr('stroke-width', d => (getNodeDisplayStyle(d.name).fill ? 1 : null))
      .on('mouseover', function(event, d) {
        const node = d as SankeyNodeExtra;
        const value = nodeValues.get(node) || 0;
        const formattedValue = formatFlowCurrencyFromBillionsFull(value);
        const incoming = nodeIncoming.get(node) || 0;
        const outgoing = nodeOutgoing.get(node) || 0;
        
         // Check if this is a parent node (Start/End) and collect subasset information
         let subassetHtml = '';
         if (node.name.includes('(Start)') || node.name.includes('(End)')) {
           const subassets: Array<{ name: string; value: number; date?: string }> = [];
           
           // Find all connected subasset nodes (Source for Start nodes, Destination for End nodes)
           if (node.name.includes('(Start)')) {
             // For Start nodes, find all Source nodes connected via outgoing links
             graph.links.forEach(link => {
               const linkSource = link.source as SankeyNodeExtra;
               const linkTarget = link.target as SankeyNodeExtra;
               if (linkSource === node && linkTarget.name && linkTarget.name.includes('(Source)')) {
                 const linkExtra = link as SankeyLinkExtra;
                 subassets.push({
                   name: linkTarget.name,
                   value: component.linkFlowForTotals(linkExtra),
                   date: linkExtra.date
                 });
               }
             });
           } else if (node.name.includes('(End)')) {
             // For End nodes, find all Destination nodes connected via incoming links
             graph.links.forEach(link => {
               const linkSource = link.source as SankeyNodeExtra;
               const linkTarget = link.target as SankeyNodeExtra;
               if (linkTarget === node && linkSource.name && linkSource.name.includes('(Destination)')) {
                 const linkExtra = link as SankeyLinkExtra;
                 subassets.push({
                   name: linkSource.name,
                   value: component.linkFlowForTotals(linkExtra),
                   date: linkExtra.date
                 });
               }
             });
           }
           
           // Group subassets by name and aggregate values and collect unique dates
           const subassetMap = new Map<string, { value: number; dates: Set<string> }>();
           subassets.forEach(subasset => {
             // Clean up the subasset name - remove region prefix and (Source)/(Destination) suffix
             let cleanName = subasset.name;
             cleanName = cleanName.replace(/^[^:]+: /, ''); // Remove region prefix like "United States: "
             cleanName = cleanName.replace(/\s*\(Source\)\s*$/, ''); // Remove (Source)
             cleanName = cleanName.replace(/\s*\(Destination\)\s*$/, ''); // Remove (Destination)
             
             if (!subassetMap.has(cleanName)) {
               subassetMap.set(cleanName, { value: 0, dates: new Set<string>() });
             }
             const entry = subassetMap.get(cleanName)!;
             entry.value += subasset.value;
             if (subasset.date) {
               entry.dates.add(subasset.date);
             }
           });
           
           // Convert map to array and sort by value
           const aggregatedSubassets = Array.from(subassetMap.entries()).map(([name, data]) => ({
             name,
             value: data.value,
             dates: Array.from(data.dates).sort()
           }));
           
           // Sort subassets by value (descending) and format them
           if (aggregatedSubassets.length > 0) {
             aggregatedSubassets.sort((a, b) => b.value - a.value);
             const maxItemsToShow = 10;
             const itemsToShow = aggregatedSubassets.slice(0, maxItemsToShow);
             const remainingCount = aggregatedSubassets.length - maxItemsToShow;
             
             subassetHtml = '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(10, 10, 10, 0.12); font-size: 13px;">';
             subassetHtml += `<div style="font-weight: 600; margin-bottom: 4px; opacity: 0.9;">Product Sub-Type (${aggregatedSubassets.length}):</div>`;
             subassetHtml += '<div style="max-height: 200px; overflow-y: auto; overflow-x: hidden;">';
             itemsToShow.forEach(subasset => {
               const subassetLine = `${component.formatNodeName(subasset.name)}: <strong>${formatFlowCurrencyFromBillionsFull(subasset.value)}</strong>`;
               subassetHtml += `<div style="margin-top: 3px; opacity: 0.85; white-space: normal; line-height: 1.4;">${subassetLine}</div>`;
             });
             if (remainingCount > 0) {
               subassetHtml += `<div style="margin-top: 4px; font-style: italic; opacity: 0.7; font-size: 12px;">... and ${remainingCount} more</div>`;
             }
             subassetHtml += '</div></div>';
           }
         }
        
        const timeInfo = component.formatTimeInfo();
        
        let tooltipHtml = `
          <div><strong>${component.formatNodeName(node.name)}</strong></div>
          <div style="margin-top: 4px;">Total Value: ${formattedValue}</div>
          <div style="margin-top: 2px; font-size: 13px; opacity: 0.9;">Incoming: ${formatFlowCurrencyFromBillionsFull(incoming)}</div>
          <div style="font-size: 13px; opacity: 0.9;">Outgoing: ${formatFlowCurrencyFromBillionsFull(outgoing)}</div>
        `;
        
        if (timeInfo) {
          tooltipHtml += `<div style="margin-top: 4px; font-size: 13px; opacity: 0.9;">Time: ${timeInfo}</div>`;
        }
        
        tooltipHtml += subassetHtml;
        
        tooltip
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px')
          .style('opacity', '1')
          .style('display', 'block')
          .html(tooltipHtml);
        
        // Highlight the hovered node (hover styles in SCSS; for nodes with custom fill use brighter stroke)
        const sel = d3.select(this);
        const displayStyle = getNodeDisplayStyle(node.name);
        sel.attr('stroke-width', 3).raise();
        if (displayStyle.fill) {
          const c = d3.color(displayStyle.fill);
          if (c) sel.attr('stroke', c.brighter(0.4).toString());
        } else {
          sel.classed('sankey-node-hovered', true);
        }
        
        // Highlight connected links
        const nodeLinks = graph.links.filter(link => 
          (link.source as SankeyNodeExtra) === node || (link.target as SankeyNodeExtra) === node
        );
        const isCapitalWithdrawnHovered = node.name.includes('Capital Withdrawn');

        chartGroup.selectAll('path')
          .filter(function(link: any) {
            return nodeLinks.includes(link as SankeyLinkExtra);
          })
          .attr('opacity', 0.8)
          .attr('stroke', function(link: any) {
            const le = link as SankeyLinkExtra;
            const base = le.color || component.getCssVariable('--default-gray') || '#999';
            if (!isCapitalWithdrawnHovered) return base;
            const c = d3.color(base);
            return c ? c.darker(0.9).toString() : base;
          })
          .attr('stroke-width', (link: any) => linkStrokePx(link as SankeyLinkExtra) + 1);
        
        // Dim other nodes and links
        chartGroup.selectAll('rect')
          .filter(function() { return this !== d3.select(event.currentTarget).node(); })
          .attr('opacity', 0.3);
        
        chartGroup.selectAll('path')
          .filter(function(link: any) {
            return !nodeLinks.includes(link as SankeyLinkExtra);
          })
          .attr('opacity', 0.15);
      })
      .on('mousemove', function(event) {
        tooltip
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', function(event, d) {
        tooltip.style('opacity', '0').style('display', 'none');
        const n = d as SankeyNodeExtra;
        const sel = d3.select(this);
        const displayStyle = getNodeDisplayStyle(n.name);
        sel.classed('sankey-node-hovered', false);
        sel.attr('stroke-width', displayStyle.fill ? 1 : null);
        if (displayStyle.stroke) sel.attr('stroke', displayStyle.stroke);
        chartGroup.selectAll('rect').attr('opacity', 1);
        chartGroup
          .selectAll('path')
          .attr('opacity', linkRestOpacity)
          .attr('stroke-width', (link: any) => linkStrokePx(link as SankeyLinkExtra))
          .attr('stroke', (link: any) => {
            const le = link as SankeyLinkExtra;
            return le.color || component.getCssVariable('--default-gray') || '#999';
          });
      });

    // -----------------------------------------
    // 8. Node Labels (with values inline)
    // -----------------------------------------
    const getLabelX = (d: SankeyNodeExtra): number => {
      if (d.name.includes('Reallocation Pool')) return d.x1! + 12;
      if (d.name.includes('(Source)')) return d.x1! + 12;
      if (d.name.includes('(Destination)')) return d.x0! - 12;
      // Place New Capital and Capital Withdrawn labels to the right of the node
      if (d.name.includes('Net New Capital') || d.name.includes('Capital Withdrawn')) return d.x1! + 12;
      if (reallocationPoolX !== null && d.x0! > reallocationPoolX) return d.x0! - 12;
      if (reallocationPoolX !== null && d.x1! < reallocationPoolX) return d.x1! + 12;
      return (d.x0! + d.x1!) / 2;
    };
    const nodeLabels = chartGroup.append('g')
      .attr('class', 'sankey-node-labels')
      .selectAll('text')
      .data(graph.nodes)
      .enter()
      .append('text')
      .attr('class', 'sankey-node-label')
      .attr('x', getLabelX)
      .attr('y', d => (d.y0! + d.y1!) / 2)
      .attr('text-anchor', d => {
        if (d.name.includes('(Source)')) return 'start';
        if (d.name.includes('(Destination)')) return 'end';
        if (d.name.includes('Net New Capital') || d.name.includes('Capital Withdrawn')) return 'start';
        // Positive/inflow side: anchor at end so text sits to the left of the node
        if (reallocationPoolX !== null && d.x0! > reallocationPoolX) return 'end';
        // Negative/outflow side: anchor at start so text sits to the right of the node
        if (reallocationPoolX !== null && d.x1! < reallocationPoolX) return 'start';
        return 'middle';
      })
      .attr('alignment-baseline', 'middle');
    
    // Add label text
    nodeLabels.append('tspan')
      .attr('class', 'sankey-node-label-name')
      .text(d => {
        if (d.name.includes('Net New Capital')) {
          return 'New Capital:';
        }
        if (d.name.includes('Capital Withdrawn')) {
          return 'Withdrawn:';
        }
        // Use short label for Reallocation Pool to avoid overlap
        if (d.name.includes('Reallocation Pool')) {
          return 'Realloc:';
        }
        // Format the name (replace United States with U.S and United Kingdom with U.K)
        const formattedName = this.formatNodeName(d.name);
        // Truncate long labels (slightly longer for readability)
        const maxLength = 28;
        const label = formattedName.length > maxLength ? formattedName.substring(0, maxLength) + '...' : formattedName;
        return label + ':';
      });
    
    // Add value text as tspan – on next line for Realloc, Super Start, Super End to avoid overlap
    const putValueOnNextLine = (d: SankeyNodeExtra) =>
      d.name.includes('Reallocation Pool') ||
      d.name.includes('Super Start') || d.name.includes('Super End');
    nodeLabels.append('tspan')
      .attr('class', 'sankey-node-label-value')
      .attr('dx', d => putValueOnNextLine(d) ? null : '8px')
      .attr('dy', d => putValueOnNextLine(d) ? '1.15em' : null)
      .attr('x', d => putValueOnNextLine(d) ? getLabelX(d) : null)
      .text(d => {
        const value = nodeValues.get(d) || 0;
        const nodeX = d.x0 !== undefined ? d.x0 : (d.x1 || 0);
        const isLeftOfReallocation = reallocationPoolX !== null && nodeX < reallocationPoolX;
        const dollars = value * 1_000_000_000;
        if (d.name.includes('Net New Capital') || d.name.includes('Capital Withdrawn')) {
          return formatFlowCurrencyFromBillions(value);
        }
        const signed = isLeftOfReallocation ? -dollars : dollars;
        return formatFlowCurrencyUsd(signed);
      });

    // Link values are not drawn – only node labels show values (next to each node)
  }

  ngOnDestroy(): void {
    // Clean up tooltip when component is destroyed
    d3.select('body').select(`#${this.tooltipId}`).remove();
  }
}

