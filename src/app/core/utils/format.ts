import { ClassVector, Measured } from '../models/science.model';

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export function fmtNum(v: number, digits = 0): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtSigned(v: number, digits = 0): string {
  return (v < 0 ? '−' : v > 0 ? '+' : '') + fmtNum(Math.abs(v), digits);
}

export function fmtMeasured(m: Measured | null | undefined, digits = 0): string {
  if (!m || m.value === null) return 'No data';
  const v = m.value as number;
  const abs = Math.abs(v);
  const d = digits || (abs === 0 ? 0 : abs < 0.1 ? 3 : abs < 1 ? 2 : 0);
  const num = (v < 0 ? '−' : '') + fmtNum(abs, d);
  return m.unit === '°C' || m.unit === '°' ? `${num}${m.unit === '°C' ? ' °C' : '°'}` : `${num} ${m.unit}`;
}

export function fmtCoord(lat: number, lon: number): string {
  const la = `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lo = `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
  return `${la}, ${lo}`;
}

export function pct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function topClasses(v: Measured<ClassVector> | null | undefined, labels: Record<string, string>, n = 3, minWeight = 0.15): { key: string; label: string; weight: number }[] {
  if (!v?.value) return [];
  return Object.entries(v.value)
    .filter(([, w]) => w >= minWeight)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, weight]) => ({ key, label: labels[key] ?? key, weight }));
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}
