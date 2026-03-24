/* eslint-disable */
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

/** Scrollable chart wrappers to expand so full SVG / treemap width is captured */
const SCROLL_EXPAND_SELECTORS = '.sankey-chart-scroll, .reallocation-treemap-container';

export function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load export image'));
    img.src = dataUrl;
  });
}

type BoxStyleBackup = { overflow: string; width: string; minWidth: string; maxWidth: string };

function backupBoxStyles(el: HTMLElement): BoxStyleBackup {
  return {
    overflow: el.style.overflow,
    width: el.style.width,
    minWidth: el.style.minWidth,
    maxWidth: el.style.maxWidth,
  };
}

function restoreBoxStyles(el: HTMLElement, b: BoxStyleBackup): void {
  el.style.overflow = b.overflow;
  el.style.width = b.width;
  el.style.minWidth = b.minWidth;
  el.style.maxWidth = b.maxWidth;
}

/**
 * Renders visible Sankey / Treemap markup under `root` to a PNG data URL.
 */
export async function captureChartAreaToPng(
  root: HTMLElement,
  options?: { pixelRatio?: number }
): Promise<string> {
  const pixelRatio = options?.pixelRatio ?? 2;
  const scrollEls = Array.from(root.querySelectorAll(SCROLL_EXPAND_SELECTORS)) as HTMLElement[];
  const scrollBackups = scrollEls.map(backupBoxStyles);
  const rootBackup = backupBoxStyles(root);

  try {
    root.style.overflow = 'visible';
    scrollEls.forEach((h) => {
      h.style.overflow = 'visible';
      const w = Math.max(h.scrollWidth, h.offsetWidth, h.clientWidth || 0);
      if (w > 0) {
        h.style.width = `${w}px`;
      }
    });

    return await toPng(root, {
      pixelRatio,
      cacheBust: true,
      backgroundColor: '#ffffff',
    });
  } finally {
    scrollEls.forEach((h, i) => restoreBoxStyles(h, scrollBackups[i]));
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
 * Builds a PDF with title lines and the chart image, splitting across pages when the image is tall.
 */
export async function saveChartAsMultiPagePdf(params: {
  imageDataUrl: string;
  title: string;
  timeLine: string;
  filename: string;
  orientation?: 'landscape' | 'portrait';
}): Promise<void> {
  const { imageDataUrl, title, timeLine, filename, orientation = 'landscape' } = params;
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
  pdf.setFontSize(14);
  pdf.text(title, margin, y);
  y += 18;
  pdf.setFontSize(10);
  pdf.text(timeLine, margin, y);
  y += 22;

  const drawHFull = (contentW * imgH) / imgW;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const h = Math.min(drawHFull, pageH - y - margin);
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
    const availH = pageH - yStart - margin;
    const maxSrcH = (availH / drawHFull) * imgH;
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
