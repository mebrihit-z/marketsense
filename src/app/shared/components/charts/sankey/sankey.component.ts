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
  
  // Getter to ensure TypeScript recognizes the input
  get shouldShowLegend(): boolean {
    return this.showLegend;
  }
  
  private loadedData?: RegionalSankeyData;
  private currentZoom: any;
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
        this.setupZoomControls();
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
        this.setupZoomControls();
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
    
    // Get the full container width, ensuring we use 100% of available space
    const baseContainerWidth = elementRect.width > 0 ? elementRect.width : 
                          nativeRect.width > 0 ? nativeRect.width : 
                          element.clientWidth || 
                          element.offsetWidth || 
                          this.el.nativeElement.clientWidth || 
                          this.el.nativeElement.offsetWidth ||
                          window.innerWidth || 2400;
    // Increase the width for better spacing - use container width or minimum 2400px
    const width = Math.max(baseContainerWidth, 2400);
    const height = 900; // Increased height to reduce crowding

    // Get CSS variable values
    const overlayDarker = this.getCssVariable('--overlay-darker');
    const bgWhite = this.getCssVariable('--bg-white');

    // Create tooltip (append to body for better positioning and to avoid overflow issues)
    // Use unique ID to prevent conflicts with multiple Sankey instances
    // Remove any existing tooltip with this ID first, then create a new one
    d3.select('body').select(`#${this.tooltipId}`).remove();
    const tooltip = d3.select('body')
      .append('div')
      .attr('id', this.tooltipId)
      .attr('class', 'sankey-tooltip')
      .style('position', 'absolute')
      .style('background-color', overlayDarker || 'rgba(0, 0, 0, 0.85)')
      .style('color', bgWhite || 'white')
      .style('padding', '8px 12px')
      .style('border-radius', '4px')
      .style('font-size', '14px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', 10000)
      .style('box-shadow', '0 2px 8px rgba(0,0,0,0.3)')
      .style('max-width', '300px')
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
    // 3. Create SVG with Zoom
    // -----------------------------------------
    const svg = d3.select(element)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height-50}`)
      .attr('preserveAspectRatio', 'none')
      .style('display', 'block')
      .style('width', '100%')
      .style('height', height + 'px');

    // Create a group for all zoomable content
    const zoomGroup = svg.append('g')
      .attr('class', 'zoom-group');

    // Calculate generous translate extents to allow panning to see all parts when zoomed
    // When zoomed to 3x, we need to allow panning to see content that's up to 3x the viewport
    // We make it generous: allow panning up to 4x the dimensions in each direction
    const maxZoom = 3;
    const panBoundary = Math.max(width, height) * maxZoom;
    const translateExtent: [[number, number], [number, number]] = [
      [-panBoundary, -panBoundary], // Minimum translate (far left and up)
      [panBoundary, panBoundary]     // Maximum translate (far right and down)
    ];

    // Define zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.5, maxZoom]) // Allow zoom from 50% to 300%
      .translateExtent(translateExtent) // Allow panning within generous bounds
      .extent([[0, 0], [width, height]]) // Zoom extent is the full SVG
      .filter((event: any) => {
        // Only allow zoom with mouse wheel when holding Ctrl/Cmd/Shift
        // This allows normal page scrolling when not holding modifier keys
        // Allow all other interactions (drag, touch, buttons) normally
        if (event.type === 'wheel') {
          return event.ctrlKey || event.metaKey || event.shiftKey;
        }
        // Allow all other event types (mousedown, mousemove, touchstart, etc.)
        return true;
      })
      .on('zoom', (event) => {
        zoomGroup.attr('transform', event.transform);
      });

    // Apply zoom to SVG
    svg.call(zoom as any);
    
    // Store zoom behavior for button controls
    this.currentZoom = { zoom, svg };

    const leftMargin = 150; // Space for Super Start node and labels
    const rightMargin = 150; // Space for Super End node and labels
    const topMargin = 35; // Increased to accommodate "Outflows" and "Inflows" labels
    const bottomMargin = 50;
    const legendTopMargin = 70;// Space between chart and legend
    const legendBottomOffset = 15; // Space from legend to bottom of SVG
    
    const sankeyGen = sankey<SankeyNodeExtra, SankeyLinkExtra>()
      .nodeWidth(20)
      .nodePadding(10)
      .extent([[leftMargin, topMargin], [width - rightMargin, height - bottomMargin - legendTopMargin - legendBottomOffset]]);

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
        } else if (source.name.includes('Other / Specialized')) {
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
        } else if (target.name.includes('Other / Specialized')) {
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
      
      // Check if link is connected to Capital Withdrawn - make it orange
      if ((source.name && source.name.includes('Capital Withdrawn')) || 
          (target.name && target.name.includes('Capital Withdrawn'))) {
        linkExtra.color = '#ff7f0e'; // Orange color matching treemap
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
          ? (this.getCssVariable('--red-link') || '#DC2626')
          : (this.getCssVariable('--green-link') || '#059669');
        return;
      }
      
      // Get x positions of source and target nodes
      const sourceX = source.x0 !== undefined ? source.x0 : (source.x1 || 0);
      const targetX = target.x0 !== undefined ? target.x0 : (target.x1 || 0);
      
      // Link is green if source or target is to the right of Reallocation Pool
      if (sourceX > reallocationPoolX || targetX > reallocationPoolX) {
        // Links to the right of Reallocation Pool are green
        linkExtra.color = this.getCssVariable('--green-link') || '#059669';
      } else {
        // Links to the left of Reallocation Pool are red
        linkExtra.color = this.getCssVariable('--red-link') || '#DC2626';
      }
    });

    // -----------------------------------------
    // 4. Draw Links
    // -----------------------------------------
    // Capture component reference for use in callbacks
    const component = this;
    
    zoomGroup.append('g')
      .selectAll('path')
      .data(graph.links)
      .enter()
      .append('path')
      .attr('d', sankeyLinkHorizontal())
      .attr('stroke', d => (d as SankeyLinkExtra).color || this.getCssVariable('--default-gray') || '#999')
      .attr('stroke-width', d => Math.max(1, (d as SankeyLinkExtra).width || 1))
      .attr('fill', 'none')
      .attr('opacity', 0.45)
      .style('cursor', 'pointer')
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
          .style('opacity', 1)
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
        zoomGroup.selectAll('path')
          .filter(function() { return this !== d3.select(event.currentTarget).node(); })
          .attr('opacity', 0.2);
      })
      .on('mousemove', function(event) {
        tooltip
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', function() {
        tooltip
          .style('opacity', 0)
          .style('display', 'none');
        d3.select(this)
          .attr('opacity', 0.45)
          .attr('stroke-width', (d: any) => Math.max(1, (d as SankeyLinkExtra).width || 1));
        
        // Restore all links opacity
        zoomGroup.selectAll('path').attr('opacity', 0.45);
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
    // 6. Color mapping function for nodes
    // -----------------------------------------
    const getCssVar = (name: string, fallback: string) => {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value || fallback;
    };
    
    const getNodeColor = (nodeName: string): { fill: string; stroke: string; hoverFill: string; hoverStroke: string } => {
      // Reallocation Pool
      if (nodeName.includes('Reallocation Pool')) {
        return {
          fill: getCssVar('--orange-primary', '#f59e0b'),
          stroke: getCssVar('--orange-primary-dark', '#d97706'),
          hoverFill: getCssVar('--orange-primary-hover', '#fbbf24'),
          hoverStroke: getCssVar('--orange-primary', '#f59e0b')
        };
      }
      // Net New Capital
      if (nodeName.includes('Net New Capital')) {
        return {
          fill: getCssVar('--green-dark', '#10b981'),
          stroke: getCssVar('--green-darker', '#059669'),
          hoverFill: getCssVar('--green-hover', '#34d399'),
          hoverStroke: getCssVar('--green-dark', '#10b981')
        };
      }
      // Capital Withdrawn
      if (nodeName.includes('Capital Withdrawn')) {
        return {
          fill: '#ff7f0e', // Orange color matching treemap
          stroke: '#e6730c',
          hoverFill: '#ff9933',
          hoverStroke: '#ff7f0e'
        };
      }
      // Super Start/End
      if (nodeName.includes('Super Start') || nodeName.includes('Super End')) {
        return {
          fill: getCssVar('--blue-primary', '#3b82f6'),
          stroke: getCssVar('--blue-primary-dark', '#2563eb'),
          hoverFill: getCssVar('--blue-primary-hover', '#60a5fa'),
          hoverStroke: getCssVar('--blue-primary', '#3b82f6')
        };
      }
      
      // Source/Destination nodes - match parent node colors
      const parentType = nodeParentTypeMap.get(nodeName);
      if (parentType) {
        if (parentType === 'Equity') {
          return {
            fill: '#5093b3',
            stroke: '#0284c7',
            hoverFill: '#38bdf8',
            hoverStroke: '#5093b3'
          };
        }
        if (parentType === 'Fixed Income') {
          return {
            fill: getCssVar('--purple-primary', '#8b5cf6'),
            stroke: getCssVar('--purple-primary-dark', '#7c3aed'),
            hoverFill: getCssVar('--purple-primary-hover', '#a78bfa'),
            hoverStroke: getCssVar('--purple-primary', '#8b5cf6')
          };
        }
        if (parentType === 'Cash') {
          return {
            fill: getCssVar('--cyan-primary', '#06b6d4'),
            stroke: getCssVar('--cyan-primary-dark', '#0891b2'),
            hoverFill: getCssVar('--cyan-primary-hover', '#22d3ee'),
            hoverStroke: getCssVar('--cyan-primary', '#06b6d4')
          };
        }
        if (parentType === 'Multi-Asset') {
          return {
            fill: '#ec4899',
            stroke: '#db2777',
            hoverFill: '#f472b6',
            hoverStroke: '#ec4899'
          };
        }
        if (parentType === 'Alternatives') {
          return {
            fill: '#6366f1',
            stroke: '#4f46e5',
            hoverFill: '#818cf8',
            hoverStroke: '#6366f1'
          };
        }
        if (parentType === 'Other / Specialized') {
          return {
            fill: '#f59e0b',
            stroke: '#d97706',
            hoverFill: '#fbbf24',
            hoverStroke: '#f59e0b'
          };
        }
        if (parentType === 'Private Markets') {
          return {
            fill: '#14b8a6',
            stroke: '#0d9488',
            hoverFill: '#2dd4bf',
            hoverStroke: '#14b8a6'
          };
        }
      }
      
      // Start/End nodes (Parent nodes) - each with distinct colors
      if (nodeName.includes('(Start)') || nodeName.includes('(End)')) {
        if (nodeName.includes('Equity')) {
          return {
            fill: '#5093b3', // Sky Blue - bright and distinct
            stroke: '#0284c7',
            hoverFill: '#38bdf8',
            hoverStroke: '#5093b3'
          };
        }
        if (nodeName.includes('Fixed Income')) {
          return {
            fill: getCssVar('--purple-primary', '#8b5cf6'),
            stroke: getCssVar('--purple-primary-dark', '#7c3aed'),
            hoverFill: getCssVar('--purple-primary-hover', '#a78bfa'),
            hoverStroke: getCssVar('--purple-primary', '#8b5cf6')
          };
        }
        if (nodeName.includes('Cash')) {
          return {
            fill: getCssVar('--cyan-primary', '#06b6d4'),
            stroke: getCssVar('--cyan-primary-dark', '#0891b2'),
            hoverFill: getCssVar('--cyan-primary-hover', '#22d3ee'),
            hoverStroke: getCssVar('--cyan-primary', '#06b6d4')
          };
        }
        if (nodeName.includes('Multi-Asset')) {
          return {
            fill: '#ec4899', // Pink
            stroke: '#db2777',
            hoverFill: '#f472b6',
            hoverStroke: '#ec4899'
          };
        }
        if (nodeName.includes('Alternatives')) {
          return {
            fill: '#6366f1', // Indigo
            stroke: '#4f46e5',
            hoverFill: '#818cf8',
            hoverStroke: '#6366f1'
          };
        }
        if (nodeName.includes('Other / Specialized')) {
          return {
            fill: '#f59e0b', // Amber
            stroke: '#d97706',
            hoverFill: '#fbbf24',
            hoverStroke: '#f59e0b'
          };
        }
        if (nodeName.includes('Private Markets')) {
          return {
            fill: '#14b8a6', // Teal
            stroke: '#0d9488',
            hoverFill: '#2dd4bf',
            hoverStroke: '#14b8a6'
          };
        }
      }
      
      // Default color for Source/Destination nodes that weren't mapped
      if (nodeName.includes('(Source)') || nodeName.includes('(Destination)')) {
        return {
          fill: getCssVar('--gray-medium', '#6b7280'),
          stroke: getCssVar('--gray-dark', '#4b5563'),
          hoverFill: getCssVar('--gray-light', '#9ca3af'),
          hoverStroke: getCssVar('--gray-medium', '#6b7280')
        };
      }
      
      // Default color
      return {
        fill: getCssVar('--gray-medium', '#6b7280'),
        stroke: getCssVar('--gray-dark', '#4b5563'),
        hoverFill: getCssVar('--gray-light', '#9ca3af'),
        hoverStroke: getCssVar('--gray-medium', '#6b7280')
      };
    };

    // -----------------------------------------
    // 7. Draw Nodes
    // -----------------------------------------
    zoomGroup.append('g')
      .selectAll('rect')
      .data(graph.nodes)
      .enter()
      .append('rect')
      .attr('x', d => d.x0!)
      .attr('y', d => d.y0!)
      .attr('height', d => d.y1! - d.y0!)
      .attr('width', d => d.x1! - d.x0!)
      .attr('fill', d => {
        const colors = getNodeColor(d.name);
        return colors.fill;
      })
      .attr('stroke', d => {
        const colors = getNodeColor(d.name);
        return colors.stroke;
      })
      .attr('data-original-fill', d => {
        const colors = getNodeColor(d.name);
        return colors.fill;
      })
      .attr('data-original-stroke', d => {
        const colors = getNodeColor(d.name);
        return colors.stroke;
      })
      .style('cursor', 'pointer')
      .on('mouseover', function(event, d) {
        const node = d as SankeyNodeExtra;
        const value = nodeValues.get(node) || 0;
        const formattedValue = value >= 0.1 ? value.toFixed(2) : value.toFixed(3);
        const incoming = nodeIncoming.get(node) || 0;
        const outgoing = nodeOutgoing.get(node) || 0;
        const colors = getNodeColor(node.name);
        
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
          .style('opacity', 1)
          .style('display', 'block')
          .html(tooltipHtml);
        
        // Highlight the hovered node
        d3.select(this)
          .attr('fill', colors.hoverFill)
          .attr('stroke', colors.hoverStroke)
          .attr('stroke-width', 3)
          .raise(); // Bring to front
        
        // Highlight connected links
        const nodeLinks = graph.links.filter(link => 
          (link.source as SankeyNodeExtra) === node || (link.target as SankeyNodeExtra) === node
        );
        
        zoomGroup.selectAll('path')
          .filter(function(link: any) {
            return nodeLinks.includes(link as SankeyLinkExtra);
          })
          .attr('opacity', 0.8)
          .attr('stroke-width', (link: any) => {
            const baseWidth = Math.max(1, ((link as SankeyLinkExtra).width || 1));
            return baseWidth + 1;
          });
        
        // Dim other nodes and links
        zoomGroup.selectAll('rect')
          .filter(function() { return this !== d3.select(event.currentTarget).node(); })
          .attr('opacity', 0.3);
        
        zoomGroup.selectAll('path')
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
        tooltip
          .style('opacity', 0)
          .style('display', 'none');
        const originalFill = d3.select(this).attr('data-original-fill');
        const originalStroke = d3.select(this).attr('data-original-stroke');
        d3.select(this)
          .attr('fill', originalFill)
          .attr('stroke', originalStroke)
          .attr('stroke-width', 1);
        
        // Restore all nodes and links opacity
        zoomGroup.selectAll('rect').attr('opacity', 1);
        zoomGroup.selectAll('path').attr('opacity', 0.45).attr('stroke-width', (d: any) => Math.max(1, (d as SankeyLinkExtra).width || 1));
      });

    // -----------------------------------------
    // 8. Node Labels (with values inline)
    // -----------------------------------------
    const nodeLabels = zoomGroup.append('g')
      .selectAll('text')
      .data(graph.nodes)
      .enter()
      .append('text')
      .attr('x', d => {
        // Position labels based on node type
        if (d.name.includes('(Source)')) {
          return d.x1! + 12;
        } else if (d.name.includes('(Destination)')) {
          return d.x0! - 12;
        } else {
          return (d.x0! + d.x1!) / 2;
        }
      })
      .attr('y', d => (d.y0! + d.y1!) / 2)
      .attr('text-anchor', d => {
        if (d.name.includes('(Source)')) return 'start';
        if (d.name.includes('(Destination)')) return 'end';
        return 'middle';
      })
      .attr('alignment-baseline', 'middle')
      .style('font-size', '14px')
      .style('font-weight', '600')
      .style('fill', this.getCssVariable('--text-primary') || '#1f2937')
      .style('pointer-events', 'none')
      .style('text-shadow', '0 0 3px rgba(255,255,255,0.9), 0 0 3px rgba(255,255,255,0.9)');
    
    // Add label text
    nodeLabels.append('tspan')
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
      .attr('dx', '4px')
      .style('font-weight', 'bold')
      .text(d => {
        const value = nodeValues.get(d) || 0;
        const formattedValue = value >= 0.1 ? value.toFixed(2) : value.toFixed(3);
        // Add negative sign for nodes to the left of Reallocation Pool
        const nodeX = d.x0 !== undefined ? d.x0 : (d.x1 || 0);
        const isLeftOfReallocation = reallocationPoolX !== null && nodeX < reallocationPoolX;
        const sign = isLeftOfReallocation ? '-' : '';
        return '$' + sign + formattedValue + 'B';
      });

    // -----------------------------------------
    // 8.5. Add "Outflows" and "Inflows" labels above the chart
    // -----------------------------------------
    if (reallocationPoolNode && reallocationPoolX !== null) {
      const labelY = 20; // Position above the chart area, within the top margin
      const reallocationX1 = reallocationPoolNode.x1 || reallocationPoolX;
      const reallocationCenterX = (reallocationPoolX + reallocationX1) / 2;
      
      // Calculate positions: left side for Outflows, right side for Inflows
      const leftSideCenter = leftMargin + (reallocationCenterX - leftMargin) / 2;
      const rightSideCenter = reallocationCenterX + (width - rightMargin - reallocationCenterX) / 2;
      
      // Add "Outflows" label on the left side above the chart
      zoomGroup.append('text')
        .attr('x', leftSideCenter)
        .attr('y', labelY)
        .attr('text-anchor', 'middle')
        .attr('alignment-baseline', 'middle')
        .style('font-size', '18px')
        .style('font-weight', 'bold')
        .style('fill', this.getCssVariable('--red-link') || '#DC2626')
        .style('pointer-events', 'none')
        .style('text-shadow', '0 0 3px rgba(255,255,255,0.8), 0 0 3px rgba(255,255,255,0.8)')
        .text('Outflows');
      
      // Add "Inflows" label on the right side above the chart
      zoomGroup.append('text')
        .attr('x', rightSideCenter)
        .attr('y', labelY)
        .attr('text-anchor', 'middle')
        .attr('alignment-baseline', 'middle')
        .style('font-size', '18px')
        .style('font-weight', 'bold')
        .style('fill', this.getCssVariable('--green-link') || '#059669')
        .style('pointer-events', 'none')
        .style('text-shadow', '0 0 3px rgba(255,255,255,0.8), 0 0 3px rgba(255,255,255,0.8)')
        .text('Inflows');
    }

    // -----------------------------------------
    // 9. Link Values (on the links) - Only show for larger flows to avoid crowding
    // -----------------------------------------
    // Filter links to only show values for significant flows to reduce crowding
    // Sort by value and only show top links to avoid overlap
    const sortedLinks = [...graph.links].sort((a, b) => (b as SankeyLinkExtra).value - (a as SankeyLinkExtra).value);
    
    // Only show values for links with value >= 20.0, and limit to top 8 to avoid crowding
    // This significantly reduces visual clutter while keeping only the most important flows visible
    const significantLinks = sortedLinks
      .filter(link => (link as SankeyLinkExtra).value >= 20.0)
      .slice(0, 8);

    // Function to check if a link value position would be too close to a node label
    const isTooCloseToNode = (link: any, node: SankeyNodeExtra, threshold: number = 25): boolean => {
      const linkX = ((link.source as SankeyNodeExtra).x1! + (link.target as SankeyNodeExtra).x0!) / 2;
      const linkY = (((link.source as SankeyNodeExtra).y0! + (link.source as SankeyNodeExtra).y1!) / 2 + 
                    ((link.target as SankeyNodeExtra).y0! + (link.target as SankeyNodeExtra).y1!) / 2) / 2;
      
      // Check distance from link center to node edges
      const distToNodeX = Math.min(
        Math.abs(linkX - node.x0!),
        Math.abs(linkX - node.x1!)
      );
      const distToNodeY = Math.min(
        Math.abs(linkY - node.y0!),
        Math.abs(linkY - node.y1!)
      );
      
      // If link is very close to a node (within threshold), skip showing the value
      return distToNodeX < threshold || distToNodeY < threshold;
    };

    // Filter out links that are too close to nodes to avoid overlap with labels
    const displayableLinks = significantLinks.filter(link => {
      const source = link.source as SankeyNodeExtra;
      const target = link.target as SankeyNodeExtra;
      // Skip if too close to source or target node
      return !isTooCloseToNode(link, source, 30) && !isTooCloseToNode(link, target, 30);
    });

    zoomGroup.append('g')
      .selectAll('text')
      .data(displayableLinks)
      .enter()
      .append('text')
      .attr('x', d => {
        const sourceX = (d.source as SankeyNodeExtra).x1!;
        const targetX = (d.target as SankeyNodeExtra).x0!;
        return (sourceX + targetX) / 2;
      })
      .attr('y', d => {
        const sourceY = ((d.source as SankeyNodeExtra).y0! + (d.source as SankeyNodeExtra).y1!) / 2;
        const targetY = ((d.target as SankeyNodeExtra).y0! + (d.target as SankeyNodeExtra).y1!) / 2;
        return (sourceY + targetY) / 2;
      })
      .attr('text-anchor', 'middle')
      .attr('alignment-baseline', 'middle')
      .style('font-size', '14px')
      .style('fill', this.getCssVariable('--text-primary') || '#1f2937')
      .style('font-weight', '700')
      .style('pointer-events', 'none')
      .style('text-shadow', '0 0 3px rgba(255,255,255,0.9), 0 0 3px rgba(255,255,255,0.9)')
      .text(d => {
        const value = (d as SankeyLinkExtra).value;
        return value >= 0.1 ? value.toFixed(1) + 'B' : value.toFixed(2) + 'B';
      });

    // -----------------------------------------
    // 10. Legend
    // -----------------------------------------
    // Only show legend if showLegend input is true
    if (this.showLegend) {
      // Build legend data based on node types in the diagram
      const legendData: Array<{ label: string; color: string }> = [];

    // Always include special nodes
    legendData.push(
      { label: 'Reallocation Pool', color: getCssVar('--orange-primary', '#f59e0b') },
      { label: 'Net New Capital', color: getCssVar('--green-dark', '#10b981') }
    );

    // Check if Capital Withdrawn nodes are present
    const hasCapitalWithdrawn = graph.nodes.some(node => 
      node.name && node.name.includes('Capital Withdrawn')
    );
    if (hasCapitalWithdrawn) {
      legendData.push({ label: 'Capital Withdrawn', color: '#ff7f0e' });
    }

    // Add node type categories
    const nodeTypeMap: Record<string, string> = {
      'Super Start': getCssVar('--blue-primary', '#3b82f6'),
      'Super End': getCssVar('--blue-primary', '#3b82f6'),
      'Equity (Start)': getCssVar('--blue-primary', '#3b82f6'),
      'Equity (End)': getCssVar('--blue-primary', '#3b82f6'),
      'Fixed Income (Start)': getCssVar('--purple-primary', '#8b5cf6'),
      'Fixed Income (End)': getCssVar('--purple-primary', '#8b5cf6'),
      'Cash (Start)': getCssVar('--cyan-primary', '#06b6d4'),
      'Cash (End)': getCssVar('--cyan-primary', '#06b6d4'),
      '(Source)': getCssVar('--red-primary', '#ef4444'),
      '(Destination)': getCssVar('--green-primary', '#22c55e')
    };

    // Check which node types are present
    const presentTypes = new Set<string>();
    graph.nodes.forEach(node => {
      if (node.name.includes('Super Start') || node.name.includes('Super End')) {
        presentTypes.add('Super Start/End');
      } else if (node.name.includes('Equity (Start)') || node.name.includes('Equity (End)')) {
        presentTypes.add('Equity');
      } else if (node.name.includes('Fixed Income (Start)') || node.name.includes('Fixed Income (End)')) {
        presentTypes.add('Fixed Income');
      } else if (node.name.includes('Cash (Start)') || node.name.includes('Cash (End)')) {
        presentTypes.add('Cash');
      } else if (node.name.includes('Multi-Asset (Start)') || node.name.includes('Multi-Asset (End)')) {
        presentTypes.add('Multi-Asset');
      } else if (node.name.includes('Alternatives (Start)') || node.name.includes('Alternatives (End)')) {
        presentTypes.add('Alternatives');
      } else if (node.name.includes('Other / Specialized (Start)') || node.name.includes('Other / Specialized (End)')) {
        presentTypes.add('Other / Specialized');
      } else if (node.name.includes('Private Markets (Start)') || node.name.includes('Private Markets (End)')) {
        presentTypes.add('Private Markets');
      } else if (node.name.includes('(Source)')) {
        presentTypes.add('Source');
      } else if (node.name.includes('(Destination)')) {
        presentTypes.add('Destination');
      }
    });

    // Add present types to legend
    if (presentTypes.has('Super Start/End')) {
      legendData.push({ label: 'Super Start/End', color: getCssVar('--blue-primary', '#3b82f6') });
    }
    if (presentTypes.has('Equity')) {
      legendData.push({ label: 'Equity', color: '#5093b3' });
    }
    if (presentTypes.has('Fixed Income')) {
      legendData.push({ label: 'Fixed Income', color: getCssVar('--purple-primary', '#8b5cf6') });
    }
    if (presentTypes.has('Cash')) {
      legendData.push({ label: 'Cash', color: getCssVar('--cyan-primary', '#06b6d4') });
    }
    if (presentTypes.has('Multi-Asset')) {
      legendData.push({ label: 'Multi-Asset', color: '#ec4899' });
    }
    if (presentTypes.has('Alternatives')) {
      legendData.push({ label: 'Alternatives', color: '#6366f1' });
    }
    if (presentTypes.has('Other / Specialized')) {
      legendData.push({ label: 'Other / Specialized', color: '#f59e0b' });
    }
    if (presentTypes.has('Private Markets')) {
      legendData.push({ label: 'Private Markets', color: '#14b8a6' });
    }
    if (presentTypes.has('Source')) {
      legendData.push({ label: 'Source', color: getCssVar('--red-primary', '#ef4444') });
    }
    if (presentTypes.has('Destination')) {
      legendData.push({ label: 'Destination', color: getCssVar('--green-primary', '#22c55e') });
    }

    // Add link type colors
    legendData.push(
      { label: 'Outflow', color: getCssVar('--red-link', '#DC2626') },
      { label: 'Reallocation', color: getCssVar('--green-link', '#059669') },
      { label: 'New Capital', color: getCssVar('--blue-link', 'rgba(0,100,200,0.7)') }
    );

    // Spacing: more room per item and between square and label so legend doesn't look crowded
    const legendSquareSize = 12;
    const gapBetweenSquareAndLabel = 10;
    const legendItemWidth = 165; // Horizontal space per entry
    const totalLegendWidth = legendData.length * legendItemWidth;
    const legendStartX = Math.max(10, (width - totalLegendWidth) / 2);
    
    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${80}, ${height - bottomMargin - legendBottomOffset})`);

    const legendItems = legend.selectAll('.legend-item')
      .data(legendData)
      .enter()
      .append('g')
      .attr('class', 'legend-item')
      .attr('transform', (d, i) => {
        return `translate(${i * legendItemWidth}, 0)`;
      });

    // Add colored rectangles
    legendItems.append('rect')
      .attr('width', legendSquareSize)
      .attr('height', legendSquareSize)
      .attr('x', 0)
      .attr('y', 0)
      .attr('fill', d => d.color)
      .attr('stroke', d => {
        // Use darker stroke for better visibility
        if (d.label === 'Reallocation Pool') return getCssVar('--orange-primary-dark', '#d97706');
        if (d.label === 'Net New Capital') return getCssVar('--green-darker', '#059669');
        if (d.label === 'Capital Withdrawn') return '#e6730c';
        if (d.label === 'Super Start/End') return getCssVar('--blue-primary-dark', '#2563eb');
        if (d.label === 'Equity') return '#0284c7';
        if (d.label === 'Fixed Income') return getCssVar('--purple-primary-dark', '#7c3aed');
        if (d.label === 'Cash') return getCssVar('--cyan-primary-dark', '#0891b2');
        if (d.label === 'Multi-Asset') return '#db2777';
        if (d.label === 'Alternatives') return '#4f46e5';
        if (d.label === 'Other / Specialized') return '#d97706';
        if (d.label === 'Private Markets') return '#0d9488';
        if (d.label === 'Source') return getCssVar('--red-primary-dark', '#dc2626');
        if (d.label === 'Destination') return getCssVar('--green-primary-dark', '#16a34a');
        if (d.label === 'Outflow') return getCssVar('--red-link', '#DC2626');
        if (d.label === 'Reallocation') return getCssVar('--green-link', '#059669');
        if (d.label === 'New Capital') return getCssVar('--blue-link', 'rgba(0,100,200,0.7)');
        return getCssVar('--gray-dark', '#4b5563');
      })
      .attr('stroke-width', 1);

    // Add labels – match chart label styling; position after square with comfortable gap
    legendItems.append('text')
      .attr('x', legendSquareSize + gapBetweenSquareAndLabel)
      .attr('y', legendSquareSize / 2)
      .attr('alignment-baseline', 'middle')
      .style('font-size', '15x')
      .style('font-weight', '500')
      .style('fill', this.getCssVariable('--text-primary') || '#1f2937')
      .style('white-space', 'nowrap')
      .style('text-shadow', '0 0 3px rgba(255,255,255,0.9), 0 0 3px rgba(255,255,255,0.9)')
      .style('font-family', 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif')
      .text(d => {
        // Truncate long labels if needed
        const maxLength = 18;
        return d.label.length > maxLength ? d.label.substring(0, maxLength) + '...' : d.label;
      });
    }
  }

  // -----------------------------------------
  // Setup Zoom Controls
  // -----------------------------------------
  private setupZoomControls(): void {
    const container = this.el.nativeElement.querySelector('.sankey-container');
    if (!container) return;

    const zoomInBtn = container.querySelector('.zoom-in');
    const zoomOutBtn = container.querySelector('.zoom-out');
    const zoomResetBtn = container.querySelector('.zoom-reset');

    if (!this.currentZoom || !zoomInBtn || !zoomOutBtn || !zoomResetBtn) return;

    const { zoom, svg } = this.currentZoom;

    // Zoom in button
    zoomInBtn.addEventListener('click', () => {
      svg.transition().duration(300).call(zoom.scaleBy, 1.3);
    });

    // Zoom out button
    zoomOutBtn.addEventListener('click', () => {
      svg.transition().duration(300).call(zoom.scaleBy, 0.7);
    });

    // Reset zoom button
    zoomResetBtn.addEventListener('click', () => {
      svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
    });
  }
  
  ngOnDestroy(): void {
    // Clean up tooltip when component is destroyed
    d3.select('body').select(`#${this.tooltipId}`).remove();
  }
}

