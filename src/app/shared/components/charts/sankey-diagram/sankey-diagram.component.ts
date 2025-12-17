import { Component, ElementRef, AfterViewInit, Input, OnChanges, SimpleChanges } from '@angular/core';
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

// ----------------------
// Angular Component
// ----------------------
@Component({
  selector: 'app-sankey-diagram',
  standalone: true,
  imports: [],
  templateUrl: './sankey-diagram.component.html',
  styleUrl: './sankey-diagram.component.scss'
})
export class SankeyDiagramComponent implements AfterViewInit, OnChanges {
  @Input() selectedProductTypes: string[] = [];
  @Input() selectedProductSubTypes: string[] = [];
  @Input() dataType: 'historical' | 'forecasted' = 'forecasted';
  @Input() timeHorizon: string = 'Today';

  constructor(private el: ElementRef) {}

  ngAfterViewInit(): void {
    // Use setTimeout to ensure the container is fully rendered and has its width
    setTimeout(() => {
      this.createSankey();
    }, 0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Recreate the sankey diagram when filters, data type, or time horizon change
    if (changes['selectedProductTypes'] || changes['selectedProductSubTypes'] || 
        changes['dataType'] || changes['timeHorizon']) {
      if (this.el?.nativeElement) {
        setTimeout(() => {
          this.createSankey();
        }, 0);
      }
    }
  }

  // Helper function to get CSS variable value
  private getCssVariable(name: string): string {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
  }

  // -----------------------------------------
  // MAIN FUNCTION
  // -----------------------------------------
  private createSankey() {
    const element = this.el.nativeElement.querySelector('.sankey');
    
    // Clear any existing SVG
    d3.select(element).select('svg').remove();
    
    // Get the container width dynamically - use 100% of container
    // Use the native element (component root) width, which should be 100% of its parent
    const nativeRect = this.el.nativeElement.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    
    // Prefer the actual rendered width from getBoundingClientRect
    const containerWidth = elementRect.width > 0 ? elementRect.width : 
                          nativeRect.width > 0 ? nativeRect.width :
                          element.clientWidth || 
                          element.offsetWidth || 
                          this.el.nativeElement.clientWidth || 
                          this.el.nativeElement.offsetWidth ||
                          1600;
    const width = containerWidth; // Use full container width (100%)
    const height = 700; // Reduced height to prevent scrolling

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
    // 1. RAW DATA (converted from Python rows)
    // -----------------------------------------
    // Helper function to get data based on dataType and timeHorizon
    const getDataByTimeHorizon = (): [string, string, number][] => {
      // Base data structure
      const baseData: [string, string, number][] = [
        ["Equity", "US Equity Small Cap", 0],
        ["Equity", "US Equity Large Cap", 0],
        ["Equity", "Global Equity", 0],
        ["Equity", "Emerging Markets", 0],
        ["Equity", "Mid Cap Growth", 0],
        ["Fixed Income", "Core Investment Grade", 0],
        ["Fixed Income", "Municipal Bond", 0],
        ["Fixed Income", "Global Bonds", 0],
        ["Fixed Income", "Short Duration", 0],
        ["Fixed Income", "High Yield Bonds", 0],
        ["Fixed Income", "Government/Sovereign", 0],
        ["Fixed Income", "Credit Long Duration", 0],
        ["Alternatives", "Hedge Funds", 0],
        ["Alternatives", "Crypto", 0],
        ["Alternatives", "Commodities", 0],
        ["Cash", "Money Market Funds", 0],
        ["Cash", "Treasury Bills", 0],
        ["Cash", "Bank Deposits / CDs", 0],
        ["Cash", "Foreign Currency / FFX", 0],
        ["Private Markets", "Private Credit", 0],
        ["Private Markets", "Venture Capital", 0],
        ["Private Markets", "Co-Investment", 0],
        ["Private Markets", "Private Equity", 0],
        ["Real Estate", "Single-family homes", 0],
        ["Real Estate", "Multi-family homes", 0],
        ["Real Estate", "Condominiums", 0],
        ["Real Estate", "Townhouses", 0],
        ["Other / Specialized", "Overlay Strategies", 0],
        ["Other / Specialized", "Factor Based Investing", 0],
        ["Multi-Asset", "Diversified Growth Funds", 0],
        ["Multi-Asset", "Target Date Funds", 0],
      ];

      // Time horizon multipliers (scales data based on time period)
      const getTimeMultiplier = (): number => {
        if (this.dataType === 'historical') {
          // Historical: longer periods have larger absolute values
          if (this.timeHorizon === '-3 mo') return 0.3;
          if (this.timeHorizon === '-6 mo') return 0.6;
          if (this.timeHorizon === '-9 mo') return 0.9;
          if (this.timeHorizon === '-12 mo') return 1.2;
          if (this.timeHorizon === '-18 mo') return 1.8;
          return 0.9; // default to -9 mo
        } else {
          // Forecasted: future periods have projected values
          if (this.timeHorizon === 'Today') return 1.0;
          if (this.timeHorizon === '+3 mo') return 1.1;
          if (this.timeHorizon === '+6 mo') return 1.2;
          if (this.timeHorizon === '+9 mo') return 1.3;
          if (this.timeHorizon === '+12 mo') return 1.4;
          if (this.timeHorizon === '+18 mo') return 1.6;
          return 1.0; // default to Today
        }
      };

      const multiplier = getTimeMultiplier();

      // Base values - use same values for both historical and forecasted
      // Forecasted will be similar to historical, just with different time horizon scaling
      const baseValues: Record<string, number> = {
        "Equity:US Equity Small Cap": -84.11,
        "Equity:US Equity Large Cap": -63.40,
        "Equity:Global Equity": 10.68,
        "Equity:Emerging Markets": 34.48,
        "Equity:Mid Cap Growth": 16.68,
        "Fixed Income:Core Investment Grade": 50.33,
        "Fixed Income:Municipal Bond": -43.90,
        "Fixed Income:Global Bonds": 34.73,
        "Fixed Income:Short Duration": -64.56,
        "Fixed Income:High Yield Bonds": 20.00,
        "Fixed Income:Government/Sovereign": 17.00,
        "Fixed Income:Credit Long Duration": 12.00,
        "Alternatives:Hedge Funds": 30.33,
        "Alternatives:Crypto": -23.90,
        "Alternatives:Commodities": 44.73,
        "Cash:Money Market Funds": 10.0,
        "Cash:Treasury Bills": -1.64,
        "Cash:Bank Deposits / CDs": 20.0,
        "Cash:Foreign Currency / FFX": 30.58,
        "Private Markets:Private Credit": -5.20,
        "Private Markets:Venture Capital": 15.60,
        "Private Markets:Co-Investment": -3.90,
        "Private Markets:Private Equity": 75.73,
        "Real Estate:Single-family homes": 85.20,
        "Real Estate:Multi-family homes": 35.60,
        "Real Estate:Condominiums": -13.90,
        "Real Estate:Townhouses": 55.73,
        "Other / Specialized:Overlay Strategies": -3.82,
        "Other / Specialized:Factor Based Investing": 2.60,
        "Multi-Asset:Diversified Growth Funds": -1.64,
        "Multi-Asset:Target Date Funds": 2.67,
      };

      // Apply time horizon multiplier and return data
      return baseData.map(([productType, subType]) => {
        const key = `${productType}:${subType}`;
        const baseValue = baseValues[key] || 0;
        const adjustedValue = baseValue * multiplier;
        return [productType, subType, Math.round(adjustedValue * 100) / 100] as [string, string, number];
      });
    };

    const allRows = getDataByTimeHorizon();

    // Filter rows based on selected product types and sub-types
    let rows = allRows;
    
    // Normalize strings for comparison (handles variations in spacing and slashes)
    const normalizeString = (str: string): string => {
      return str.trim()
        .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
        .replace(/\s*\/\s*/g, '/') // Normalize slashes (remove spaces around them)
        .toLowerCase();
    };

    // Filter by product type if any are selected
    if (this.selectedProductTypes && this.selectedProductTypes.length > 0) {
      const normalizedSelectedTypes = this.selectedProductTypes.map(normalizeString);
      rows = rows.filter(row => {
        const normalizedRowType = normalizeString(row[0]);
        return normalizedSelectedTypes.includes(normalizedRowType);
      });
    }

    // Filter by product sub-type if any are selected
    if (this.selectedProductSubTypes && this.selectedProductSubTypes.length > 0) {
      const normalizedSelectedSubTypes = this.selectedProductSubTypes.map(normalizeString);
      rows = rows.filter(row => {
        const normalizedRowSubType = normalizeString(row[1]);
        return normalizedSelectedSubTypes.includes(normalizedRowSubType);
      });
    }

    // -----------------------------------------
    // 2. Python logic → TypeScript conversion
    // -----------------------------------------
    function makeLabel(parent: string, child: string) {
      return `${parent}: ${child}`;
    }

    const negRows = rows.filter(r => r[2] < 0);
    const posRows = rows.filter(r => r[2] > 0);

    const totalNegAbs = negRows.reduce((s, r) => s + Math.abs(r[2]), 0);
    const totalPos = posRows.reduce((s, r) => s + r[2], 0);

    // Handle edge case: avoid division by zero
    const rebalFactor = totalPos > 0 ? totalNegAbs / totalPos : 0;

    const negLabels = negRows.map(r => makeLabel(r[0], r[1]));
    const posLabels = posRows.map(r => makeLabel(r[0], r[1]));

    const poolLabel = "Reallocation Pool";
    const newCapLabel = "Net New Capital";

    const labels = [...negLabels, poolLabel, newCapLabel, ...posLabels];

    const labelToIndex: Record<string, number> = {};
    labels.forEach((l, i) => (labelToIndex[l] = i));

    const poolIndex = labelToIndex[poolLabel];
    const newCapIndex = labelToIndex[newCapLabel];

    const nodes = labels.map(name => ({ name }));

    // -----------------------------------------
    // 3. Build D3 links (selling → pool → buying)
    // -----------------------------------------
    const links: SankeyLinkExtra[] = [];

    // Get CSS variable values for links
    const greenLink = this.getCssVariable('--green-link');
    const redLink = this.getCssVariable('--red-link');
    const blueLink = this.getCssVariable('--blue-link');

    // Selling flows → Pool
    negRows.forEach(([parent, child, value]) => {
      const lbl = makeLabel(parent, child);
      links.push({
        source: labelToIndex[lbl],
        target: poolIndex,
        value: Math.abs(value),
        color: redLink || "#DC2626" // darker red
      });
    });

    // Pool/New Capital → Buying flows
    posRows.forEach(([parent, child, v]) => {
      const lbl = makeLabel(parent, child);
      const targetIndex = labelToIndex[lbl];

      const rebalFlow = v * rebalFactor;
      const newCapFlow = v - rebalFlow;

      // Rebalancing (Pool → Target)
      links.push({
        source: poolIndex,
        target: targetIndex,
        value: rebalFlow,
        color: greenLink || "#059669" // darker green
      });

      // New Capital → Target
      if (newCapFlow > 0) {
        links.push({
          source: newCapIndex,
          target: targetIndex,
          value: newCapFlow,
          color: blueLink || "rgba(0,100,200,0.7)" // blue
        });
      }
    });

    // -----------------------------------------
    // 4. Prepare Graph for D3 Sankey
    // -----------------------------------------
    const data: SankeyGraph<SankeyNodeExtra, SankeyLinkExtra> = {
      nodes,
      links
    };

    // -----------------------------------------
    // 5. Create SVG
    // -----------------------------------------
    const svg = d3.select(element)
      .append('svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    // Calculate left margin for labels (minimal since negative labels are above links)
    const leftMargin = 10; // Minimal margin since labels are positioned above links
    const rightMargin = 0; // Use full width
    const topMargin = 10;
    const bottomMargin = 50;
    
    const sankeyGen = sankey<SankeyNodeExtra, SankeyLinkExtra>()
      .nodeWidth(25)
      .nodePadding(15)
      .extent([[leftMargin, topMargin], [width - rightMargin, height - bottomMargin]]);

    const graph = sankeyGen(data);

    // -----------------------------------------
    // 6. Draw Links
    // -----------------------------------------
    svg.append('g')
      .selectAll('path')
      .data(graph.links)
      .enter()
      .append('path')
      .attr('d', sankeyLinkHorizontal())
      .attr('stroke', d => d.color || this.getCssVariable('--default-gray') || '#999')
      .attr('stroke-width', d => Math.max(1, d.width || 1))
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
          .style('display', 'block')
          .html(`
            <div><strong>${source.name}</strong> → <strong>${target.name}</strong></div>
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
    // 7. Draw Nodes
    // -----------------------------------------
    // Calculate node values first (needed for tooltip)
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
    // Color mapping function for nodes
    // -----------------------------------------
    // Capture the helper function to access CSS variables
    const getCssVar = (name: string, fallback: string) => {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value || fallback;
    };
    
    const getNodeColor = (nodeName: string): { fill: string; stroke: string; hoverFill: string; hoverStroke: string } => {
      
      // Special nodes
      if (nodeName === 'Reallocation Pool') {
        return {
          fill: getCssVar('--orange-primary', '#f59e0b'),
          stroke: getCssVar('--orange-primary-dark', '#d97706'),
          hoverFill: getCssVar('--orange-primary-hover', '#fbbf24'),
          hoverStroke: getCssVar('--orange-primary', '#f59e0b')
        };
      }
      if (nodeName === 'Net New Capital') {
        return {
          fill: getCssVar('--green-dark', '#10b981'),
          stroke: getCssVar('--green-darker', '#059669'),
          hoverFill: getCssVar('--green-hover', '#34d399'),
          hoverStroke: getCssVar('--green-dark', '#10b981')
        };
      }
      
      // Categorize by prefix
      if (nodeName.startsWith('Equity:')) {
        return {
          fill: getCssVar('--blue-primary', '#3b82f6'),
          stroke: getCssVar('--blue-primary-dark', '#2563eb'),
          hoverFill: getCssVar('--blue-primary-hover', '#60a5fa'),
          hoverStroke: getCssVar('--blue-primary', '#3b82f6')
        };
      }
      if (nodeName.startsWith('Fixed Income:')) {
        return {
          fill: getCssVar('--purple-primary', '#8b5cf6'),
          stroke: getCssVar('--purple-primary-dark', '#7c3aed'),
          hoverFill: getCssVar('--purple-primary-hover', '#a78bfa'),
          hoverStroke: getCssVar('--purple-primary', '#8b5cf6')
        };
      }
      if (nodeName.startsWith('Cash:')) {
        return {
          fill: getCssVar('--cyan-primary', '#06b6d4'),
          stroke: getCssVar('--cyan-primary-dark', '#0891b2'),
          hoverFill: getCssVar('--cyan-primary-hover', '#22d3ee'),
          hoverStroke: getCssVar('--cyan-primary', '#06b6d4')
        };
      }
      if (nodeName.startsWith('Private Markets:')) {
        return {
          fill: getCssVar('--pink-primary', '#ec4899'),
          stroke: getCssVar('--pink-primary-dark', '#db2777'),
          hoverFill: getCssVar('--pink-primary-hover', '#f472b6'),
          hoverStroke: getCssVar('--pink-primary', '#ec4899')
        };
      }
      if (nodeName.startsWith('Other / Specialized:')) {
        return {
          fill: getCssVar('--orange-secondary', '#f97316'),
          stroke: getCssVar('--orange-secondary-dark', '#ea580c'),
          hoverFill: getCssVar('--orange-secondary-hover', '#fb923c'),
          hoverStroke: getCssVar('--orange-secondary', '#f97316')
        };
      }
      if (nodeName.startsWith('Multi-Asset:')) {
        return {
          fill: getCssVar('--teal-primary', '#14b8a6'),
          stroke: getCssVar('--teal-primary-dark', '#0d9488'),
          hoverFill: getCssVar('--teal-primary-hover', '#5eead4'),
          hoverStroke: getCssVar('--teal-primary', '#14b8a6')
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
            <div><strong>${node.name}</strong></div>
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
    // Create a set of negative node names for quick lookup
    const negativeNodeNames = new Set(negLabels);
    
    // Separate nodes: negative nodes and "Net New Capital" get labels above links,
    // others get labels to the left
    const nodesWithLabelsAbove = graph.nodes.filter(n => 
      negativeNodeNames.has(n.name) || n.name === newCapLabel
    );
    const otherNodes = graph.nodes.filter(n => 
      !negativeNodeNames.has(n.name) && n.name !== newCapLabel
    );
    
    // For negative nodes and "Net New Capital": position labels above their outgoing links, right next to the node
    const nodesWithLabelsAboveTexts = svg.append('g')
      .selectAll('text')
      .data(nodesWithLabelsAbove)
      .enter()
      .append('text')
      .attr('x', d => {
        // Position right next to the node (just after it exits)
        return d.x1! + 8; // 8px after the node
      })
      .attr('y', d => {
        // Position above the link, aligned with the center of the node
        return (d.y0! + d.y1!) / 2 - 8; // 8px above the node center
      })
      .attr('text-anchor', 'start')
      .attr('alignment-baseline', 'baseline')
      .style('font-size', '12px');
    
    // Add label text for negative nodes and "Net New Capital"
    nodesWithLabelsAboveTexts.append('tspan')
      .text(d => d.name + ':');
    
    // Add value text as tspan for negative nodes and "Net New Capital"
    nodesWithLabelsAboveTexts.append('tspan')
      .attr('dx', '8px')
      .style('font-weight', 'bold')
      .text(d => {
        const value = nodeValues.get(d) || 0;
        const formattedValue = value >= 0.1 ? value.toFixed(2) : value.toFixed(3);
        return '$' + formattedValue + 'B';
      });
    
    // For other nodes: position labels to the left as before
    const otherLabelTexts = svg.append('g')
      .selectAll('text')
      .data(otherNodes)
      .enter()
      .append('text')
      .attr('x', d => d.x0! - 6)
      .attr('y', d => (d.y0! + d.y1!) / 2)
      .attr('text-anchor', 'end')
      .attr('alignment-baseline', 'middle')
      .style('font-size', '12px');
    
    // Add label text for other nodes
    otherLabelTexts.append('tspan')
      .text(d => d.name + ':');
    
    // Add value text as tspan for other nodes
    otherLabelTexts.append('tspan')
      .attr('dx', '8px')
      .style('font-weight', 'bold')
      .text(d => {
        const value = nodeValues.get(d) || 0;
        const formattedValue = value >= 0.1 ? value.toFixed(2) : value.toFixed(3);
        return '$' + formattedValue + 'B';
      });

    // -----------------------------------------
    // 9. Link Values (on the links)
    // -----------------------------------------
    svg.append('g')
      .selectAll('text')
      .data(graph.links)
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
      .style('font-weight', '500')
      .style('pointer-events', 'none')
      .text(d => {
        const value = (d as SankeyLinkExtra).value;
        return value >= 0.1 ? value.toFixed(2) : value.toFixed(3);
      });

    // -----------------------------------------
    // 10. Legend
    // -----------------------------------------
    // Determine which product types are actually present in the diagram
    const presentProductTypes = new Set<string>();
    graph.nodes.forEach(node => {
      const nodeName = node.name;
      // Extract product type from node names like "Equity: US Equity Small Cap"
      if (nodeName.includes(':')) {
        const productType = nodeName.split(':')[0].trim();
        presentProductTypes.add(productType);
      }
    });

    // Build legend data - always include special nodes, then add product types that are present
    const legendData: Array<{ label: string; color: string }> = [
      { label: 'Reallocation Pool', color: getCssVar('--orange-primary', '#f59e0b') },
      { label: 'Net New Capital', color: getCssVar('--green-dark', '#10b981') }
    ];

    // Add product types that are present in the diagram
    const productTypeMap: Record<string, string> = {
      'Equity': getCssVar('--blue-primary', '#3b82f6'),
      'Fixed Income': getCssVar('--purple-primary', '#8b5cf6'),
      'Cash': getCssVar('--cyan-primary', '#06b6d4'),
      'Private Markets': getCssVar('--pink-primary', '#ec4899'),
      'Alternatives': getCssVar('--gray-medium', '#6b7280'),
      'Real Estate': getCssVar('--gray-medium', '#6b7280'),
      'Other / Specialized': getCssVar('--orange-secondary', '#f97316'),
      'Other/Specialized': getCssVar('--orange-secondary', '#f97316'), // Handle both variations
      'Multi-Asset': getCssVar('--teal-primary', '#14b8a6')
    };

    // Normalize product type names for comparison
    const normalizeProductType = (type: string): string => {
      return type.replace(/\s*\/\s*/g, '/').trim();
    };

    // Add product types that are present
    presentProductTypes.forEach(productType => {
      const normalizedType = normalizeProductType(productType);
      // Check if we have a color mapping for this type
      const matchingKey = Object.keys(productTypeMap).find(key => 
        normalizeProductType(key) === normalizedType
      );
      if (matchingKey && !legendData.some(item => normalizeProductType(item.label) === normalizedType)) {
        legendData.push({
          label: productType, // Use the original name from the node
          color: productTypeMap[matchingKey]
        });
      }
    });

    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${width / 2 - 200}, ${height - 30})`);

    const legendItems = legend.selectAll('.legend-item')
      .data(legendData)
      .enter()
      .append('g')
      .attr('class', 'legend-item')
      .attr('transform', (d, i) => {
        const itemWidth = 120;
        const startX = -(legendData.length * itemWidth) / 2;
        return `translate(${startX + i * itemWidth}, 0)`;
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
        if (d.label === 'Equity') return getCssVar('--blue-primary-dark', '#2563eb');
        if (d.label === 'Fixed Income') return getCssVar('--purple-primary-dark', '#7c3aed');
        if (d.label === 'Cash') return getCssVar('--cyan-primary-dark', '#0891b2');
        if (d.label === 'Private Markets') return getCssVar('--pink-primary-dark', '#db2777');
        if (d.label === 'Other / Specialized') return getCssVar('--orange-secondary-dark', '#ea580c');
        if (d.label === 'Multi-Asset') return getCssVar('--teal-primary-dark', '#0d9488');
        return getCssVar('--gray-dark', '#4b5563');
      })
      .attr('stroke-width', 1);

    // Add labels
    legendItems.append('text')
      .attr('x', 16)
      .attr('y', 9)
      .attr('alignment-baseline', 'middle')
      .style('font-size', '11px')
      .style('fill', this.getCssVariable('--text-primary') || '#333')
      .text(d => d.label);

  }
}
