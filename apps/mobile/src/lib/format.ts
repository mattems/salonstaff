import type { VerificationStatus } from '@salonstaff/shared';

export function timeAgo(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (days < 30) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const VERIFICATION_LEVELS = {
  0: { label: 'Not verified', description: 'Verify your ID so salons know you’re real.' },
  1: { label: 'ID verified', description: 'Add right to work to become work-ready.' },
  2: { label: 'Work-ready', description: 'Identity and right to work confirmed.' },
} as const;

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  not_started: 'Not started',
  pending: 'In review',
  requires_input: 'Action needed',
  verified: 'Verified',
  failed: 'Failed',
};

export function initials(first?: string | null, last?: string | null, fallback = '?') {
  const s = `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
  return s || fallback.slice(0, 1).toUpperCase();
}

/** `+61412345678` → `0412 345 678` (anything else is returned unchanged). */
export function formatAuMobile(e164: string): string {
  const m = e164.match(/^\+61(4\d{2})(\d{3})(\d{3})$/);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2021-03` → `Mar 2021` */
export function formatMonth(ym: string | null | undefined): string {
  const m = ym?.match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  return `${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}`;
}

export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Inclusive month count, e.g. Mar 2021 → Oct 2024 is "3 yrs 8 mos". */
export function formatDuration(start: string, end: string | null, now = new Date()): string {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = (end ?? currentMonth(now)).split('-').map(Number);
  if (!sy || !sm || !ey || !em) return '';
  const total = Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
  const years = Math.floor(total / 12);
  const months = total % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} ${years === 1 ? 'yr' : 'yrs'}`);
  if (months) parts.push(`${months} ${months === 1 ? 'mo' : 'mos'}`);
  return parts.join(' ');
}

/** `Mar 2021 – Present · 3 yrs 8 mos` */
export function formatPeriod(start: string, end: string | null): string {
  const range = `${formatMonth(start)} – ${end ? formatMonth(end) : 'Present'}`;
  const duration = formatDuration(start, end);
  return duration ? `${range} · ${duration}` : range;
}

/** `2026-12-01` → `1 Dec 2026` */
export function formatIsoDate(iso: string | null | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}`;
}

/** `DD/MM/YYYY` (or `D/M/YYYY`) → `YYYY-MM-DD`, or null if invalid. */
export function parseAuDate(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** `YYYY-MM-DD` → `DD/MM/YYYY` */
export function toAuDate(iso: string | null | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
