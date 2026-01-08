/* eslint-disable */
import { Component, ElementRef, AfterViewInit, OnDestroy, Input, OnChanges, SimpleChanges, ViewEncapsulation } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import * as d3 from 'd3';
import { filterSankeyData, type SankeyData } from '../../../utils/sankey-data.utils';
import { convertExcelToSankey } from '../../../utils/excel-to-sankey.util';

interface SankeyDataLocal {
  nodes: Array<{ name: string }>;
  links: Array<{ source: string; target: string; value: number }>;
  summary?: any;
}

interface TreemapNodeData {
  name: string;
  value?: number;
  trueValue?: number;
  group?: string;
  children?: TreemapNodeData[];
}

interface TreemapHierarchyNode extends d3.HierarchyNode<TreemapNodeData> {
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
  styleUrl: './treemap.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class TreemapComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() data?: SankeyDataLocal;
  @Input() dataUrl: string = 'assets/data/marketsense_input_data.xlsx';
  @Input() selectedInvestorRegions: string[] = [];
  @Input() selectedProductTypes: string[] = [];
  @Input() selectedProductSubTypes: string[] = [];

  private loadedData?: SankeyDataLocal;
  private originalData?: SankeyDataLocal;
  private resizeObserver?: ResizeObserver;

  constructor(
    private el: ElementRef,
    private http: HttpClient
  ) {}

  ngAfterViewInit(): void {
    if (this.data) {
      this.originalData = this.data;
      this.applyFilters();
    } else {
      this.loadDataFromJson();
    }
    this.setupResizeObserver();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Handle data input changes
    if (changes['data'] && this.data) {
      this.originalData = this.data;
      this.applyFilters();
      return;
    }
    
    // Handle filter changes - check if any filter input changed
    const filterChanged = changes['selectedInvestorRegions'] || 
                          changes['selectedProductTypes'] || 
                          changes['selectedProductSubTypes'];
    
    if (filterChanged) {
      // If filters changed, reapply filters and recreate treemap
      console.log('ReallocationTreemap: Filters changed', {
        investorRegions: this.selectedInvestorRegions,
        productTypes: this.selectedProductTypes,
        productSubTypes: this.selectedProductSubTypes,
        changes: Object.keys(changes)
      });
      
      // Apply filters if data is already loaded, otherwise filters will be applied when data loads
      if (this.originalData) {
        this.applyFilters();
      }
    }
  }

  ngOnDestroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  private loadDataFromJson(): void {
    // Check if dataUrl is an Excel file
    const isExcelFile = this.dataUrl.toLowerCase().endsWith('.xlsx') || 
                        this.dataUrl.toLowerCase().endsWith('.xls');
    
    if (isExcelFile) {
      // Load Excel file as ArrayBuffer
      this.http.get(this.dataUrl, { responseType: 'arraybuffer' }).subscribe({
        next: (arrayBuffer) => {
          try {
            // Convert Excel to Sankey data using the utility
            const sankeyData = convertExcelToSankey(arrayBuffer, {
              superparentCol: 'SuperParent',
              parentCol: 'Parent',
              subassetCol: 'SubAsset',
              valueCol: 'Value'
            });
            
            // Map to SankeyDataLocal format
            this.originalData = {
              nodes: sankeyData.nodes,
              links: sankeyData.links,
              summary: sankeyData.summary
            };
            
            this.applyFilters();
          } catch (error) {
            console.error('Error converting Excel to treemap data:', error);
          }
        },
        error: (error) => {
          console.error('Error loading Excel file:', error);
          console.error('Failed to load from:', this.dataUrl);
        }
      });
    } else {
      // Load JSON file (backward compatibility)
      this.http.get<SankeyDataLocal>(this.dataUrl).subscribe({
        next: (data) => {
          this.originalData = data;
          this.applyFilters();
        },
        error: (error) => {
          console.error('Error loading sankey data:', error);
          console.error('Failed to load from:', this.dataUrl);
        }
      });
    }
  }

  private applyFilters(): void {
    if (!this.originalData) {
      console.log('ReallocationTreemap: No original data available yet');
      return;
    }

    console.log('ReallocationTreemap: Applying filters', {
      investorRegions: this.selectedInvestorRegions,
      productTypes: this.selectedProductTypes,
      productSubTypes: this.selectedProductSubTypes,
      originalNodesCount: this.originalData.nodes?.length || 0
    });

    // Convert to SankeyData format for filtering
    const sankeyData: SankeyData = {
      nodes: this.originalData.nodes,
      links: this.originalData.links,
      summary: this.originalData.summary
    };

    // Apply filters using the filterSankeyData utility
    const filteredData = filterSankeyData(
      sankeyData,
      this.selectedInvestorRegions,
      this.selectedProductTypes,
      this.selectedProductSubTypes
    );

    console.log('ReallocationTreemap: Filtered data', {
      filteredNodesCount: filteredData.nodes?.length || 0,
      filteredLinksCount: filteredData.links?.length || 0
    });

    // Convert back to local format
    this.loadedData = {
      nodes: filteredData.nodes,
      links: filteredData.links || [],
      summary: filteredData.summary
    };

    if (this.el?.nativeElement) {
      setTimeout(() => this.createTreemap(), 100);
    }
  }

  private setupResizeObserver(): void {
    const element = this.el.nativeElement.querySelector('.reallocation-treemap-container');
    if (element && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        const container = element.querySelector('.chart-container');
        if (container) {
          container.innerHTML = '';
          this.createTreemap();
        }
      });
      this.resizeObserver.observe(element);
    }
  }

  // Helper functions matching Python logic
  private isPool(name: string): boolean {
    return typeof name === 'string' && name.includes('Reallocation Pool');
  }

  private superparentFromPool(poolName: string): string {
    if (typeof poolName !== 'string') return 'Unknown';
    const idx = poolName.indexOf(':');
    if (idx === -1) return 'Unknown';
    return poolName.slice(0, idx).trim();
  }

  private superparentFromNetNew(name: string): string {
    if (typeof name !== 'string') return 'Unknown';
    const m = name.match(/\(([^)]+)\)\s*$/);
    return m ? m[1].trim() : 'Unknown';
  }

  private isNetNew(name: string): boolean {
    return typeof name === 'string' && name.startsWith('Net New Capital');
  }

  private isWithdrawn(name: string): boolean {
    return typeof name === 'string' && name.startsWith('Capital Withdrawn');
  }

  private isSourceNodeName(name: string): boolean {
    return typeof name === 'string' && name.endsWith('(Source)');
  }

  private isDestinationNodeName(name: string): boolean {
    return typeof name === 'string' && name.endsWith('(Destination)');
  }

  private stripSuperPrefix(name: string): string {
    return typeof name === 'string' ? name.replace(/^[^:]+:\s*/, '') : name;
  }

  private stripSuffix(name: string): string {
    return typeof name === 'string'
      ? name.replace(/\s*\((Source|Destination)\)\s*$/, '')
      : name;
  }

  private superFromScoped(name: string): string {
    if (typeof name !== 'string') return 'Unknown';
    const idx = name.indexOf(':');
    if (idx === -1) return 'Unknown';
    return name.slice(0, idx).trim();
  }

  private stripParentSuffix(name: string): string {
    return typeof name === 'string'
      ? name.replace(/\s*\((Start|End)\)\s*$/, '')
      : name;
  }

  private cleanParentName(name: string): string {
    return this.stripParentSuffix(this.stripSuperPrefix(name));
  }

  private formatValue(x: number): string {
    const v = +x || 0;
    return '$ ' + d3.format(',.2f')(v) + 'B';
  }

  private sizeWeight(d: TreemapNodeData): number {
    const SIZE_EXPONENT = 0.60;
    const MIN_SIZE_FLOOR = 0.15;
    const raw = Math.abs(+((d && d.value) || 0));
    const floored = Math.max(raw, MIN_SIZE_FLOOR);
    return Math.pow(floored, SIZE_EXPONENT);
  }

  private buildHierarchy(sankeyData: SankeyDataLocal): TreemapNodeData {
    // Map SubAsset -> Parent per SuperParent
    const outParentOf = new Map<string, string>();
    const inParentOf = new Map<string, string>();

    for (const l of (sankeyData.links || [])) {
      const s = l.source as string;
      const t = l.target as string;

      // Parent(Start) -> Sub(Source)
      if (typeof s === 'string' && typeof t === 'string' && s.endsWith('(Start)') && this.isSourceNodeName(t)) {
        const sp = this.superFromScoped(s);
        const parent = this.cleanParentName(s);
        const sub = this.stripSuffix(this.stripSuperPrefix(t));
        outParentOf.set(`${sp}|${sub}`, parent);
        continue;
      }

      // Sub(Destination) -> Parent(End)
      if (typeof s === 'string' && typeof t === 'string' && this.isDestinationNodeName(s) && t.endsWith('(End)')) {
        const sp = this.superFromScoped(t);
        const parent = this.cleanParentName(t);
        const sub = this.stripSuffix(this.stripSuperPrefix(s));
        inParentOf.set(`${sp}|${sub}`, parent);
        continue;
      }
    }

    // Collect leaves per SuperParent
    const bySP = new Map<string, {
      outflows: Array<{ parent: string; name: string; value: number }>;
      inflows: Array<{ parent: string; name: string; value: number }>;
      netNew: number;
      withdrawn: number;
    }>();

    const ensureSP = (sp: string) => {
      if (!bySP.has(sp)) {
        bySP.set(sp, {
          outflows: [],
          inflows: [],
          netNew: 0,
          withdrawn: 0
        });
      }
      return bySP.get(sp)!;
    };

    for (const l of (sankeyData.links || [])) {
      const s = l.source as string;
      const t = l.target as string;
      const v = +l.value || 0;

      // Net New Capital
      if (this.isNetNew(s) && this.isPool(t)) {
        const sp = this.superparentFromPool(t) !== 'Unknown' 
          ? this.superparentFromPool(t) 
          : this.superparentFromNetNew(s);
        ensureSP(sp).netNew += v;
        continue;
      }

      // Capital Withdrawn
      if (this.isPool(s) && this.isWithdrawn(t)) {
        const sp = this.superparentFromPool(s) !== 'Unknown'
          ? this.superparentFromPool(s)
          : this.superparentFromNetNew(t);
        ensureSP(sp).withdrawn += v;
        continue;
      }

      // Outflows: (Source) -> SP: Reallocation Pool
      if (this.isPool(t) && this.isSourceNodeName(s)) {
        const sp = this.superparentFromPool(t);
        const leafName = this.stripSuffix(this.stripSuperPrefix(s));
        const parent = outParentOf.get(`${sp}|${leafName}`) || '(Unknown Parent)';
        ensureSP(sp).outflows.push({ parent, name: leafName, value: v });
        continue;
      }

      // Inflows: SP: Reallocation Pool -> (Destination)
      if (this.isPool(s) && this.isDestinationNodeName(t)) {
        const sp = this.superparentFromPool(s);
        const leafName = this.stripSuffix(this.stripSuperPrefix(t));
        const parent = inParentOf.get(`${sp}|${leafName}`) || '(Unknown Parent)';
        ensureSP(sp).inflows.push({ parent, name: leafName, value: v });
        continue;
      }
    }

    // Aggregate duplicates
    const aggregateByParent = (leaves: Array<{ parent: string; name: string; value: number }>): TreemapNodeData[] => {
      const parents = new Map<string, Map<string, number>>();
      for (const d of leaves) {
        const p = d.parent || '(Unknown Parent)';
        if (!parents.has(p)) parents.set(p, new Map());
        const m = parents.get(p)!;
        m.set(d.name, (m.get(d.name) || 0) + d.value);
      }

      return Array.from(parents, ([parent, m]) => ({
        name: parent,
        children: Array.from(m, ([name, value]) => ({ name, value }))
      }));
    };

    const hierarchy: TreemapNodeData = {
      name: 'Reallocation',
      children: []
    };

    for (const [sp, parts] of Array.from(bySP.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const spNode: TreemapNodeData = {
        name: sp,
        children: []
      };

      // Outflows (left)
      spNode.children!.push({
        name: 'Outflows',
        group: 'outflows',
        children: aggregateByParent(parts.outflows)
      });

      // Net New Capital (middle)
      if (parts.netNew !== 0) {
        spNode.children!.push({ 
          name: 'Net New Capital', 
          group: 'netnew', 
          value: parts.netNew 
        });
      }

      // Inflows (right)
      spNode.children!.push({
        name: 'Inflows',
        group: 'inflows',
        children: aggregateByParent(parts.inflows)
      });

      // Capital Withdrawn (far right)
      if (parts.withdrawn !== 0) {
        spNode.children!.push({ 
          name: 'Capital Withdrawn', 
          group: 'withdrawn', 
          value: parts.withdrawn 
        });
      }

      hierarchy.children!.push(spNode);
    }

    // Annotate with true values
    this.annotateTrueValues(hierarchy);

    return hierarchy;
  }

  private annotateTrueValues(node: TreemapNodeData): number {
    if (!node) return 0;
    if (!node.children || node.children.length === 0) {
      node.trueValue = +(node.value ?? 0) || 0;
      return node.trueValue;
    }
    let s = 0;
    for (const c of node.children) s += this.annotateTrueValues(c);
    node.trueValue = s;
    return s;
  }

  private groupOf(node: TreemapHierarchyNode): string {
    if (!node) return 'Other';
    if (node.depth === 2) return node.data.name;
    if (node.depth >= 3) {
      const g = node.ancestors().find(a => a.depth === 2);
      return g ? g.data.name : 'Other';
    }
    return 'Other';
  }

  private nodeColor(node: TreemapHierarchyNode, root: d3.HierarchyNode<TreemapNodeData>): string {
    const g = this.groupOf(node);

    // Shade leaf nodes by magnitude
    if (node && !node.children) {
      const mag = Math.abs(+((node.data && node.data.trueValue) || 0));
      const leaves = root.leaves() as TreemapHierarchyNode[];
      
      const maxOut = d3.max(
        leaves.filter(d => this.groupOf(d) === 'Outflows'),
        d => Math.abs(+((d.data && d.data.trueValue) || 0))
      ) || 1;
      
      const maxIn = d3.max(
        leaves.filter(d => this.groupOf(d) === 'Inflows'),
        d => Math.abs(+((d.data && d.data.trueValue) || 0))
      ) || 1;

      const outflowScale = d3.scaleLinear<string>()
        .domain([0, maxOut])
        .range(['#f7c6c6', '#d62728'])
        .clamp(true);

      const inflowScale = d3.scaleLinear<string>()
        .domain([0, maxIn])
        .range(['#c7e9c0', '#2ca02c'])
        .clamp(true);

      if (g === 'Outflows') return outflowScale(mag);
      if (g === 'Inflows') return inflowScale(mag);
    }

    // Container nodes
    if (g === 'Inflows') return '#2ca02c';
    if (g === 'Outflows') return '#d62728';
    if (g === 'Net New Capital') return '#1f77b4';
    if (g === 'Capital Withdrawn') return '#ff7f0e';
    return '#999999';
  }

  private signedValue(d: TreemapHierarchyNode): number {
    const g = this.groupOf(d);
    const tv = +((d && d.data && d.data.trueValue) || 0);
    if (g === 'Outflows') return -Math.abs(tv);
    return tv;
  }

  private createTreemap(): void {
    if (!this.loadedData || !this.loadedData.nodes || this.loadedData.nodes.length === 0) {
      console.warn('ReallocationTreemap: No data loaded or data is empty');
      return;
    }

    const container = this.el.nativeElement.querySelector('.chart-container') as HTMLElement;
    if (!container) {
      console.error('ReallocationTreemap: Chart container not found');
      return;
    }

    container.innerHTML = '';

    const hierarchy = this.buildHierarchy(this.loadedData);
    
    if (!hierarchy.children || hierarchy.children.length === 0) {
      console.warn('ReallocationTreemap: Hierarchy has no children', hierarchy);
      return;
    }

    console.log('ReallocationTreemap: Hierarchy built with', hierarchy.children.length, 'superparents');

    // Get container dimensions or use defaults
    const containerWidth = container.parentElement?.clientWidth || container.offsetWidth || 1800;
    const width = Math.max(containerWidth - 40, 800); // Account for padding
    const height = Math.round(width * (1050 / 1800) + 400); // Maintain aspect ratio

    console.log('ReallocationTreemap: Creating treemap with dimensions', width, height);

    const root = d3.hierarchy(hierarchy)
      .sum(d => (d && !d.children && (d.value != null)) ? this.sizeWeight(d) : 0);

    const treemap = d3.treemap<TreemapNodeData>()
      .size([width, height])
      .tile((node, x0, y0, x1, y1) => {
        if (node.depth === 0) return d3.treemapSlice(node, x0, y0, x1, y1);
        if (node.depth === 1) return d3.treemapDice(node, x0, y0, x1, y1);
        return d3.treemapSquarify(node, x0, y0, x1, y1);
      })
      .paddingOuter(4)
      .paddingTop((d) => {
        if (d.depth === 1) return 30;
        if (d.depth === 2) return 24;
        // Increase padding for depth 3 nodes with children to accommodate multi-line labels when needed
        if (d.depth === 3) return d.children && d.children.length > 0 ? 45 : 20;
        return 2;
      })
      .paddingInner(2)
      .round(true);

    treemap(root);

    const chartDiv = d3.select(container)
      .style('position', 'relative')
      .style('width', '100%')
      .style('max-width', width + 'px')
      .style('height', height + 'px')
      .style('margin', '0 auto')
      .style('background', 'white')
      // .style('border', '1px solid #e6e6e6')
      // .style('box-shadow', '0 1px 3px rgba(0,0,0,0.06)');

    const tooltip = d3.select(container)
      .append('div')
      .attr('class', 'tooltip')
      .style('position', 'fixed')
      .style('pointer-events', 'none')
      .style('background', 'rgba(0,0,0,0.85)')
      .style('color', 'white')
      .style('padding', '8px 10px')
      .style('border-radius', '6px')
      .style('font-size', '12px')
      .style('line-height', '1.3')
      .style('opacity', '0')
      .style('transform', 'translate(10px, 10px)')
      .style('max-width', '340px')
      .style('z-index', '9999');

    const nodes = chartDiv.selectAll('div.node')
      .data(root.descendants().filter(d => d.depth > 0))
      .enter()
      .append('div')
      .attr('class', 'node')
      .classed('superparent', d => d.depth === 1)
      .classed('group', d => d.depth === 2)
      .classed('parent', d => d.depth === 3)
      .classed('leaf', d => !d.children)
      .classed('small-leaf', d => {
        // Add class for small leaf nodes to allow CSS targeting
        if (!d.children) {
          const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
          const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
          return w < 60 || h < 25;
        }
        return false;
      })
      .classed('tiny-leaf', d => {
        // Add class for tiny leaf nodes (very small)
        if (!d.children) {
          const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
          const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
          return w < 40 || h < 18;
        }
        return false;
      })
      .style('position', 'absolute')
      .style('box-sizing', 'border-box')
      .style('overflow', d => {
        // For very small leaf nodes (product sub-types), allow overflow so labels can show
        if (!d.children) {
          const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
          const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
          const isVerySmall = w < 60 || h < 25;
          if (isVerySmall) return 'visible';
        }
        return 'hidden';
      })
      .style('border', d => {
        if (d.depth === 3) return '2px solid #000';
        return '1px solid rgba(0,0,0,0.12)';
      })
      .style('display', 'flex')
      .style('flex-direction', 'column')
      .style('pointer-events', d => d.children ? 'none' : 'auto')
      .style('left', d => (d as TreemapHierarchyNode).x0 + 'px')
      .style('top', d => (d as TreemapHierarchyNode).y0 + 'px')
      .style('width', d => Math.max(0, (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0) + 'px')
      .style('height', d => Math.max(0, (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0) + 'px')
      .style('z-index', d => 1000 - d.depth)
      .style('background', d => {
        const colorStr = this.nodeColor(d as TreemapHierarchyNode, root);
        const c = d3.color(colorStr) || d3.color('#999');
        if (!c) return '#999999';
        c.opacity = d.children ? 0.14 : 0.80;
        return c.formatRgb();
      });

    // Capture component reference for use in callbacks
    const component = this;

    const labels = nodes.append('div')
      .attr('class', 'label')
      .style('font-size', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isSmall = w < 100 || h < 35;
        const isVerySmall = w < 60 || h < 25;
        const isTiny = w < 40 || h < 18;
        
        if (d.depth === 1) return '15px';
        if (d.depth === 2) return '13px';
        if (d.depth === 3) return '13px';
        // For leaf nodes (product sub-types), adjust font size based on node size
        // Always show labels, even for tiny nodes
        if (isTiny) return '7px';
        if (isVerySmall) return '8px';
        if (isSmall) return '9px';
        return '10px';
      })
      .style('font-weight', d => {
        if (d.depth === 1) return '750';
        if (d.depth === 2) return '750';
        if (d.depth === 3) return '650';
        return '650';
      })
      .style('line-height', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isSmall = w < 60 || h < 25;
        const isTiny = w < 40 || h < 18;
        
        if (d.depth === 1) return '1.30';
        if (d.depth === 3) return '1.30';
        // For very small leaf nodes, use tighter line height
        if (!d.children && isTiny) return '1.0';
        if (!d.children && isSmall) return '1.1';
        return '1.25';
      })
      .style('padding', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isSmall = w < 60 || h < 25;
        const isTiny = w < 40 || h < 18;
        
        // Reduce padding for small leaf nodes to ensure labels fit
        if (!d.children && isTiny) return '1px 2px';
        if (!d.children && isSmall) return '2px 3px';
        return '4px 6px';
      })
      .style('margin', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isSmall = w < 60 || h < 25;
        const isTiny = w < 40 || h < 18;
        
        // Add extra bottom margin for depth 3 nodes with children to prevent overlap when labels wrap
        if (d.depth === 3 && d.children && d.children.length > 0) return '2px 2px 12px 2px';
        // Reduce margin for small leaf nodes
        if (!d.children && isTiny) return '0px';
        if (!d.children && isSmall) return '1px';
        return '2px';
      })
      .style('color', 'rgba(0, 0, 0, 0.92)')
      .style('pointer-events', 'none')
      .style('white-space', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isSmall = w < 60 || h < 25;
        
        // Allow wrapping for product type (depth 3) nodes with children
        if (d.depth === 3 && d.children && d.children.length > 0) return 'normal';
        // For small leaf nodes, allow wrapping to show at least part of the label
        if (!d.children && isSmall) return 'normal';
        return 'nowrap';
      })
      .style('word-break', 'break-word')
      .style('overflow', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isSmall = w < 60 || h < 25;
        
        // For small leaf nodes, use visible overflow to ensure labels show
        if (!d.children && isSmall) return 'visible';
        return 'hidden';
      })
      .style('text-overflow', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isSmall = w < 60 || h < 25;
        
        // Use clip instead of ellipsis when wrapping is allowed
        if (d.depth === 3 && d.children && d.children.length > 0) return 'clip';
        // For small nodes, don't use ellipsis to ensure text shows
        if (!d.children && isSmall) return 'clip';
        return 'ellipsis';
      })
      .style('background', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isTiny = w < 40 || h < 18;
        
        // For tiny nodes, use more opaque background to ensure text is readable
        if (!d.children && isTiny) return 'rgba(255, 255, 255, 0.9)';
        return 'rgba(255, 255, 255, 0.65)';
      })
      .style('border-radius', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isSmall = w < 60 || h < 25;
        const isTiny = w < 40 || h < 18;
        
        // Smaller border radius for small nodes
        if (!d.children && isTiny) return '1px';
        if (!d.children && isSmall) return '2px';
        return '4px';
      })
      .style('flex-shrink', '0') // Prevent labels from shrinking
      .style('flex-grow', '0') // Prevent labels from growing
      .style('display', 'inline-block')
      .style('max-width', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isSmall = w < 60 || h < 25;
        const isTiny = w < 40 || h < 18;
        
        // For small nodes, use more of the available width
        // For tiny nodes, allow full width and even overflow slightly
        if (!d.children && isTiny) return 'none';
        if (!d.children && isSmall) return 'calc(100% - 2px)';
        return 'calc(100% - 8px)';
      })
      .style('min-height', d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isTiny = w < 40 || h < 18;
        
        // Ensure labels have minimum height to be visible
        if (!d.children && isTiny) return 'auto';
        return 'auto';
      })
      .text(d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isTiny = w < 40 || h < 18;
        const isSmall = w < 60 || h < 25;
        
        // Always show labels for all nodes, especially leaf nodes (product sub-types)
        if (d.depth === 2) {
          return d.data.name + ' — ' + this.formatValue(this.signedValue(d as TreemapHierarchyNode));
        }
        if (d.depth === 3) {
          return d.data.name + ' — ' + this.formatValue(this.signedValue(d as TreemapHierarchyNode));
        }
        // For very small leaf nodes, include value in label to save space
        if (!d.children && isTiny) {
          const v = this.signedValue(d as TreemapHierarchyNode);
          const name = d.data.name || '';
          // Prioritize showing the name, add value if there's space
          return name ? (name + ' ' + this.formatValue(v)) : this.formatValue(v);
        }
        // For small leaf nodes, show name first, value can be separate
        if (!d.children && isSmall) {
          return d.data.name || '';
        }
        // For leaf nodes (product sub-types), always return the name
        return d.data.name || '';
      })
      .style('display', 'block') // Ensure labels are always displayed
      .style('visibility', 'visible') // Explicitly make labels visible
      .style('z-index', '10') // Ensure labels are above other elements
      .style('position', 'relative'); // Ensure proper positioning

    const values = nodes.append('div')
      .attr('class', 'value')
      .style('margin-top', 'auto')
      .style('font-size', '12px')
      .style('font-weight', '600')
      .style('padding', '0 6px 6px 6px')
      .style('color', 'rgba(0, 0, 0, 0.85)')
      .style('pointer-events', 'none')
      .text(d => {
        const w = (d as TreemapHierarchyNode).x1 - (d as TreemapHierarchyNode).x0;
        const h = (d as TreemapHierarchyNode).y1 - (d as TreemapHierarchyNode).y0;
        const isTiny = w < 40 || h < 18;

        // For very small leaf nodes, hide the separate value div since it's included in the label
        if (!d.children && isTiny) return '';

        if (w < 60 || h < 26) return '';

        const v = this.signedValue(d as TreemapHierarchyNode);

        if (!d.children) return this.formatValue(v);

        return '';
      });

    nodes.on('mousemove', function(event: MouseEvent, d) {
      const path = d.ancestors().reverse().map(x => x.data.name).join(' › ');
      tooltip.style('opacity', '1');
      tooltip.text(`${path}\n${component.formatValue(component.signedValue(d as TreemapHierarchyNode))}`);
      tooltip.style('left', event.clientX + 'px');
      tooltip.style('top', event.clientY + 'px');
      
      // Highlight the hovered cell
      d3.select(this)
        .classed('highlighted', true)
        .style('border-width', () => {
          if (d.depth === 3) return '3px';
          return '2px';
        })
        .style('border-color', '#0b41ad')
        .style('box-shadow', '0 0 8px rgba(11, 65, 173, 0.5)')
        .style('z-index', '2000');
    });

    nodes.on('mouseleave', function(event: MouseEvent, d) {
      tooltip.style('opacity', '0');
      
      // Remove highlighting from the cell
      d3.select(this)
        .classed('highlighted', false)
        .style('border-width', () => {
          if (d.depth === 3) return '2px';
          return '1px';
        })
        .style('border-color', () => {
          if (d.depth === 3) return '#000';
          return 'rgba(0,0,0,0.12)';
        })
        .style('box-shadow', 'none')
        .style('z-index', () => String(1000 - d.depth));
    });
  }
}

