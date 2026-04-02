/**
 * Returns a human-readable relative date string for a given Date or timestamp.
 *
 * - Within the last 60 minutes: "{N} minutes ago"
 * - Within the last 24 hours: "{N} hours ago"
 * - Within the last 7 days: "{N} days ago"
 * - Older than 7 days: locale date string (e.g. "Mar 15, 2026")
 */
export function formatRelativeDate(date: Date | string | number): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 60) {
    const n = Math.max(diffMinutes, 1);
    return `${n} minute${n === 1 ? '' : 's'} ago`;
  }

  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  if (diffDays <= 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }

  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
