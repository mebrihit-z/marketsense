/** Normalize optional visualization payload from API (snake/camel keys, data-URL prefix). */
export function pickVisualizationImageBase64FromResponseBody(body: unknown): string | undefined {
  if (body == null || typeof body !== 'object') return undefined;
  const r = body as Record<string, unknown>;
  const raw =
    r['visualization_image_base64'] ?? r['visualizationImageBase64'] ?? r['visualization_image'];
  return coerceVisualizationImageBase64Payload(raw);
}

export function coerceVisualizationImageBase64Payload(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  if (s.toLowerCase().startsWith('data:image')) {
    const idx = s.indexOf('base64,');
    if (idx !== -1) {
      const payload = s.slice(idx + 'base64,'.length).trim();
      return payload || undefined;
    }
  }
  return s;
}
