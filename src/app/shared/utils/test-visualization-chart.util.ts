/* eslint-disable */
/**
 * Builds a PNG (raw base64, no data: prefix) for local export testing.
 * On VDI, real charts come from the backend as `visualization_image_base64`.
 */
export function buildTestVisualizationImageBase64(): string {
  if (typeof document === 'undefined') {
    return MIN_PNG_BASE64;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return MIN_PNG_BASE64;
  }

  ctx.fillStyle = '#f0f2f5';
  ctx.fillRect(0, 0, 640, 400);

  ctx.fillStyle = '#1c2434';
  ctx.font = 'bold 20px system-ui, Segoe UI, sans-serif';
  ctx.fillText('MarketSense — sample visualization', 28, 44);
  ctx.fillStyle = '#5a6578';
  ctx.font = '14px system-ui, Segoe UI, sans-serif';
  ctx.fillText('Local export test (VDI serves real chart from backend)', 28, 72);

  const baseY = 330;
  const barW = 52;
  const gap = 20;
  const heights = [95, 155, 72, 128, 168, 110, 88];
  const colors = ['#2d6a8f', '#c45c3e', '#3d5a80', '#6b9080', '#2d6a8f', '#c45c3e', '#3d5a80'];
  let x = 40;
  heights.forEach((h, i) => {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x, baseY - h, barW, h);
    x += barW + gap;
  });

  ctx.strokeStyle = '#cfd6e0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(32, baseY + 0.5);
  ctx.lineTo(608, baseY + 0.5);
  ctx.stroke();

  const dataUrl = canvas.toDataURL('image/png');
  const idx = dataUrl.indexOf('base64,');
  return idx >= 0 ? dataUrl.slice(idx + 'base64,'.length) : MIN_PNG_BASE64;
}

/** 1×1 PNG fallback if canvas is unavailable */
const MIN_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
