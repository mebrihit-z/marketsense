/* eslint-disable */
import {
    Component,
    ElementRef,
    AfterViewInit,
    ViewChild
  } from '@angular/core';
  import * as d3 from 'd3';
  
  @Component({
    selector: 'app-line-chart-card',
    standalone: true,
    templateUrl: './line-chart-card.component.html',
    styleUrls: ['./line-chart-card.component.scss']
  })
  export class LineChartCardComponent implements AfterViewInit {
  
    @ViewChild('chart', { static: true }) chartRef!: ElementRef;
  
    private data = [10, 12, 15, 14, 18, 22, 25, 28, 32];
  
    ngAfterViewInit(): void {
      this.createChart();
    }
  
    private createChart(): void {
      const width = 260;
      const height = 90;
      const margin = { top: 0, right: 10, bottom: 20, left: 10 };
  
      const svg = d3
        .select(this.chartRef.nativeElement)
        .append('svg')
        .attr('width', width)
        .attr('height', height);
  
      const x = d3
        .scaleLinear()
        .domain([0, this.data.length - 1])
        .range([margin.left, width - margin.right]);
  
      const y = d3
        .scaleLinear()
        .domain([d3.min(this.data)!, d3.max(this.data)!])
        .range([height - margin.bottom, margin.top]);
  
      const line = d3
        .line<number>()
        .x((_, i) => x(i))
        .y(d => y(d))
        .curve(d3.curveMonotoneX);
  
      svg
        .append('path')
        .datum(this.data)
        .attr('fill', 'none')
        .attr('stroke', '#22C55E')
        .attr('stroke-width', 2.5)
        .attr('d', line);
    }
  }
  