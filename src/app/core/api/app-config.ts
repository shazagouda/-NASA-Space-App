import { signal } from '../signals';

export type DataMode = 'offline' | 'live';

export interface AppConfig {
  mode: DataMode;
  /** https origin (or same-origin path) of the data API. Empty = no API. */
  apiBaseUrl: string;
  endpoints: { regions: string; analogs: string; search: string; assistant: string; health: string };
  /** Equirectangular raster per planet + layer, e.g. { mars: { elevation: 'https://…/mars-elev.png' } }. */
  layerRasters: Partial<Record<'moon' | 'mars', Partial<Record<string, string>>>>;
  timeoutMs: number;
  retries: number;
  maxImportKb: number;
}

export const DEFAULT_CONFIG: AppConfig = {
  mode: 'offline',
  apiBaseUrl: '',
  endpoints: { regions: '/regions', analogs: '/analogs', search: '/analogs/search', assistant: '/assistant', health: '/health' },
  layerRasters: {},
  timeoutMs: 8000,
  retries: 1,
  maxImportKb: 2048,
};

/** An API base is accepted only if it is https, or http on localhost (for local development), or a same-origin path. */
export function safeBaseUrl(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const v = raw.trim().replace(/\/+$/, '');
  if (v.startsWith('/') && !v.startsWith('//')) return v;
  try {
    const u = new URL(v);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol === 'https:' || (u.protocol === 'http:' && local)) return u.origin + u.pathname.replace(/\/+$/, '');
  } catch { /* fall through */ }
  return '';
}

export function safeAssetUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.startsWith('assets/') && !raw.includes('..')) return raw;
  const b = safeBaseUrl(raw);
  return b || null;
}

export class ConfigService {
  readonly config = signal<AppConfig>({ ...DEFAULT_CONFIG });
  readonly loadError = signal<string | null>(null);

  async load(): Promise<void> {
    try {
      const res = await fetch('assets/config.json', { cache: 'no-store', credentials: 'omit' });
      if (!res.ok) throw new Error(`config.json returned ${res.status}`);
      this.config.set(this.sanitise(await res.json()));
    } catch (e) {
      this.loadError.set((e as Error).message);
      this.config.set({ ...DEFAULT_CONFIG });
    }
  }

  private sanitise(raw: Record<string, unknown>): AppConfig {
    const d = DEFAULT_CONFIG;
    const num = (v: unknown, lo: number, hi: number, f: number) => (typeof v === 'number' && v >= lo && v <= hi ? v : f);
    const ep = (raw['endpoints'] ?? {}) as Record<string, unknown>;
    const path = (v: unknown, f: string) => (typeof v === 'string' && /^\/[\w\-/]{0,60}$/.test(v) ? v : f);
    const base = safeBaseUrl(raw['apiBaseUrl']);
    const rasters: AppConfig['layerRasters'] = {};
    const lr = (raw['layerRasters'] ?? {}) as Record<string, Record<string, unknown>>;
    for (const p of ['moon', 'mars'] as const) {
      for (const [k, v] of Object.entries(lr[p] ?? {})) {
        const u = safeAssetUrl(v);
        if (u) (rasters[p] ??= {})[k] = u;
      }
    }
    return {
      mode: raw['mode'] === 'live' && base ? 'live' : 'offline',
      apiBaseUrl: base,
      endpoints: {
        regions: path(ep['regions'], d.endpoints.regions), analogs: path(ep['analogs'], d.endpoints.analogs),
        search: path(ep['search'], d.endpoints.search), assistant: path(ep['assistant'], d.endpoints.assistant), health: path(ep['health'], d.endpoints.health),
      },
      layerRasters: rasters,
      timeoutMs: num(raw['timeoutMs'], 1000, 30000, d.timeoutMs),
      retries: num(raw['retries'], 0, 3, d.retries),
      maxImportKb: num(raw['maxImportKb'], 64, 8192, d.maxImportKb),
    };
  }
}

export const configService = new ConfigService();
