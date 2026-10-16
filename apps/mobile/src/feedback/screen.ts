const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isFeedbackUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

export function feedbackScreenFromPath(pathname: string): string {
  const parts = pathname
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.startsWith('('));
  if (parts.includes('draft')) return 'draft';
  if (parts.includes('quote')) return 'quote';
  const last = parts[parts.length - 1];
  if (!last || isFeedbackUuid(last)) return 'app';
  return last.slice(0, 64);
}

/** Quote id only while the tester is on a draft or quote screen. */
export function feedbackQuoteIdFromPath(pathname: string, id: unknown): string | null {
  const screen = feedbackScreenFromPath(pathname);
  if (screen !== 'draft' && screen !== 'quote') return null;
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  return isFeedbackUuid(trimmed) ? trimmed : null;
}

export function firstRouteParam(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}
