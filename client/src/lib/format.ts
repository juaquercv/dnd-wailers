/** Display formatting helpers (Spanish, es-ES). */

const LOCALE = 'es-ES';

type DateInput = string | number | Date | null | undefined;

function toDate(input: DateInput): Date | null {
  if (input === null || input === undefined || input === '') return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });
const timeSecondsFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const relativeFmt = new Intl.RelativeTimeFormat('es', { numeric: 'auto', style: 'long' });

/** "14:05" (or "14:05:33" with seconds). */
export function formatTime(input: DateInput, withSeconds = false): string {
  const d = toDate(input);
  if (!d) return '—';
  return (withSeconds ? timeSecondsFmt : timeFmt).format(d);
}

/** "1 oct 2026". */
export function formatDate(input: DateInput): string {
  const d = toDate(input);
  return d ? dateFmt.format(d) : '—';
}

/** "1 oct 2026, 14:05". */
export function formatDateTime(input: DateInput): string {
  const d = toDate(input);
  return d ? dateTimeFmt.format(d) : '—';
}

const RELATIVE_STEPS: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: 'year', seconds: 365 * 24 * 3600 },
  { unit: 'month', seconds: 30 * 24 * 3600 },
  { unit: 'week', seconds: 7 * 24 * 3600 },
  { unit: 'day', seconds: 24 * 3600 },
  { unit: 'hour', seconds: 3600 },
  { unit: 'minute', seconds: 60 },
];

/** "hace 5 minutos", "ayer", "dentro de 2 horas", "ahora mismo". */
export function formatRelative(input: DateInput, now: Date = new Date()): string {
  const d = toDate(input);
  if (!d) return '—';
  const diffSec = (d.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diffSec);
  if (abs < 45) return 'ahora mismo';
  for (const step of RELATIVE_STEPS) {
    if (abs >= step.seconds || step.unit === 'minute') {
      const value = Math.round(diffSec / step.seconds);
      return relativeFmt.format(value, step.unit);
    }
  }
  return relativeFmt.format(Math.round(diffSec), 'second');
}

const numberFormatters = new Map<number, Intl.NumberFormat>();
function numberFormatter(maxDecimals: number): Intl.NumberFormat {
  let f = numberFormatters.get(maxDecimals);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: maxDecimals, useGrouping: true });
    numberFormatters.set(maxDecimals, f);
  }
  return f;
}

/** "12.500" / "2,5". */
export function formatNumber(n: number | null | undefined, maxDecimals = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return numberFormatter(maxDecimals).format(n);
}

/** "+3" / "−2" / "0" (typographic minus). */
export function formatSigned(n: number): string {
  if (n > 0) return `+${formatNumber(n)}`;
  if (n < 0) return `−${formatNumber(Math.abs(n))}`;
  return '0';
}

/**
 * Gold amount. short=true compacts large amounts ("12,5k", "1,2M").
 * unit is appended when provided (campaigns may rename the currency, default "po").
 */
export function formatGold(n: number | null | undefined, short = false, unit: string | null = 'po'): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  let text: string;
  const abs = Math.abs(n);
  if (short && abs >= 1_000_000) {
    text = `${numberFormatter(1).format(n / 1_000_000)}M`;
  } else if (short && abs >= 10_000) {
    text = `${numberFormatter(1).format(n / 1_000)}k`;
  } else {
    text = numberFormatter(2).format(n);
  }
  return unit ? `${text} ${unit}` : text;
}

/** Challenge rating: 0.125 → "1/8", 0.25 → "1/4", 0.5 → "1/2", 3 → "3". */
export function formatCr(cr: number | null | undefined): string {
  if (cr === null || cr === undefined || !Number.isFinite(cr)) return '—';
  if (Math.abs(cr - 0.125) < 1e-6) return '1/8';
  if (Math.abs(cr - 0.25) < 1e-6) return '1/4';
  if (Math.abs(cr - 0.5) < 1e-6) return '1/2';
  return formatNumber(cr, 2);
}

/** Parse "1/8", "1/4", "1/2" or a number string back to a CR value. */
export function parseCr(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (frac) {
    const den = Number(frac[2]);
    return den ? Number(frac[1]) / den : null;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Weight in kilograms: "2,5 kg". */
export function formatWeight(kg: number | null | undefined): string {
  if (kg === null || kg === undefined || !Number.isFinite(kg)) return '—';
  return `${numberFormatter(2).format(kg)} kg`;
}

/** Seconds → "3:07" or "1:02:45". */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || !Number.isFinite(totalSeconds) || totalSeconds < 0) return '—';
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** File size: "1,2 MB". */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${numberFormatter(1).format(bytes / 1024)} KB`;
  return `${numberFormatter(1).format(bytes / (1024 * 1024))} MB`;
}

/** Spanish plural helper: plural(3, 'zona', 'zonas') → "3 zonas". */
export function plural(n: number, singular: string, pluralForm: string): string {
  return `${formatNumber(n, 0)} ${n === 1 ? singular : pluralForm}`;
}
