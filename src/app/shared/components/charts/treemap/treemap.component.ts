import { Component, ElementRef, AfterViewInit, OnDestroy, Input, OnChanges, SimpleChanges } from '@angular/core';
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
export class TreemapComponent implements AfterViewInit, OnDestroy, OnChanges {
  private _selectedProductRegions: string[] = [];
  private _selectedProductTypes: string[] = [];
  
  @Input() 
  set selectedProductRegions(value: string[]) {
    console.log('selectedProductRegions setter called:', value);
    this._selectedProductRegions = value || [];
  }
  get selectedProductRegions(): string[] {
    return this._selectedProductRegions;
  }
  
  @Input() 
  set selectedProductTypes(value: string[]) {
    console.log('selectedProductTypes setter called:', value);
    this._selectedProductTypes = value || [];
  }
  get selectedProductTypes(): string[] {
    return this._selectedProductTypes;
  }
  
  private resizeObserver?: ResizeObserver;

  constructor(private el: ElementRef) {}

  ngAfterViewInit(): void {
    // Initial creation - inputs should be set by now
    this.createTreemap();
    this.setupResizeObserver();
  }

  ngOnDestroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedProductRegions'] || changes['selectedProductTypes']) {
      console.log('Treemap: Filters changed', {
        selectedProductRegions: this.selectedProductRegions,
        selectedProductTypes: this.selectedProductTypes,
        previousRegions: changes['selectedProductRegions']?.previousValue,
        previousTypes: changes['selectedProductTypes']?.previousValue,
        currentRegions: changes['selectedProductRegions']?.currentValue,
        currentTypes: changes['selectedProductTypes']?.currentValue
      });
      
      // Recreate treemap when filters change (only if view is initialized)
      const container = this.el.nativeElement.querySelector('.treemap-container');
      if (container) {
        this.createTreemap();
      }
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

    // Log current input values at the start of createTreemap
    console.log('=== createTreemap called ===', new Date().toISOString());
    console.log('selectedProductTypes:', this.selectedProductTypes);
    console.log('selectedProductTypes type:', typeof this.selectedProductTypes);
    console.log('selectedProductTypes isArray:', Array.isArray(this.selectedProductTypes));
    console.log('selectedProductTypes length:', this.selectedProductTypes?.length);
    console.log('selectedProductRegions:', this.selectedProductRegions);
    console.log('selectedProductRegions length:', this.selectedProductRegions?.length);

    // Clear any existing SVG and tooltip
    d3.select(element).select('svg').remove();
    d3.select(element).select('.treemap-tooltip').remove();

    const containerWidth = element.clientWidth || element.offsetWidth || 1200;
    const width = Math.max(containerWidth, 800);
    const height = 500;
    const margin = { top: 30, right: 20, bottom: 60, left: 20 };
    const regionLabelHeight = 25;
    const regionPadding = 5;

    // Raw data: Product Region -> Product Type
    const rawData: { [region: string]: { [productType: string]: { value: number; percentage: number } } } = {
      'United States': {
        'Equity': { value: 285, percentage: 6.8 },
        'Fixed Income': { value: 215, percentage: 3.5 },
        'Alternatives': { value: 215, percentage: 3.5 },
        'Cash': { value: 45, percentage: 1.2 },
        'Private Markets': { value: 95, percentage: 12.5 },
        'Real Estate': { value: 95, percentage: -7.2 },
        'Other/Specialized': { value: 95, percentage: -7.2 },
        'Multi-Asset': { value: 75, percentage: 4.5 }
      },
      'Europe': {
        'Equity': { value: 195, percentage: 2.5 },
        'Fixed Income': { value: 235, percentage: 4.8 },
        'Alternatives': { value: 105, percentage: 9.5 },
        'Cash': { value: 42, percentage: 1.8 },
        'Private Markets': { value: 95, percentage: 12.5 },
        'Real Estate': { value: 32, percentage: -4.5 },
        'Other/Specialized': { value: 58, percentage: 7.9 },
        'Multi-Asset': { value: 68, percentage: 3.9 }
      },
      'Asia Pacific': {
        'Equity': { value: 198, percentage: -0.8 },
        'Fixed Income': { value: 168, percentage: 2.2 },
        'Alternatives': { value: 85, percentage: 6.5 },
        'Cash': { value: 38, percentage: 1.5 },
        'Private Markets': { value: 95, percentage: 12.5 },
        'Real Estate': { value: 69, percentage: -3.2 },
        'Other/Specialized': { value: 95, percentage: -7.2 },
        'Multi-Asset': { value: 52, percentage: 3.2 }
      },
      'United Kingdom': {
        'Equity': { value: 145, percentage: 4.2 },
        'Fixed Income': { value: 125, percentage: 3.1 },
        'Alternatives': { value: 75, percentage: 8.5 },
        'Cash': { value: 35, percentage: 1.1 },
        'Private Markets': { value: 95, percentage: 12.5 },
        'Real Estate': { value: 69, percentage: -3.2 },
        'Other/Specialized': { value: 95, percentage: -7.2 },
        'Multi-Asset': { value: 48, percentage: 2.8 }
      },
      'Middle East & Africa': {
        'Equity': { value: 98, percentage: 2.8 },
        'Fixed Income': { value: 88, percentage: 2.5 },
        'Alternatives': { value: 55, percentage: 7.2 },
        'Cash': { value: 28, percentage: 0.9 },
        'Private Markets': { value: 95, percentage: 12.5 },
        'Real Estate': { value: 69, percentage: -3.2 },
        'Other/Specialized': { value: 95, percentage: -7.2 },
        'Multi-Asset': { value: 38, percentage: 2.1 },
      }
    };

    // Filter and prepare region data based on selected filters
    const regionsData: Array<{ name: string; children: Array<{ name: string; value: number; percentage: number }> }> = [];
    
    // Get all available regions if none selected, otherwise use selected ones
    const availableRegions = Object.keys(rawData);
    const regionsToShow = this.selectedProductRegions.length > 0 
      ? this.selectedProductRegions.filter(r => availableRegions.includes(r))
      : availableRegions;

    // Get all available product types if none selected, otherwise use selected ones
    const allProductTypes = new Set<string>();
    Object.values(rawData).forEach(regionData => {
      Object.keys(regionData).forEach(type => allProductTypes.add(type));
    });
    
    // Filter selected product types to only include those that exist in the data
    // If selectedProductTypes is empty, null, or undefined, show all types
    const hasSelectedTypes = Array.isArray(this.selectedProductTypes) && this.selectedProductTypes.length > 0;
    let productTypesToShow: string[] = [];
    
    console.log('Filtering product types:', {
      selectedProductTypes: this.selectedProductTypes,
      isArray: Array.isArray(this.selectedProductTypes),
      length: this.selectedProductTypes?.length,
      hasSelectedTypes,
      allProductTypes: Array.from(allProductTypes)
    });
    
    if (hasSelectedTypes) {
      // Filter to only include types that exist in the data
      productTypesToShow = this.selectedProductTypes
        .map(t => t?.trim())
        .filter(t => {
          if (!t) return false;
          const exists = allProductTypes.has(t);
          if (!exists) {
            console.warn(`Product type "${t}" not found in treemap data. Available types:`, Array.from(allProductTypes));
          }
          return exists;
        });
      
      console.log('After filtering:', {
        originalCount: this.selectedProductTypes.length,
        filteredCount: productTypesToShow.length,
        filteredTypes: productTypesToShow
      });
      
      // If all selected types were filtered out, show all types instead
      // This handles the case where user selects types that don't exist in the data
      if (productTypesToShow.length === 0) {
        console.warn('All selected product types were filtered out. Showing all available types instead.');
        productTypesToShow = Array.from(allProductTypes);
      } else {
        // IMPORTANT: Only show the filtered types, not all available types
        // This ensures that when user selects specific types, only those are shown
        console.log('Showing only selected/filtered product types:', productTypesToShow);
      }
    } else {
      // No types selected (empty array, null, or undefined), show all
      console.log('No product types selected, showing all available types');
      productTypesToShow = Array.from(allProductTypes);
    }
    
    console.log('Treemap filtering:', {
      selectedProductTypes: this.selectedProductTypes,
      hasSelectedTypes,
      productTypesToShow,
      availableProductTypes: Array.from(allProductTypes),
      willShowAll: !hasSelectedTypes
    });

    // Build filtered regions data
    console.log('Building regions data with productTypesToShow:', productTypesToShow);
    regionsToShow.forEach(regionName => {
      const regionData = rawData[regionName];
      if (!regionData) return;

      const children: Array<{ name: string; value: number; percentage: number }> = [];
      
      productTypesToShow.forEach(productType => {
        const typeData = regionData[productType];
        if (typeData) {
          children.push({
            name: productType,
            value: typeData.value,
            percentage: typeData.percentage
          });
        } else {
          console.log(`Region "${regionName}" does not have product type "${productType}"`);
        }
      });

      console.log(`Region "${regionName}" will show ${children.length} product types:`, children.map(c => c.name));

      // Only add region if it has children after filtering
      if (children.length > 0) {
        regionsData.push({
          name: regionName,
          children: children
        });
      } else {
        console.log(`Region "${regionName}" filtered out (no matching product types)`);
      }
    });
    
    console.log(`Final regionsData: ${regionsData.length} regions with data`, 
      regionsData.map(r => ({ name: r.name, types: r.children.map(c => c.name) })));

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

    // Add background rectangle to the group
    g.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', availableWidth)
      .attr('height', availableHeight + regionLabelHeight)
      .attr('fill', this.getCssVariable('--green-light', 'rgba(134, 239, 172, 0.61)'))
      .attr('rx', 0)
      .attr('ry', 10)
      .attr('stroke', this.getCssVariable('--border-light', 'rgba(0, 0, 0, 0.10)'))
      .attr('stroke-width', 1)
      .style('pointer-events', 'none');

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
        .attr('x', 8)
        .attr('y', -5)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'bottom')
        .style('font-size', '12px')
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
        .attr('stroke', this.getCssVariable('--bg-white', 'white'))
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
            .style('font-size', '10px')
            .style('font-weight', '500')
            .style('fill', getCssVar('--text-secondary', '#717182'))
            .text(`$${d.data.value}B`);

          // Percentage
          cell.append('text')
            .attr('x', 6)
            .attr('y', 46)
            .attr('class', 'cell-label-percentage')
            .style('font-size', '10px')
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
      .attr('width', 12)
      .attr('height', 12)
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('fill', d => d.color)
      .attr('stroke-width', 1.5);

    legendItems.append('text')
      .attr('x', 22)
      .attr('y', 12)
      .style('font-size', '12px')
      .style('fill', this.getCssVariable('--text-primary', '#030213'))
      .text(d => d.label);
  }
}
