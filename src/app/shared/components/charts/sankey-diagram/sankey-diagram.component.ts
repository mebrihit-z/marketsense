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
    const width = 1100;
    const height = 800;

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
        color: "rgba(200,0,0,0.7)" // red
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
        color: "rgba(0,150,0,0.7)" // green
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
      .attr('width', width)
      .attr('height', height);

    const sankeyGen = sankey<SankeyNodeExtra, SankeyLinkExtra>()
      .nodeWidth(25)
      .nodePadding(15)
      .extent([[10, 10], [width - 10, height - 10]]);

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
      .attr('opacity', 0.45);

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
      .attr('fill', '#4f46e5')
      .attr('stroke', '#312e81');

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
  }
}
