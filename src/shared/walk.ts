/**
 * Depth-first walk over a parsed JSON value, invoking `visit` for every
 * plain object found. Providers use this to fish media descriptors out of
 * deeply nested, frequently-changing API payloads without depending on the
 * exact response shape.
 */
export function walkJson(value: unknown, visit: (obj: Record<string, any>) => void): void {
  if (Array.isArray(value)) {
    for (const entry of value) walkJson(entry, visit);
    return;
  }
  if (value !== null && typeof value === 'object') {
    visit(value as Record<string, any>);
    for (const key of Object.keys(value)) {
      walkJson((value as Record<string, any>)[key], visit);
    }
  }
}

/** Sanitize a string so it is safe to use as (part of) a download filename. */
export function sanitizeFilename(input: string, maxLength = 80): string {
  const cleaned = input
    .replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
  return cleaned || 'video';
}

export function buildFilename(provider: string, title: string | undefined, id: string): string {
  const base = title ? sanitizeFilename(title, 60) : id;
  return `autoclipper/${provider}-${sanitizeFilename(base)}.mp4`;
}
