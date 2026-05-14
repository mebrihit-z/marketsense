/**
 * Normalize raw base64 image input (optional `data:image/...;base64,` prefix stripped).
 * @param {unknown} raw Value from API (typically a string)
 * @returns {string | undefined} Base64 payload without data URL prefix, or undefined when invalid or empty
 */
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

/**
 * Normalize optional visualization payload from API (snake/camel keys, data-URL prefix).
 * @param {unknown} body Parsed response body
 * @returns {string | undefined} Base64 image string, or undefined when not present or invalid
 */
export function pickVisualizationImageBase64FromResponseBody(body: unknown): string | undefined {
  if (body == null || typeof body !== 'object') return undefined;
  const r = body as Record<string, unknown>;
  const raw =
    r['visualization_image_base64'] ?? r['visualizationImageBase64'] ?? r['visualization_image'];
  return coerceVisualizationImageBase64Payload(raw);
}
