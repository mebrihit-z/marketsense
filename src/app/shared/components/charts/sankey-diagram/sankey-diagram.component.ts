import { Component, ElementRef, AfterViewInit } from '@angular/core';
import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal, SankeyNode, SankeyLink, SankeyGraph } from 'd3-sankey';

interface SankeyNodeExtra {
  name: string;
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
}

interface SankeyLinkExtra {
  source: number | SankeyNodeExtra;
  target: number | SankeyNodeExtra;
  value: number;
  width?: number;
}

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

  private createSankey() {
    const element = this.el.nativeElement.querySelector('.sankey');
    const width = 800;
    const height = 500;

    // Sample Sankey data
    const data: SankeyGraph<SankeyNodeExtra, {}> = {
      nodes: [
        { name: 'Source A' },
        { name: 'Source B' },
        { name: 'Source C' },
        { name: 'Target X' },
        { name: 'Target Y' },
        { name: 'Target Z' }
      ],
      links: [
        { source: 0, target: 2, value: 10 },
        { source: 0, target: 3, value: 5 },
        { source: 1, target: 3, value: 15 }
      ]
    };
    

    // SVG
    const svg = d3.select(element)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    // Sankey generator
    const sankeyGenerator = sankey<SankeyNodeExtra, {}>()
      .nodeWidth(36)
      .nodePadding(20)
      .extent([[1, 1], [width - 1, height - 6]]);

    const graph = sankeyGenerator(data);

    // Draw links
    svg.append('g')
      .selectAll<SVGPathElement, SankeyLinkExtra>('path')
      .data(graph.links)
      .enter()
      .append('path')
      .attr('d', sankeyLinkHorizontal())
      .attr('stroke', '#4f46e5')
      .attr('stroke-width', d => Math.max(1, d.width || 1))
      .attr('fill', 'none')
      .attr('opacity', 0.4);

    // Draw nodes
    svg.append('g')
      .selectAll<SVGRectElement, SankeyNodeExtra>('rect')
      .data(graph.nodes)
      .enter()
      .append('rect')
      .attr('x', d => d.x0 || 0)
      .attr('y', d => d.y0 || 0)
      .attr('height', d => (d.y1 || 0) - (d.y0 || 0))
      .attr('width', d => (d.x1 || 0) - (d.x0 || 0))
      .attr('fill', '#10b981')
      .attr('stroke', '#059669');

    // Node labels
    svg.append('g')
      .selectAll<SVGTextElement, SankeyNodeExtra>('text')
      .data(graph.nodes)
      .enter()
      .append('text')
      .attr('x', d => (d.x0 || 0) - 6)
      .attr('y', d => ((d.y0 || 0) + (d.y1 || 0)) / 2)
      .attr('text-anchor', 'end')
      .attr('alignment-baseline', 'middle')
      .text(d => d.name)
      .style('font-size', '14px');
  }
}
