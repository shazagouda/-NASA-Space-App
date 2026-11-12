import {
  ClassVector, EarthAnalog, Fingerprint, GEOLOGY_CLASSES, MINERAL_CLASSES, Measured, Provenance, Region, TERRAIN_CLASSES,
} from '../models/science.model';

/**
 * Hand-written validators for every external payload (API, file import, share link).
 * Output is rebuilt field by field, so unknown keys, prototype tricks and oversized strings never reach the app.
 * Text is later rendered through Angular bindings (auto-escaped); map popups escape it again.
 */

export interface Issue { path: string; message: string; level: 'error' | 'warning' }
export interface Bundle { regions: Region[]; analogs: EarthAnalog[] }
export interface ValidationResult { bundle: Bundle; issues: Issue[]; ok: boolean }

const PROV: Provenance[] = ['verified', 'derived', 'simulated', 'unavailable'];
const ID = /^[a-z0-9][a-z0-9-]{1,39}$/;
const MAX_ITEMS = 500;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Strips control characters and angle brackets, then trims and caps length. */
export function cleanText(v: unknown, max = 400): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export class Ctx {
  issues: Issue[] = [];
  err(path: string, message: string) { this.issues.push({ path, message, level: 'error' }); }
  warn(path: string, message: string) { this.issues.push({ path, message, level: 'warning' }); }
}

function measured(v: unknown, path: string, unit: string, c: Ctx, range?: [number, number]): Measured {
  const none: Measured = { value: null, unit, provenance: 'unavailable', source: 'Not supplied', confidence: 0 };
  if (v === undefined || v === null) { c.warn(path, 'missing — treated as unavailable (excluded from scoring)'); return none; }
  // allow a bare number as shorthand for a supplied measurement of unknown provenance
  const o: Obj = isObj(v) ? v : { value: v };
  if (o['value'] === null) return { ...none, source: cleanText(o['source'], 160) || 'Not supplied' };
  if (!isNum(o['value'])) { c.err(path, 'value must be a finite number or null'); return none; }
  if (range && (o['value'] < range[0] || o['value'] > range[1])) { c.err(path, `value ${o['value']} is outside ${range[0]}…${range[1]}`); return none; }
  let prov = o['provenance'] as Provenance;
  if (!PROV.includes(prov)) { c.warn(path, 'provenance missing or invalid — marked "derived"'); prov = 'derived'; }
  if (prov === 'unavailable') return { ...none, source: cleanText(o['source'], 160) || 'Not supplied' };
  const conf = isNum(o['confidence']) && o['confidence'] >= 0 && o['confidence'] <= 1 ? o['confidence'] : 0.6;
  if (o['confidence'] !== undefined && conf !== o['confidence']) c.warn(path, 'confidence must be 0..1 — default used');
  return { value: o['value'], unit: cleanText(o['unit'], 16) || unit, provenance: prov, source: cleanText(o['source'], 160) || 'Supplied dataset', confidence: conf };
}

function classVec(v: unknown, path: string, allowed: Record<string, string>, c: Ctx): Measured<ClassVector> {
  const none: Measured<ClassVector> = { value: null, unit: 'class weights', provenance: 'unavailable', source: 'Not supplied', confidence: 0 };
  if (v === undefined || v === null) { c.warn(path, 'missing — treated as unavailable'); return none; }
  if (!isObj(v)) { c.err(path, 'must be an object'); return none; }
  // accept either {value:{cls:w}, provenance…} or the bare {cls:w}
  const hasEnvelope = isObj(v['value']) || v['value'] === null;
  const raw = hasEnvelope ? v['value'] : v;
  if (raw === null) return { ...none, source: cleanText(v['source'], 160) || 'Not supplied' };
  const out: ClassVector = {};
  for (const [k, w] of Object.entries(raw as Obj)) {
    if (hasEnvelope === false && ['provenance', 'source', 'confidence', 'unit'].includes(k)) continue;
    if (!Object.prototype.hasOwnProperty.call(allowed, k)) { c.warn(`${path}.${k}`, 'unknown class ignored'); continue; }
    if (!isNum(w) || w < 0 || w > 1) { c.err(`${path}.${k}`, 'class weight must be 0..1'); continue; }
    out[k] = w;
  }
  if (!Object.keys(out).length) { c.err(path, 'no valid classes'); return none; }
  const env = hasEnvelope ? v : {};
  let prov = env['provenance'] as Provenance;
  if (!PROV.includes(prov) || prov === 'unavailable') prov = 'derived';
  const conf = isNum(env['confidence']) && env['confidence'] >= 0 && env['confidence'] <= 1 ? env['confidence'] : 0.6;
  return { value: out, unit: 'class weights', provenance: prov, source: cleanText(env['source'], 160) || 'Supplied dataset', confidence: conf };
}

function fingerprint(v: unknown, path: string, c: Ctx): Fingerprint | null {
  if (!isObj(v)) { c.err(path, 'fingerprint object is required'); return null; }
  const tm = measured(v['tempMean'], `${path}.tempMean`, '°C', c, [-300, 600]);
  return {
    tempMean: tm,
    tempMin: measured(v['tempMin'], `${path}.tempMin`, '°C', c, [-300, 600]),
    tempMax: measured(v['tempMax'], `${path}.tempMax`, '°C', c, [-300, 600]),
    elevation: measured(v['elevation'], `${path}.elevation`, 'm', c, [-12000, 30000]),
    slope: measured(v['slope'], `${path}.slope`, '°', c, [0, 90]),
    aridity: measured(v['aridity'], `${path}.aridity`, 'P/PET', c, [0, 10]),
    terrain: classVec(v['terrain'], `${path}.terrain`, TERRAIN_CLASSES, c),
    geology: classVec(v['geology'], `${path}.geology`, GEOLOGY_CLASSES, c),
    minerals: classVec(v['minerals'], `${path}.minerals`, MINERAL_CLASSES, c),
    surfaceTraits: Array.isArray(v['surfaceTraits']) ? v['surfaceTraits'].slice(0, 8).map(t => cleanText(t, 80)).filter(Boolean) : [],
  };
}

function coords(o: Obj, path: string, c: Ctx): { lat: number; lon: number } | null {
  if (!isNum(o['lat']) || o['lat'] < -90 || o['lat'] > 90) { c.err(`${path}.lat`, 'latitude must be −90…90'); return null; }
  if (!isNum(o['lon']) || o['lon'] < -180 || o['lon'] > 360) { c.err(`${path}.lon`, 'longitude must be −180…360'); return null; }
  return { lat: o['lat'], lon: o['lon'] > 180 ? o['lon'] - 360 : o['lon'] };
}

export function validateRegion(v: unknown, path: string, c: Ctx): Region | null {
  if (!isObj(v)) { c.err(path, 'must be an object'); return null; }
  const id = cleanText(v['id'], 40);
  if (!ID.test(id)) { c.err(`${path}.id`, 'id must be lowercase letters, digits and dashes (2–40 chars)'); return null; }
  if (v['planet'] !== 'moon' && v['planet'] !== 'mars') { c.err(`${path}.planet`, 'planet must be "moon" or "mars"'); return null; }
  const name = cleanText(v['name'], 80);
  if (!name) { c.err(`${path}.name`, 'name is required'); return null; }
  const pos = coords(v, path, c); if (!pos) return null;
  const fp = fingerprint(v['fingerprint'], `${path}.fingerprint`, c); if (!fp) return null;
  return {
    id, planet: v['planet'], name, kind: cleanText(v['kind'], 60) || 'Region', ...pos,
    featureSizeKm: isNum(v['featureSizeKm']) && v['featureSizeKm'] > 0 && v['featureSizeKm'] < 20000 ? v['featureSizeKm'] : 10,
    siteType: v['siteType'] === 'base' ? 'base' : 'landing',
    summary: cleanText(v['summary'], 500) || `${name} — imported region.`,
    surfaceDescription: cleanText(v['surfaceDescription'], 500) || 'No surface description supplied.',
    geologicalNotes: Array.isArray(v['geologicalNotes']) ? v['geologicalNotes'].slice(0, 6).map(t => cleanText(t, 200)).filter(Boolean) : [],
    fingerprint: fp,
  };
}

export function validateAnalog(v: unknown, path: string, c: Ctx): EarthAnalog | null {
  if (!isObj(v)) { c.err(path, 'must be an object'); return null; }
  const id = cleanText(v['id'], 40);
  if (!ID.test(id)) { c.err(`${path}.id`, 'id must be lowercase letters, digits and dashes (2–40 chars)'); return null; }
  const name = cleanText(v['name'], 80);
  if (!name) { c.err(`${path}.name`, 'name is required'); return null; }
  const pos = coords(v, path, c); if (!pos) return null;
  const fp = fingerprint(v['fingerprint'], `${path}.fingerprint`, c); if (!fp) return null;
  return {
    id, name, country: cleanText(v['country'], 60) || 'Unspecified', ...pos,
    blurb: cleanText(v['blurb'], 500) || `${name} — imported candidate site.`,
    researchUse: cleanText(v['researchUse'], 300) || 'No research use supplied.',
    known: v['known'] === true,
    fingerprint: fp,
  };
}

export function validateBundle(raw: unknown): ValidationResult {
  const c = new Ctx();
  const bundle: Bundle = { regions: [], analogs: [] };
  if (!isObj(raw)) { c.err('$', 'top level must be an object with "regions" and/or "analogs" arrays'); return { bundle, issues: c.issues, ok: false }; }
  const seen = new Set<string>();
  const run = <T extends { id: string }>(key: 'regions' | 'analogs', fn: (v: unknown, p: string, c: Ctx) => T | null, out: T[]) => {
    const arr = raw[key];
    if (arr === undefined) return;
    if (!Array.isArray(arr)) { c.err(key, 'must be an array'); return; }
    if (arr.length > MAX_ITEMS) c.err(key, `at most ${MAX_ITEMS} items are accepted`);
    arr.slice(0, MAX_ITEMS).forEach((item, i) => {
      const r = fn(item, `${key}[${i}]`, c);
      if (!r) return;
      const uid = `${key}:${r.id}`;
      if (seen.has(uid)) { c.err(`${key}[${i}].id`, `duplicate id "${r.id}"`); return; }
      seen.add(uid); out.push(r);
    });
  };
  run('regions', validateRegion, bundle.regions);
  run('analogs', validateAnalog, bundle.analogs);
  if (!bundle.regions.length && !bundle.analogs.length && !c.issues.some(i => i.level === 'error')) c.err('$', 'nothing to import');
  return { bundle, issues: c.issues, ok: !c.issues.some(i => i.level === 'error') };
}

/* ─────────── CSV ─────────── */

/** Minimal RFC-4180 parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); if (row.some(x => x.trim())) rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  row.push(cur); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}

/**
 * Flat CSV → bundle. Columns: id,name,planet,country,lat,lon,siteType,known,tempMean,tempMin,tempMax,elevation,slope,aridity,
 * terrain,geology,minerals,provenance,source — class columns look like "basalt=0.8|felsic_highland=0.3".
 */
export function csvToRaw(text: string, kind: 'regions' | 'analogs'): { raw: Obj; issues: Issue[] } {
  const rows = parseCsv(text);
  const issues: Issue[] = [];
  if (rows.length < 2) return { raw: {}, issues: [{ path: 'csv', message: 'needs a header row and at least one data row', level: 'error' }] };
  const head = rows[0].map(h => h.trim());
  const items: Obj[] = [];
  rows.slice(1, MAX_ITEMS + 1).forEach((r, ri) => {
    const g = (k: string) => r[head.indexOf(k)]?.trim() ?? '';
    const prov = (g('provenance') || 'derived') as Provenance;
    const source = g('source') || 'CSV import';
    const mm = (k: string) => (g(k) === '' ? undefined : { value: Number(g(k)), provenance: prov, source });
    const cls = (k: string) => {
      if (!g(k)) return undefined;
      const o: Obj = {};
      g(k).split('|').forEach(p => { const [a, b] = p.split('='); if (a) o[a.trim()] = Number(b); });
      return { value: o, provenance: prov, source };
    };
    const base: Obj = {
      id: g('id'), name: g('name'), lat: g('lat') === '' ? NaN : Number(g('lat')), lon: g('lon') === '' ? NaN : Number(g('lon')),
      blurb: g('blurb'), summary: g('summary'),
      fingerprint: {
        tempMean: mm('tempMean'), tempMin: mm('tempMin'), tempMax: mm('tempMax'), elevation: mm('elevation'),
        slope: mm('slope'), aridity: mm('aridity'), terrain: cls('terrain'), geology: cls('geology'), minerals: cls('minerals'),
        surfaceTraits: g('surfaceTraits') ? g('surfaceTraits').split('|') : [],
      },
    };
    if (kind === 'regions') { base['planet'] = g('planet'); base['siteType'] = g('siteType'); base['kind'] = g('kind'); }
    else { base['country'] = g('country'); base['known'] = g('known').toLowerCase() === 'true'; }
    if (!g('id')) issues.push({ path: `csv row ${ri + 2}`, message: 'missing id', level: 'error' });
    items.push(base);
  });
  return { raw: { [kind]: items }, issues };
}
