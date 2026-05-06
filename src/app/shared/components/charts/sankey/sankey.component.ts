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
  buildSankeySourceTargetPairSumDollars,
  cascadePruneSankeyLinkRows,
  linkPassesFlowValueRangeFilter,
  sankeyLinkPairKey,
  extractProductTypeFromNodeName,
  type SankeyData,
} from '../../../utils/sankey-data.utils';
import { formatFlowCurrencyUsd } from '../../../utils/flow-currency-format.util';
import { formatTimeHorizonSliderHandleDate } from '../../../utils/time-horizon-slider-tooltip-date.util';
import { AssetFlowHistoricAnchorService } from '../../../../core/services/asset-flow-historic-anchor.service';
import {
  FLOW_CHART_MIN_WIDTH_DIM3_LEAF_PX,
  FLOW_CHART_MIN_WIDTH_DIM3_NONE_PX,
} from '../../../utils/flow-chart-min-width.constants';

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
  /** Original flow value (USD); tooltips and totals use this when set. */
  rawValue?: number;
  color?: string;
  width?: number;
  y0?: number;
  y1?: number;
  date?: string;
  /** Sum of client counts for rows on this link (from {@link SankeyLink#nClientsTotal}). */
  nClientsTotal?: number;
  /** Set before layout so we can scale the same logical link across iterations. */
  layoutIndex?: number;
}

interface RegionalSankeyData {
  nodes: Array<{ name: string }>;
  links: Array<{ source: string; target: string; value: number; date?: string; nClientsTotal?: number }>;
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
  /** Selected flow Dimension 1 id (e.g. `investor-type`); boosts layout readability when not `investor-region`. */
  @Input() dimension1Id?: string;
  /** Flow Dimension 3 label (leaf / Source–Destination breakdown); tooltip heading on (Start)/(End) parent hovers. */
  @Input() dimension3Label?: string;
  /**
   * True when Dimension 3 is not "None". Enables aggregate Super↔parent reconcile after value-range
   * so trunk link thickness matches surviving leaf links; included in filter hash when it toggles.
   */
  @Input() sankeyHasLeafDimension = false;
  /** Minimum flow value in billions ($B); links below this are hidden when greater than 0. */
  @Input() minFlowValue: number = 0;
  /** Maximum flow value in billions; links above this are hidden when set. Null = no upper cap. */
  @Input() maxFlowValue: number | null = null;
  /**
   * For Net New / Capital In links only: floor layout value to this fraction of the
   * largest link value so those nodes stay visible (matches treemap emphasis). Does not change raw $ in tooltips.
   */
  @Input() structuralFlowLayoutFloorFraction: number = 0.02;
  /**
   * For ordinary links: floor layout thickness vs. the largest link so ribbons stay visible.
   * Does not change raw $ in tooltips or totals.
   */
  @Input() linkLayoutVisibilityFloorFraction: number = 0.012;
  /**
   * Target minimum node height in pixels; layout link weights are boosted iteratively until met.
   * Set 0 to disable. Does not change raw $ in tooltips.
   */
  @Input() minNodeHeightPx: number = 8;
  /** Minimum drawn link stroke width in pixels. */
  @Input() minLinkStrokePx: number = 1.75;
  /**
   * When true, links that touch sub-asset tier nodes — names ending in `(Source)` or `(Destination)` —
   * use a single fixed layout weight so those ribbons share the same thickness; all other links keep
   * flow-based layout. USD stays in labels/tooltips via {@link SankeyLinkExtra#rawValue}.
   */
  @Input() uniformLinkLayout = true;

  /** Layout weight for each leaf/sub link when {@link uniformLinkLayout} applies. */
  private static readonly UNIFORM_LAYOUT_LINK_WEIGHT = 1;

  /**
   * When `window.innerWidth` is below this, Reallocation Pool labels place the currency value on a second line.
   */
  private static readonly REALLOC_LABEL_VALUE_WRAP_MAX_VIEWPORT_WIDTH = 1921;

  /**
   * When `window.innerWidth` is strictly less than this, apply reduced label character budgets and pixel clamping.
   */
  private static readonly SANKEY_LABEL_TRUNCATION_INNER_WIDTH_PX = 1540;

  private loadedData?: RegionalSankeyData;
  private lastDataHash: string = '';
  private lastFiltersHash: string = '';
  private tooltipId: string;
  /** True after destroy so the global render queue can skip this instance. */
  private hostDestroyed = false;
  /** Avoids full rebuild when time inputs are re-written with the same strings. */
  private lastHorizonInputsKey = '';
  private removeWindowResizeListener: (() => void) | null = null;

  /**
   * Total block height (flow labels + chart scroll); grows when many Super Start/End hubs need vertical room.
   * Bound in template; defaults to 960 until `createSankey` runs.
   */
  sankeyContainerHeightPx = 960;

  /**
   * Laid-out SVG width in px — drives `max(100%, Npx)` on `.sankey-scroll-pane` so narrow viewports get horizontal scroll.
   */
  sankeyLayoutWidthPx = 960;

  /** Scroll row: never narrower than the Dimension-3-aware floor, or full host width when wider. */
  get sankeyScrollHostMinWidthCss(): string {
    const floorPx = this.sankeyHasLeafDimension
      ? FLOW_CHART_MIN_WIDTH_DIM3_LEAF_PX
      : FLOW_CHART_MIN_WIDTH_DIM3_NONE_PX;
    const w = Math.max(this.sankeyLayoutWidthPx, floorPx);
    return `max(100%, ${w}px)`;
  }

  /**
   * One `createSankey` per animation frame app-wide (deduped per instance) so N regional
   * charts do not all layout in the same long task ("stacking" / tab freeze).
   */
  private static readonly renderQueue: SankeyComponent[] = [];
  private static pumpRafId: number | null = null;

  constructor(
    private el: ElementRef,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private historicAnchor: AssetFlowHistoricAnchorService
  ) {
    // Generate unique tooltip ID for this instance
    this.tooltipId = `sankey-tooltip-${Math.random().toString(36).substr(2, 9)}`;
  }

  private isStructuralCapitalFlowName(name: string): boolean {
    return typeof name === 'string' &&
      (name.includes('Capital In') || name.includes('Capital Out'));
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
      return boostedLayout(structuralFrac, 6, 0.014);
    }
    return boostedLayout(generalFrac, 8, 0.008);
  }

  /**
   * Maps linear layout weight → d3-sankey `link.value` so a single huge ribbon cannot use almost
   * the entire chart height. Uses √x (proportions still rank-correct; small flows stay visible).
   * {@link SankeyLinkExtra#rawValue} and tooltips are unchanged (true USD).
   */
  private sankeyLinkLayoutRenderValue(linearLayout: number): number {
    const x = Math.max(0, Number.isFinite(linearLayout) ? linearLayout : 0);
    if (x <= 0) return 0;
    return Math.sqrt(x);
  }

  private linkFlowForTotals(link: SankeyLinkExtra): number {
    return link.rawValue != null ? link.rawValue : link.value;
  }

  /** Sub-asset nodes from `convertAssetFlowsToSankey` — product sub-type `(Source)` / `(Destination)`. */
  private isLeafSubSankeyNodeName(name: string | undefined | null): boolean {
    return (
      typeof name === 'string' &&
      (name.includes('(Source)') || name.includes('(Destination)'))
    );
  }

  /** True when either end of the link is a leaf/sub node. */
  private sankeyLinkTouchesLeafSubTier(sourceName: string, targetName: string): boolean {
    return this.isLeafSubSankeyNodeName(sourceName) || this.isLeafSubSankeyNodeName(targetName);
  }

  /**
   * Groups all nodes in a super-dimension band (region/segment) so d3-sankey can align vertical
   * positions and reduce crossing when several super values are on the same chart.
   * Matches `convertAssetFlowsToSankey` naming: `Super:…`, `… (Super Start)`, `…: Reallocation Pool`, etc.
   */
  private sankeySuperKeyForNodeSort(name: string | undefined | null): string {
    if (!name) return '\u0000';
    const n = name.trim();
    if (/\s*\(Super Start\)\s*$/i.test(n)) {
      return n.replace(/\s*\(Super Start\)\s*$/i, '').trim();
    }
    if (/\s*\(Super End\)\s*$/i.test(n)) {
      return n.replace(/\s*\(Super End\)\s*$/i, '').trim();
    }
    const rePool = /^(.*):\s*Reallocation Pool\s*$/i.exec(n);
    if (rePool) {
      return rePool[1].trim();
    }
    const c = n.indexOf(':');
    if (c >= 0) {
      return n.slice(0, c).trim();
    }
    if (n.includes('Capital In') || n.includes('Capital Out')) {
      return '\u0001structural';
    }
    return '\u0002' + n;
  }

  private buildReallocationPoolXBySuperMap(
    nodes: Array<{ name?: string; x0?: number; x1?: number }>
  ): Map<string, number> {
    const m = new Map<string, number>();
    for (const node of nodes) {
      if (!node.name || !node.name.includes('Reallocation Pool')) {
        continue;
      }
      const k = this.sankeySuperKeyForNodeSort(node.name);
      const x = node.x0 != null && Number.isFinite(node.x0) ? node.x0 : (node.x1 != null && Number.isFinite(node.x1) ? node.x1 : null);
      if (x != null) {
        m.set(k, x);
      }
    }
    return m;
  }

  private getReallocationRefXForName(
    bySuper: ReadonlyMap<string, number>,
    name: string,
    globalFallback: number | null
  ): number | null {
    const k = this.sankeySuperKeyForNodeSort(name);
    if (bySuper.has(k)) {
      return bySuper.get(k)!;
    }
    return globalFallback;
  }

  private getReallocationRefXForLink(
    bySuper: ReadonlyMap<string, number>,
    source: { name?: string },
    target: { name?: string },
    globalFallback: number | null
  ): number | null {
    for (const p of [source, target]) {
      if (!p?.name) continue;
      const v = this.getReallocationRefXForName(bySuper, p.name, null);
      if (v != null) return v;
    }
    return globalFallback;
  }

  /**
   * Max nodes stacked in any one Sankey column (same depth). Used for node padding and label
   * density; overall chart band height can grow when many Super hubs are present (see `createSankey`).
   */
  private maxSankeyColumnStack(nodes: Array<{ name: string }>): number {
    if (!nodes.length) return 1;
    let cSource = 0;
    let cDest = 0;
    let cParentStart = 0;
    let cParentEnd = 0;
    let cSuper = 0;
    let cOther = 0;
    for (const { name } of nodes) {
      if (name.includes('(Source)')) cSource++;
      else if (name.includes('(Destination)')) cDest++;
      else if (name.includes('(Start)') && !name.includes('Super')) cParentStart++;
      else if (name.includes('(End)') && !name.includes('Super')) cParentEnd++;
      else if (name.includes('Super Start') || name.includes('Super End')) cSuper++;
      else cOther++;
    }
    return Math.max(1, cSource, cDest, cParentStart, cParentEnd, cSuper, cOther);
  }

  /**
   * Greedy vertical packing: sorted by `desiredY`, each assigned y is at least `minGap` below the previous.
   * Used for leaf label tops (hanging baseline) and parent row centers when columns are dense.
   */
  private packVerticalLabelYs(
    nodes: SankeyNodeExtra[],
    predicate: (n: SankeyNodeExtra) => boolean,
    desiredY: (n: SankeyNodeExtra) => number,
    minGap: number
  ): Map<SankeyNodeExtra, number> {
    const list = nodes.filter(predicate).sort((a, b) => desiredY(a) - desiredY(b));
    const out = new Map<SankeyNodeExtra, number>();
    let prevY = -Infinity;
    for (const n of list) {
      const want = desiredY(n);
      const y = Math.max(want, prevY + minGap);
      out.set(n, y);
      prevY = y;
    }
    return out;
  }

  /**
   * Shift every packed y by the same amount upward so no label anchor sits below `maxY`.
   * Greedy vertical packing can push the last labels past the SVG bottom; this keeps them visible.
   */
  private clampPackedLabelYsMax(m: Map<SankeyNodeExtra, number>, maxY: number): void {
    if (m.size === 0) return;
    let peak = -Infinity;
    m.forEach(y => {
      if (y > peak) peak = y;
    });
    if (peak <= maxY) return;
    const delta = peak - maxY;
    m.forEach((y, k) => m.set(k, y - delta));
  }

  private isSankeyFlowPillarNode(name: string): boolean {
    return (
      name.includes('Reallocation Pool') ||
      name.includes('(Super Start)') ||
      name.includes('(Super End)') ||
      name.includes('Capital In') ||
      name.includes('Capital Out')
    );
  }

  private isProductRegionDimension1(): boolean {
    return this.dimension1Id === 'product-region';
  }

  /** Matches column `nodePadding` with floors/caps for Capital In/Out vs Super Start/End spacing. */
  private structuralCapitalSuperGapPx(layoutNodePaddingPx: number): number {
    return Math.max(18, Math.min(layoutNodePaddingPx + 10, 36));
  }

  /**
   * Draw the Capital In branch under the investor `(Super Start)` bar:
   * - `${sp}: Capital In (Super)` stacks just below `${sp} (Super Start)`.
   * - `Capital In (${sp})` (what users read as "Capital In") is vertically **centered**
   *   on that stub — d3 normally drops it toward the pool,yielding a long vertical offset.
   * Caller runs `sankeyGen.update(graph)` next, then hub spreading.
   */
  private anchorCapitalInUnderInvestorBar(
    graph: SankeyGraph<SankeyNodeExtra, SankeyLinkExtra>,
    gapPx: number
  ): void {
    const capMidRe = /^Capital In \((.+)\)\s*$/i;
    const nodes = graph.nodes as SankeyNodeExtra[];
    /** Breathing room under the investor bar; slightly more than caps so ribbons do not kiss the trunk. */
    const gap = this.structuralCapitalSuperGapPx(gapPx);

    for (const capMid of nodes) {
      const midM = capMidRe.exec((capMid.name ?? '').trim());
      if (!midM) continue;

      const sp = midM[1].trim();
      const superStart = nodes.find(n => n.name === `${sp} (Super Start)`);
      if (!superStart || superStart.y0 == null || superStart.y1 == null) continue;
      if (capMid.y0 == null || capMid.y1 == null) continue;

      const capSuper = nodes.find(n => n.name === `${sp}: Capital In (Super)`);
      const ssBottom = superStart.y1 + gap;

      if (capSuper && capSuper.y0 != null && capSuper.y1 != null) {
        const hS = capSuper.y1 - capSuper.y0;
        capSuper.y0 = ssBottom;
        capSuper.y1 = ssBottom + hS;

        const hM = capMid.y1 - capMid.y0;
        const midCy = (capSuper.y0 + capSuper.y1) / 2;
        let capMidY0 = midCy - hM / 2;
        const minTopBelowInvestor = superStart.y1 + gap;
        if (capMidY0 < minTopBelowInvestor) {
          capMidY0 = minTopBelowInvestor;
        }
        capMid.y0 = capMidY0;
        capMid.y1 = capMidY0 + hM;
      } else {
        const hM = capMid.y1 - capMid.y0;
        capMid.y0 = ssBottom;
        capMid.y1 = ssBottom + hM;
      }
    }
  }

  /**
   * Mirror {@link anchorCapitalInUnderInvestorBar} on the sink side:
   * `Pool → Capital Out (${sp}) → ${sp}: Capital Out (Super)` clustered under `${sp} (Super End)`
   * so the visible Capital Out pillar is not stranded toward slack / pool-aligned y.
   * Caller runs `sankeyGen.update(graph)` next, then hub spreading.
   */
  private anchorCapitalOutUnderSuperEndBar(
    graph: SankeyGraph<SankeyNodeExtra, SankeyLinkExtra>,
    gapPx: number
  ): void {
    const capMidRe = /^Capital Out \((.+)\)\s*$/i;
    const nodes = graph.nodes as SankeyNodeExtra[];
    const gap = this.structuralCapitalSuperGapPx(gapPx);

    for (const capMid of nodes) {
      const midM = capMidRe.exec((capMid.name ?? '').trim());
      if (!midM) continue;

      const sp = midM[1].trim();
      const superEnd = nodes.find(n => n.name === `${sp} (Super End)`);
      if (!superEnd || superEnd.y0 == null || superEnd.y1 == null) continue;
      if (capMid.y0 == null || capMid.y1 == null) continue;

      const capOutSuper = nodes.find(n => n.name === `${sp}: Capital Out (Super)`);
      const endBottom = superEnd.y1 + gap;

      if (capOutSuper && capOutSuper.y0 != null && capOutSuper.y1 != null) {
        const hS = capOutSuper.y1 - capOutSuper.y0;
        capOutSuper.y0 = endBottom;
        capOutSuper.y1 = endBottom + hS;

        const hM = capMid.y1 - capMid.y0;
        const midCy = (capOutSuper.y0 + capOutSuper.y1) / 2;
        let capMidY0 = midCy - hM / 2;
        const minTopBelowSuperEnd = superEnd.y1 + gap;
        if (capMidY0 < minTopBelowSuperEnd) {
          capMidY0 = minTopBelowSuperEnd;
        }
        capMid.y0 = capMidY0;
        capMid.y1 = capMidY0 + hM;
      } else {
        const hM = capMid.y1 - capMid.y0;
        capMid.y0 = endBottom;
        capMid.y1 = endBottom + hM;
      }
    }
  }

  /** Pull the laid-out flow block up so the top node sits on `extentTop` (drops top slack from d3 columns). */
  private shiftSankeyGraphVertically(
    graph: SankeyGraph<SankeyNodeExtra, SankeyLinkExtra>,
    extentTop: number
  ): void {
    let minY = Infinity;
    for (const n of graph.nodes as SankeyNodeExtra[]) {
      if (n.y0 != null && Number.isFinite(n.y0)) {
        minY = Math.min(minY, n.y0);
      }
    }
    if (!Number.isFinite(minY)) return;
    const delta = extentTop - minY;
    if (Math.abs(delta) < 0.25) return;

    for (const n of graph.nodes as SankeyNodeExtra[]) {
      if (n.y0 != null && Number.isFinite(n.y0)) n.y0 += delta;
      if (n.y1 != null && Number.isFinite(n.y1)) n.y1 += delta;
    }
    for (const l of graph.links as SankeyLinkExtra[]) {
      if (l.y0 != null && Number.isFinite(l.y0)) l.y0 += delta;
      if (l.y1 != null && Number.isFinite(l.y1)) l.y1 += delta;
    }
  }

  /**
   * Product Region can create very dominant Super Start/End trunks that force
   * strong vertical re-stacking. Damp super aggregate layout weight a bit so
   * links remain readable without changing tooltip/raw values.
   */
  private applyDimension1LayoutAdjustment(
    layoutValue: number,
    sourceName: string,
    targetName: string
  ): number {
    if (!this.isProductRegionDimension1()) {
      return layoutValue;
    }
    const touchesSuperAggregate =
      sourceName.includes('(Super Start)') || targetName.includes('(Super End)');
    if (!touchesSuperAggregate) {
      return layoutValue;
    }
    return layoutValue * 0.7;
  }

  /** Realloc + super terminals only (not Capital In/Out): show full $ in labels/tooltips while value-range prunes elsewhere. */
  private isReallocOrSuperTerminalHub(name: string): boolean {
    return (
      name.includes('Reallocation Pool') ||
      name.includes('(Super Start)') ||
      name.includes('(Super End)')
    );
  }

  /**
   * When Dimension 3 is on, shrink or mute Super→(Start) and (End)→Super End aggregates so they match
   * only leaf links that pass the value-range filter (avoids a huge ribbon while sub-links are pruned).
   * Super / Realloc **labels** and tooltips still use full totals from the pre-prune link sums in createSankey.
   */
  private reconcileDimension3AggregatesWithValueRange(
    layoutLinkDefs: Array<{
      source: number;
      target: number;
      baseLayoutValue: number;
      rawValue: number;
      mutedByValueRange?: boolean;
    }>,
    nodeList: Array<{ name: string }>,
    maxRawAll: number
  ): void {
    const nm = (i: number) => nodeList[i]?.name ?? '';

    const isParentProductStart = (n: string) =>
      n.includes('(Start)') && !n.includes('(Super Start)');
    const isParentProductEnd = (n: string) =>
      n.includes('(End)') && !n.includes('(Super End)');

    const parentStartVisible = new Map<string, number>();
    for (const d of layoutLinkDefs) {
      if (d.mutedByValueRange) continue;
      const s = nm(d.source);
      const t = nm(d.target);
      if (isParentProductStart(s) && t.includes('(Source)')) {
        parentStartVisible.set(s, (parentStartVisible.get(s) || 0) + d.rawValue);
      }
    }

    for (const d of layoutLinkDefs) {
      if (d.mutedByValueRange) continue;
      const s = nm(d.source);
      const t = nm(d.target);
      if (s.includes('(Super Start)') && isParentProductStart(t)) {
        const v = parentStartVisible.get(t) ?? 0;
        if (v < 1e-9) {
          d.mutedByValueRange = true;
        } else {
          d.rawValue = v;
          d.baseLayoutValue = this.layoutValueForLink(v, maxRawAll, s, t);
        }
      }
    }

    const parentEndVisible = new Map<string, number>();
    for (const d of layoutLinkDefs) {
      if (d.mutedByValueRange) continue;
      const s = nm(d.source);
      const t = nm(d.target);
      if (s.includes('(Destination)') && isParentProductEnd(t)) {
        parentEndVisible.set(t, (parentEndVisible.get(t) || 0) + d.rawValue);
      }
    }

    for (const d of layoutLinkDefs) {
      if (d.mutedByValueRange) continue;
      const s = nm(d.source);
      const t = nm(d.target);
      if (isParentProductEnd(s) && t.includes('(Super End)')) {
        const v = parentEndVisible.get(s) ?? 0;
        if (v < 1e-9) {
          d.mutedByValueRange = true;
        } else {
          d.rawValue = v;
          d.baseLayoutValue = this.layoutValueForLink(v, maxRawAll, s, t);
        }
      }
    }
  }

  /**
   * After per-link value-range mutes, drop links (and their downstream) whose sources are not
   * reachable from true graph sources along **unmuted** links — e.g. sub-asset → pool cannot
   * stay when all parent start → sub links were pruned.
   */
  private cascadeMuteValueRangeOrphans(
    layoutLinkDefs: Array<{
      source: number;
      target: number;
      baseLayoutValue: number;
      rawValue: number;
      layoutIndex: number;
      date?: string;
      nClientsTotal?: number;
      mutedByValueRange?: boolean;
    }>,
    dataToUse: RegionalSankeyData
  ): void {
    const nodeList = dataToUse.nodes || [];
    const nm = (i: number) => nodeList[i]?.name ?? '';
    type Row = { def: (typeof layoutLinkDefs)[0]; source: string; target: string };
    const activeRows: Row[] = layoutLinkDefs
      .filter(d => !d.mutedByValueRange)
      .map(d => ({ def: d, source: nm(d.source), target: nm(d.target) }));
    if (activeRows.length === 0) {
      return;
    }
    const pruned = cascadePruneSankeyLinkRows(dataToUse.links || [], activeRows);
    const keep = new Set(pruned.map(r => r.def));
    for (const d of layoutLinkDefs) {
      if (d.mutedByValueRange) {
        continue;
      }
      if (!keep.has(d)) {
        d.mutedByValueRange = true;
      }
    }
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
   *
   * After value-range pruning, few ribbons can cover a small fraction of a tall hub; spreading
   * then inserts huge gaps between ribbons. Only spread when ribbons already fill most of the bar.
   */
  private spreadHubLinkStacksToNodeHeight(
    graph: SankeyGraph<SankeyNodeExtra, SankeyLinkExtra>
  ): void {
    /** Below this fill ratio, keep d3’s stack (one slack band) instead of gaps between ribbons. */
    const minFillRatioToSpread = 0.82;

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
      if (totalW < nodeSpan * minFillRatioToSpread) return;

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
   * Generate a simple hash of data to detect actual changes (structure and magnitudes).
   * Topology alone is not enough: the same nodes/links with different values (e.g. time horizon)
   * must still invalidate the chart.
   */
  private getDataHash(data: RegionalSankeyData | undefined): string {
    if (!data) return '';
    const nodes = data.nodes ?? [];
    const links = data.links ?? [];
    const nodesCount = nodes.length;
    const linksCount = links.length;
    const firstNode = nodes[0]?.name || '';
    const lastNode = nodes[nodesCount - 1]?.name || '';
    let valueSum = 0;
    for (let i = 0; i < linksCount; i++) {
      const v = links[i]?.value;
      if (typeof v === 'number' && Number.isFinite(v)) {
        valueSum += v;
      }
    }
    const firstLinkVal = linksCount > 0 ? links[0]?.value ?? 0 : 0;
    const lastLinkVal = linksCount > 0 ? links[linksCount - 1]?.value ?? 0 : 0;
    return `${nodesCount}-${linksCount}-${firstNode}-${lastNode}-${valueSum}-${firstLinkVal}-${lastLinkVal}`;
  }
  
  /**
   * Generate a hash of filter values to detect actual changes
   */
  private getFiltersHash(): string {
    return `${this.selectedInvestorRegions.join(',')}-${this.selectedProductTypes.join(',')}-${this.selectedProductSubTypes.join(',')}-${this.dimension1Id ?? ''}-${this.minFlowValue ?? 0}-${this.maxFlowValue ?? ''}-${this.minNodeHeightPx}-${this.linkLayoutVisibilityFloorFraction}-${this.structuralFlowLayoutFloorFraction}-${this.minLinkStrokePx}-${this.sankeyHasLeafDimension ? 1 : 0}`;
  }

  ngAfterViewInit(): void {
    // If data is provided via input, use it; otherwise load from JSON
    if (this.data) {
      this.loadedData = this.data;
      this.lastDataHash = this.getDataHash(this.data);
      this.lastFiltersHash = this.getFiltersHash();
      this.scheduleCreateSankey();
    } else {
      
    }

    // Keep label truncation responsive when crossing inner width below SANKEY_LABEL_TRUNCATION_INNER_WIDTH_PX.
    this.installResizeListener();
  }

  private installResizeListener(): void {
    if (this.removeWindowResizeListener) return;
    let lastW = window.innerWidth;
    let t: number | null = null;
    const onResize = () => {
      if (this.hostDestroyed) return;
      // Throttle via timeout: resize can fire many times while dragging.
      if (t != null) window.clearTimeout(t);
      t = window.setTimeout(() => {
        t = null;
        const w = window.innerWidth;
        const wasTruncateViewport =
          lastW < SankeyComponent.SANKEY_LABEL_TRUNCATION_INNER_WIDTH_PX;
        const isTruncateViewport =
          w < SankeyComponent.SANKEY_LABEL_TRUNCATION_INNER_WIDTH_PX;
        const wasReallocWrap =
          lastW < SankeyComponent.REALLOC_LABEL_VALUE_WRAP_MAX_VIEWPORT_WIDTH;
        const isReallocWrap =
          w < SankeyComponent.REALLOC_LABEL_VALUE_WRAP_MAX_VIEWPORT_WIDTH;
        lastW = w;
        if (
          wasTruncateViewport !== isTruncateViewport ||
          wasReallocWrap !== isReallocWrap
        ) {
          this.scheduleCreateSankey();
        }
      }, 140);
    };
    window.addEventListener('resize', onResize, { passive: true });
    this.removeWindowResizeListener = () => {
      if (t != null) window.clearTimeout(t);
      window.removeEventListener('resize', onResize as any);
    };
  }

  /**
   * Reduce inline label char budget when `window.innerWidth` is below
   * SANKEY_LABEL_TRUNCATION_INNER_WIDTH_PX (less horizontal room); encourages "…" truncation.
   */
  private responsiveInlineLabelCharBudget(rawBudget: number): number {
    const b = Math.max(10, Math.floor(Number.isFinite(rawBudget) ? rawBudget : 0));
    const w = window?.innerWidth ?? 0;
    if (w < SankeyComponent.SANKEY_LABEL_TRUNCATION_INNER_WIDTH_PX) {
      return Math.max(28, Math.floor(b * 0.78));
    }
    return b;
  }

  /** True while `window.innerWidth` is below SANKEY_LABEL_TRUNCATION_INNER_WIDTH_PX (char + pixel truncation). */
  private isMidViewportTruncationBand(): boolean {
    const w = window?.innerWidth ?? 0;
    return w < SankeyComponent.SANKEY_LABEL_TRUNCATION_INNER_WIDTH_PX;
  }

  /** Realloc hub: two-line label (value under the title) for narrower viewports. */
  private isReallocLabelValueWrappedLayout(): boolean {
    return (
      (window?.innerWidth ?? 0) <
      SankeyComponent.REALLOC_LABEL_VALUE_WRAP_MAX_VIEWPORT_WIDTH
    );
  }

  private scheduleCreateSankey(): void {
    const q = SankeyComponent.renderQueue;
    const i = q.indexOf(this);
    if (i >= 0) {
      q.splice(i, 1);
    }
    q.push(this);
    SankeyComponent.ensurePumpScheduled();
  }

  private static ensurePumpScheduled(): void {
    if (SankeyComponent.pumpRafId != null) {
      return;
    }
    SankeyComponent.pumpRafId = requestAnimationFrame(() => SankeyComponent.runPump());
  }

  private static runPump(): void {
    SankeyComponent.pumpRafId = null;
    while (SankeyComponent.renderQueue.length > 0) {
      const cmp = SankeyComponent.renderQueue.shift()!;
      if (cmp.hostDestroyed || !cmp.el?.nativeElement) {
        continue;
      }
      cmp.createSankey();
      break;
    }
    if (SankeyComponent.renderQueue.length > 0) {
      SankeyComponent.ensurePumpScheduled();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    let shouldRecreate = false;
    
    // Check if data actually changed
    if (changes['data']) {
      if (this.data) {
        this.loadedData = this.data;
        const newDataHash = this.getDataHash(this.data);
        if (newDataHash !== this.lastDataHash) {
          this.lastDataHash = newDataHash;
          shouldRecreate = true;
        }
      } else {
        this.loadedData = undefined;
        if (this.lastDataHash !== '') {
          this.lastDataHash = '';
          shouldRecreate = true;
        }
      }
    }
    
    // Horizon labels affect tooltips; recreate so copy matches the slider.
    if (changes['timeHorizon'] || changes['timeHorizonStart'] || changes['timeHorizonEnd']) {
      if (this.data || this.loadedData) {
        const horizonKey = `${this.timeHorizon ?? ''}|${this.timeHorizonStart ?? ''}|${this.timeHorizonEnd ?? ''}`;
        if (horizonKey !== this.lastHorizonInputsKey) {
          this.lastHorizonInputsKey = horizonKey;
          shouldRecreate = true;
        }
      }
    }

    // Check if filters actually changed
    if (changes['selectedInvestorRegions'] || 
        changes['selectedProductTypes'] || 
        changes['selectedProductSubTypes'] ||
        changes['dimension1Id'] ||
        changes['minFlowValue'] ||
        changes['maxFlowValue'] ||
        changes['structuralFlowLayoutFloorFraction'] ||
        changes['linkLayoutVisibilityFloorFraction'] ||
        changes['minNodeHeightPx'] ||
        changes['minLinkStrokePx'] ||
        changes['sankeyHasLeafDimension'] ||
        changes['uniformLinkLayout']) {
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
      this.scheduleCreateSankey();
    }
  }


  /**
   * Category filters only. Value-range pruning runs in {@link createSankey}.
   */
  private getFilteredData(): RegionalSankeyData | undefined {
    const dataToUse = this.loadedData || this.data;
    if (!dataToUse) return undefined;

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
      // Capital Out / Capital In stay "Capital Out/In (…)".
      if (/^.+:\s*.+/.test(formatted) && !/\(Super\s+(Start|End)\)\s*$/.test(name.trim())) {
        formatted = formatted.replace(/^[^:]+:\s*/, '').trim();
      }
      // On global sankey only, remove "Global" prefix from labels (title already says Global)
      if (this.regionKey === 'Global') {
        formatted = formatted.replace(/^Global\s*:\s*/, '').replace(/^Global\s*-\s*/, '').replace(/^Global\s+/, '').trim();
      }
      return formatted;
    }

    private escapeTooltipHtml(raw: string): string {
      return raw
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    /** Matches selected Flow Dimension 3; fallback for hosts that omit {@link dimension3Label}. */
    private tooltipLeafBreakdownSectionTitle(): string {
      const t = this.dimension3Label?.trim();
      return t && t.length > 0 ? t : 'Product Sub-Type';
    }

    /**
     * Label/tooltip title for Sankey nodes. When Dimension 1 is Investor Region, super-terminal
     * hubs for the United States read as "US Investors" instead of "US" / "U.S".
     */
    private formatSankeyNodeDisplayName(fullName: string): string {
      const base = this.formatNodeName(fullName);
      if (
        this.dimension1Id === 'investor-region' &&
        (fullName.includes('(Super Start)') || fullName.includes('(Super End)')) &&
        (base === 'US' || base === 'U.S')
      ) {
        return 'US Investors';
      }
      return base;
    }

    /** When {@link formatNodeName} strips everything, still show a short leaf/sub label. */
    private leafLabelDisplayBody(fullName: string): string {
      const formatted = this.formatNodeName(fullName).trim();
      if (formatted.length > 0) return formatted;
      return (
        fullName
          .replace(/\s*\(Source\)\s*$/i, '')
          .replace(/\s*\(Destination\)\s*$/i, '')
          .trim() ||
        fullName.trim() ||
        '—'
      );
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
      return formatTimeHorizonSliderHandleDate(horizon.trim(), this.historicAnchor.getAnchor());
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

    /**
     * Places the sankey tooltip near the pointer and keeps it within the viewport
     * (e.g. when hovering the rightmost column).
     */
    private positionSankeyTooltip(
      event: MouseEvent,
    tooltip: d3.Selection<HTMLDivElement, unknown, HTMLElement, any>,
    forceLeftOfCursor?: boolean
    ): void {
    const pad = 12;
    const verticalOffset = 3;
    const margin = 8;
    const el = tooltip.node();
    if (!el) return;
    const chartRect = this.el?.nativeElement?.getBoundingClientRect?.();
    const chartCenterX =
      chartRect && Number.isFinite(chartRect.left) && Number.isFinite(chartRect.width)
        ? chartRect.left + chartRect.width / 2
        : window.innerWidth / 2;
    const preferLeftOfCursor =
      forceLeftOfCursor !== undefined ? forceLeftOfCursor : event.clientX > chartCenterX;
    let left = preferLeftOfCursor ? event.clientX - pad : event.clientX + pad;
    // Prefer rendering below the hovered point/node for clearer context.
    let top = event.clientY + verticalOffset;
    tooltip.style('left', `${left}px`).style('top', `${top}px`);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    left = preferLeftOfCursor ? event.clientX - w - pad : event.clientX + pad;
    if (left + w > window.innerWidth - margin) {
      left = event.clientX - w - pad;
    }
    if (left < margin) {
      left = margin;
    }
    if (top + h > window.innerHeight - margin) {
      // If there is not enough room below, flip above the pointer.
      top = event.clientY - h - pad;
    }
    if (top < margin) {
      top = margin;
    }
    tooltip.style('left', `${left}px`).style('top', `${top}px`);
  }

  // -----------------------------------------
  // MAIN FUNCTION
  // -----------------------------------------
  private createSankey() {
    if (this.hostDestroyed || !this.el?.nativeElement) {
      return;
    }
    const dataToUse = this.getFilteredData();
    const element = this.el.nativeElement.querySelector('.regional-sankey');
    if (!dataToUse) {
      // No data for current filters: clear any existing SVG and tooltip.
      if (element) {
        d3.select(element).select('svg').remove();
      }
      d3.select('body').select(`#${this.tooltipId}`).remove();
      this.sankeyContainerHeightPx = 960;
      this.sankeyLayoutWidthPx = this.sankeyHasLeafDimension
        ? FLOW_CHART_MIN_WIDTH_DIM3_LEAF_PX
        : FLOW_CHART_MIN_WIDTH_DIM3_NONE_PX;
      this.cdr.markForCheck();
      return;
    }
    
    // Clear any existing SVG and tooltip for this instance
    d3.select(element).select('svg').remove();
    d3.select('body').select(`#${this.tooltipId}`).remove();
    
    // Visible width of `.sankey-chart-scroll` (not the inner pane, which can be wider than the viewport).
    const nativeRect = this.el.nativeElement.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const scrollViewport =
      (element.closest('.sankey-chart-scroll') as HTMLElement | null) ||
      element.parentElement;
    const scrollW =
      scrollViewport && scrollViewport.clientWidth > 0
        ? scrollViewport.clientWidth
        : 0;
    const baseContainerWidth =
      scrollW > 0
        ? scrollW
        : elementRect.width > 0
          ? elementRect.width
          : nativeRect.width > 0
            ? nativeRect.width
            : element.clientWidth ||
              element.offsetWidth ||
              this.el.nativeElement.clientWidth ||
              this.el.nativeElement.offsetWidth ||
              window.innerWidth ||
              400;
    /**
     * When the host is narrower than this, draw a wider SVG so `.sankey-chart-scroll` can pan horizontally.
     * Dimension 3 (leaf breakdown) layouts need extra width; otherwise use the legacy 960px floor.
     */
    const SANKEY_MIN_DRAW_WIDTH_PX = this.sankeyHasLeafDimension
      ? FLOW_CHART_MIN_WIDTH_DIM3_LEAF_PX
      : FLOW_CHART_MIN_WIDTH_DIM3_NONE_PX;
    const flooredBase = Math.floor(baseContainerWidth);
    const width = Math.max(
      320,
      flooredBase,
      flooredBase < SANKEY_MIN_DRAW_WIDTH_PX ? SANKEY_MIN_DRAW_WIDTH_PX : 0
    );
    this.sankeyLayoutWidthPx = width;

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
      .style('position', 'fixed')
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

    // Incoming/outgoing $ from full category-filtered links (before value-range prune) for Realloc + Super Start/End labels/tooltips.
    const tripleHubTotalsFull = new Map<string, { incoming: number; outgoing: number }>();
    for (const link of dataToUse.links || []) {
      const s = typeof link.source === 'string' ? link.source : '';
      const t = typeof link.target === 'string' ? link.target : '';
      const v = link.value ?? 0;
      if (this.isReallocOrSuperTerminalHub(s)) {
        if (!tripleHubTotalsFull.has(s)) {
          tripleHubTotalsFull.set(s, { incoming: 0, outgoing: 0 });
        }
        tripleHubTotalsFull.get(s)!.outgoing += v;
      }
      if (this.isReallocOrSuperTerminalHub(t)) {
        if (!tripleHubTotalsFull.has(t)) {
          tripleHubTotalsFull.set(t, { incoming: 0, outgoing: 0 });
        }
        tripleHubTotalsFull.get(t)!.incoming += v;
      }
    }

    // -----------------------------------------
    // 1. Prepare link layout definitions (indices + boosted base layout values)
    // Value range: drop out-of-range links and orphan nodes. Pillar hubs stay when they have base data.
    // -----------------------------------------
    const nodeMap = new Map<string, number>();
    dataToUse.nodes.forEach((node, i) => nodeMap.set(node.name, i));

    interface LayoutLinkDef {
      source: number;
      target: number;
      baseLayoutValue: number;
      rawValue: number;
      date?: string;
      nClientsTotal?: number;
      layoutIndex: number;
      mutedByValueRange?: boolean;
    }

    const maxRawAll = d3.max(dataToUse.links, l => l.value) || 1;
    const pairSumDollars = buildSankeySourceTargetPairSumDollars(dataToUse.links);

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
      const leafUniform =
        this.uniformLinkLayout && this.sankeyLinkTouchesLeafSubTier(sourceName, targetName);
      const layoutValue = leafUniform
        ? SankeyComponent.UNIFORM_LAYOUT_LINK_WEIGHT
        : this.applyDimension1LayoutAdjustment(
            this.layoutValueForLink(raw, maxRawAll, sourceName, targetName),
            sourceName,
            targetName
          );

      const minVal = this.minFlowValue ?? 0;
      const maxVal = this.maxFlowValue;
      const valueForFlowRange =
        pairSumDollars.get(sankeyLinkPairKey(sourceName, targetName)) ?? raw;
      const passesValueRange = linkPassesFlowValueRangeFilter(
        sourceName,
        targetName,
        valueForFlowRange,
        minVal,
        maxVal,
        true
      );

      layoutLinkDefs.push({
        source: sourceIndex,
        target: targetIndex,
        baseLayoutValue: layoutValue,
        rawValue: raw,
        date: link.date,
        nClientsTotal: link.nClientsTotal,
        layoutIndex: defIndex++,
        mutedByValueRange: !passesValueRange,
      });
    }

    if (this.sankeyHasLeafDimension) {
      this.reconcileDimension3AggregatesWithValueRange(layoutLinkDefs, dataToUse.nodes, maxRawAll);
    }

    this.cascadeMuteValueRangeOrphans(layoutLinkDefs, dataToUse);

    // Only nodes that participate in at least one *unmuted* (value-range–passing) link.
    // Do not add Super Start/End or pillar hubs from the full pre–value-range link list: with
    // several super-dimension values, a hub with every link pruned by value range would still
    // land in the node array, stay disconnected in d3-sankey (depth 0), and sit on the
    // wrong horizontal side of the reallocation column — breaking left = outflow / right = inflow.
    const nodeIncluded = new Set<string>();
    for (const def of layoutLinkDefs) {
      if (def.mutedByValueRange) continue;
      nodeIncluded.add(dataToUse.nodes[def.source].name);
      nodeIncluded.add(dataToUse.nodes[def.target].name);
    }

    const prunedNodes = dataToUse.nodes.filter(n => nodeIncluded.has(n.name));
    const nameToPrunedIndex = new Map<string, number>();
    prunedNodes.forEach((n, i) => nameToPrunedIndex.set(n.name, i));

    const prunedLayoutLinkDefs: LayoutLinkDef[] = [];
    let prunedIdx = 0;
    for (const d of layoutLinkDefs) {
      if (d.mutedByValueRange) continue;
      const sName = dataToUse.nodes[d.source].name;
      const tName = dataToUse.nodes[d.target].name;
      const si = nameToPrunedIndex.get(sName);
      const ti = nameToPrunedIndex.get(tName);
      if (si === undefined || ti === undefined) continue;
      prunedLayoutLinkDefs.push({
        source: si,
        target: ti,
        baseLayoutValue: d.baseLayoutValue,
        rawValue: d.rawValue,
        date: d.date,
        nClientsTotal: d.nClientsTotal,
        layoutIndex: prunedIdx++,
      });
    }

    if (prunedLayoutLinkDefs.length === 0) {
      d3.select('body').select(`#${this.tooltipId}`).remove();
      this.sankeyContainerHeightPx = 960;
      this.cdr.markForCheck();
      return;
    }

    if (!this.uniformLinkLayout) {
      const maxRawLinkValue = d3.max(prunedLayoutLinkDefs, l => l.rawValue) || 1;
      for (const d of prunedLayoutLinkDefs) {
        const sName = prunedNodes[d.source].name;
        const tName = prunedNodes[d.target].name;
        d.baseLayoutValue = this.applyDimension1LayoutAdjustment(
          this.layoutValueForLink(d.rawValue, maxRawLinkValue, sName, tName),
          sName,
          tName
        );
      }
    }

    /** When Dimension 1 is not Investor Region (e.g. Investor Type), mids stack more densely — allot taller nodes/links and chart height. */
    const dim1ReadabilityBoost =
      !!this.dimension1Id &&
      this.dimension1Id !== 'investor-region' &&
      this.dimension1Id !== 'product-region';

    /** Max nodes in any vertical column drives minimum drawable height (+ padding between rows). */
    const maxColumnStack = this.maxSankeyColumnStack(prunedNodes);
    const denseLeafLayout = this.sankeyHasLeafDimension && maxColumnStack >= 12;
    let effectiveMinNodeInput = Math.max(0, this.minNodeHeightPx ?? 8);
    let effectiveMinNodeFloor = this.sankeyHasLeafDimension ? 8 : 5;
    if (dim1ReadabilityBoost) {
      effectiveMinNodeInput = Math.max(effectiveMinNodeInput, 12);
      effectiveMinNodeFloor = Math.max(effectiveMinNodeFloor, 11);
    }
    const minNodePx = Math.max(effectiveMinNodeInput, effectiveMinNodeFloor);
    const padLoBase = denseLeafLayout ? 7 : 6;
    const padLo = dim1ReadabilityBoost ? padLoBase + 1 : padLoBase;
    const dynamicNodePadding = Math.min(
      dim1ReadabilityBoost ? 22 : 16,
      Math.max(
        padLo,
        Math.floor(
          (dim1ReadabilityBoost ? 340 : 280) / Math.max(maxColumnStack, 8)
        )
      )
    );

    /** Space for outflow/inflow caption row above the scroll host (approx., matches fixed layout). */
    const SANKEY_FLOW_LABELS_ROW_RESERVE_PX = 54;
    /**
     * Total SVG pixel height scales with stacked row count × min row height × inter-row padding — not a fixed giant band when data is sparse.
     */
    const layoutDensityRough = Math.max(
      maxColumnStack,
      Math.floor(Math.sqrt(prunedLayoutLinkDefs.length + 4))
    );
    const SANKEY_SVG_TOTAL_HEIGHT_HARD_MAX_PX = dim1ReadabilityBoost
      ? layoutDensityRough > 55
        ? 4200
        : layoutDensityRough > 38
          ? 3600
          : 3000
      : 2400;
    const SANKEY_SVG_TOTAL_HEIGHT_HARD_MIN_PX = 380;
    /** Breathable inner band for drawable flow (extent vertical span). */
    const SANKEY_DRAW_INNER_FLOOR_PX = dim1ReadabilityBoost ? 340 : 300;
    /** Modest slack for multi-row labels / pooled super-terminal packing. */
    const SANKEY_INNER_VERTICAL_SLACK_PX = dim1ReadabilityBoost ? 72 : 48;
    /** Light extra slack when several Super hubs add label-crossing churn (capped). */
    const superStartCountPruned = prunedNodes.filter(n => n.name.includes('(Super Start)')).length;
    const superEndCountPruned = prunedNodes.filter(n => n.name.includes('(Super End)')).length;
    const superColumnMax = Math.max(superStartCountPruned, superEndCountPruned);
    const superTotal = superStartCountPruned + superEndCountPruned;
    const extraSuperBands = Math.max(0, superColumnMax - 3, superTotal - 3);
    const superLabelSlackPx = Math.min(120, extraSuperBands * 28);

    const stackInnerFloor =
      maxColumnStack * minNodePx +
      Math.max(0, maxColumnStack - 1) * dynamicNodePadding +
      SANKEY_INNER_VERTICAL_SLACK_PX +
      superLabelSlackPx;
    let drawInnerPx = Math.max(SANKEY_DRAW_INNER_FLOOR_PX, stackInnerFloor);

    /** Many ribbons need a bit more vertical spread than node count alone; keep capped so sparse charts stay short. */
    const linkRowCount = prunedLayoutLinkDefs.length;
    const linkDensitySlackPx = Math.min(
      dim1ReadabilityBoost ? 128 : 96,
      Math.floor(
        Math.pow(Math.max(1, Math.log(linkRowCount + 1)), 2) *
          (dim1ReadabilityBoost ? 2.75 : 2.25)
      )
    );
    drawInnerPx += linkDensitySlackPx;

    // Minimal horizontal inset; labels use overflow visible on SVG (tight = more flow width)
    /** Horizontal stagger proxy for stacked same-side labels — cap inset so flows use nearly full drawable width. */
    const labelLaneStride = maxColumnStack > 22 ? 11 : maxColumnStack > 14 ? 9 : 7;
    const laneSpread = labelLaneStride * 2;
    const chartHorizontalSlackPx = Math.min(laneSpread, 22);
    const leftMargin =
      6 + chartHorizontalSlackPx + (maxColumnStack > 14 ? 8 : 4);
    const rightMargin =
      6 + chartHorizontalSlackPx + (maxColumnStack > 14 ? 8 : 4);
    const topMargin = 12;
    /** Extra room below the flow so packed node labels are not clipped by the SVG. */
    const bottomMargin = dim1ReadabilityBoost && maxColumnStack > 16 ? 84 : 64;

    let layoutInnerHeightPx = Math.min(
      SANKEY_SVG_TOTAL_HEIGHT_HARD_MAX_PX,
      Math.max(SANKEY_SVG_TOTAL_HEIGHT_HARD_MIN_PX, drawInnerPx + topMargin + bottomMargin)
    );
    if (!Number.isFinite(layoutInnerHeightPx) || layoutInnerHeightPx < SANKEY_SVG_TOTAL_HEIGHT_HARD_MIN_PX) {
      layoutInnerHeightPx = Math.min(
        SANKEY_SVG_TOTAL_HEIGHT_HARD_MAX_PX,
        Math.max(
          SANKEY_SVG_TOTAL_HEIGHT_HARD_MIN_PX,
          SANKEY_DRAW_INNER_FLOOR_PX + topMargin + bottomMargin
        )
      );
    }

    const height = layoutInnerHeightPx;
    /** Total chrome = SVG height plus outflows/inflows row; floor keeps tiny datasets from collapsing awkwardly. */
    this.sankeyContainerHeightPx = Math.max(430, height + SANKEY_FLOW_LABELS_ROW_RESERVE_PX);

    // Leave `nodeSort` unset so d3-sankey can sort columns by breadth after relaxation — custom
    // name-based sorts blocked that and caused crossing, vertically inconsistent links (spaghetti paths).
    const hasLeafTierForUniform =
      this.uniformLinkLayout &&
      prunedLayoutLinkDefs.some(d =>
        this.sankeyLinkTouchesLeafSubTier(
          prunedNodes[d.source].name,
          prunedNodes[d.target].name
        )
      );
    const sankeyGen = sankey<SankeyNodeExtra, SankeyLinkExtra>()
      .nodeWidth(
        hasLeafTierForUniform
          ? dim1ReadabilityBoost
            ? 18
            : 17
          : dim1ReadabilityBoost
            ? 22
            : 20
      )
      .nodePadding(dynamicNodePadding)
      .iterations(56)
      .extent([[leftMargin, topMargin], [width - rightMargin, height - bottomMargin]]);
    let linkMultipliers = prunedLayoutLinkDefs.map(() => 1);
    // Assigned on every iteration of the loop below (always runs ≥ once).
    let graph!: SankeyGraph<SankeyNodeExtra, SankeyLinkExtra>;

    const MAX_LAYOUT_ITERATIONS = 32;
    const LAYOUT_BUMP = 1.12;

    for (let attempt = 0; attempt < MAX_LAYOUT_ITERATIONS; attempt++) {
      const sankeyNodes: SankeyNodeExtra[] = prunedNodes.map(n => ({ name: n.name }));
      const sankeyLinks: SankeyLinkExtra[] = prunedLayoutLinkDefs.map((def, i) => ({
        source: def.source,
        target: def.target,
        value: this.uniformLinkLayout
          ? SankeyComponent.UNIFORM_LAYOUT_LINK_WEIGHT * linkMultipliers[i]
          : this.sankeyLinkLayoutRenderValue(def.baseLayoutValue * linkMultipliers[i]),
        rawValue: def.rawValue,
        date: def.date,
        nClientsTotal: def.nClientsTotal,
        layoutIndex: def.layoutIndex,
      }));

      graph = sankeyGen({
        nodes: sankeyNodes,
        links: sankeyLinks,
      });

      if (minNodePx <= 0 || prunedLayoutLinkDefs.length === 0) {
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
    const nodesBalanced: SankeyNodeExtra[] = prunedNodes.map(n => ({ name: n.name }));
    const linksBalanced: SankeyLinkExtra[] = (graph.links as SankeyLinkExtra[]).map(l => {
      const s = l.source as SankeyNodeExtra;
      const t = l.target as SankeyNodeExtra;
      return {
        source: s.index!,
        target: t.index!,
        value: l.value,
        rawValue: l.rawValue,
        date: l.date,
        nClientsTotal: l.nClientsTotal,
        layoutIndex: l.layoutIndex,
      };
    });
    graph = sankeyGen({
      nodes: nodesBalanced,
      links: linksBalanced,
    });

    this.anchorCapitalInUnderInvestorBar(graph, dynamicNodePadding);
    this.anchorCapitalOutUnderSuperEndBar(graph, dynamicNodePadding);
    sankeyGen.update(graph);

    // Product Region already has heavy trunk fan-in/out; preserve d3 stacks to avoid extra vertical weaving.
    if (!this.uniformLinkLayout && !this.isProductRegionDimension1()) {
      this.spreadHubLinkStacksToNodeHeight(graph);
    }

    this.shiftSankeyGraphVertically(graph, topMargin);

    // -----------------------------------------
    // 2. Create SVG (no zoom – chart at fixed scale for readable labels)
    // -----------------------------------------
    const svg = d3.select(element)
      .append('svg')
      .attr('class', 'sankey-svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'none')
      .attr('overflow', 'visible');

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

    // Reference x for each super-dimension band (per `…: Reallocation Pool`), plus a global fallback
    // from the first pool so sign/color/labels use the same hub as the flow, not a random peer.
    const reallocationPoolNode = graph.nodes.find(
      node => node.name && node.name.includes('Reallocation Pool')
    );
    const reallocationPoolX =
      reallocationPoolNode?.x0 !== undefined
        ? reallocationPoolNode.x0
        : reallocationPoolNode?.x1 !== undefined
          ? reallocationPoolNode.x1
          : null;
    const reallocationXBySuper = this.buildReallocationPoolXBySuperMap(
      graph.nodes as SankeyNodeExtra[]
    );
    const reallocationRefX = (name: string) =>
      this.getReallocationRefXForName(reallocationXBySuper, name, reallocationPoolX);

    // Assign link colors based on position relative to the relevant Reallocation Pool
    // Links to the right of Reallocation Pool are green, others are red
    // Capital In links are always blue; Capital Out links are orange
    graph.links.forEach(link => {
      const linkExtra = link as SankeyLinkExtra;
      const source = link.source as SankeyNodeExtra;
      const target = link.target as SankeyNodeExtra;
      
      // Check if link is connected to Capital In - make it blue
      if ((source.name && source.name.includes('Capital In')) || 
          (target.name && target.name.includes('Capital In'))) {
        linkExtra.color = this.getCssVariable('--blue-link') || 'rgba(0,100,200,0.7)';
        return;
      }
      
      // Check if link is connected to Capital Out - use dedicated orange color
      if ((source.name && source.name.includes('Capital Out')) || 
          (target.name && target.name.includes('Capital Out'))) {
        linkExtra.color = this.getCssVariable('--capital-withdrawn-link') || '#ff7f0e';
        return;
      }
      
      const refX = this.getReallocationRefXForLink(
        reallocationXBySuper,
        source,
        target,
        reallocationPoolX
      );
      
      // If no reallocation x, fall back to midpoint logic
      if (refX === null) {
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
      
      // Link is green if source or target is to the right of the band's Reallocation Pool
      if (sourceX > refX || targetX > refX) {
        linkExtra.color = 'rgba(104, 188, 102, 0.8)';
      } else {
        // Links to the left of the pool are outflow (negative flows)
        linkExtra.color = 'rgba(238, 152, 153, 0.8)';
      }
    });

    // -----------------------------------------
    // 4. Draw Links
    // -----------------------------------------
    // Capture component reference for use in callbacks
    const component = this;
    const strokeScale =
      (hasLeafTierForUniform ? 0.85 : 1) * (dim1ReadabilityBoost ? 1.3 : 1);
    const minLkStroke = Math.max(
      hasLeafTierForUniform ? 1.1 : 1.25,
      (this.minLinkStrokePx ?? 1.75) * strokeScale
    );
    const linkRestOpacity = 0.64;
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
      // Narrow hit-testing to the stroked ribbon (avoid huge bbox / overlaps feeling like “empty” hovers).
      .attr('pointer-events', 'stroke')
      .attr('opacity', linkRestOpacity)
      .attr('class', 'sankey-link')
      .on('mouseover', function(event, d) {
        const link = d as SankeyLinkExtra;
        const source = link.source as SankeyNodeExtra;
        const target = link.target as SankeyNodeExtra;
        const value = component.linkFlowForTotals(link);
        const sourceX = source.x0 !== undefined ? source.x0 : (source.x1 || 0);
        const targetX = target.x0 !== undefined ? target.x0 : (target.x1 || 0);
        const linkRefX = component.getReallocationRefXForLink(
          reallocationXBySuper,
          source,
          target,
          reallocationPoolX
        );
        const isLeftOfReallocation =
          linkRefX !== null &&
          sourceX < linkRefX &&
          targetX <= linkRefX;
        const signedValue = isLeftOfReallocation ? -Math.abs(value) : value;
        const formattedValue = formatFlowCurrencyUsd(signedValue);
        
        // Check if this is a subasset link (connected to Source or Destination nodes)
        const isSubassetLink = (source.name && (source.name.includes('(Source)') || source.name.includes('(Destination)'))) ||
                               (target.name && (target.name.includes('(Source)') || target.name.includes('(Destination)')));
        
        let tooltipHtml = `
          <div><strong>${component.formatSankeyNodeDisplayName(source.name)}</strong> → <strong>${component.formatSankeyNodeDisplayName(target.name)}</strong></div>
          <div style="margin-top: 4px;">Value: <strong>${formattedValue}</strong></div>
        `;
        // For subasset links, show the Asset_Flow_Date if available, otherwise show time horizon
        if (isSubassetLink && link.date) {
          tooltipHtml += `<div style="margin-top: 4px; font-size: 13px; opacity: 0.9;">Date: <strong>${component.formatDateForTooltip(link.date)}</strong></div>`;
        } else {
          const timeInfo = component.formatTimeInfo();
          if (timeInfo) {
            tooltipHtml += `<div style="margin-top: 4px; font-size: 13px; opacity: 0.9;">Time: <strong>${timeInfo}</strong></div>`;
          }
        }
        const linkNc = link.nClientsTotal;
        if (typeof linkNc === 'number' && linkNc > 0) {
          tooltipHtml += `<div style="margin-top: 4px; font-size: 13px; opacity: 0.9;">Sample Size: <strong>${linkNc.toLocaleString('en-US')}</strong></div>`;
        }
        
        tooltip
          .style('opacity', '1')
          .style('display', 'block')
          .html(tooltipHtml);
        component.positionSankeyTooltip(event, tooltip);

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
        component.positionSankeyTooltip(event, tooltip);
      })
      .on('mouseout', function() {
        resetInteractiveState();
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
      if (nodeName.includes('Capital In')) return 'net-new-capital';
      if (nodeName.includes('Capital Out')) return 'capital-withdrawn';
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

    /** Hide tooltip + restore link/node visuals (shared by link/node mouseout and leaving the SVG area). */
    const resetInteractiveState = () => {
      tooltip.style('opacity', '0').style('display', 'none');
      chartGroup
        .selectAll('path')
        .attr('opacity', linkRestOpacity)
        .attr('stroke-width', (d: unknown) => linkStrokePx(d as SankeyLinkExtra))
        .attr('stroke', (d: unknown) => {
          const le = d as SankeyLinkExtra;
          return le.color || component.getCssVariable('--default-gray') || '#999';
        });
      chartGroup
        .selectAll('rect')
        .attr('opacity', 1)
        .each(function (d: unknown) {
          const n = d as SankeyNodeExtra;
          const sel = d3.select(this as SVGRectElement);
          sel.classed('sankey-node-hovered', false);
          const displayStyle = getNodeDisplayStyle(n.name);
          sel.attr('stroke-width', displayStyle.fill ? 1 : null);
          if (displayStyle.stroke) {
            sel.attr('stroke', displayStyle.stroke);
          }
        });
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
        const hubFull = tripleHubTotalsFull.get(node.name);
        const useHubFullTotals =
          component.isReallocOrSuperTerminalHub(node.name) && hubFull != null;
        const value = useHubFullTotals
          ? Math.max(hubFull.incoming, hubFull.outgoing)
          : nodeValues.get(node) || 0;
        const incoming = useHubFullTotals ? hubFull.incoming : nodeIncoming.get(node) || 0;
        const outgoing = useHubFullTotals ? hubFull.outgoing : nodeOutgoing.get(node) || 0;
        const nodeX = node.x0 !== undefined ? node.x0 : (node.x1 || 0);
        const refX = reallocationRefX(node.name);
        const isLeftOfReallocation = refX !== null && nodeX < refX;
        const isStructuralCapitalNode =
          node.name.includes('Capital In') || node.name.includes('Capital Out');
        const signMultiplier = isLeftOfReallocation && !isStructuralCapitalNode ? -1 : 1;
        const formattedValue = formatFlowCurrencyUsd(signMultiplier * value);
        const formattedIncoming = formatFlowCurrencyUsd(signMultiplier * incoming);
        const formattedOutgoing = formatFlowCurrencyUsd(signMultiplier * outgoing);
        
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
             const leafSectionTitle = component.escapeTooltipHtml(component.tooltipLeafBreakdownSectionTitle());
             subassetHtml += `<div style="font-weight: 600; margin-bottom: 4px; opacity: 0.9;">${leafSectionTitle} (<strong>${aggregatedSubassets.length}</strong>):</div>`;
             subassetHtml += '<div style="max-height: 200px; overflow-y: auto; overflow-x: hidden;">';
             itemsToShow.forEach(subasset => {
              const signedSubassetValue = signMultiplier * subasset.value;
              const subassetLine = `${component.formatNodeName(subasset.name)}: <strong>${formatFlowCurrencyUsd(signedSubassetValue)}</strong>`;
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
          <div style="margin-top: 4px;">Total Value: <strong>${formattedValue}</strong></div>
          <div style="margin-top: 2px; font-size: 13px; opacity: 0.9;">Incoming: <strong>${formattedIncoming}</strong></div>
          <div style="font-size: 13px; opacity: 0.9;">Outgoing: <strong>${formattedOutgoing}</strong></div>
        `;
        let nClientsOutgoing = 0;
        graph.links.forEach(lk => {
          if ((lk.source as SankeyNodeExtra) === node) {
            const nc = (lk as SankeyLinkExtra).nClientsTotal;
            if (typeof nc === 'number' && nc > 0) nClientsOutgoing += nc;
          }
        });
        
        if (timeInfo) {
          tooltipHtml += `<div style="margin-top: 4px; font-size: 13px; opacity: 0.9;">Time: <strong>${timeInfo}</strong></div>`;
        }
        
        tooltipHtml += subassetHtml;

        if (nClientsOutgoing > 0) {
          tooltipHtml += `<div style="margin-top: 4px; font-size: 13px; opacity: 0.9;">Sample Size: <strong>${nClientsOutgoing.toLocaleString('en-US')}</strong></div>`;
        }

        tooltip
          .style('opacity', '1')
          .style('display', 'block')
          .html(tooltipHtml);
        const hoveredNodeMidX = ((node.x0 ?? 0) + (node.x1 ?? 0)) / 2;
        const isRightSideNodeByName =
          node.name.includes('Super End') ||
          node.name.includes('(End)') ||
          node.name.includes('(Destination)');
        const forceLeftOfCursor = isRightSideNodeByName || hoveredNodeMidX > width / 2;
        component.positionSankeyTooltip(event, tooltip, forceLeftOfCursor);

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
        const isCapitalWithdrawnHovered = node.name.includes('Capital Out');

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
      .on('mousemove', function(event, d) {
        const hoveredNode = d as SankeyNodeExtra;
        const hoveredNodeMidX = ((hoveredNode.x0 ?? 0) + (hoveredNode.x1 ?? 0)) / 2;
        const isRightSideNodeByName =
          hoveredNode.name.includes('Super End') ||
          hoveredNode.name.includes('(End)') ||
          hoveredNode.name.includes('(Destination)');
        const forceLeftOfCursor = isRightSideNodeByName || hoveredNodeMidX > width / 2;
        component.positionSankeyTooltip(event, tooltip, forceLeftOfCursor);
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
    const isLeafChartLabel = (n: SankeyNodeExtra) =>
      n.name.includes('(Source)') || n.name.includes('(Destination)');
    const isParentStartOnly = (n: SankeyNodeExtra) =>
      n.name.includes('(Start)') && !n.name.includes('Super');
    const isParentEndOnly = (n: SankeyNodeExtra) =>
      n.name.includes('(End)') && !n.name.includes('Super');

    const chartInnerH = height - topMargin - bottomMargin;
    const leafCount = graph.nodes.filter(n => isLeafChartLabel(n as SankeyNodeExtra)).length;
    /** Single-line leaves (`Name: $…`); slightly smaller type when many rows — later threshold when dim1 needs legibility. */
    const leafCompact = dim1ReadabilityBoost ? leafCount > 26 : leafCount > 18;
    /** Room below last label row (`alignment-baseline: middle`). */
    const labelYMax = height - 12;

    const parentBandCount =
      graph.nodes.filter(n => isParentStartOnly(n as SankeyNodeExtra)).length +
      graph.nodes.filter(n => isParentEndOnly(n as SankeyNodeExtra)).length;
    const parentMinGap =
      maxColumnStack > 16 && parentBandCount > 1
        ? Math.max(
            15,
            Math.min(22, Math.floor((chartInnerH - 40) / Math.max(parentBandCount, 1)))
          )
        : 0;
    const parentStartMidY =
      parentMinGap > 0
        ? this.packVerticalLabelYs(
            graph.nodes as SankeyNodeExtra[],
            isParentStartOnly,
            n => (n.y0! + n.y1!) / 2,
            parentMinGap
          )
        : new Map<SankeyNodeExtra, number>();
    const parentEndMidY =
      parentMinGap > 0
        ? this.packVerticalLabelYs(
            graph.nodes as SankeyNodeExtra[],
            isParentEndOnly,
            n => (n.y0! + n.y1!) / 2,
            parentMinGap
          )
        : new Map<SankeyNodeExtra, number>();
    const parentLabelMidY = new Map<SankeyNodeExtra, number>([
      ...parentStartMidY,
      ...parentEndMidY,
    ]);
    this.clampPackedLabelYsMax(parentLabelMidY, labelYMax);

    /** Super Start / Super End share one column each; without packing, every label uses the node mid and stacks overlap when nodes are thin. */
    const isSuperStartTerminal = (n: SankeyNodeExtra) => n.name.includes('(Super Start)');
    const isSuperEndTerminal = (n: SankeyNodeExtra) => n.name.includes('(Super End)');
    const superStartCount = graph.nodes.filter(n => isSuperStartTerminal(n as SankeyNodeExtra)).length;
    const superEndCount = graph.nodes.filter(n => isSuperEndTerminal(n as SankeyNodeExtra)).length;
    const superGapForCount = (count: number) =>
      count > 1
        ? Math.max(15, Math.min(28, Math.floor((chartInnerH - 56) / Math.max(count, 1))))
        : 0;
    const superStartGap = superGapForCount(superStartCount);
    const superEndGap = superGapForCount(superEndCount);
    const superStartPackedY =
      superStartGap > 0
        ? this.packVerticalLabelYs(
            graph.nodes as SankeyNodeExtra[],
            isSuperStartTerminal,
            n => (n.y0! + n.y1!) / 2,
            superStartGap
          )
        : new Map<SankeyNodeExtra, number>();
    const superEndPackedY =
      superEndGap > 0
        ? this.packVerticalLabelYs(
            graph.nodes as SankeyNodeExtra[],
            isSuperEndTerminal,
            n => (n.y0! + n.y1!) / 2,
            superEndGap
          )
        : new Map<SankeyNodeExtra, number>();
    const superTerminalLabelY = new Map<SankeyNodeExtra, number>([
      ...superStartPackedY,
      ...superEndPackedY,
    ]);
    this.clampPackedLabelYsMax(superTerminalLabelY, labelYMax);
    /** Allow packed super labels to move farther from a tiny node's mid than leaf labels. */
    const superLabelMaxVerticalDriftPx = Math.max(72, Math.min(220, Math.floor(chartInnerH * 0.42)));

    /** Same horizontal inset for leaf `(Source)` / `(Destination)` as parent/hub nodes; no stagger so labels share one vertical line per column. */
    const nodeLabelGapPx = 6;
    /** Shift labels down slightly so they sit on the node’s visual center line (baseline middle reads a bit high on 12px type). */
    const nodeLabelVerticalNudgePx = 4;
    const getLabelX = (d: SankeyNodeExtra): number => {
      const refX = reallocationRefX(d.name);
      if (d.name.includes('Reallocation Pool')) return d.x1! + 4;
      if (d.name.includes('(Source)')) return d.x1! + nodeLabelGapPx;
      if (d.name.includes('(Destination)')) return d.x0! - nodeLabelGapPx;
      // Capital Out labels to the left of the bar; Capital In stays to the right
      if (d.name.includes('Capital Out')) return d.x0! - nodeLabelGapPx;
      if (d.name.includes('Capital In')) return d.x1! + nodeLabelGapPx;
      if (refX !== null && d.x0! > refX) return d.x0! - nodeLabelGapPx;
      if (refX !== null && d.x1! < refX) return d.x1! + nodeLabelGapPx;
      return (d.x0! + d.x1!) / 2;
    };
    /** Approx max chars for one `Name: $…` row (wider budget → less `…` truncation). */
    const maxLeafInlineCharsRaw = leafCompact
      ? maxColumnStack > 26
        ? 52
        : maxColumnStack > 16
          ? 56
          : 60
      : maxColumnStack > 26
        ? 58
        : maxColumnStack > 16
          ? 64
          : 72;
    const maxParentInlineCharsRaw = maxColumnStack > 26 ? 54 : maxColumnStack > 16 ? 60 : 68;
    const labelCharBump = dim1ReadabilityBoost ? 6 : 0;
    const maxLeafInlineChars = this.responsiveInlineLabelCharBudget(maxLeafInlineCharsRaw + labelCharBump);
    const maxParentInlineChars = this.responsiveInlineLabelCharBudget(maxParentInlineCharsRaw + labelCharBump);

    const nodeLabels = chartGroup.append('g')
      .attr('class', 'sankey-node-labels')
      .selectAll('text')
      .data(graph.nodes)
      .enter()
      .append('text')
      .attr('class', d => {
        const n = d as SankeyNodeExtra;
        if (!isLeafChartLabel(n)) return 'sankey-node-label';
        return leafCompact
          ? 'sankey-node-label sankey-node-label-leaf sankey-node-label-leaf-compact'
          : 'sankey-node-label sankey-node-label-leaf';
      })
      .attr('x', getLabelX)
      .attr('y', d => {
        const n = d as SankeyNodeExtra;
        const mid = (n.y0! + n.y1!) / 2;
        let y: number;
        if (isLeafChartLabel(n)) {
          y = mid;
        } else if (superTerminalLabelY.has(n)) {
          const packed = superTerminalLabelY.get(n)!;
          const lo = mid - superLabelMaxVerticalDriftPx;
          const hi = mid + superLabelMaxVerticalDriftPx;
          y = Math.max(lo, Math.min(hi, packed));
        } else if (parentLabelMidY.has(n)) {
          y = parentLabelMidY.get(n)!;
        } else {
          y = mid;
        }
        if (
          this.isReallocLabelValueWrappedLayout() &&
          n.name.includes('Reallocation Pool')
        ) {
          y -= 7;
        }
        return y + nodeLabelVerticalNudgePx;
      })
      .attr('text-anchor', d => {
        const n = d as SankeyNodeExtra;
        const refX = reallocationRefX(n.name);
        if (n.name.includes('(Source)')) return 'start';
        if (n.name.includes('(Destination)')) return 'end';
        // Label at x1 + small gap: anchor start so "Realloc: …" sits just right of the node
        if (n.name.includes('Reallocation Pool')) return 'start';
        if (n.name.includes('Capital Out')) return 'end';
        if (n.name.includes('Capital In')) return 'start';
        // Positive/inflow side: anchor at end so text sits to the left of the node
        if (refX !== null && d.x0! > refX) return 'end';
        // Negative/outflow side: anchor at start so text sits to the right of the node
        if (refX !== null && d.x1! < refX) return 'start';
        return 'middle';
      })
      .attr('alignment-baseline', 'middle');

    const truncateName = (formattedName: string, maxLen: number): string =>
      formattedName.length > maxLen ? formattedName.substring(0, maxLen) + '...' : formattedName;

    /** Same row as treemap: `Name:` ({@link formatFlowCurrencyUsd} value follows in value style). */
    const appendTreemapStyleLabelValue = (
      el: d3.Selection<SVGTextElement, unknown, null, undefined>,
      labelBody: string,
      valueDollars: number,
      maxInlineChars: number
    ): void => {
      const valStr = formatFlowCurrencyUsd(valueDollars);
      const sep = ': ';
      const tail = sep + valStr;
      const nameBudget = Math.max(4, maxInlineChars - tail.length);
      const nm = truncateName(labelBody, nameBudget);
      // Use parent <text x="…"> + text-anchor only; an explicit x on the first tspan breaks `end` anchoring for Destinations.
      el.append('tspan')
        .attr('class', 'sankey-treemap-label')
        .text(`${nm}${sep}`);
      el.append('tspan').attr('class', 'sankey-treemap-value').text(valStr);
    };

    /** Realloc hub when narrow: title + colon on line 1, {@link formatFlowCurrencyUsd} on line 2. */
    const appendTreemapStyleLabelValueStacked = (
      el: d3.Selection<SVGTextElement, unknown, null, undefined>,
      labelBody: string,
      valueDollars: number,
      maxInlineChars: number
    ): void => {
      const valStr = formatFlowCurrencyUsd(valueDollars);
      const nameBudget = Math.max(4, maxInlineChars);
      const nm = truncateName(labelBody, nameBudget);
      const xAttr = el.node()?.getAttribute('x') ?? '0';
      el.append('tspan')
        .attr('class', 'sankey-treemap-label')
        .attr('x', xAttr)
        .attr('dy', '0')
        .text(`${nm}:`);
      el.append('tspan')
        .attr('class', 'sankey-treemap-value')
        .attr('x', xAttr)
        .attr('dy', '1.12em')
        .text(valStr);
    };

    const cmp = this;
    nodeLabels.each(function (d) {
      const n = d as SankeyNodeExtra;
      const el = d3.select(this) as d3.Selection<SVGTextElement, unknown, null, undefined>;

      const hubFull = tripleHubTotalsFull.get(n.name);
      const useHubFullTotals =
        cmp.isReallocOrSuperTerminalHub(n.name) && hubFull != null;
      const rawValue =
        useHubFullTotals && hubFull != null
          ? Math.max(hubFull.incoming, hubFull.outgoing)
          : nodeValues.get(n) || 0;
      const nodeX = n.x0 !== undefined ? n.x0 : (n.x1 || 0);
      const refXForNode = reallocationRefX(n.name);
      const isLeftOfReallocation = refXForNode !== null && nodeX < refXForNode;
      const signedValue =
        n.name.includes('Capital Out') || n.name.includes('Capital In')
          ? rawValue
          : isLeftOfReallocation
            ? -rawValue
            : rawValue;

      if (isLeafChartLabel(n)) {
        appendTreemapStyleLabelValue(
          el,
          cmp.leafLabelDisplayBody(n.name),
          signedValue,
          maxLeafInlineChars
        );
        return;
      }

      if (n.name.includes('Capital Out')) {
        appendTreemapStyleLabelValue(el, 'Capital Out', rawValue, maxParentInlineChars);
        return;
      }
      if (n.name.includes('Capital In')) {
        appendTreemapStyleLabelValue(el, 'Capital In', rawValue, maxParentInlineChars);
        return;
      }
      if (n.name.includes('Reallocation Pool')) {
        if (cmp.isReallocLabelValueWrappedLayout()) {
          appendTreemapStyleLabelValueStacked(
            el,
            'Realloc',
            signedValue,
            maxParentInlineChars
          );
        } else {
          appendTreemapStyleLabelValue(
            el,
            'Realloc',
            signedValue,
            maxParentInlineChars
          );
        }
        return;
      }

      appendTreemapStyleLabelValue(
        el,
        cmp.formatSankeyNodeDisplayName(n.name),
        signedValue,
        maxParentInlineChars
      );
    });

    /**
     * When inner width is below SANKEY_LABEL_TRUNCATION_INNER_WIDTH_PX, clamp labels by rendered
     * pixel width to prevent overlaps. We only shrink the name/label part (first tspan) and keep the value visible.
     */
    if (this.isMidViewportTruncationBand()) {
      const clampLabelByPx = (textEl: SVGTextElement, maxPx: number) => {
        if (!textEl || !(maxPx > 20)) return;
        // First tspan: "Name: " (class sankey-treemap-label); second tspan: "$…" (value).
        const tspans = Array.from(textEl.querySelectorAll('tspan'));
        const labelTspan = tspans.find(t => t.classList.contains('sankey-treemap-label')) as SVGTSpanElement | undefined;
        if (!labelTspan) return;

        const original = labelTspan.textContent ?? '';
        if (!original) return;

        // If already fits, done.
        if (textEl.getComputedTextLength() <= maxPx) return;

        // Preserve the trailing separator (": ") if present.
        const sep = ': ';
        const hasSep = original.endsWith(sep);
        const base = hasSep ? original.slice(0, -sep.length) : original;

        // Iteratively shrink until it fits or becomes too small.
        const ell = '...';
        let lo = 0;
        let hi = base.length;

        // Binary search the largest prefix that fits.
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          labelTspan.textContent = base.slice(0, mid) + (mid < base.length ? ell : '') + (hasSep ? sep : '');
          if (textEl.getComputedTextLength() <= maxPx) {
            lo = mid;
          } else {
            hi = mid - 1;
          }
        }

        const finalPrefix = Math.max(0, lo);
        labelTspan.textContent =
          base.slice(0, finalPrefix) + (finalPrefix < base.length ? ell : '') + (hasSep ? sep : '');

        // If still doesn't fit (very small budget), fall back to just ellipsis + sep.
        if (textEl.getComputedTextLength() > maxPx) {
          labelTspan.textContent = ell + (hasSep ? sep : '');
        }
      };

      // Tuned to match the screenshot density: keep labels short in mid-size viewports.
      nodeLabels.each(function (d) {
        const n = d as SankeyNodeExtra;
        const el = this as SVGTextElement;
        const isLeaf = isLeafChartLabel(n);
        if (
          n.name.includes('Reallocation Pool') &&
          cmp.isReallocLabelValueWrappedLayout()
        ) {
          return;
        }
        // Shorter labels for mid-size viewports (match dense dashboard layouts).
        const maxPx = isLeaf ? 132 : 152;
        clampLabelByPx(el, maxPx);
      });
    }

    nodeLabels.each(function (d) {
      const node = d as SankeyNodeExtra;
      const h = (node.y1 ?? 0) - (node.y0 ?? 0);
      const thinThreshold = dim1ReadabilityBoost ? 18 : 16;
      d3.select(this).classed('sankey-node-label-thin', h < thinThreshold);
    });

    // Clearing hover state: mouseout doesn't always fire (e.g. transparent SVG margins), but hit target is svg root.
    svg.on('pointermove', function (this: SVGSVGElement, event: PointerEvent) {
      if (event.target === this) {
        resetInteractiveState();
      }
    });
    svg.on('pointerleave', resetInteractiveState);

    // Link values are not drawn – only node labels show values (next to each node)
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.hostDestroyed = true;
    const q = SankeyComponent.renderQueue;
    const i = q.indexOf(this);
    if (i >= 0) {
      q.splice(i, 1);
    }
    if (SankeyComponent.pumpRafId != null && q.length === 0) {
      cancelAnimationFrame(SankeyComponent.pumpRafId);
      SankeyComponent.pumpRafId = null;
    }
    this.removeWindowResizeListener?.();
    this.removeWindowResizeListener = null;
    // Clean up tooltip when component is destroyed
    d3.select('body').select(`#${this.tooltipId}`).remove();
  }
}

