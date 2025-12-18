/* eslint-disable */
import { Component, ElementRef, AfterViewInit, Input, OnChanges, SimpleChanges } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import * as d3 from 'd3';
import {
  sankey,
  sankeyLinkHorizontal,
  SankeyNode,
  SankeyLink,
  SankeyGraph
} from 'd3-sankey';

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
}

interface RegionalSankeyData {
  nodes: Array<{ name: string }>;
  links: Array<{ source: string; target: string; value: number }>;
  summary?: any;
}

// ----------------------
// Angular Component
// ----------------------
@Component({
  selector: 'app-regional-sankey-diagram',
  standalone: true,
  imports: [],
  templateUrl: './regional-sankey-diagram.component.html',
  styleUrl: './regional-sankey-diagram.component.scss',
  providers: []
})
export class RegionalSankeyDiagramComponent implements AfterViewInit, OnChanges {
  @Input() data?: RegionalSankeyData;
  private loadedData?: RegionalSankeyData;

  constructor(
    private el: ElementRef,
    private http: HttpClient
  ) {}

  ngAfterViewInit(): void {
    // If data is provided via input, use it; otherwise load from JSON
    if (this.data) {
      this.loadedData = this.data;
      setTimeout(() => {
        this.createSankey();
      }, 0);
    } else {
      this.loadDataFromJson();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.data) {
      this.loadedData = this.data;
      if (this.el?.nativeElement) {
        setTimeout(() => {
          this.createSankey();
        }, 0);
      }
    }
  }

  private loadDataFromJson(): void {
    this.http.get<RegionalSankeyData>('assets/data/sankey_data.json').subscribe({
      next: (data) => {
        this.loadedData = data;
        setTimeout(() => {
          this.createSankey();
        }, 0);
      },
      error: (error) => {
        console.error('Error loading sankey data:', error);
      }
    });
  }

    // Helper function to get CSS variable value
    private getCssVariable(name: string): string {
      return getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
    }

    // Helper function to format node name for display
    private formatNodeName(name: string): string {
      // Replace "United States" with "U.S" and "United Kingdom" with "U.K"
      let formatted = name.replace(/United States/g, 'U.S');
      formatted = formatted.replace(/United Kingdom/g, 'U.K');
      return formatted;
    }

  // -----------------------------------------
  // MAIN FUNCTION
  // -----------------------------------------
  private createSankey() {
    const dataToUse = this.loadedData || this.data;
    if (!dataToUse) return;

    const element = this.el.nativeElement.querySelector('.regional-sankey');
    
    // Clear any existing SVG
    d3.select(element).select('svg').remove();
    
    // Get the container width dynamically
    const nativeRect = this.el.nativeElement.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    
    // Get the full container width, ensuring we use 100% of available space
    const containerWidth = elementRect.width > 0 ? elementRect.width : 
                          nativeRect.width > 0 ? nativeRect.width : 
                          element.clientWidth || 
                          element.offsetWidth || 
                          this.el.nativeElement.clientWidth || 
                          this.el.nativeElement.offsetWidth ||
                          window.innerWidth || 1600;
    const width = containerWidth;
    const height = 600; // Optimized height to prevent scrolling

    // Get CSS variable values
    const overlayDarker = this.getCssVariable('--overlay-darker');
    const bgWhite = this.getCssVariable('--bg-white');

    // Create tooltip
    const tooltip = d3.select(element)
      .append('div')
      .attr('class', 'sankey-tooltip')
      .style('position', 'absolute')
      .style('background-color', overlayDarker || 'rgba(0, 0, 0, 0.85)')
      .style('color', bgWhite || 'white')
      .style('padding', '8px 12px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', 10000)
      .style('box-shadow', '0 2px 8px rgba(0,0,0,0.3)')
      .style('white-space', 'nowrap')
      .style('display', 'block');

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
    const links: SankeyLinkExtra[] = dataToUse.links.map(link => {
      const sourceIndex = nodeMap.get(link.source);
      const targetIndex = nodeMap.get(link.target);
      
      if (sourceIndex === undefined || targetIndex === undefined) {
        return null;
      }

      // Determine link color based on node types
      let linkColor = this.getCssVariable('--gray-medium') || '#999';
      
      // Red for outflows (Source -> Reallocation Pool)
      if (link.source.includes('(Source)') && link.target.includes('Reallocation Pool')) {
        linkColor = this.getCssVariable('--red-link') || '#DC2626';
      }
      // Green for reallocation flows (Reallocation Pool -> Destination)
      else if (link.source.includes('Reallocation Pool') && link.target.includes('(Destination)')) {
        linkColor = this.getCssVariable('--green-link') || '#059669';
      }
      // Blue for new capital flows
      else if (link.source.includes('Net New Capital') || link.target.includes('Net New Capital')) {
        linkColor = this.getCssVariable('--blue-link') || 'rgba(0,100,200,0.7)';
      }
      // Default for other flows
      else {
        linkColor = this.getCssVariable('--gray-medium') || '#999';
      }

      return {
        source: sourceIndex,
        target: targetIndex,
        value: link.value,
        color: linkColor
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
    // 3. Create SVG
    // -----------------------------------------
    const svg = d3.select(element)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'none')
      .style('display', 'block')
      .style('width', '100%')
      .style('height', 'auto');

    const leftMargin = 0;
    const rightMargin = 0;
    const topMargin = 10;
    const bottomMargin = 50;
    
    const sankeyGen = sankey<SankeyNodeExtra, SankeyLinkExtra>()
      .nodeWidth(20)
      .nodePadding(10)
      .extent([[leftMargin, topMargin], [width - rightMargin, height - bottomMargin]]);

    const graph = sankeyGen(graphData);

    // -----------------------------------------
    // 4. Draw Links
    // -----------------------------------------
    // Capture component reference for use in callbacks
    const component = this;
    
    svg.append('g')
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
        
        tooltip
          .style('opacity', 1)
          .html(`
            <div><strong>${component.formatNodeName(source.name)}</strong> → <strong>${component.formatNodeName(target.name)}</strong></div>
            <div style="margin-top: 4px;">Value: $${formattedValue}B</div>
          `);
        
        // Highlight the hovered link
        d3.select(this)
          .attr('opacity', 1)
          .attr('stroke-width', (d: any) => {
            const baseWidth = Math.max(1, ((d as SankeyLinkExtra).width || 1));
            return baseWidth + 3; // More prominent hover effect
          })
          .raise(); // Bring to front
        
        // Dim other links slightly
        svg.selectAll('path')
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
        svg.selectAll('path').attr('opacity', 0.45);
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
      // Super Start/End
      if (nodeName.includes('Super Start') || nodeName.includes('Super End')) {
        return {
          fill: getCssVar('--blue-primary', '#3b82f6'),
          stroke: getCssVar('--blue-primary-dark', '#2563eb'),
          hoverFill: getCssVar('--blue-primary-hover', '#60a5fa'),
          hoverStroke: getCssVar('--blue-primary', '#3b82f6')
        };
      }
      // Start/End nodes
      if (nodeName.includes('(Start)') || nodeName.includes('(End)')) {
        if (nodeName.includes('Equity')) {
          return {
            fill: getCssVar('--blue-primary', '#3b82f6'),
            stroke: getCssVar('--blue-primary-dark', '#2563eb'),
            hoverFill: getCssVar('--blue-primary-hover', '#60a5fa'),
            hoverStroke: getCssVar('--blue-primary', '#3b82f6')
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
      }
      // Source nodes
      if (nodeName.includes('(Source)')) {
        return {
          fill: getCssVar('--red-primary', '#ef4444'),
          stroke: getCssVar('--red-primary-dark', '#dc2626'),
          hoverFill: getCssVar('--red-primary-hover', '#f87171'),
          hoverStroke: getCssVar('--red-primary', '#ef4444')
        };
      }
      // Destination nodes
      if (nodeName.includes('(Destination)')) {
        return {
          fill: getCssVar('--green-primary', '#22c55e'),
          stroke: getCssVar('--green-primary-dark', '#16a34a'),
          hoverFill: getCssVar('--green-primary-hover', '#4ade80'),
          hoverStroke: getCssVar('--green-primary', '#22c55e')
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
    svg.append('g')
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
        
        tooltip
          .style('opacity', 1)
          .style('display', 'block')
          .html(`
            <div><strong>${component.formatNodeName(node.name)}</strong></div>
            <div style="margin-top: 4px;">Total Value: $${formattedValue}B</div>
            <div style="margin-top: 2px; font-size: 11px; opacity: 0.9;">Incoming: $${incoming.toFixed(2)}B</div>
            <div style="font-size: 11px; opacity: 0.9;">Outgoing: $${outgoing.toFixed(2)}B</div>
          `);
        
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
        
        svg.selectAll('path')
          .filter(function(link: any) {
            return nodeLinks.includes(link as SankeyLinkExtra);
          })
          .attr('opacity', 0.8)
          .attr('stroke-width', (link: any) => {
            const baseWidth = Math.max(1, ((link as SankeyLinkExtra).width || 1));
            return baseWidth + 1;
          });
        
        // Dim other nodes and links
        svg.selectAll('rect')
          .filter(function() { return this !== d3.select(event.currentTarget).node(); })
          .attr('opacity', 0.3);
        
        svg.selectAll('path')
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
        svg.selectAll('rect').attr('opacity', 1);
        svg.selectAll('path').attr('opacity', 0.45).attr('stroke-width', (d: any) => Math.max(1, (d as SankeyLinkExtra).width || 1));
      });

    // -----------------------------------------
    // 8. Node Labels (with values inline)
    // -----------------------------------------
    const nodeLabels = svg.append('g')
      .selectAll('text')
      .data(graph.nodes)
      .enter()
      .append('text')
      .attr('x', d => {
        // Position labels based on node type
        if (d.name.includes('(Source)')) {
          return d.x1! + 6;
        } else if (d.name.includes('(Destination)')) {
          return d.x0! - 6;
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
      .style('font-size', '10px')
      .style('fill', this.getCssVariable('--text-primary') || '#333')
      .style('pointer-events', 'none');
    
    // Add label text
    nodeLabels.append('tspan')
      .text(d => {
        // Format the name (replace United States with U.S and United Kingdom with U.K)
        const formattedName = this.formatNodeName(d.name);
        // Truncate long labels
        const maxLength = 20;
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
        return '$' + formattedValue + 'B';
      });

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

    svg.append('g')
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
      .style('font-size', '10px')
      .style('fill', this.getCssVariable('--text-primary') || '#333')
      .style('font-weight', '600')
      .style('pointer-events', 'none')
      .style('text-shadow', '0 0 3px rgba(255,255,255,0.8), 0 0 3px rgba(255,255,255,0.8)') // White shadow for better visibility on colored links
      .text(d => {
        const value = (d as SankeyLinkExtra).value;
        return value >= 0.1 ? value.toFixed(1) + 'B' : value.toFixed(2) + 'B';
      });

    // -----------------------------------------
    // 10. Legend
    // -----------------------------------------
    // Build legend data based on node types in the diagram
    const legendData: Array<{ label: string; color: string }> = [];

    // Always include special nodes
    legendData.push(
      { label: 'Reallocation Pool', color: getCssVar('--orange-primary', '#f59e0b') },
      { label: 'Net New Capital', color: getCssVar('--green-dark', '#10b981') }
    );

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
      legendData.push({ label: 'Equity', color: getCssVar('--blue-primary', '#3b82f6') });
    }
    if (presentTypes.has('Fixed Income')) {
      legendData.push({ label: 'Fixed Income', color: getCssVar('--purple-primary', '#8b5cf6') });
    }
    if (presentTypes.has('Cash')) {
      legendData.push({ label: 'Cash', color: getCssVar('--cyan-primary', '#06b6d4') });
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

    // Calculate legend width based on text length
    const legendItemWidth = 130; // Increased width to prevent overlap
    const totalLegendWidth = legendData.length * legendItemWidth;
    const legendStartX = Math.max(10, (width - totalLegendWidth) / 2);
    
    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${10}, ${height -15})`);

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
      .attr('width', 12)
      .attr('height', 12)
      .attr('x', 0)
      .attr('y', 0)
      .attr('fill', d => d.color)
      .attr('stroke', d => {
        // Use darker stroke for better visibility
        if (d.label === 'Reallocation Pool') return getCssVar('--orange-primary-dark', '#d97706');
        if (d.label === 'Net New Capital') return getCssVar('--green-darker', '#059669');
        if (d.label === 'Super Start/End' || d.label === 'Equity') return getCssVar('--blue-primary-dark', '#2563eb');
        if (d.label === 'Fixed Income') return getCssVar('--purple-primary-dark', '#7c3aed');
        if (d.label === 'Cash') return getCssVar('--cyan-primary-dark', '#0891b2');
        if (d.label === 'Source') return getCssVar('--red-primary-dark', '#dc2626');
        if (d.label === 'Destination') return getCssVar('--green-primary-dark', '#16a34a');
        if (d.label === 'Outflow') return getCssVar('--red-link', '#DC2626');
        if (d.label === 'Reallocation') return getCssVar('--green-link', '#059669');
        if (d.label === 'New Capital') return getCssVar('--blue-link', 'rgba(0,100,200,0.7)');
        return getCssVar('--gray-dark', '#4b5563');
      })
      .attr('stroke-width', 1);

    // Add labels with better spacing
    legendItems.append('text')
      .attr('x', 16)
      .attr('y', 9)
      .attr('alignment-baseline', 'middle')
      .style('font-size', '10px')
      .style('fill', this.getCssVariable('--text-primary') || '#333')
      .style('white-space', 'nowrap')
      .text(d => {
        // Truncate long labels if needed
        const maxLength = 15;
        return d.label.length > maxLength ? d.label.substring(0, maxLength) + '...' : d.label;
      });
  }
}

