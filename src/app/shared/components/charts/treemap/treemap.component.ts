import { Component, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import * as d3 from 'd3';

interface TreemapDataNode {
  name: string;
  value: number;
  percentage: number;
  children?: TreemapDataNode[];
}

// Extended hierarchy node with treemap layout properties
interface TreemapNode extends d3.HierarchyNode<TreemapDataNode> {
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
  styleUrl: './treemap.component.scss'
})
export class TreemapComponent implements AfterViewInit, OnDestroy {
  private resizeObserver?: ResizeObserver;

  constructor(private el: ElementRef) {}

  ngAfterViewInit(): void {
    this.createTreemap();
    this.setupResizeObserver();
  }

  ngOnDestroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  private setupResizeObserver(): void {
    const element = this.el.nativeElement.querySelector('.treemap-container');
    if (element && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        // Clear and recreate on resize
        const svg = element.querySelector('svg');
        if (svg) {
          svg.remove();
        }
        this.createTreemap();
      });
      this.resizeObserver.observe(element);
    }
  }

  private getCssVariable(name: string, fallback: string = ''): string {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim() || fallback;
  }

  private getColorForPercentage(percentage: number): string {
    if (percentage > 0) {
      // Green for inflow/positive
      return this.getCssVariable('--green-light', '#86efac');
    } else if (percentage < 0) {
      // Pink for outflow/negative
      return this.getCssVariable('--red-light', '#fca5a5');
    } else {
      // Light gray for neutral
      return this.getCssVariable('--bg-gray-medium', '#e5e7eb');
    }
  }

  private getBorderColorForPercentage(percentage: number): string {
    if (percentage > 0) {
      return this.getCssVariable('--green-dark', '#10b981');
    } else if (percentage < 0) {
      return this.getCssVariable('--red-dark', '#ef4444');
    } else {
      return this.getCssVariable('--gray-medium', '#6b7280');
    }
  }

  private createTreemap(): void {
    const element = this.el.nativeElement.querySelector('.treemap-container');
    if (!element) return;

    // Clear any existing SVG and tooltip
    d3.select(element).select('svg').remove();
    d3.select(element).select('.treemap-tooltip').remove();

    const containerWidth = element.clientWidth || element.offsetWidth || 1200;
    const width = Math.max(containerWidth, 800);
    const height = 500;
    const margin = { top: 30, right: 20, bottom: 60, left: 20 };
    const regionLabelHeight = 25;
    const regionPadding = 5;

    // Prepare region data
    const regionsData = [
      {
        name: 'United States',
        children: [
          { name: 'Equity', value: 285, percentage: 6.8 },
          { name: 'Fixed Income', value: 215, percentage: 3.5 },
          { name: 'Private Equ.', value: 95, percentage: 12.5 },
          { name: 'Real Estate', value: 95, percentage: -7.2 },
          { name: 'Alternatives', value: 55, percentage: 9.8 }
        ]
      },
      {
        name: 'Europe',
        children: [
          { name: 'Fixed Income', value: 235, percentage: 4.8 },
          { name: 'Alternatives', value: 105, percentage: 9.5 },
          { name: 'Equity', value: 195, percentage: 2.5 },
          { name: 'Infrastruct.', value: 58, percentage: 7.9 },
          { name: 'Real Estate', value: 32, percentage: -4.5 }
        ]
      },
      {
        name: 'Asia Pacific',
        children: [
          { name: 'Equity', value: 198, percentage: -0.8 },
          { name: 'Fixed Income', value: 168, percentage: 2.2 },
          { name: 'Alternatives', value: 85, percentage: 6.5 },
          { name: 'Real Estate', value: 69, percentage: -3.2 }
        ]
      }
    ];

    // Calculate total value and region widths
    const totalValue = regionsData.reduce((sum, region) => 
      sum + region.children.reduce((s, child) => s + child.value, 0), 0
    );

    const availableWidth = width - margin.left - margin.right;
    const availableHeight = height - margin.top - margin.bottom - regionLabelHeight;

    // Create SVG
    const svg = d3.select(element)
      .append('svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create tooltip
    const tooltip = d3.select(element)
      .append('div')
      .attr('class', 'treemap-tooltip')
      .style('position', 'absolute')
      .style('background-color', this.getCssVariable('--overlay-darker', 'rgba(0, 0, 0, 0.85)'))
      .style('color', this.getCssVariable('--bg-white', 'white'))
      .style('padding', '8px 12px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', 1000)
      .style('box-shadow', '0 2px 8px rgba(0,0,0,0.3)');

    // Capture component reference for use in callbacks
    const component = this;
    const getCssVar = (name: string, fallback: string) => component.getCssVariable(name, fallback);

    let currentX = 0;

    // Process each region
    regionsData.forEach((regionData, regionIndex) => {
      const regionValue = regionData.children.reduce((sum, child) => sum + child.value, 0);
      const regionWidth = (regionValue / totalValue) * availableWidth;
      const regionHeight = availableHeight;

      // Create region group
      const regionGroup = g.append('g')
        .attr('class', 'region')
        .attr('transform', `translate(${currentX}, ${regionLabelHeight})`);

      // Draw region label
      regionGroup.append('text')
        .attr('class', 'region-label')
        .attr('x', regionWidth / 2)
        .attr('y', -regionLabelHeight + 5)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'bottom')
        .style('font-size', '14px')
        .style('font-weight', '600')
        .style('fill', this.getCssVariable('--text-primary', '#030213'))
        .text(regionData.name);

      // Create hierarchy for this region
      const regionHierarchy = d3.hierarchy({
        name: regionData.name,
        value: 0,
        percentage: 0,
        children: regionData.children
      } as TreemapDataNode)
        .sum(d => d.value)
        .sort((a, b) => (b.value || 0) - (a.value || 0));

      // Create treemap layout for this region
      const treemapLayout = d3.treemap<TreemapDataNode>()
        .size([regionWidth - regionPadding * 2, regionHeight - regionPadding * 2])
        .paddingInner(2)
        .round(true);

      treemapLayout(regionHierarchy);

      const treemapRoot = regionHierarchy as unknown as TreemapNode;

      // Draw asset class rectangles
      const cells = regionGroup.selectAll('g.cell')
        .data((treemapRoot.leaves() || []) as TreemapNode[])
        .enter()
        .append('g')
        .attr('class', 'cell')
        .attr('transform', d => `translate(${d.x0 + regionPadding},${d.y0 + regionPadding})`);

      cells.append('rect')
        .attr('width', d => d.x1 - d.x0)
        .attr('height', d => d.y1 - d.y0)
        .attr('fill', d => this.getColorForPercentage(d.data.percentage))
        .attr('stroke', d => this.getBorderColorForPercentage(d.data.percentage))
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
          d3.select(this)
            .attr('stroke-width', 2.5)
            .attr('opacity', 0.9);

          tooltip
            .style('opacity', 1)
            .html(`
              <div><strong>${d.data.name}</strong></div>
              <div style="margin-top: 4px;">Value: $${d.data.value}B</div>
              <div style="margin-top: 2px;">Change: ${d.data.percentage > 0 ? '+' : ''}${d.data.percentage}%</div>
            `);
        })
        .on('mousemove', function(event) {
          tooltip
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px');
        })
        .on('mouseout', function() {
          d3.select(this)
            .attr('stroke-width', 1.5)
            .attr('opacity', 1);
          tooltip.style('opacity', 0);
        });

      // Add text labels to cells
      cells.each(function(d: TreemapNode) {
        const cell = d3.select(this);
        const rectWidth = d.x1 - d.x0;
        const rectHeight = d.y1 - d.y0;
        const minSize = 60;

        if (rectWidth > minSize && rectHeight > minSize) {
          // Asset name
          cell.append('text')
            .attr('x', 6)
            .attr('y', 16)
            .attr('class', 'cell-label-name')
            .style('font-size', '12px')
            .style('font-weight', '600')
            .style('fill', getCssVar('--text-primary', '#030213'))
            .text(d.data.name);

          // Value
          cell.append('text')
            .attr('x', 6)
            .attr('y', 32)
            .attr('class', 'cell-label-value')
            .style('font-size', '11px')
            .style('font-weight', '500')
            .style('fill', getCssVar('--text-secondary', '#717182'))
            .text(`$${d.data.value}B`);

          // Percentage
          cell.append('text')
            .attr('x', 6)
            .attr('y', 46)
            .attr('class', 'cell-label-percentage')
            .style('font-size', '11px')
            .style('font-weight', '500')
            .style('fill', getCssVar('--text-secondary', '#717182'))
            .text(`${d.data.percentage > 0 ? '+' : ''}${d.data.percentage}%`);
        } else if (rectWidth > 40 && rectHeight > 30) {
          // Show abbreviated label for medium-sized cells
          cell.append('text')
            .attr('x', rectWidth / 2)
            .attr('y', rectHeight / 2)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .style('font-size', '10px')
            .style('font-weight', '600')
            .style('fill', getCssVar('--text-primary', '#030213'))
            .text(d.data.name);
        }
      });

      currentX += regionWidth;
    });

    // Create legend
    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${margin.left},${height - margin.bottom + 10})`);

    const legendData = [
      { label: 'Inflow', color: this.getColorForPercentage(1), border: this.getBorderColorForPercentage(1) },
      { label: 'Neutral', color: this.getColorForPercentage(0), border: this.getBorderColorForPercentage(0) },
      { label: 'Outflow', color: this.getColorForPercentage(-1), border: this.getBorderColorForPercentage(-1) }
    ];

    const legendItems = legend.selectAll('g.legend-item')
      .data(legendData)
      .enter()
      .append('g')
      .attr('class', 'legend-item')
      .attr('transform', (d, i) => `translate(${i * 120}, 0)`);

    legendItems.append('rect')
      .attr('width', 16)
      .attr('height', 16)
      .attr('fill', d => d.color)
      .attr('stroke', d => d.border)
      .attr('stroke-width', 1.5);

    legendItems.append('text')
      .attr('x', 22)
      .attr('y', 12)
      .style('font-size', '12px')
      .style('fill', this.getCssVariable('--text-primary', '#030213'))
      .text(d => d.label);
  }
}
