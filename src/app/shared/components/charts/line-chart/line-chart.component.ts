/* eslint-disable */
import { Component, ElementRef, AfterViewInit, OnDestroy, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import * as d3 from 'd3';

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
  @Input() height: number = 250;
  @Input() showGrid: boolean = true;
  @Input() showArea: boolean = false;
  @Input() xAxisLabels: string[] = [];
  @Input() yAxisMin?: number;
  @Input() yAxisMax?: number;
  @Input() yAxisLabel?: string; // Y-axis label text (e.g., "Billions (USD)")
  @Input() xAxisLabel?: string; // X-axis label text (e.g., "Billions (USD)")

  @ViewChild('chart', { static: false }) chartElement!: ElementRef<HTMLDivElement>;

  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
  private margin = { top: 50, right: 20, bottom: 50, left: 55 }; // Increased top margin for axisTop labels, bottom for x-axis label
  private tooltip: any = null;

  /** Effective margin: larger bottom on mobile so x-axis labels are not cut off */
  private getEffectiveMargin(): { top: number; right: number; bottom: number; left: number } {
    if (typeof window === 'undefined') return this.margin;
    const w = window.innerWidth;
    if (w <= 480) return { ...this.margin, bottom: 80 };
    if (w <= 768) return { ...this.margin, bottom: 72 };
    return this.margin;
  }

  ngAfterViewInit(): void {
    this.renderChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.chartElement && (changes['data'] || changes['color'] || changes['width'] || changes['height'] || 
        changes['showGrid'] || changes['showArea'] || changes['xAxisLabels'] || changes['yAxisMin'] || 
        changes['yAxisMax'] || changes['yAxisLabel'] || changes['xAxisLabel'])) {
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
    const margin = this.getEffectiveMargin();
    // Use container width if available, otherwise use provided width, with a max fallback
    const containerWidth = element.clientWidth || element.parentElement?.clientWidth || 0;
    // Ensure width fits within container to prevent horizontal scrolling
    const maxWidth = containerWidth > 0 ? containerWidth : (this.width || 400);
    const actualWidth = Math.min(this.width || maxWidth, maxWidth);
    const actualHeight = this.height || 250;

    const innerWidth = actualWidth - margin.left - margin.right;
    const innerHeight = actualHeight - margin.top - margin.bottom;

    // Create SVG with overflow visible to prevent clipping
    this.svg = d3.select(element)
      .append('svg')
      .attr('width', actualWidth)
      .attr('height', actualHeight)
      .style('overflow', 'visible');

    const g = this.svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Calculate domain for Y axis
    const actualDataMin = d3.min(this.data) ?? 0;
    const actualDataMax = d3.max(this.data) ?? 100;
    
    // Check if we have negative values in the actual data (not just the domain)
    const hasNegativeValues = actualDataMin < 0;
    const explicitDomain = this.yAxisMin !== undefined && this.yAxisMax !== undefined;

    let yMin: number;
    let yMax: number;

    if (explicitDomain) {
      // Parent provided min/max (e.g. data-driven from modal): use them so the axis fits the data
      yMin = Math.min(this.yAxisMin!, this.yAxisMax!);
      yMax = Math.max(this.yAxisMin!, this.yAxisMax!);
    } else {
      // Compute domain from data
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

    // Create scales - first point aligns with y-axis, last point has minimal padding
    const rightPadding = 8; // Minimal padding on the right to prevent last point from being cut off
    const xScale = d3.scaleLinear()
      .domain([0, this.data.length - 1])
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
      const xTicks = d3.range(0, this.data.length);
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
      .style('background-color', '#ffffff')
      .style('color', '#030213')
      .style('padding', '10px 14px')
      .style('border-radius', '8px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '10000')
      .style('box-shadow', '0 2px 8px rgba(0, 0, 0, 0.15)')
      .style('border', '1px solid #e5e7eb')
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

    // Helper function to show tooltip for a specific index (only one at a time)
    const showTooltip = (index: number, xPos: number, yPos: number) => {
      if (index < 0 || index >= component.data.length || !component.tooltip) {
        return;
      }

      currentTooltipIndex = index;
      const value = component.data[index];
      const label = component.xAxisLabels && component.xAxisLabels.length > index 
        ? component.xAxisLabels[index] 
        : `Point ${index + 1}`;

      // Update tooltip line
      tooltipLine
        .attr('x1', xPos)
        .attr('x2', xPos)
        .attr('y1', 0)
        .attr('y2', innerHeight)
        .style('opacity', 1);

      // Format value as currency
      const formattedValue = `$${Math.abs(value).toFixed(1)}B`;
      
      // Set tooltip content
      component.tooltip.html(
        `<div style="font-size: 14px; font-weight: 600; color: #030213; margin-bottom: 4px; line-height: 1.2;">${formattedValue}</div>` +
        `<div style="font-size: 12px; color: #717182; line-height: 1.2;">${label}</div>`
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
      
      // Calculate final position
      let tooltipX = pointX - (tooltipWidth / 2);
      let tooltipY = pointY + 15;

      // Boundary checks
      if (tooltipX < 5) tooltipX = 5;
      if (tooltipX + tooltipWidth > actualWidth - 5) {
        tooltipX = actualWidth - tooltipWidth - 5;
      }
      if (tooltipY + tooltipHeight > actualHeight - 5) {
        tooltipY = pointY - tooltipHeight - 10;
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
    };
    
    // Helper function to hide tooltip
    const hideTooltip = () => {
      currentTooltipIndex = null;
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


    // Draw data points - larger, more visible circles with larger hit area
    const dots = g.selectAll('.dot')
      .data(this.data)
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', (d, i) => xScale(i))
      .attr('cy', d => yScale(d))
      .attr('r', 6) // Slightly larger for easier hovering
      .attr('fill', this.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .style('pointer-events', 'all');
    
    // Add invisible larger circles for easier hover detection
    const hitAreas = g.selectAll('.dot-hit-area')
      .data(this.data)
      .enter()
      .append('circle')
      .attr('class', 'dot-hit-area')
      .attr('cx', (d, i) => xScale(i))
      .attr('cy', d => yScale(d))
      .attr('r', 12) // Larger hit area
      .attr('fill', 'transparent')
      .style('pointer-events', 'all')
      .style('cursor', 'pointer')
      .lower(); // Behind visible dots

    // Add hover handlers to both visible dots and hit areas
    // Store index as data attribute for easy access
    dots.attr('data-index', (d, i) => i);
    hitAreas.attr('data-index', (d, i) => i);
    
    // Helper function to handle mouse enter (show tooltip)
    const handleMouseEnter = function(event: MouseEvent, d: number) {
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
    const handleMouseLeave = function(event: MouseEvent, d: number) {
      hideTooltip();
    };
    
    // Attach hover handlers
    dots.on('mouseenter', handleMouseEnter)
        .on('mouseleave', handleMouseLeave);
    hitAreas.on('mouseenter', handleMouseEnter)
            .on('mouseleave', handleMouseLeave);

    // X Axis - show exactly one tick per data point
    // When y values are negative, put x-axis on top; otherwise at bottom
    const useTopAxis = hasNegativeValues;
    const xAxisYPosition = useTopAxis ? 0 : innerHeight;
    const xTickValues = d3.range(0, this.data.length);
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
    xAxisGroup.selectAll('text')
      .style('font-size', isNarrow ? '10px' : '12px')
      .style('fill', '#949294')
      .style('font-weight', '400');
    
    // Style x-axis line
    xAxisGroup.select('.domain')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-width', 1);
    
    // Remove tick marks (only show labels)
    xAxisGroup.selectAll('.tick line')
      .attr('stroke', 'none');
    
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

    // Y Axis - show more ticks (10) and format as plain numbers
    const yAxis = d3.axisLeft(yScale)
      .ticks(5)
      .tickFormat(d => {
        const value = Number(d);
        // Format as plain numbers (85, 90, etc.) not currency
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

    // Add Y-axis label if provided - positioned to the left of y-axis values
    if (this.yAxisLabel) {
      g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left + 5) // Positioned further left to avoid y-axis values
        .attr('x', 0 - (innerHeight / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('fill', '#717182')
        .text(this.yAxisLabel);
    }
  }
}
`y`