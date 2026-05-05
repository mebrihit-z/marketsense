/* eslint-disable */
import { Component, ElementRef, AfterViewInit, OnDestroy, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import * as d3 from 'd3';
import { formatFlowCurrencyUsd } from '../../../utils/flow-currency-format.util';

@Component({
  selector: 'app-line-chart',
  standalone: true,
  imports: [],
  templateUrl: './line-chart.component.html',
  styleUrl: './line-chart.component.scss'
})
export class LineChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  // Input properties for chart configuration
  @Input() data: number[] = [];
  @Input() color: string = '#00113F'; // $primary-colors-midnight-blue
  /** First series index in the strictly-after-anchor (forecast) segment; omit for a single-color line. */
  @Input() forecastStartIndex: number | null = null;
  /** Stroke for the forecast segment (and dots in that segment) when {@link forecastStartIndex} is set. */
  @Input() forecastLineColor: string = '#0C42FE';
  @Input() width: number = 400;
  @Input() height: number = 320;
  @Input() showGrid: boolean = true;
  @Input() showArea: boolean = false;
  @Input() xAxisLabels: string[] = [];
  @Input() yAxisMin?: number;
  @Input() yAxisMax?: number;
  @Input() yAxisLabel?: string; // Y-axis label text (e.g., "Billions (USD)")
  @Input() xAxisLabel?: string; // X-axis label text (e.g., "Billions (USD)")
  /** When true, y-axis ticks use {@link formatFlowCurrencyUsd} (data values are USD). */
  @Input() yAxisValuesInBillions: boolean = false;
  /**
   * When set, visible dots / hover targets exist only at these data indices (line and x-axis stay unchanged).
   */
  @Input() dotIndices?: number[];
  /** Optional tooltip subtitle per data index (e.g. semantic "+6mo" when the x tick reads "+5mo"). */
  @Input() pointHoverLabels?: Record<number, string>;
  /**
   * When set for an index, tooltip shows that quarter date and the value in compact $K/$M/$B/$T (same as the y-axis).
   */
  @Input() pointTooltipDateLabels?: string[];
  /**
   * Per-point upper forecast bound (USD), aligned with {@link data}. Use `null` where no band is shown.
   * Shown from {@link forecastStartIndex} through the end when both arrays are set and match length.
   */
  @Input() predictionIntervalUpper: (number | null)[] | null = null;
  @Input() predictionIntervalLower: (number | null)[] | null = null;
  /**
   * Optional x-index for the time-horizon anchor tick (e.g. latest historic quarter). When the label is
   * shortened to "0" instead of a date, this preserves orange accent styling and grid.
   */
  @Input() accentXAxisTickIndex: number | null = null;

  @ViewChild('chart', { static: false }) chartElement!: ElementRef<HTMLDivElement>;

  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
  private readonly baseMargin = { top: 50, right: 20, bottom: 50, left: 70 };
  private tooltip: any = null;

  /**
   * Minimum left margin for currency y-ticks; actual margin also grows from measured tick label width.
   */
  private static readonly Y_AXIS_BILLIONS_LEFT_MARGIN_MIN = 88;

  /** Y-axis tick numerals (and measurement probe for left margin). */
  private static readonly Y_AXIS_TICK_VALUE_FONT_SIZE = '14px';

  /**
   * Anchor date tick (e.g. "Mar 31, 2025") and its vertical grid — saturated orange-amber for contrast on white.
   */
  private static readonly X_AXIS_DATE_ACCENT = '#FF9100';

  private static escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Tooltip block for forecast points with bounds: label and compact $K/$M/$B/$T range on one row (same as axis).
   */
  private static predictionRangeTooltipFragment(
    index: number,
    upper: (number | null)[] | null,
    lower: (number | null)[] | null
  ): string {
    if (!upper || !lower || index < 0 || index >= upper.length || index >= lower.length) {
      return '';
    }
    const u = upper[index];
    const l = lower[index];
    if (l == null || u == null || !Number.isFinite(l) || !Number.isFinite(u)) {
      return '';
    }
    const rangeValues = `${formatFlowCurrencyUsd(l)} to ${formatFlowCurrencyUsd(u)}`;
    return (
      `<div class="line-chart-tooltip-prediction-range">` +
      `<div class="line-chart-tooltip-prediction-range-label">${LineChartComponent.escapeHtml('Prediction Range:')}</div>` +
      `<div class="line-chart-tooltip-prediction-range-values">${LineChartComponent.escapeHtml(rangeValues)}</div>` +
      `</div>`
    );
  }

  /** Margins with responsive bottom; `left` comes from measured y-tick + title width. */
  private getEffectiveMargin(left: number): { top: number; right: number; bottom: number; left: number } {
    let bottom = this.baseMargin.bottom;
    if (typeof window !== 'undefined') {
      const w = window.innerWidth;
      if (w <= 480) bottom = 80;
      else if (w <= 768) bottom = 72;
    }
    return { top: this.baseMargin.top, right: this.baseMargin.right, bottom, left };
  }

  /**
   * Leftmost x of y-axis tick labels in axis group space (negative toward the margin strip).
   * Uses the same scale/nice/ticks/format as the rendered axis.
   */
  private measureYAxisTickLabelLeftExtent(innerHeight: number, yMin: number, yMax: number): number {
    const yScale = d3.scaleLinear().domain([yMin, yMax]).range([innerHeight, 0]).nice(5);
    const yAxis = d3.axisLeft(yScale)
      .ticks(5)
      .tickPadding(this.yAxisValuesInBillions ? 10 : 3)
      .tickFormat(d => {
        const value = Number(d);
        if (this.yAxisValuesInBillions) {
          return formatFlowCurrencyUsd(value);
        }
        return value.toFixed(0);
      });

    const host = this.chartElement?.nativeElement;
    if (!host) return -56;

    const svg = d3
      .select(host)
      .append('svg')
      .attr('width', 560)
      .attr('height', Math.max(innerHeight, 1))
      .style('overflow', 'visible')
      .style('visibility', 'hidden')
      .style('position', 'absolute')
      .style('left', '-10000px')
      .style('top', '0')
      .style('pointer-events', 'none');

    const g = svg.append('g');
    g.call(yAxis);
    g.selectAll('text').style('font-size', LineChartComponent.Y_AXIS_TICK_VALUE_FONT_SIZE);

    let minX = 0;
    g.selectAll<SVGGElement, unknown>('.tick').each(function () {
      const text = this.querySelector('text');
      if (!text) return;
      const bb = (text as SVGGraphicsElement).getBBox();
      minX = Math.min(minX, bb.x);
    });
    svg.remove();
    return minX;
  }

  ngAfterViewInit(): void {
    this.renderChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.chartElement && (changes['data'] || changes['color'] || changes['forecastStartIndex'] ||
        changes['forecastLineColor'] || changes['width'] || changes['height'] ||
        changes['showGrid'] || changes['showArea'] || changes['xAxisLabels'] || changes['yAxisMin'] ||
        changes['yAxisMax'] || changes['yAxisLabel'] || changes['xAxisLabel'] || changes['yAxisValuesInBillions'] ||
        changes['dotIndices'] || changes['pointHoverLabels'] || changes['pointTooltipDateLabels'] ||
        changes['predictionIntervalUpper'] || changes['predictionIntervalLower'])) {
      this.renderChart();
    }
  }

  ngOnDestroy(): void {
    if (this.svg) {
      this.svg.remove();
    }
    if (this.tooltip) {
      this.tooltip.remove();
    }
  }

  private renderChart(): void {
    if (!this.chartElement || !this.data || this.data.length === 0) {
      return;
    }

    // Hide and remove existing tooltip before re-rendering
    if (this.tooltip) {
      this.tooltip.style('opacity', 0)
        .style('visibility', 'hidden')
        .style('display', 'none');
    }

    // Clear previous chart
    d3.select(this.chartElement.nativeElement).select('svg').remove();

    const element = this.chartElement.nativeElement;
    const containerWidth = element.clientWidth || element.parentElement?.clientWidth || 0;
    const maxWidth = containerWidth > 0 ? containerWidth : (this.width || 400);
    const actualWidth = Math.min(this.width || maxWidth, maxWidth);
    const actualHeight = this.height || 320;

    // Y domain before margins so we can measure tick label width and size `margin.left` tightly.
    let actualDataMin = d3.min(this.data) ?? 0;
    let actualDataMax = d3.max(this.data) ?? 100;
    const nData = this.data.length;
    if (
      this.predictionIntervalUpper &&
      this.predictionIntervalLower &&
      this.predictionIntervalUpper.length === nData &&
      this.predictionIntervalLower.length === nData
    ) {
      for (let i = 0; i < nData; i++) {
        const u = this.predictionIntervalUpper[i];
        const l = this.predictionIntervalLower[i];
        if (u != null && l != null && Number.isFinite(u) && Number.isFinite(l)) {
          actualDataMin = Math.min(actualDataMin, u, l);
          actualDataMax = Math.max(actualDataMax, u, l);
        }
      }
    }
    const hasNegativeValues = actualDataMin < 0;
    const explicitDomain = this.yAxisMin !== undefined && this.yAxisMax !== undefined;

    let yMin: number;
    let yMax: number;

    if (explicitDomain) {
      yMin = Math.min(this.yAxisMin!, this.yAxisMax!);
      yMax = Math.max(this.yAxisMin!, this.yAxisMax!);
    } else {
      let dataMin = this.yAxisMin !== undefined ? this.yAxisMin : actualDataMin;
      if (hasNegativeValues && dataMin > 0) {
        dataMin = Math.min(0, actualDataMin);
      }
      const dataMax = this.yAxisMax !== undefined ? this.yAxisMax : actualDataMax;
      const paddingPercent = hasNegativeValues ? 0.05 : 0.1;
      const range = dataMax - dataMin;
      const yPadding = range * paddingPercent;
      yMin = dataMin - yPadding;
      yMax = dataMax + yPadding;

      if (hasNegativeValues) {
        if (actualDataMin < 0 && actualDataMax > 0) {
          if (yMin > 0) yMin = 0;
          if (yMax < 0) yMax = 0;
        } else if (actualDataMax <= 0) {
          const smallPadding = Math.abs(actualDataMax) * 0.05;
          yMin = actualDataMin - yPadding;
          yMax = Math.max(0, actualDataMax + smallPadding);
        }
      }
    }

    const preTopBottom = this.getEffectiveMargin(this.baseMargin.left);
    const innerHeight = actualHeight - preTopBottom.top - preTopBottom.bottom;
    const yTickLabelLeft = this.measureYAxisTickLabelLeftExtent(innerHeight, yMin, yMax);

    const labelGap = 18;
    const labelHalfThickness = 8;
    const edgePad = 6;
    let computedLeft = this.yAxisLabel
      ? Math.ceil(-yTickLabelLeft + labelGap + labelHalfThickness + edgePad)
      : Math.ceil(-yTickLabelLeft + edgePad);
    computedLeft = Math.max(this.baseMargin.left, computedLeft);
    if (this.yAxisValuesInBillions) {
      computedLeft = Math.max(computedLeft, LineChartComponent.Y_AXIS_BILLIONS_LEFT_MARGIN_MIN);
    }

    const margin = this.getEffectiveMargin(computedLeft);
    const innerWidth = actualWidth - margin.left - margin.right;

    this.svg = d3.select(element)
      .append('svg')
      .attr('width', actualWidth)
      .attr('height', actualHeight)
      .style('overflow', 'visible');

    const g = this.svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const n = this.data.length;
    const dotIndexSet =
      Array.isArray(this.dotIndices) &&
      this.dotIndices.length > 0 &&
      this.dotIndices.every(idx => Number.isFinite(idx) && idx >= 0 && idx < n)
        ? new Set(this.dotIndices)
        : null;
    const dateTickPattern = /^[A-Za-z]{3}\s+\d{1,2},\s+\d{4}$/;
    const accentIdx = this.accentXAxisTickIndex;
    const isDateXAxisTick = (tickIndex: number): boolean => {
      if (accentIdx != null && tickIndex === accentIdx) {
        return true;
      }
      const label = this.xAxisLabels?.[tickIndex];
      return typeof label === 'string' && dateTickPattern.test(label.trim());
    };

    // Create scales - first point aligns with y-axis, last point has minimal padding
    const rightPadding = 8; // Minimal padding on the right to prevent last point from being cut off
    const xScale = d3.scaleLinear()
      .domain([0, n - 1])
      .range([0, innerWidth - rightPadding]);

    const yScale = d3.scaleLinear()
      .domain([yMin, yMax])
      .range([innerHeight, 0])
      .nice(5); // Round domain to nice values and use chart space properly

    // Create line generator - use linear interpolation for straight lines
    const line = d3.line<number>()
      .x((d, i) => xScale(i))
      .y(d => yScale(d))
      .curve(d3.curveLinear);

    // Create area generator (if needed)
    // Use y=0 as baseline only when 0 is in the domain (data spans zero); otherwise use bottom
    const [scaleYMin, scaleYMax] = yScale.domain();
    const zeroInDomain = scaleYMin <= 0 && scaleYMax >= 0;
    const zeroY = (hasNegativeValues && zeroInDomain) ? yScale(0) : innerHeight;
    const area = d3.area<number>()
      .x((d, i) => xScale(i))
      .y0(zeroY)
      .y1(d => yScale(d))
      .curve(d3.curveMonotoneX);

    // Draw grid lines (if enabled) - solid light gray lines
    if (this.showGrid) {
      // Horizontal grid lines - show all Y-axis ticks
      const yTicks = yScale.ticks(5);
      const gridLines = g.selectAll('.grid-line-horizontal')
        .data(yTicks)
        .enter()
        .append('line')
        .attr('class', 'grid-line-horizontal')
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', d => yScale(d))
        .attr('y2', d => yScale(d))
        .attr('stroke', d => (hasNegativeValues && Math.abs(d) < 0.01) ? '#c5d0e0' : '#e1e8f2')
        .attr('stroke-width', d => (hasNegativeValues && Math.abs(d) < 0.01) ? 1.5 : 1);

      // Vertical grid lines - align with all data points (using the same scale with padding)
      const xTicks = d3.range(0, n);
      g.selectAll('.grid-line-vertical')
        .data(xTicks)
        .enter()
        .append('line')
        .attr('class', 'grid-line-vertical')
        .attr('x1', d => xScale(d))
        .attr('x2', d => xScale(d))
        .attr('y1', 0)
        .attr('y2', innerHeight)
        .attr('stroke', d =>
          isDateXAxisTick(d) ? LineChartComponent.X_AXIS_DATE_ACCENT : '#e8edf5')
        .attr('stroke-width', 1);
    }

    // Draw area (if enabled)
    if (this.showArea) {
      g.append('path')
        .datum(this.data)
        .attr('fill', this.color)
        .attr('fill-opacity', 0.2)
        .attr('d', area);
    }

    const linePathForRange = (fromIdx: number, toIdx: number): string => {
      if (toIdx < fromIdx || fromIdx < 0 || toIdx >= n) return '';
      const slice = this.data.slice(fromIdx, toIdx + 1);
      return (
        d3
          .line<number>()
          .x((_d, j) => xScale(fromIdx + j))
          .y(d => yScale(d))
          .curve(d3.curveLinear)(slice) ?? ''
      );
    };

    const fRaw = this.forecastStartIndex;
    const hasSplit =
      fRaw !== null &&
      fRaw !== undefined &&
      Number.isFinite(fRaw) &&
      n > 1;
    const f = hasSplit ? Math.max(0, Math.min(n, Math.round(Number(fRaw)))) : null;

    const piU = this.predictionIntervalUpper;
    const piL = this.predictionIntervalLower;
    /** Renders on top of bound lines and main line (same coordinates as the dashed interval paths). */
    let piPointsForBoundDots: { i: number; upper: number; lower: number }[] | null = null;
    if (f !== null && f < n && piU && piL && piU.length === n && piL.length === n) {
      const piPoints: { i: number; upper: number; lower: number }[] = [];
      let piStart = f;
      if (f > 0) {
        const u0 = piU[f - 1];
        const l0 = piL[f - 1];
        if (u0 != null && l0 != null && Number.isFinite(u0) && Number.isFinite(l0)) {
          piStart = f - 1;
        }
      }
      for (let i = piStart; i < n; i++) {
        const u = piU[i];
        const lo = piL[i];
        if (u != null && lo != null && Number.isFinite(u) && Number.isFinite(lo)) {
          piPoints.push({ i, upper: u, lower: lo });
        }
      }
      if (piPoints.length > 0) {
        piPointsForBoundDots = piPoints;
        const piArea = d3
          .area<{ i: number; upper: number; lower: number }>()
          .x(d => xScale(d.i))
          .y0(d => yScale(d.lower))
          .y1(d => yScale(d.upper))
          .curve(d3.curveLinear);
        g.append('path')
          .datum(piPoints)
          .attr('class', 'line-chart-prediction-interval')
          .attr('fill', this.forecastLineColor)
          .attr('fill-opacity', 0.110)
          .attr('d', piArea)
          .style('pointer-events', 'none');

        const lineUpper = d3
          .line<{ i: number; upper: number; lower: number }>()
          .x(d => xScale(d.i))
          .y(d => yScale(d.upper))
          .curve(d3.curveLinear);
        const lineLower = d3
          .line<{ i: number; upper: number; lower: number }>()
          .x(d => xScale(d.i))
          .y(d => yScale(d.lower))
          .curve(d3.curveLinear);
        g.append('path')
          .datum(piPoints)
          .attr('class', 'line-chart-prediction-interval-bound')
          .attr('fill', 'none')
          .attr('stroke', this.forecastLineColor)
          .attr('stroke-opacity', 0.88)
          .attr('stroke-width', 1.25)
          .attr('stroke-dasharray', '4,3')
          .attr('d', lineUpper)
          .style('pointer-events', 'none');
        g.append('path')
          .datum(piPoints)
          .attr('class', 'line-chart-prediction-interval-bound')
          .attr('fill', 'none')
          .attr('stroke', this.forecastLineColor)
          .attr('stroke-opacity', 0.88)
          .attr('stroke-width', 1.25)
          .attr('stroke-dasharray', '4,3')
          .attr('d', lineLower)
          .style('pointer-events', 'none');
      }
    }

    if (f === null) {
      g.append('path')
        .datum(this.data)
        .attr('fill', 'none')
        .attr('stroke', this.color)
        .attr('stroke-width', 2)
        .attr('d', line)
        .style('pointer-events', 'none');
    } else if (f <= 0) {
      g.append('path')
        .attr('fill', 'none')
        .attr('stroke', this.forecastLineColor)
        .attr('stroke-width', 2)
        .attr('d', linePathForRange(0, n - 1))
        .style('pointer-events', 'none');
    } else if (f >= n) {
      g.append('path')
        .attr('fill', 'none')
        .attr('stroke', this.color)
        .attr('stroke-width', 2)
        .attr('d', linePathForRange(0, n - 1))
        .style('pointer-events', 'none');
    } else {
      const historicD = linePathForRange(0, f - 1);
      if (historicD) {
        g.append('path')
          .attr('fill', 'none')
          .attr('stroke', this.color)
          .attr('stroke-width', 2)
          .attr('d', historicD)
          .style('pointer-events', 'none');
      }
      const forecastD = linePathForRange(f - 1, n - 1);
      if (forecastD) {
        g.append('path')
          .attr('fill', 'none')
          .attr('stroke', this.forecastLineColor)
          .attr('stroke-width', 2)
          .attr('d', forecastD)
          .style('pointer-events', 'none');
      }
    }

    if (piPointsForBoundDots && piPointsForBoundDots.length > 0) {
      const boundDotR = 4;
      const boundDotStrokeW = 1.5;
      const pts = piPointsForBoundDots;
      g.append('g')
        .attr('class', 'line-chart-prediction-interval-dots line-chart-prediction-interval-dots--upper')
        .selectAll<SVGCircleElement, (typeof pts)[0]>('circle')
        .data(pts)
        .enter()
        .append('circle')
        .attr('class', 'line-chart-pi-bound-dot')
        .attr('cx', d => xScale(d.i))
        .attr('cy', d => yScale(d.upper))
        .attr('r', boundDotR)
        .attr('fill', this.forecastLineColor)
        .attr('stroke', '#fff')
        .attr('stroke-width', boundDotStrokeW)
        .style('pointer-events', 'none');
      g.append('g')
        .attr('class', 'line-chart-prediction-interval-dots line-chart-prediction-interval-dots--lower')
        .selectAll<SVGCircleElement, (typeof pts)[0]>('circle')
        .data(pts)
        .enter()
        .append('circle')
        .attr('class', 'line-chart-pi-bound-dot')
        .attr('cx', d => xScale(d.i))
        .attr('cy', d => yScale(d.lower))
        .attr('r', boundDotR)
        .attr('fill', this.forecastLineColor)
        .attr('stroke', '#fff')
        .attr('stroke-width', boundDotStrokeW)
        .style('pointer-events', 'none');
    }

    // Create tooltip - append to body to avoid overflow issues
    const container = element.parentElement;
    if (!container) {
      console.error('Line chart: Container not found');
      return;
    }

    // Remove existing tooltip if it exists (check both container and body)
    d3.select(container).select('.line-chart-tooltip').remove();
    d3.select('body').select('.line-chart-tooltip').remove();

    // Append to body for better positioning and to avoid overflow clipping
    this.tooltip = d3.select('body')
      .append('div')
      .attr('class', 'line-chart-tooltip')
      .style('position', 'fixed') // Use fixed instead of absolute for body positioning
      .style('background-color', '#00113F')
      .style('color', '#f8fafc')
      .style('padding', '11px 14px')
      .style('font-size', '15px')
      .style('pointer-events', 'none')
      .style('z-index', '10000')
      .style('box-shadow', '0 6px 18px rgba(0, 17, 63, 0.32)')
      .style('border', '1px solid rgba(255, 255, 255, 0.14)')
      .style('display', 'none')
      .style('visibility', 'hidden')
      .style('opacity', '0')
      .style('white-space', 'nowrap');

    // Verify tooltip was created
    if (!this.tooltip.node()) {
      console.error('Line chart: Failed to create tooltip element');
    }

    // Store component reference for use in event handlers
    const component = this;

    // Create vertical line for tooltip
    const tooltipLine = g.append('line')
      .attr('class', 'tooltip-line')
      .attr('stroke', '#666')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .style('opacity', 0);

    // Track current tooltip state
    let currentTooltipIndex: number | null = null;

    /** Set after x-axis is rendered; bolds the tick for the hovered point index. */
    let setXAxisTickHighlight: (activeIndex: number | null) => void = () => {};

    // Helper function to show tooltip for a specific index (only one at a time)
    const showTooltip = (index: number, xPos: number, yPos: number) => {
      if (index < 0 || index >= component.data.length || !component.tooltip) {
        return;
      }

      currentTooltipIndex = index;
      const value = component.data[index];

      // Update tooltip line
      tooltipLine
        .attr('x1', xPos)
        .attr('x2', xPos)
        .attr('y1', 0)
        .attr('y2', innerHeight)
        .style('opacity', 1);

      const datePrefix =
        component.pointTooltipDateLabels &&
        index < component.pointTooltipDateLabels.length
          ? component.pointTooltipDateLabels[index]?.trim()
          : '';

      const rangeFrag = LineChartComponent.predictionRangeTooltipFragment(
        index,
        component.predictionIntervalUpper,
        component.predictionIntervalLower
      );

      if (datePrefix) {
        const compactUsd = formatFlowCurrencyUsd(value);
        const safeDate = LineChartComponent.escapeHtml(datePrefix);
        const safeUsd = LineChartComponent.escapeHtml(compactUsd);
        component.tooltip.html(
          `<div class="line-chart-tooltip-row line-chart-tooltip-row--dated">` +
          `<div class="line-chart-tooltip-dated-date">${safeDate}</div>` +
          `<div class="line-chart-tooltip-dated-value-row">Value: ` +
          `<span class="line-chart-tooltip-value">${safeUsd}</span></div>` +
          rangeFrag +
          `</div>`
        );
      } else {
        const label =
          component.pointHoverLabels?.[index] ??
          (component.xAxisLabels && component.xAxisLabels.length > index
            ? component.xAxisLabels[index]
            : `Point ${index + 1}`);
        const formattedValue = formatFlowCurrencyUsd(value);
        component.tooltip.html(
          `<div class="line-chart-tooltip-stack">` +
          `<div class="line-chart-tooltip-row">` +
          `<span class="line-chart-tooltip-value">${LineChartComponent.escapeHtml(formattedValue)}</span>` +
          `<span class="line-chart-tooltip-label">${LineChartComponent.escapeHtml(String(label))}</span>` +
          `</div>` +
          rangeFrag +
          `</div>`
        );
      }

      component.tooltip.style('white-space', rangeFrag || datePrefix ? 'normal' : 'nowrap');

      // Calculate position - use getBoundingClientRect for fixed positioning
      const svgElement = component.svg?.node() as SVGSVGElement;
      if (!svgElement) return;

      const svgRect = svgElement.getBoundingClientRect();
      const pointX = svgRect.left + margin.left + xPos;
      const pointY = svgRect.top + margin.top + yPos;

      // Get tooltip node first
      const tooltipNode = component.tooltip.node() as HTMLElement;
      if (!tooltipNode) {
        return;
      }

      // Show tooltip temporarily off-screen to measure using direct DOM with !important
      tooltipNode.style.setProperty('display', 'block', 'important');
      tooltipNode.style.setProperty('visibility', 'visible', 'important');
      tooltipNode.style.setProperty('opacity', '1', 'important');
      tooltipNode.style.setProperty('left', '-9999px', 'important');
      tooltipNode.style.setProperty('top', '0px', 'important');
      tooltipNode.style.setProperty('pointer-events', 'none', 'important');

      // Force reflow to ensure dimensions are calculated
      void tooltipNode.offsetWidth;

      // Get dimensions
      const tooltipWidth = tooltipNode.offsetWidth || 120;
      const tooltipHeight = tooltipNode.offsetHeight || 50;

      const pad = 8;
      const vw = typeof window !== 'undefined' ? window.innerWidth : actualWidth;
      const vh = typeof window !== 'undefined' ? window.innerHeight : actualHeight;

      // Center on the point horizontally; sit just above the dot (fixed = viewport coords)
      let tooltipX = pointX - tooltipWidth / 2;
      let tooltipY = pointY - tooltipHeight - pad;

      if (tooltipY < pad) {
        tooltipY = pointY + pad;
      }

      if (tooltipX < pad) tooltipX = pad;
      if (tooltipX + tooltipWidth > vw - pad) {
        tooltipX = vw - tooltipWidth - pad;
      }
      if (tooltipY + tooltipHeight > vh - pad) {
        tooltipY = pointY - tooltipHeight - pad;
      }
      if (tooltipY < pad) {
        tooltipY = Math.min(pointY + pad, vh - tooltipHeight - pad);
      }

      // Position and show using direct DOM manipulation with !important
      // Use fixed positioning since tooltip is in body
      tooltipNode.style.setProperty('position', 'fixed', 'important');
      tooltipNode.style.setProperty('left', `${tooltipX}px`, 'important');
      tooltipNode.style.setProperty('top', `${tooltipY}px`, 'important');
      tooltipNode.style.setProperty('opacity', '1', 'important');
      tooltipNode.style.setProperty('visibility', 'visible', 'important');
      tooltipNode.style.setProperty('display', 'block', 'important');
      tooltipNode.style.setProperty('z-index', '10000', 'important');

      setXAxisTickHighlight(index);
    };

    // Helper function to hide tooltip
    const hideTooltip = () => {
      currentTooltipIndex = null;
      setXAxisTickHighlight(null);
      if (component.tooltip) {
        const tooltipNode = component.tooltip.node() as HTMLElement;
        if (tooltipNode) {
          tooltipNode.style.opacity = '0';
          tooltipNode.style.visibility = 'hidden';
          tooltipNode.style.display = 'none';
        }
      }
      if (tooltipLine) {
        tooltipLine.style('opacity', 0);
      }
    };

    // Draw invisible overlay - behind dots for proper layering
    // Also handles mouseleave when leaving the chart area
    const overlay = g.append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .style('pointer-events', 'all')
      .on('mouseleave', function(event: MouseEvent) {
        // Hide tooltip when mouse leaves the chart area
        hideTooltip();
      })
      .lower(); // Move to back so dots are on top


    const dotData = this.data
      .map((value, index) => ({ value, index }))
      .filter(({ index }) => dotIndexSet === null || dotIndexSet.has(index));

    const dotFill = (index: number): string => {
      if (f === null) return this.color;
      if (f <= 0) return this.forecastLineColor;
      if (f >= n) return this.color;
      return index < f ? this.color : this.forecastLineColor;
    };

    // Draw data points - larger, more visible circles with larger hit area
    const dots = g.selectAll('.dot')
      .data(dotData)
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', ({ index }) => xScale(index))
      .attr('cy', ({ value }) => yScale(value))
      .attr('r', 6) // Slightly larger for easier hovering
      .attr('fill', ({ index }) => dotFill(index))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .style('pointer-events', 'all');

    // Add invisible larger circles for easier hover detection
    const hitAreas = g.selectAll('.dot-hit-area')
      .data(dotData)
      .enter()
      .append('circle')
      .attr('class', 'dot-hit-area')
      .attr('cx', ({ index }) => xScale(index))
      .attr('cy', ({ value }) => yScale(value))
      .attr('r', 12) // Larger hit area
      .attr('fill', 'transparent')
      .style('pointer-events', 'all')
      .style('cursor', 'pointer')
      .lower(); // Behind visible dots

    // Add hover handlers to both visible dots and hit areas
    // Store index as data attribute for easy access
    dots.attr('data-index', ({ index }) => index);
    hitAreas.attr('data-index', ({ index }) => index);

    // Helper function to handle mouse enter (show tooltip)
    const handleMouseEnter = function (event: MouseEvent, _d: { value: number; index: number }) {
      const element = event.currentTarget as SVGCircleElement;
      if (!element) return;

      // Get index from data attribute
      const indexAttr = element.getAttribute('data-index');
      let index = indexAttr !== null ? parseInt(indexAttr, 10) : -1;

      // Fallback: find index from parent
      if (isNaN(index) || index < 0) {
        const parent = element.parentElement;
        if (parent) {
          const allDots = Array.from(parent.querySelectorAll('.dot, .dot-hit-area'));
          index = allDots.indexOf(element);
        }
      }

      if (index >= 0 && index < component.data.length) {
        const xPos = xScale(index);
        const yPos = yScale(component.data[index]);
        showTooltip(index, xPos, yPos);
      }
    };

    // Helper function to handle mouse leave (hide tooltip)
    const handleMouseLeave = function (_event: MouseEvent, _d: { value: number; index: number }) {
      hideTooltip();
    };

    // Attach hover handlers
    dots.on('mouseenter', handleMouseEnter)
        .on('mouseleave', handleMouseLeave);
    hitAreas.on('mouseenter', handleMouseEnter)
            .on('mouseleave', handleMouseLeave);

    if (piPointsForBoundDots && piPointsForBoundDots.length > 0) {
      type PiBoundHitDatum = { i: number; upper: number; lower: number; edge: 'upper' | 'lower' };
      const boundHitDatum: PiBoundHitDatum[] = [
        ...piPointsForBoundDots.map(d => ({ ...d, edge: 'upper' as const })),
        ...piPointsForBoundDots.map(d => ({ ...d, edge: 'lower' as const })),
      ];
      const handlePiBoundMouseEnter = function (_evt: MouseEvent, d: PiBoundHitDatum): void {
        const index = d.i;
        if (index < 0 || index >= component.data.length) return;
        const yVal = d.edge === 'upper' ? d.upper : d.lower;
        showTooltip(index, xScale(index), yScale(yVal));
      };
      g.append('g')
        .attr('class', 'line-chart-pi-bound-hit-areas')
        .selectAll<SVGCircleElement, PiBoundHitDatum>('circle')
        .data(boundHitDatum)
        .enter()
        .append('circle')
        .attr('cx', d => xScale(d.i))
        .attr('cy', d => yScale(d.edge === 'upper' ? d.upper : d.lower))
        .attr('r', 11)
        .attr('fill', 'transparent')
        .style('pointer-events', 'all')
        .style('cursor', 'pointer')
        .on('mouseenter', handlePiBoundMouseEnter)
        .on('mouseleave', hideTooltip);
    }

    // X Axis - show exactly one tick per data point
    // When the series spans both positive and negative Y, keep the axis at the bottom (same as an all-positive chart).
    // Otherwise, negative net flow at the latest point → top; positive → bottom (avoids crowding when values stay negative).
    const lastFlow = this.data[n - 1] ?? 0;
    const ySpansPositiveAndNegative = actualDataMin < 0 && actualDataMax > 0;
    const useTopAxis = !ySpansPositiveAndNegative && lastFlow < 0;
    const xAxisYPosition = useTopAxis ? 0 : innerHeight;
    const xTickValues = d3.range(0, n);
    const xAxis = (useTopAxis ? d3.axisTop(xScale) : d3.axisBottom(xScale))
      .tickValues(xTickValues)
      .tickFormat((d, i) => {
        const tickIndex = Math.round(Number(d));
        if (this.xAxisLabels && this.xAxisLabels.length > tickIndex) {
          return this.xAxisLabels[tickIndex];
        }
        return String(d);
      });

    const xAxisGroup = g.append('g')
      .attr('transform', `translate(0,${xAxisYPosition})`)
      .call(xAxis);

    const isNarrow = typeof window !== 'undefined' && window.innerWidth <= 768;
    const xAxisTickFillDefault = '#9ca3af';
    const xAxisTickFillActive = '#00113F'; // midnight blue (hover / tooltip only)
    const xAxisDateTickFill = LineChartComponent.X_AXIS_DATE_ACCENT;

    const getXAxisTickBaseFill = (tickIndex: number): string => {
      if (isDateXAxisTick(tickIndex)) {
        return xAxisDateTickFill;
      }
      return xAxisTickFillDefault;
    };

    xAxisGroup.selectAll<SVGGElement, number>('.tick')
      .select('text')
      .style('font-size', d => {
        const i = Math.round(Number(d));
        if (isNarrow) return isDateXAxisTick(i) ? '15px' : '14px';
        return isDateXAxisTick(i) ? '16px' : '15px';
      })
      .style('fill', d => getXAxisTickBaseFill(Math.round(Number(d))))
      .style('font-weight', d =>
        isDateXAxisTick(Math.round(Number(d))) ? '700' : '400')
      .style('font-family', 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');

    // Style x-axis line
    xAxisGroup.select('.domain')
      .attr('stroke', '#dde3ec')
      .attr('stroke-width', 1);

    // Remove tick marks (only show labels)
    xAxisGroup.selectAll('.tick line')
      .attr('stroke', 'none');

    setXAxisTickHighlight = (activeIndex: number | null) => {
      xAxisGroup.selectAll<SVGGElement, number>('.tick').each(function (d) {
        const tickIndex = Math.round(Number(d));
        const active = activeIndex !== null && tickIndex === activeIndex;
        const baseFill = getXAxisTickBaseFill(tickIndex);
        const isDateTick = isDateXAxisTick(tickIndex);
        const weight = isDateTick
          ? active
            ? '800'
            : '700'
          : active
            ? '600'
            : '400';
        d3.select(this)
          .select('text')
          .style('font-weight', weight)
          .style('fill', active && !isDateTick ? xAxisTickFillActive : baseFill);
      });
    };

    // Add X-axis label if provided - positioned relative to x-axis position
    const axisTitleFontSize = '15px';
    const axisTitleColor = '#4B494E';
    if (this.xAxisLabel) {
      // If axis is at top, place label above it (but within visible area); otherwise below
      let labelY: number;
      if (useTopAxis) {
        // Title sits above tick labels (axisTop draws ticks upward from y=0)
        labelY = xAxisYPosition - 38;
        labelY = Math.max(-margin.top + 8, labelY);
      } else {
        // Slightly below previous position so the title sits a bit lower under the tick numerals
        labelY = innerHeight + margin.bottom - 4;
      }
      g.append('text')
        .attr('transform', `translate(${innerWidth / 2}, ${labelY})`)
        .style('text-anchor', 'middle')
        .style('font-size', axisTitleFontSize)
        .style('font-weight', '500')
        .style('fill', axisTitleColor)
        .style('font-family', 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif')
        .style('letter-spacing', '-0.01em')
        .text(this.xAxisLabel);
    }

    // Y Axis — plain integers unless values are billions USD (market flow modal)
    const yAxis = d3.axisLeft(yScale)
      .ticks(5)
      .tickPadding(this.yAxisValuesInBillions ? 10 : 3)
      .tickFormat(d => {
        const value = Number(d);
        if (this.yAxisValuesInBillions) {
          return formatFlowCurrencyUsd(value);
        }
        return value.toFixed(0);
      });

    const yAxisGroup = g.append('g')
      .call(yAxis);

    yAxisGroup.selectAll('text')
      .style('font-size', LineChartComponent.Y_AXIS_TICK_VALUE_FONT_SIZE)
      .style('fill', '#7a8799')
      .style('font-weight', '400')
      .style('font-family', 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');

    // Style y-axis line
    yAxisGroup.select('.domain')
      .attr('stroke', '#dde3ec')
      .attr('stroke-width', 1);

    // Style tick lines
    yAxisGroup.selectAll('.tick line')
      .attr('stroke', '#e1e8f2')
      .attr('stroke-width', 1);

    // Y-axis label: snug to the left of tick numerals (position from measured tick extent, not full margin).
    if (this.yAxisLabel) {
      const labelX = yTickLabelLeft - labelGap;
      g.append('text')
        .attr('transform', `translate(${labelX},${innerHeight / 2}) rotate(-90)`)
        .style('text-anchor', 'middle')
        .style('dominant-baseline', 'middle')
        .style('font-size', axisTitleFontSize)
        .style('font-weight', '500')
        .style('fill', axisTitleColor)
        .style('font-family', 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif')
        .style('letter-spacing', '-0.01em')
        .text(this.yAxisLabel);
    }
  }
}
