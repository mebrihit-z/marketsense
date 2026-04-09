/**
 * Same calendar strings as the time-horizon slider handle tooltips above the range handles.
 * "Today" uses the actual current date; "+/- N mo" uses the last day of the target month.
 */
export function formatTimeHorizonSliderHandleDate(horizon: string): string {
  const today = new Date();
  let d: Date;
  if (horizon === 'Today') {
    d = today;
  } else {
    const normalized = horizon.trim().toLowerCase();
    const match = normalized.match(/^([+-]?)(\d+)\s*mo$/);
    if (!match) return horizon;
    const isNegative = match[1] === '-';
    const months = parseInt(match[2], 10);
    const base = new Date(today.getFullYear(), today.getMonth(), 1);
    base.setMonth(base.getMonth() + (isNegative ? -months : months));
    d = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  }
  return formatEnglishShortDate(d);
}

function formatEnglishShortDate(d: Date): string {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
