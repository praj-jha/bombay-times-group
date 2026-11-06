// Small shared helpers used by the build and templates.

export const TZ = 'Asia/Kolkata';

export function esc(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function xmlEsc(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function slugify(text = '') {
  return String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
    .replace(/-+$/g, '');
}

// ISO 8601 timestamp in Indian Standard Time, e.g. 2026-11-06T08:30:00+05:30
export function isoIST(date) {
  const shifted = new Date(date.getTime() + 330 * 60000);
  return shifted.toISOString().replace(/\.\d{3}Z$/, '+05:30');
}

export function fmtDate(date, opts = {}) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric', ...opts,
  }).format(date).replace(/^(\d+) (\w+) (\d+)$/, '$2 $1, $3');
}

export function fmtWeekdayDate(date) {
  const weekday = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'long' }).format(date);
  return `${weekday}, ${fmtDate(date)}`;
}

export function fmtTime(date) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(date).replace(/\s?(am|pm)$/i, (m) => ' ' + m.trim().toUpperCase()) + ' IST';
}

export function fmtDateTime(date) {
  return `${fmtDate(date)}, ${fmtTime(date)}`;
}

export function wordCount(text = '') {
  return String(text).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
}

export function readMinutes(words) {
  return Math.max(1, Math.round(words / 220));
}

export function truncate(text = '', max = 160) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\-–—]+$/, '') + '…';
}

export function stripHtml(html = '') {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
