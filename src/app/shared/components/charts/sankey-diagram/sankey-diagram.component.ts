import { Component, ElementRef, AfterViewInit } from '@angular/core';
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
export class SankeyDiagramComponent implements AfterViewInit {

  constructor(private el: ElementRef) {}

  ngAfterViewInit(): void {
    this.createSankey();
  }

  // -----------------------------------------
  // MAIN FUNCTION
  // -----------------------------------------
  private createSankey() {
    const element = this.el.nativeElement.querySelector('.sankey');
    // Get the container width dynamically, with a minimum width
    const containerWidth = element.clientWidth || element.offsetWidth || 1600;
    const width = Math.max(containerWidth, 800);
    const height = 800;

    // Create tooltip
    const tooltip = d3.select(element)
      .append('div')
      .style('position', 'absolute')
      .style('background-color', 'rgba(0, 0, 0, 0.85)')
      .style('color', 'white')
      .style('padding', '8px 12px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', 1000)
      .style('box-shadow', '0 2px 8px rgba(0,0,0,0.3)');

    // -----------------------------------------
    // 1. RAW DATA (converted from Python rows)
    // -----------------------------------------
    const rows: [string, string, number][] = [
      ["Equity", "US Equity Small Cap", -84.11],
      ["Equity", "US Equity Large Cap", -63.40],
      ["Equity", "Global Equity", 10.68],
      ["Equity", "Emerging Markets", 34.48],
      ["Equity", "Mid Cap Growth", 16.68],

      ["Fixed Income", "Core Investment Grade", 50.33],
      ["Fixed Income", "Municipal Bond", -43.90],
      ["Fixed Income", "Global Bonds", 34.73],
      ["Fixed Income", "Short Duration", -64.56],
      ["Fixed Income", "High Yield Bonds", 20.00],
      ["Fixed Income", "Government/Sovereign", 17.00],
      ["Fixed Income", "Credit Long Duration", 12.00],

      ["Cash", "Money Market Funds", 0.0],
      ["Cash", "Treasury Bills", 0.64],
      ["Cash", "Bank Deposits / CDs", 0.0],
      ["Cash", "Foreign Currency / FFX", 0.58],

      ["Private Markets", "Private Credit", -5.20],
      ["Private Markets", "Venture Capital", 15.60],
      ["Private Markets", "Co-Investment", 3.90],
      ["Private Markets", "Private Equity", 75.73],

      ["Other / Specialized", "Overlay Strategies", 3.82],
      ["Other / Specialized", "Factor Based Investing", 2.60],

      ["Multi-Asset", "Diversified Growth Funds", 1.64],
      ["Multi-Asset", "Target Date Funds", 2.67],
    ];

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

    const rebalFactor = totalNegAbs / totalPos;

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

    // Selling flows → Pool
    negRows.forEach(([parent, child, value]) => {
      const lbl = makeLabel(parent, child);
      links.push({
        source: labelToIndex[lbl],
        target: poolIndex,
        value: Math.abs(value),
        color: "#6EE7B7" // green
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
        color: "#FCA5A5" // red
      });

      // New Capital → Target
      if (newCapFlow > 0) {
        links.push({
          source: newCapIndex,
          target: targetIndex,
          value: newCapFlow,
          color: "rgba(0,100,200,0.7)" // blue
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

    // Calculate left margin for labels (adjust based on longest label)
    const leftMargin = 250;
    const rightMargin = 10;
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
      .attr('stroke', d => d.color || '#999')
      .attr('stroke-width', d => Math.max(1, d.width || 1))
      .attr('fill', 'none')
      .attr('opacity', 0.45)
      .on('mouseover', function(event, d) {
        const link = d as SankeyLinkExtra;
        const source = link.source as SankeyNodeExtra;
        const target = link.target as SankeyNodeExtra;
        const value = link.value;
        const formattedValue = value >= 0.1 ? value.toFixed(2) : value.toFixed(3);
        
        tooltip
          .style('opacity', 1)
          .html(`
            <div><strong>${source.name}</strong> → <strong>${target.name}</strong></div>
            <div style="margin-top: 4px;">Value: ${formattedValue}</div>
          `);
        
        d3.select(this)
          .attr('opacity', 0.8)
          .attr('stroke-width', (d: any) => Math.max(2, ((d as SankeyLinkExtra).width || 1) + 2));
      })
      .on('mousemove', function(event) {
        tooltip
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', function() {
        tooltip.style('opacity', 0);
        d3.select(this)
          .attr('opacity', 0.45)
          .attr('stroke-width', (d: any) => Math.max(1, (d as SankeyLinkExtra).width || 1));
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
    const getNodeColor = (nodeName: string): { fill: string; stroke: string; hoverFill: string; hoverStroke: string } => {
      // Special nodes
      if (nodeName === 'Reallocation Pool') {
        return { fill: '#f59e0b', stroke: '#d97706', hoverFill: '#fbbf24', hoverStroke: '#f59e0b' };
      }
      if (nodeName === 'Net New Capital') {
        return { fill: '#10b981', stroke: '#059669', hoverFill: '#34d399', hoverStroke: '#10b981' };
      }
      
      // Categorize by prefix
      if (nodeName.startsWith('Equity:')) {
        return { fill: '#3b82f6', stroke: '#2563eb', hoverFill: '#60a5fa', hoverStroke: '#3b82f6' };
      }
      if (nodeName.startsWith('Fixed Income:')) {
        return { fill: '#8b5cf6', stroke: '#7c3aed', hoverFill: '#a78bfa', hoverStroke: '#8b5cf6' };
      }
      if (nodeName.startsWith('Cash:')) {
        return { fill: '#06b6d4', stroke: '#0891b2', hoverFill: '#22d3ee', hoverStroke: '#06b6d4' };
      }
      if (nodeName.startsWith('Private Markets:')) {
        return { fill: '#ec4899', stroke: '#db2777', hoverFill: '#f472b6', hoverStroke: '#ec4899' };
      }
      if (nodeName.startsWith('Other / Specialized:')) {
        return { fill: '#f97316', stroke: '#ea580c', hoverFill: '#fb923c', hoverStroke: '#f97316' };
      }
      if (nodeName.startsWith('Multi-Asset:')) {
        return { fill: '#14b8a6', stroke: '#0d9488', hoverFill: '#5eead4', hoverStroke: '#14b8a6' };
      }
      
      // Default color
      return { fill: '#6b7280', stroke: '#4b5563', hoverFill: '#9ca3af', hoverStroke: '#6b7280' };
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
          .html(`
            <div><strong>${node.name}</strong></div>
            <div style="margin-top: 4px;">Total Value: ${formattedValue}</div>
            <div style="margin-top: 2px; font-size: 11px; opacity: 0.9;">Incoming: ${incoming.toFixed(2)}</div>
            <div style="font-size: 11px; opacity: 0.9;">Outgoing: ${outgoing.toFixed(2)}</div>
          `);
        
        d3.select(this)
          .attr('fill', colors.hoverFill)
          .attr('stroke', colors.hoverStroke)
          .attr('stroke-width', 2);
      })
      .on('mousemove', function(event) {
        tooltip
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', function() {
        tooltip.style('opacity', 0);
        const originalFill = d3.select(this).attr('data-original-fill');
        const originalStroke = d3.select(this).attr('data-original-stroke');
        d3.select(this)
          .attr('fill', originalFill)
          .attr('stroke', originalStroke)
          .attr('stroke-width', 1);
      });

    // -----------------------------------------
    // 8. Node Labels
    // -----------------------------------------
    svg.append('g')
      .selectAll('text')
      .data(graph.nodes)
      .enter()
      .append('text')
      .attr('x', d => d.x0! - 6)
      .attr('y', d => (d.y0! + d.y1!) / 2)
      .attr('text-anchor', 'end')
      .attr('alignment-baseline', 'middle')
      .style('font-size', '12px')
      .text(d => d.name);

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
      .style('fill', '#333')
      .style('font-weight', '500')
      .style('pointer-events', 'none')
      .text(d => {
        const value = (d as SankeyLinkExtra).value;
        return value >= 0.1 ? value.toFixed(2) : value.toFixed(3);
      });

    // -----------------------------------------
    // 10. Node Values (total flow through each node)
    // -----------------------------------------
    // Note: nodeValues already calculated in step 7

    svg.append('g')
      .selectAll('text')
      .data(graph.nodes)
      .enter()
      .append('text')
      .attr('x', d => d.x0! - 6)
      .attr('y', d => (d.y0! + d.y1!) / 2 + 15)
      .attr('text-anchor', 'end')
      .attr('alignment-baseline', 'middle')
      .style('font-size', '10px')
      .style('fill', '#666')
      .style('font-weight', '600')
      .text(d => {
        const value = nodeValues.get(d) || 0;
        return value >= 0.1 ? value.toFixed(2) : value.toFixed(3);
      });
  }
}
