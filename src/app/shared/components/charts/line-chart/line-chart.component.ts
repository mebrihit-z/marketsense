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

  @ViewChild('chart', { static: false }) chartElement!: ElementRef<HTMLDivElement>;

  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
  private readonly baseMargin = { top: 50, right: 20, bottom: 50, left: 70 };
  private tooltip: any = null;

  /**
   * Minimum left margin for currency y-ticks; actual margin also grows from measured tick label width.
   */
  private static readonly Y_AXIS_BILLIONS_LEFT_MARGIN_MIN = 88;

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
    if (this.chartElement && (changes['data'] || changes['color'] || changes['width'] || changes['height'] ||
        changes['showGrid'] || changes['showArea'] || changes['xAxisLabels'] || changes['yAxisMin'] ||
        changes['yAxisMax'] || changes['yAxisLabel'] || changes['xAxisLabel'] || changes['yAxisValuesInBillions'] ||
        changes['dotIndices'] || changes['pointHoverLabels'])) {
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
    const actualDataMin = d3.min(this.data) ?? 0;
    const actualDataMax = d3.max(this.data) ?? 100;
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
        .attr('stroke', d => (hasNegativeValues && Math.abs(d) < 0.01) ? '#cbd5e1' : '#e5e7eb')
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
        .attr('stroke', '#e5e7eb')
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

    // Draw line
    const linePath = g.append('path')
      .datum(this.data)
      .attr('fill', 'none')
      .attr('stroke', this.color)
      .attr('stroke-width', 2)
      .attr('d', line)
      .style('pointer-events', 'none'); // Line doesn't need pointer events, dots handle it

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
      .style('padding', '7px 10px')
      .style('font-size', '11px')
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
      const label =
        component.pointHoverLabels?.[index] ??
        (component.xAxisLabels && component.xAxisLabels.length > index
          ? component.xAxisLabels[index]
          : `Point ${index + 1}`);

      // Update tooltip line
      tooltipLine
        .attr('x1', xPos)
        .attr('x2', xPos)
        .attr('y1', 0)
        .attr('y2', innerHeight)
        .style('opacity', 1);

      // Format value as currency (billions; compact $T/$B/$M/$K)
      const formattedValue = formatFlowCurrencyUsd(value);

      // Set tooltip content
      component.tooltip.html(
        `<div class="line-chart-tooltip-row">` +
        `<span class="line-chart-tooltip-value">${formattedValue}</span>` +
        `<span class="line-chart-tooltip-label">${label}</span>` +
        `</div>`
      );

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

    // Draw data points - larger, more visible circles with larger hit area
    const dots = g.selectAll('.dot')
      .data(dotData)
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', ({ index }) => xScale(index))
      .attr('cy', ({ value }) => yScale(value))
      .attr('r', 6) // Slightly larger for easier hovering
      .attr('fill', this.color)
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

    // X Axis - show exactly one tick per data point
    // Negative net flow (latest point below zero) → top; positive (above zero) → bottom.
    const lastFlow = this.data[n - 1] ?? 0;
    const useTopAxis = lastFlow < 0;
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
    const xAxisTickFillDefault = '#949294';
    const xAxisTickFillActive = '#00113F'; // midnight blue (hover / tooltip only)

    xAxisGroup.selectAll('text')
      .style('font-size', isNarrow ? '10px' : '12px')
      .style('fill', xAxisTickFillDefault)
      .style('font-weight', '400');

    // Style x-axis line
    xAxisGroup.select('.domain')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-width', 1);

    // Remove tick marks (only show labels)
    xAxisGroup.selectAll('.tick line')
      .attr('stroke', 'none');

    setXAxisTickHighlight = (activeIndex: number | null) => {
      xAxisGroup.selectAll<SVGGElement, number>('.tick').each(function (d) {
        const tickIndex = Math.round(Number(d));
        const active = activeIndex !== null && tickIndex === activeIndex;
        d3.select(this)
          .select('text')
          .style('font-weight', active ? '600' : '400')
          .style('fill', active ? xAxisTickFillActive : xAxisTickFillDefault);
      });
    };

    // Add X-axis label if provided - positioned relative to x-axis position
    if (this.xAxisLabel) {
      // If axis is at top, place label above it (but within visible area); otherwise below
      let labelY: number;
      if (useTopAxis) {
        // Position well above the axis and tick labels (tick labels are ~15px above axis line)
        // Position the label about 35px above the axis line to avoid overlap
        labelY = xAxisYPosition - 35;
        // Ensure it's within the top margin area
        labelY = Math.max(-margin.top + 5, labelY);
      } else {
        labelY = innerHeight + margin.bottom - 10;
      }
      g.append('text')
        .attr('transform', `translate(${innerWidth / 2}, ${labelY})`)
        .style('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('fill', '#717182')
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
      .style('font-size', '12px')
      .style('fill', '#949294');

    // Style y-axis line
    yAxisGroup.select('.domain')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-width', 1);

    // Style tick lines
    yAxisGroup.selectAll('.tick line')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-width', 1);

    // Y-axis label: snug to the left of tick numerals (position from measured tick extent, not full margin).
    if (this.yAxisLabel) {
      const labelX = yTickLabelLeft - labelGap;
      g.append('text')
        .attr('transform', `translate(${labelX},${innerHeight / 2}) rotate(-90)`)
        .style('text-anchor', 'middle')
        .style('dominant-baseline', 'middle')
        .style('font-size', '12px')
        .style('fill', '#717182')
        .text(this.yAxisLabel);
    }
  }
}
