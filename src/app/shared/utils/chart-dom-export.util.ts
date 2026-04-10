/* eslint-disable */
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

/** Treemap scroll wrapper (same expansion idea as Sankey). */
const TREEMAP_SCROLL_SELECTORS = '.reallocation-treemap-container';

export function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load export image'));
    img.src = dataUrl;
  });
}

type BoxStyleBackup = {
  overflow: string;
  width: string;
  minWidth: string;
  maxWidth: string;
  height: string;
  minHeight: string;
  maxHeight: string;
};

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

function restoreBoxStyles(el: HTMLElement, b: BoxStyleBackup): void {
  el.style.overflow = b.overflow;
  el.style.width = b.width;
  el.style.minWidth = b.minWidth;
  el.style.maxWidth = b.maxWidth;
  el.style.height = b.height;
  el.style.minHeight = b.minHeight;
  el.style.maxHeight = b.maxHeight;
}

function readSvgLayoutSize(svg: SVGSVGElement): { w: number; h: number } {
  const sw = svg.width?.baseVal?.value ?? parseFloat(svg.getAttribute('width') || '0');
  const sh = svg.height?.baseVal?.value ?? parseFloat(svg.getAttribute('height') || '0');
  return {
    w: Number.isFinite(sw) && sw > 0 ? sw : 0,
    h: Number.isFinite(sh) && sh > 0 ? sh : 0,
  };
}

function expandSankeyCaptureBranch(el: HTMLElement): void {
  el.style.overflow = 'visible';
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
    el.style.width = `${w}px`;
  }
  if (h > 0) {
    el.style.height = `${h}px`;
  }
}

/**
 * Renders visible Sankey / Treemap markup under `root` to a PNG data URL.
 */
export async function captureChartAreaToPng(
  root: HTMLElement,
  options?: { pixelRatio?: number }
): Promise<string> {
  const pixelRatio = options?.pixelRatio ?? 2;
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

  const rootBackup = backupBoxStyles(root);

  try {
    root.style.overflow = 'visible';

    sankeyContainers.forEach((c) => {
      c.style.overflow = 'visible';
    });

    regionals.forEach(expandSankeyCaptureBranch);
    chartScrolls.forEach(expandSankeyCaptureBranch);
    treemapEls.forEach((h) => {
      h.style.overflow = 'visible';
      const w = Math.max(h.scrollWidth, h.offsetWidth, h.clientWidth || 0);
      const ht = Math.max(h.scrollHeight, h.offsetHeight, h.clientHeight || 0);
      if (w > 0) {
        h.style.width = `${w}px`;
      }
      if (ht > 0) {
        h.style.height = `${ht}px`;
      }
    });

    sankeySvgs.forEach((svg) => {
      svg.style.overflow = 'visible';
    });

    void root.offsetWidth;
    void root.getBoundingClientRect();

    sankeyContainers.forEach((c) => {
      const ch = Math.max(c.scrollHeight, c.offsetHeight, c.clientHeight || 0);
      if (ch > 0) {
        c.style.height = `${ch}px`;
      }
    });

    void root.offsetWidth;

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
    });
  } finally {
    modified.reverse().forEach(({ el, backup }) => restoreBoxStyles(el, backup));
    restoreBoxStyles(root, rootBackup);
  }
}

export function downloadDataUrlAsPng(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Builds a PDF with optional title lines and the chart image.
 * By default, splits across pages when the image is taller than the first page.
 * Set `fitSinglePage` to scale the image down so the chart fits on one page (after the header).
 * Omit `title` and `timeLine` (or pass empty strings) to export only the image.
 */
export async function saveChartAsMultiPagePdf(params: {
  imageDataUrl: string;
  title?: string;
  timeLine?: string;
  filename: string;
  orientation?: 'landscape' | 'portrait';
  fitSinglePage?: boolean;
}): Promise<void> {
  const {
    imageDataUrl,
    title = '',
    timeLine = '',
    filename,
    orientation = 'landscape',
    fitSinglePage = false,
  } = params;
  const img = await loadImageFromDataUrl(imageDataUrl);
  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;
  if (imgW <= 0 || imgH <= 0) {
    throw new Error('Invalid image dimensions for PDF export');
  }

  const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 40;
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

  if (fitSinglePage) {
    const scale = Math.min(contentW / imgW, availH / imgH);
    const dispW = imgW * scale;
    const dispH = imgH * scale;
    const x = margin + (contentW - dispW) / 2;
    pdf.addImage(imageDataUrl, 'PNG', x, y, dispW, dispH);
    pdf.save(filename);
    return;
  }

  const drawHFull = (contentW * imgH) / imgW;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const h = Math.min(drawHFull, availH);
    pdf.addImage(imageDataUrl, 'PNG', margin, y, contentW, h);
    pdf.save(filename);
    return;
  }

  let srcTopPx = 0;
  let pageIndex = 0;

  while (srcTopPx < imgH - 0.5) {
    if (pageIndex > 0) {
      pdf.addPage();
    }
    const yStart = pageIndex === 0 ? y : margin;
    const pageAvailH = pageH - yStart - margin;
    const maxSrcH = (pageAvailH / drawHFull) * imgH;
    let srcH = Math.min(imgH - srcTopPx, maxSrcH);
    if (srcH < 1 && srcTopPx < imgH - 0.5) {
      srcH = Math.min(imgH - srcTopPx, 1);
    }
    if (srcH < 1) {
      break;
    }
    const sliceH = Math.ceil(srcH);

    canvas.width = imgW;
    canvas.height = sliceH;
    ctx.clearRect(0, 0, imgW, sliceH);
    ctx.drawImage(img, 0, srcTopPx, imgW, sliceH, 0, 0, imgW, sliceH);
    const sliceData = canvas.toDataURL('image/png');
    const displayH = (sliceH / imgH) * drawHFull;

    pdf.addImage(sliceData, 'PNG', margin, yStart, contentW, displayH);
    srcTopPx += sliceH;
    pageIndex++;
  }

  pdf.save(filename);
}
