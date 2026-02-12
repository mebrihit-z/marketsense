/* eslint-disable */
import { Component, ElementRef, AfterViewInit, OnDestroy, Input, OnChanges, SimpleChanges } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import * as d3 from 'd3';
import {
  sankey,
  sankeyLinkHorizontal,
  SankeyGraph
} from 'd3-sankey';
import { filterSankeyData, type SankeyData } from '../../../utils/sankey-data.utils';

// ----------------------
// TypeScript Models
// ----------------------
interface SankeyNodeExtra {
  name: string;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
}

interface SankeyLinkExtra {
  source: number | SankeyNodeExtra;
  target: number | SankeyNodeExtra;
  value: number;
  color?: string;
  width?: number;
  date?: string;
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
  imports: [],
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
  @Input() showLegend: boolean = true;
  /** When set to 'Global', node labels will have the "Global" prefix removed for display. */
  @Input() regionKey?: string;

  // Getter to ensure TypeScript recognizes the input
  get shouldShowLegend(): boolean {
    return this.showLegend;
  }
  
  private loadedData?: RegionalSankeyData;
  private lastDataHash: string = '';
  private lastFiltersHash: string = '';
  private tooltipId: string;

  constructor(
    private el: ElementRef,
    private http: HttpClient
  ) {
    // Generate unique tooltip ID for this instance
    this.tooltipId = `sankey-tooltip-${Math.random().toString(36).substr(2, 9)}`;
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
    return `${this.selectedInvestorRegions.join(',')}-${this.selectedProductTypes.join(',')}-${this.selectedProductSubTypes.join(',')}`;
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
        changes['selectedProductSubTypes']) {
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
   * Applies filters to the sankey data based on selected investor regions, product types, and product sub-types
   */
  private getFilteredData(): RegionalSankeyData | undefined {
    const dataToUse = this.loadedData || this.data;
    if (!dataToUse) return undefined;

    // If no filters are selected, return original data
    if (
      this.selectedInvestorRegions.length === 0 &&
      this.selectedProductTypes.length === 0 &&
      this.selectedProductSubTypes.length === 0
    ) {
      return dataToUse;
    }

    // Apply filters using the utility function
    return filterSankeyData(
      dataToUse as SankeyData,
      this.selectedInvestorRegions,
      this.selectedProductTypes,
      this.selectedProductSubTypes
    ) as RegionalSankeyData;
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
      // Remove (Source) and (Destination) from display to give labels more space
      formatted = formatted.replace(/\s*\(Source\)\s*$/, '');
      formatted = formatted.replace(/\s*\(Destination\)\s*$/, '');
      // On global sankey only, remove "Global" prefix from labels (title already says Global)
      if (this.regionKey === 'Global') {
        formatted = formatted.replace(/^Global\s*:\s*/, '').replace(/^Global\s*-\s*/, '').replace(/^Global\s+/, '').trim();
      }
      return formatted;
    }

    // Helper function to format time information for tooltip
    private formatTimeInfo(): string {
      if (this.timeHorizonStart && this.timeHorizonEnd) {
        return `${this.timeHorizonStart} to ${this.timeHorizonEnd}`;
      } else if (this.timeHorizon) {
        // If timeHorizon is "Today", show it as "Today to +3mo" by default
        if (this.timeHorizon === 'Today') {
          return 'Today to +3mo';
        }
        return this.timeHorizon;
      }
      return '';
    }

  // -----------------------------------------
  // MAIN FUNCTION
  // -----------------------------------------
  private createSankey() {
    const dataToUse = this.getFilteredData();
    if (!dataToUse) return;

    const element = this.el.nativeElement.querySelector('.regional-sankey');
    
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
    const baseHeight = elementRect.height > 0 ? elementRect.height : nativeRect.height > 0 ? nativeRect.height : 900;
    const height = Math.max(baseHeight, 600);

    // Create tooltip (append to body for positioning; inline styles required because body is outside component)
    d3.select('body').select(`#${this.tooltipId}`).remove();
    const overlayDarker = this.getCssVariable('--overlay-darker') || 'rgba(0, 0, 0, 0.85)';
    const bgWhite = this.getCssVariable('--bg-white') || '#ffffff';
    const tooltip = d3.select('body')
      .append('div')
      .attr('id', this.tooltipId)
      .attr('class', 'sankey-tooltip')
      .style('position', 'absolute')
      .style('background-color', overlayDarker)
      .style('color', bgWhite)
      .style('padding', '8px 12px')
      .style('border-radius', '4px')
      .style('font-size', '14px')
      .style('pointer-events', 'none')
      .style('z-index', '10000')
      .style('box-shadow', '0 2px 8px rgba(0,0,0,0.3)')
      .style('max-width', '300px')
      .style('opacity', '0')
      .style('display', 'none');

    // -----------------------------------------
    // 1. Prepare Data
    // -----------------------------------------
    // Create node map
    const nodeMap = new Map<string, number>();
    const nodes: SankeyNodeExtra[] = dataToUse.nodes.map((node, i) => {
      nodeMap.set(node.name, i);
      return { name: node.name };
    });

    // Create links with source and target indices
    // Colors will be assigned after sankey layout computes node positions
    const links: SankeyLinkExtra[] = dataToUse.links.map(link => {
      const sourceIndex = nodeMap.get(link.source);
      const targetIndex = nodeMap.get(link.target);
      
      if (sourceIndex === undefined || targetIndex === undefined) {
        return null;
      }

      // Color will be set after layout based on horizontal position
      return {
        source: sourceIndex,
        target: targetIndex,
        value: link.value,
        date: link.date // Preserve date information
      };
    }).filter(link => link !== null) as SankeyLinkExtra[];

    // -----------------------------------------
    // 2. Prepare Graph for D3 Sankey
    // -----------------------------------------
    const graphData: SankeyGraph<SankeyNodeExtra, SankeyLinkExtra> = {
      nodes,
      links
    };

    // -----------------------------------------
    // 3. Create SVG (no zoom – chart at fixed scale for readable labels)
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

    const leftMargin = 8;   // Minimal padding so edge labels aren’t clipped
    const rightMargin = 8;
    const topMargin = 15;   // Small padding at top (Outflows/Inflows labels are outside chart)
    const bottomMargin = 50;

    const sankeyGen = sankey<SankeyNodeExtra, SankeyLinkExtra>()
      .nodeWidth(20)
      .nodePadding(10)
      .extent([[leftMargin, topMargin], [width - rightMargin, height - bottomMargin]]);

    const graph = sankeyGen(graphData);

    // Build a map of Source/Destination nodes to their parent types
    const nodeParentTypeMap = new Map<string, string>();
    graph.links.forEach(link => {
      const source = link.source as SankeyNodeExtra;
      const target = link.target as SankeyNodeExtra;
      
      // If source is a parent (Start) node and target is a Source node, map target to parent type
      if (source.name && source.name.includes('(Start)') && target.name && target.name.includes('(Source)')) {
        if (source.name.includes('Equity')) {
          nodeParentTypeMap.set(target.name, 'Equity');
        } else if (source.name.includes('Fixed Income')) {
          nodeParentTypeMap.set(target.name, 'Fixed Income');
        } else if (source.name.includes('Cash')) {
          nodeParentTypeMap.set(target.name, 'Cash');
        } else if (source.name.includes('Multi-Asset')) {
          nodeParentTypeMap.set(target.name, 'Multi-Asset');
        } else if (source.name.includes('Alternatives')) {
          nodeParentTypeMap.set(target.name, 'Alternatives');
        } else if (source.name.includes('Other / Specialized') || source.name.includes('Other/Specialized')) {
          nodeParentTypeMap.set(target.name, 'Other / Specialized');
        } else if (source.name.includes('Private Markets')) {
          nodeParentTypeMap.set(target.name, 'Private Markets');
        }
      }
      
      // If target is a parent (End) node and source is a Destination node, map source to parent type
      if (target.name && target.name.includes('(End)') && source.name && source.name.includes('(Destination)')) {
        if (target.name.includes('Equity')) {
          nodeParentTypeMap.set(source.name, 'Equity');
        } else if (target.name.includes('Fixed Income')) {
          nodeParentTypeMap.set(source.name, 'Fixed Income');
        } else if (target.name.includes('Cash')) {
          nodeParentTypeMap.set(source.name, 'Cash');
        } else if (target.name.includes('Multi-Asset')) {
          nodeParentTypeMap.set(source.name, 'Multi-Asset');
        } else if (target.name.includes('Alternatives')) {
          nodeParentTypeMap.set(source.name, 'Alternatives');
        } else if (target.name.includes('Other / Specialized') || target.name.includes('Other/Specialized')) {
          nodeParentTypeMap.set(source.name, 'Other / Specialized');
        } else if (target.name.includes('Private Markets')) {
          nodeParentTypeMap.set(source.name, 'Private Markets');
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
    // Net New Capital links are always blue
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
      
      // Check if link is connected to Capital Withdrawn - same color as Net New Capital
      if ((source.name && source.name.includes('Capital Withdrawn')) || 
          (target.name && target.name.includes('Capital Withdrawn'))) {
        linkExtra.color = this.getCssVariable('--blue-link') || 'rgba(0,100,200,0.7)';
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
    
    chartGroup.append('g')
      .selectAll('path')
      .data(graph.links)
      .enter()
      .append('path')
      .attr('d', sankeyLinkHorizontal())
      .attr('stroke', d => (d as SankeyLinkExtra).color || this.getCssVariable('--default-gray') || '#999')
      .attr('stroke-width', d => Math.max(1, (d as SankeyLinkExtra).width || 1))
      .attr('fill', 'none')
      .attr('opacity', 0.45)
      .attr('class', 'sankey-link')
      .on('mouseover', function(event, d) {
        const link = d as SankeyLinkExtra;
        const source = link.source as SankeyNodeExtra;
        const target = link.target as SankeyNodeExtra;
        const value = link.value;
        const formattedValue = value >= 0.1 ? value.toFixed(2) : value.toFixed(3);
        
        // Check if this is a subasset link (connected to Source or Destination nodes)
        const isSubassetLink = (source.name && (source.name.includes('(Source)') || source.name.includes('(Destination)'))) ||
                               (target.name && (target.name.includes('(Source)') || target.name.includes('(Destination)')));
        
        let tooltipHtml = `
          <div><strong>${component.formatNodeName(source.name)}</strong> → <strong>${component.formatNodeName(target.name)}</strong></div>
          <div style="margin-top: 4px;">Value: $${formattedValue}B</div>
        `;
        
        // For subasset links, show the Asset_Flow_Date if available, otherwise show time horizon
        if (isSubassetLink && link.date) {
          tooltipHtml += `<div style="margin-top: 4px; font-size: 13px; opacity: 0.9;">Date: ${link.date}</div>`;
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
            const baseWidth = Math.max(1, ((d as SankeyLinkExtra).width || 1));
            return baseWidth + 3; // More prominent hover effect
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
          .attr('opacity', 0.45)
          .attr('stroke-width', (d: any) => Math.max(1, (d as SankeyLinkExtra).width || 1));
        
        // Restore all links opacity
        chartGroup.selectAll('path').attr('opacity', 0.45);
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
      const value = (link as SankeyLinkExtra).value;
      
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
        if (parentType === 'Equity') return 'equity';
        if (parentType === 'Fixed Income') return 'fixed-income';
        if (parentType === 'Cash') return 'cash';
        if (parentType === 'Multi-Asset') return 'multi-asset';
        if (parentType === 'Other / Specialized') return 'other-specialized';
        if (parentType === 'Private Markets') return 'private-markets';
        if (parentType === 'Alternatives') return 'alternatives';
      }
      if (nodeName.includes('(Start)') || nodeName.includes('(End)')) {
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
      .attr('class', d => `sankey-node-rect sankey-node-${getNodeColorClass(d.name)}`)
      .on('mouseover', function(event, d) {
        const node = d as SankeyNodeExtra;
        const value = nodeValues.get(node) || 0;
        const formattedValue = value >= 0.1 ? value.toFixed(2) : value.toFixed(3);
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
                   value: linkExtra.value,
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
                   value: linkExtra.value,
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
             
             subassetHtml = '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 13px;">';
             subassetHtml += `<div style="font-weight: 600; margin-bottom: 4px; opacity: 0.9;">Product Sub-Type (${aggregatedSubassets.length}):</div>`;
             subassetHtml += '<div style="max-height: 200px; overflow-y: auto; overflow-x: hidden;">';
             itemsToShow.forEach(subasset => {
               const subassetValue = subasset.value >= 0.1 ? subasset.value.toFixed(2) : subasset.value.toFixed(3);
               
               let subassetLine = `${component.formatNodeName(subasset.name)}: <strong>$${subassetValue}B</strong>`;
               if (subasset.dates.length > 0) {
                 // Format dates - if multiple, show range or list
                 let dateStr = '';
                 if (subasset.dates.length === 1) {
                   dateStr = subasset.dates[0];
                 } else if (subasset.dates.length <= 3) {
                   dateStr = subasset.dates.join(', ');
                 } else {
                   dateStr = `${subasset.dates[0]} - ${subasset.dates[subasset.dates.length - 1]} (${subasset.dates.length} dates)`;
                 }
                 subassetLine += ` <span style="opacity: 0.75; font-size: 12px;">(${dateStr})</span>`;
               }
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
          <div style="margin-top: 4px;">Total Value: $${formattedValue}B</div>
          <div style="margin-top: 2px; font-size: 13px; opacity: 0.9;">Incoming: $${incoming.toFixed(2)}B</div>
          <div style="font-size: 13px; opacity: 0.9;">Outgoing: $${outgoing.toFixed(2)}B</div>
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
        
        // Highlight the hovered node (hover styles in SCSS)
        d3.select(this)
          .classed('sankey-node-hovered', true)
          .attr('stroke-width', 3)
          .raise(); // Bring to front
        
        // Highlight connected links
        const nodeLinks = graph.links.filter(link => 
          (link.source as SankeyNodeExtra) === node || (link.target as SankeyNodeExtra) === node
        );
        
        chartGroup.selectAll('path')
          .filter(function(link: any) {
            return nodeLinks.includes(link as SankeyLinkExtra);
          })
          .attr('opacity', 0.8)
          .attr('stroke-width', (link: any) => {
            const baseWidth = Math.max(1, ((link as SankeyLinkExtra).width || 1));
            return baseWidth + 1;
          });
        
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
      .on('mouseout', function() {
        tooltip.style('opacity', '0').style('display', 'none');
        d3.select(this)
          .classed('sankey-node-hovered', false)
          .attr('stroke-width', 1);
        chartGroup.selectAll('rect').attr('opacity', 1);
        chartGroup.selectAll('path').attr('opacity', 0.45).attr('stroke-width', (d: any) => Math.max(1, (d as SankeyLinkExtra).width || 1));
      });

    // -----------------------------------------
    // 8. Node Labels (with values inline)
    // -----------------------------------------
    const nodeLabels = chartGroup.append('g')
      .attr('class', 'sankey-node-labels')
      .selectAll('text')
      .data(graph.nodes)
      .enter()
      .append('text')
      .attr('class', 'sankey-node-label')
      .attr('x', d => {
        // Position labels based on node type and side (outflow vs inflow)
        if (d.name.includes('(Source)')) {
          return d.x1! + 12;
        }
        if (d.name.includes('(Destination)')) {
          return d.x0! - 12;
        }
        // Positive/inflow side (right of Reallocation Pool): label to the left of the node
        if (reallocationPoolX !== null && d.x0! > reallocationPoolX) {
          return d.x0! - 12;
        }
        // Negative/outflow side (left of Reallocation Pool): label to the right of the node
        if (reallocationPoolX !== null && d.x1! < reallocationPoolX) {
          return d.x1! + 12;
        }
        return (d.x0! + d.x1!) / 2;
      })
      .attr('y', d => (d.y0! + d.y1!) / 2)
      .attr('text-anchor', d => {
        if (d.name.includes('(Source)')) return 'start';
        if (d.name.includes('(Destination)')) return 'end';
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
    
    // Add value text as tspan on the same row
    nodeLabels.append('tspan')
      .attr('class', 'sankey-node-label-value')
      .attr('dx', '8px')
      .text(d => {
        const value = nodeValues.get(d) || 0;
        const formattedValue = value >= 0.1 ? value.toFixed(2) : value.toFixed(3);
        // Add negative sign for nodes to the left of Reallocation Pool
        const nodeX = d.x0 !== undefined ? d.x0 : (d.x1 || 0);
        const isLeftOfReallocation = reallocationPoolX !== null && nodeX < reallocationPoolX;
        const sign = isLeftOfReallocation ? '-' : '';
        return '$' + sign + formattedValue + 'B';
      });

    // Link values are not drawn – only node labels show values (next to each node)

    // Legend is rendered in template (outside chart) – see sankey.component.html
  }

  ngOnDestroy(): void {
    // Clean up tooltip when component is destroyed
    d3.select('body').select(`#${this.tooltipId}`).remove();
  }
}

