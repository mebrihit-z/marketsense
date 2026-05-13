/* eslint-disable max-lines */
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

/** Treemap scroll wrapper (same expansion idea as Sankey). */
const TREEMAP_SCROLL_SELECTORS = '.reallocation-treemap-container';

/**
 * Loads a PNG (or other image) data URL into an `HTMLImageElement` for measuring or PDF embedding.
 *
 * @param {string} dataUrl - Image data URL (e.g. `data:image/png;base64,...`).
 * @returns {Promise<HTMLImageElement>} Resolves when the image has decoded.
 */
export function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load export image'));
    img.src = dataUrl;
  });
}

/**
 * Snapshot of inline box-related CSS properties for export/restore.
 *
 * @typedef {Object} BoxStyleBackup
 * @property {string} overflow - Prior inline `overflow` (e.g. `visible` during capture).
 * @property {string} width - Prior inline `width`.
 * @property {string} minWidth - Prior inline `min-width`.
 * @property {string} maxWidth - Prior inline `max-width`.
 * @property {string} height - Prior inline `height`.
 * @property {string} minHeight - Prior inline `min-height`.
 * @property {string} maxHeight - Prior inline `max-height`.
 */
type BoxStyleBackup = {
  overflow: string;
  width: string;
  minWidth: string;
  maxWidth: string;
  height: string;
  minHeight: string;
  maxHeight: string;
};

/**
 * Reads overflow and box sizing from an element's inline `style` for later restore.
 *
 * @param {HTMLElement} el - Element whose inline box styles should be snapshotted.
 * @returns {BoxStyleBackup} Snapshot of the relevant `style` properties.
 */
function backupBoxStyles(el: HTMLElement): BoxStyleBackup {
  return {
    overflow: el.style.overflow,
    width: el.style.width,
    minWidth: el.style.minWidth,
    maxWidth: el.style.maxWidth,
    height: el.style.height,
    minHeight: el.style.minHeight,
    maxHeight: el.style.maxHeight,
  };
}

/**
 * Applies box-related inline styles from a prior `backupBoxStyles()` snapshot.
 *
 * @param {HTMLElement} el - Element to restore.
 * @param {BoxStyleBackup} b - Inline style snapshot to apply.
 */
function restoreBoxStyles(el: HTMLElement, b: BoxStyleBackup): void {
  const { style } = el;
  style.overflow = b.overflow;
  style.width = b.width;
  style.minWidth = b.minWidth;
  style.maxWidth = b.maxWidth;
  style.height = b.height;
  style.minHeight = b.minHeight;
  style.maxHeight = b.maxHeight;
}

/**
 * Reads layout width/height from an SVG (presentation attributes or `width`/`height` attrs).
 *
 * @param {SVGSVGElement} svg - Sankey (or other) SVG whose intrinsic size should be read.
 * @returns {{ w: number; h: number }} Positive dimensions when defined; otherwise zeros.
 */
function readSvgLayoutSize(svg: SVGSVGElement): { w: number; h: number } {
  const sw = svg.width?.baseVal?.value ?? parseFloat(svg.getAttribute('width') || '0');
  const sh = svg.height?.baseVal?.value ?? parseFloat(svg.getAttribute('height') || '0');
  return {
    w: Number.isFinite(sw) && sw > 0 ? sw : 0,
    h: Number.isFinite(sh) && sh > 0 ? sh : 0,
  };
}

type SvgPresentationBackup = { el: SVGRectElement; attr: string; value: string | null };

/**
 * html-to-image often misses Angular / ::ng-deep SVG paint rules; rects then rasterize as black.
 * Snapshot computed fill/stroke onto presentation attributes before capture, then restore.
 *
 * @param {HTMLElement} root - DOM subtree containing `.sankey-svg` markup to adjust for export.
 * @returns {function(): void} Call the returned function to restore original SVG attributes.
 */
function inlineSankeyNodeRectColorsForExport(root: HTMLElement): () => void {
  const backups: SvgPresentationBackup[] = [];
  const attrNames = ['fill', 'stroke', 'stroke-width'] as const;

  root.querySelectorAll<SVGSVGElement>('svg.sankey-svg').forEach((svg) => {
    svg.querySelectorAll<SVGRectElement>('rect.sankey-node-rect').forEach((rect) => {
      const cs = getComputedStyle(rect);
      const fill = cs.fill;
      if (!fill || fill === 'none' || fill === 'rgba(0, 0, 0, 0)') {
        return;
      }
      attrNames.forEach((name) => {
        backups.push({ el: rect, attr: name, value: rect.getAttribute(name) });
      });
      rect.setAttribute('fill', fill);
      const stroke = cs.stroke;
      if (stroke && stroke !== 'none') {
        rect.setAttribute('stroke', stroke);
      }
      const sw = cs.strokeWidth;
      if (sw && sw !== '0px') {
        const n = parseFloat(sw);
        rect.setAttribute('stroke-width', Number.isFinite(n) ? String(n) : sw);
      }
    });
  });

  return () => {
    const byEl = new Map<SVGRectElement, Map<string, string | null>>();
    backups.forEach(({ el, attr, value }) => {
      let attrs = byEl.get(el);
      if (!attrs) {
        attrs = new Map();
        byEl.set(el, attrs);
      }
      attrs.set(attr, value);
    });
    byEl.forEach((attrs, el) => {
      attrs.forEach((value, attr) => {
        if (value == null) {
          el.removeAttribute(attr);
        } else {
          el.setAttribute(attr, value);
        }
      });
    });
  };
}

/**
 * Expands overflow and width/height for a Sankey scroll branch so html-to-image captures full content.
 *
 * @param {HTMLElement} el - Regional Sankey host or chart scroll container.
 */
function expandSankeyCaptureBranch(el: HTMLElement): void {
  const { style } = el;
  style.overflow = 'visible';
  let w = Math.max(el.scrollWidth, el.offsetWidth, el.clientWidth || 0);
  let h = Math.max(el.scrollHeight, el.offsetHeight, el.clientHeight || 0);
  if (el.classList.contains('regional-sankey')) {
    const svg = el.querySelector('svg.sankey-svg');
    if (svg) {
      const { w: sw, h: sh } = readSvgLayoutSize(svg as SVGSVGElement);
      if (sw > 0) {
        w = Math.max(w, sw);
      }
      if (sh > 0) {
        h = Math.max(h, sh);
      }
    }
  }
  if (w > 0) {
    style.width = `${w}px`;
  }
  if (h > 0) {
    style.height = `${h}px`;
  }
}

/**
 * Options passed to `captureChartAreaToPng()`.
 *
 * @typedef {Object} CaptureChartAreaToPngOptions
 * @property {number} [pixelRatio] - Device pixel ratio for the raster (e.g. `2` for sharper PNG).
 * @property {boolean} [omitMarketFlowHeaderActions] - When true, strips header action nodes from the clone only.
 * @property {function(HTMLElement): boolean} [filter] - Return false to drop a node (and subtree) from the raster.
 */
export type CaptureChartAreaToPngOptions = {
  pixelRatio?: number;
  /**
   * Drops `.detail-modal-header-actions` from the raster only (clone path in html-to-image).
   * Use for market-flow detail PNG/PDF export so icons are omitted without changing the live UI.
   */
  omitMarketFlowHeaderActions?: boolean;
  /** Optional extra filter; return false to omit node (and its subtree) from the raster. Root is never filtered. */
  filter?: (domNode: HTMLElement) => boolean;
};

type ChartCaptureStyleCollections = {
  modified: Array<{ el: HTMLElement; backup: BoxStyleBackup }>;
  regionals: HTMLElement[];
  chartScrolls: HTMLElement[];
  treemapEls: HTMLElement[];
  sankeyContainers: HTMLElement[];
  sankeySvgs: SVGSVGElement[];
  rootBackup: BoxStyleBackup;
};

/**
 * Builds an html-to-image `filter` callback from capture options.
 *
 * @param {CaptureChartAreaToPngOptions|undefined} options - Export options.
 * @returns {(function(HTMLElement): boolean)|undefined} Predicate or undefined when cloning should not filter.
 */
function createChartCaptureFilter(
  options?: CaptureChartAreaToPngOptions
): ((domNode: HTMLElement) => boolean) | undefined {
  const omitMarketFlowHeaderActions = options?.omitMarketFlowHeaderActions ?? false;
  const userFilter = options?.filter;
  if (!omitMarketFlowHeaderActions && !userFilter) {
    return undefined;
  }
  return (domNode: HTMLElement): boolean => {
    if (omitMarketFlowHeaderActions && domNode.classList?.contains('detail-modal-header-actions')) {
      return false;
    }
    if (userFilter && !userFilter(domNode)) {
      return false;
    }
    return true;
  };
}

/**
 * Queries chart-related roots and snapshots inline styles that are changed during capture.
 *
 * @param {HTMLElement} root - Chart export root.
 * @returns {Object} Element groups plus backups to restore in `finally`.
 */
function buildChartCaptureStyleCollections(root: HTMLElement): ChartCaptureStyleCollections {
  const modified: Array<{ el: HTMLElement; backup: BoxStyleBackup }> = [];
  const seen = new Set<HTMLElement>();

  const track = (el: HTMLElement): void => {
    if (seen.has(el)) {
      return;
    }
    seen.add(el);
    modified.push({ el, backup: backupBoxStyles(el) });
  };

  const regionals = Array.from(root.querySelectorAll('.regional-sankey')) as HTMLElement[];
  const chartScrolls = Array.from(root.querySelectorAll('.sankey-chart-scroll')) as HTMLElement[];
  const treemapEls = Array.from(root.querySelectorAll(TREEMAP_SCROLL_SELECTORS)) as HTMLElement[];
  const sankeyContainers = Array.from(root.querySelectorAll('.sankey-container')) as HTMLElement[];
  const sankeySvgs = Array.from(root.querySelectorAll('svg.sankey-svg')) as SVGSVGElement[];

  regionals.forEach(track);
  chartScrolls.forEach(track);
  treemapEls.forEach(track);
  sankeyContainers.forEach(track);
  sankeySvgs.forEach((svg) => track(svg as unknown as HTMLElement));

  return {
    modified,
    regionals,
    chartScrolls,
    treemapEls,
    sankeyContainers,
    sankeySvgs,
    rootBackup: backupBoxStyles(root),
  };
}

/**
 * Commits pending style/DOM updates by reading layout from `root` (avoids `void` for `no-void`).
 *
 * @param {HTMLElement} root - Export root.
 * @param {boolean} includeBoundingRect - When true, also reads `getBoundingClientRect()` after `offsetWidth`.
 * @returns {void}
 */
function flushChartCaptureLayout(root: HTMLElement, includeBoundingRect: boolean): void {
  if (includeBoundingRect) {
    Math.max(0, root.offsetWidth, root.getBoundingClientRect().width);
  } else {
    Math.max(0, root.offsetWidth);
  }
}

/**
 * Temporarily expands overflow and box sizes so html-to-image captures the full chart.
 *
 * @param {HTMLElement} root - Chart export root.
 * @param {Object} cols - Output of `buildChartCaptureStyleCollections` for the same `root`.
 * @returns {void}
 */
function mutateDomForChartCapture(root: HTMLElement, cols: ChartCaptureStyleCollections): void {
  const { regionals, chartScrolls, treemapEls, sankeyContainers, sankeySvgs } = cols;
  const rootStyle = root.style;
  rootStyle.overflow = 'visible';

  sankeyContainers.forEach((c) => {
    const { style } = c;
    style.overflow = 'visible';
  });

  regionals.forEach(expandSankeyCaptureBranch);
  chartScrolls.forEach(expandSankeyCaptureBranch);
  treemapEls.forEach((h) => {
    const { style } = h;
    style.overflow = 'visible';
    const w = Math.max(h.scrollWidth, h.offsetWidth, h.clientWidth || 0);
    const ht = Math.max(h.scrollHeight, h.offsetHeight, h.clientHeight || 0);
    if (w > 0) {
      style.width = `${w}px`;
    }
    if (ht > 0) {
      style.height = `${ht}px`;
    }
  });

  sankeySvgs.forEach((svg) => {
    const { style } = svg;
    style.overflow = 'visible';
  });

  flushChartCaptureLayout(root, true);

  sankeyContainers.forEach((c) => {
    const { style } = c;
    const ch = Math.max(c.scrollHeight, c.offsetHeight, c.clientHeight || 0);
    if (ch > 0) {
      style.height = `${ch}px`;
    }
  });

  flushChartCaptureLayout(root, false);
}

/**
 * Renders visible Sankey / Treemap markup under `root` to a PNG data URL.
 *
 * @param {HTMLElement} root - Container wrapping the chart(s) to rasterize.
 * @param {CaptureChartAreaToPngOptions} [options] - Pixel ratio, filters, and related export flags.
 * @returns {Promise<string>} PNG data URL (`data:image/png;base64,...`).
 */
export async function captureChartAreaToPng(
  root: HTMLElement,
  options?: CaptureChartAreaToPngOptions
): Promise<string> {
  const pixelRatio = options?.pixelRatio ?? 2;
  const filterFn = createChartCaptureFilter(options);
  const cols = buildChartCaptureStyleCollections(root);
  let restoreSankeyRectColors: (() => void) | null = null;

  try {
    mutateDomForChartCapture(root, cols);
    flushChartCaptureLayout(root, false);
    restoreSankeyRectColors = inlineSankeyNodeRectColorsForExport(root);
    flushChartCaptureLayout(root, false);

    const captureW = Math.ceil(
      Math.max(root.scrollWidth, root.offsetWidth, root.clientWidth || 0, 1)
    );
    const captureH = Math.ceil(
      Math.max(root.scrollHeight, root.offsetHeight, root.clientHeight || 0, 1)
    );

    return await toPng(root, {
      pixelRatio,
      cacheBust: true,
      backgroundColor: '#ffffff',
      width: captureW,
      height: captureH,
      ...(filterFn ? { filter: filterFn } : {}),
    });
  } finally {
    if (restoreSankeyRectColors) {
      restoreSankeyRectColors();
    }
    cols.modified.reverse().forEach(({ el, backup }) => restoreBoxStyles(el, backup));
    restoreBoxStyles(root, cols.rootBackup);
  }
}

/**
 * Triggers a browser download of a PNG using a temporary anchor element.
 *
 * @param {string} dataUrl - PNG data URL (`data:image/png;base64,...`) to download.
 * @param {string} filename - Suggested download filename (e.g. `chart.png`).
 * @returns {void}
 */
export function downloadDataUrlAsPng(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * @typedef {Object} SaveChartAsMultiPagePdfParams
 * @property {string} imageDataUrl - PNG data URL of the chart raster.
 * @property {string} [title] - Optional heading printed above the chart.
 * @property {string} [timeLine] - Optional subtitle line (e.g. date range) under the title.
 * @property {string} filename - Output filename for the saved PDF.
 * @property {'landscape'|'portrait'} [orientation] - jsPDF page orientation; defaults to landscape.
 * @property {boolean} [fitSinglePage] - When true, scales the image to fit on the first page after headers.
 */
export type SaveChartAsMultiPagePdfParams = {
  imageDataUrl: string;
  title?: string;
  timeLine?: string;
  filename: string;
  orientation?: 'landscape' | 'portrait';
  fitSinglePage?: boolean;
};

type JsPdfDocument = InstanceType<typeof jsPDF>;

/**
 * Creates an empty A4 jsPDF document; uses an uppercase constructor binding for `new-cap`.
 *
 * @param {'landscape'|'portrait'} orientation - Page orientation.
 * @returns {Object} New jsPDF instance.
 */
function createBlankA4Pdf(orientation: 'landscape' | 'portrait'): JsPdfDocument {
  const PDF = jsPDF;
  return new PDF({ orientation, unit: 'pt', format: 'a4' });
}

/**
 * Writes optional title lines and returns geometry for the image region.
 *
 * @param {Object} pdf - jsPDF document.
 * @param {number} margin - Page margin in pt.
 * @param {number} pageH - Page height in pt.
 * @param {string} title - Optional title text.
 * @param {string} timeLine - Optional subtitle text.
 * @returns {{ y: number, availH: number, contentW: number }} Image top `y`, remaining height, and content width.
 */
function writeChartPdfHeader(
  pdf: JsPdfDocument,
  margin: number,
  pageH: number,
  title: string,
  timeLine: string
): { y: number; availH: number; contentW: number } {
  const pageW = pdf.internal.pageSize.getWidth();
  const contentW = pageW - 2 * margin;
  let y = margin;
  const t = title.trim();
  const tl = timeLine.trim();
  if (t) {
    pdf.setFontSize(14);
    pdf.text(t, margin, y);
    y += 18;
  }
  if (tl) {
    pdf.setFontSize(10);
    pdf.text(tl, margin, y);
    y += 22;
  } else if (t) {
    y += 22;
  }
  const availH = pageH - y - margin;
  return { y, availH, contentW };
}

/**
 * Renders the chart image scaled to fit on the first page after the header.
 *
 * @param {Object} pdf - jsPDF document.
 * @param {string} imageDataUrl - PNG data URL.
 * @param {number} imgW - Image width in px.
 * @param {number} imgH - Image height in px.
 * @param {number} margin - Page margin in pt.
 * @param {number} contentW - Content width in pt.
 * @param {number} y - Vertical start for the image in pt.
 * @param {number} availH - Available height for the image in pt.
 * @param {string} filename - Output filename.
 * @returns {void}
 */
function saveChartPdfSinglePageFit(
  pdf: JsPdfDocument,
  imageDataUrl: string,
  imgW: number,
  imgH: number,
  margin: number,
  contentW: number,
  y: number,
  availH: number,
  filename: string
): void {
  const scale = Math.min(contentW / imgW, availH / imgH);
  const dispW = imgW * scale;
  const dispH = imgH * scale;
  const x = margin + (contentW - dispW) / 2;
  pdf.addImage(imageDataUrl, 'PNG', x, y, dispW, dispH);
  pdf.save(filename);
}

/**
 * Fallback when canvas 2D is unavailable: adds a single cropped image slice.
 *
 * @param {Object} pdf - jsPDF document.
 * @param {string} imageDataUrl - PNG data URL.
 * @param {number} margin - Page margin in pt.
 * @param {number} y - Image top in pt.
 * @param {number} contentW - Content width in pt.
 * @param {number} availH - Available height in pt.
 * @param {number} drawHFull - Full image height if drawn at content width.
 * @param {string} filename - Output filename.
 * @returns {void}
 */
function saveChartPdfNoCanvasFallback(
  pdf: JsPdfDocument,
  imageDataUrl: string,
  margin: number,
  y: number,
  contentW: number,
  availH: number,
  drawHFull: number,
  filename: string
): void {
  const h = Math.min(drawHFull, availH);
  pdf.addImage(imageDataUrl, 'PNG', margin, y, contentW, h);
  pdf.save(filename);
}

/**
 * Draws one horizontal strip of the chart image onto the PDF (one loop iteration).
 *
 * @param {Object} pdf - jsPDF document.
 * @param {HTMLImageElement} img - Decoded chart image.
 * @param {CanvasRenderingContext2D} sliceCtx - Scratch 2D context; its backing canvas is resized per strip.
 * @param {number} margin - Page margin in pt.
 * @param {number} pageH - Page height in pt.
 * @param {number} yFirstPage - Image top on the first page in pt.
 * @param {number} contentW - Content width in pt.
 * @param {number} imgW - Image width in px.
 * @param {number} imgH - Image height in px.
 * @param {number} drawHFull - Full image height if drawn at `contentW`.
 * @param {number} pageIndex - Zero-based page index within this export.
 * @param {number} srcTopPx - Source Y offset in px for this strip.
 * @returns {number|null} Source pixels consumed, or `null` when slicing is complete.
 */
function appendChartPdfVerticalSlice(
  pdf: JsPdfDocument,
  img: HTMLImageElement,
  sliceCtx: CanvasRenderingContext2D,
  margin: number,
  pageH: number,
  yFirstPage: number,
  contentW: number,
  imgW: number,
  imgH: number,
  drawHFull: number,
  pageIndex: number,
  srcTopPx: number
): number | null {
  if (pageIndex > 0) {
    pdf.addPage();
  }
  const yStart = pageIndex === 0 ? yFirstPage : margin;
  const pageAvailH = pageH - yStart - margin;
  const maxSrcH = (pageAvailH / drawHFull) * imgH;
  let srcH = Math.min(imgH - srcTopPx, maxSrcH);
  if (srcH < 1 && srcTopPx < imgH - 0.5) {
    srcH = Math.min(imgH - srcTopPx, 1);
  }
  if (srcH < 1) {
    return null;
  }
  const sliceH = Math.ceil(srcH);

  const rasterCanvas = sliceCtx.canvas;
  rasterCanvas.width = imgW;
  rasterCanvas.height = sliceH;
  sliceCtx.clearRect(0, 0, imgW, sliceH);
  sliceCtx.drawImage(img, 0, srcTopPx, imgW, sliceH, 0, 0, imgW, sliceH);
  const sliceData = rasterCanvas.toDataURL('image/png');
  const displayH = (sliceH / imgH) * drawHFull;

  pdf.addImage(sliceData, 'PNG', margin, yStart, contentW, displayH);
  return sliceH;
}

/**
 * Rasterizes vertical strips of `img` onto successive PDF pages.
 *
 * @param {Object} pdf - jsPDF document.
 * @param {HTMLImageElement} img - Decoded chart image.
 * @param {CanvasRenderingContext2D} sliceCtx - Scratch 2D context reused for each vertical strip.
 * @param {number} margin - Page margin in pt.
 * @param {number} pageH - Page height in pt.
 * @param {number} yFirstPage - Image top on the first page in pt.
 * @param {number} contentW - Content width in pt.
 * @param {number} imgW - Image width in px.
 * @param {number} imgH - Image height in px.
 * @param {number} drawHFull - Full image height if drawn at `contentW`.
 * @returns {void}
 */
function runMultiPageChartSliceLoop(
  pdf: JsPdfDocument,
  img: HTMLImageElement,
  sliceCtx: CanvasRenderingContext2D,
  margin: number,
  pageH: number,
  yFirstPage: number,
  contentW: number,
  imgW: number,
  imgH: number,
  drawHFull: number
): void {
  let srcTopPx = 0;
  let pageIndex = 0;

  while (srcTopPx < imgH - 0.5) {
    const advance = appendChartPdfVerticalSlice(
      pdf,
      img,
      sliceCtx,
      margin,
      pageH,
      yFirstPage,
      contentW,
      imgW,
      imgH,
      drawHFull,
      pageIndex,
      srcTopPx
    );
    if (advance == null) {
      break;
    }
    srcTopPx += advance;
    pageIndex += 1;
  }
}

/**
 * Runs vertical slicing and `pdf.save` when a 2D canvas context is available.
 *
 * @param {Object} pdf - jsPDF document.
 * @param {HTMLImageElement} img - Decoded chart image.
 * @param {CanvasRenderingContext2D} sliceCtx - Context on a scratch canvas for strip rasterization.
 * @param {number} margin - Page margin in pt.
 * @param {number} pageH - Page height in pt.
 * @param {number} y - Image top on the first page in pt.
 * @param {number} contentW - Content width in pt.
 * @param {number} imgW - Image width in px.
 * @param {number} imgH - Image height in px.
 * @param {number} drawHFull - Full image height if drawn at `contentW`.
 * @param {string} filename - Output filename.
 * @returns {void}
 */
function saveChartPdfPaginatedWithSliceCanvas(
  pdf: JsPdfDocument,
  img: HTMLImageElement,
  sliceCtx: CanvasRenderingContext2D,
  margin: number,
  pageH: number,
  y: number,
  contentW: number,
  imgW: number,
  imgH: number,
  drawHFull: number,
  filename: string
): void {
  runMultiPageChartSliceLoop(pdf, img, sliceCtx, margin, pageH, y, contentW, imgW, imgH, drawHFull);
  pdf.save(filename);
}

/**
 * Multi-page chart PDF when `fitSinglePage` is false (2D canvas or single-image fallback).
 *
 * @param {Object} pdf - jsPDF document.
 * @param {HTMLImageElement} img - Decoded chart image.
 * @param {string} imageDataUrl - PNG data URL (used when canvas slicing is unavailable).
 * @param {number} imgW - Image width in px.
 * @param {number} imgH - Image height in px.
 * @param {number} margin - Page margin in pt.
 * @param {number} pageH - Page height in pt.
 * @param {number} y - Image top on the first page in pt.
 * @param {number} availH - Available height on the first page in pt.
 * @param {number} contentW - Content width in pt.
 * @param {string} filename - Output filename.
 * @returns {void}
 */
function saveChartPdfPaginatedNonFit(
  pdf: JsPdfDocument,
  img: HTMLImageElement,
  imageDataUrl: string,
  imgW: number,
  imgH: number,
  margin: number,
  pageH: number,
  y: number,
  availH: number,
  contentW: number,
  filename: string
): void {
  const drawHFull = (contentW * imgH) / imgW;
  const sliceCtx = document.createElement('canvas').getContext('2d');
  if (!sliceCtx) {
    saveChartPdfNoCanvasFallback(pdf, imageDataUrl, margin, y, contentW, availH, drawHFull, filename);
    return;
  }
  saveChartPdfPaginatedWithSliceCanvas(
    pdf,
    img,
    sliceCtx,
    margin,
    pageH,
    y,
    contentW,
    imgW,
    imgH,
    drawHFull,
    filename
  );
}

/**
 * Creates the PDF document, writes headers, and saves using the loaded chart image.
 *
 * @param {SaveChartAsMultiPagePdfParams} params - Export inputs.
 * @param {HTMLImageElement} img - Decoded chart image.
 * @param {number} imgW - Image width in px.
 * @param {number} imgH - Image height in px.
 * @returns {void}
 */
function buildAndSaveChartPdf(
  params: SaveChartAsMultiPagePdfParams,
  img: HTMLImageElement,
  imgW: number,
  imgH: number
): void {
  const {
    imageDataUrl,
    title = '',
    timeLine = '',
    filename,
    orientation = 'landscape',
    fitSinglePage = false,
  } = params;
  const pdf = createBlankA4Pdf(orientation);
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 40;
  const { y, availH, contentW } = writeChartPdfHeader(pdf, margin, pageH, title, timeLine);

  if (fitSinglePage) {
    saveChartPdfSinglePageFit(pdf, imageDataUrl, imgW, imgH, margin, contentW, y, availH, filename);
    return;
  }

  saveChartPdfPaginatedNonFit(pdf, img, imageDataUrl, imgW, imgH, margin, pageH, y, availH, contentW, filename);
}

/**
 * Builds a PDF with optional title lines and the chart image.
 * By default, splits across pages when the image is taller than the first page.
 * Set `fitSinglePage` to scale the image down so the chart fits on one page (after the header).
 * Omit `title` and `timeLine` (or pass empty strings) to export only the image.
 *
 * @param {SaveChartAsMultiPagePdfParams} params - Export inputs (see typedef above).
 * @returns {Promise<void>} Resolves after the PDF is generated and the save dialog completes.
 */
export async function saveChartAsMultiPagePdf(params: SaveChartAsMultiPagePdfParams): Promise<void> {
  const img = await loadImageFromDataUrl(params.imageDataUrl);
  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;
  if (imgW <= 0 || imgH <= 0) {
    throw new Error('Invalid image dimensions for PDF export');
  }
  buildAndSaveChartPdf(params, img, imgW, imgH);
}
