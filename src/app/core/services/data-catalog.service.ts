import { computed, signal } from '../signals';
import { EarthAnalog, PlanetId, PlanetInfo, Region } from '../models/science.model';
import { PLANETS } from '../../data/planets';
import { api, ApiError } from '../api/api-client';
import { configService } from '../api/app-config';
import { Bundle, Issue, validateBundle } from '../security/validators';
import { notifications } from './notification.service';

export type DataSource = 'none' | 'imported' | 'live';
export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface CatalogMeta { source: DataSource; label: string; at: number | null; regions: number; analogs: number; note?: string }

/**
 * Single owner of the datasets the UI reads. Regions and Earth sites start empty and come from the live API or an imported file.
 * The planet descriptions in data/planets.ts are fixed reference facts, not a dataset.
 * Every external payload passes through validateBundle() before it can replace anything.
 */
export class DataCatalog {
  private api = api;
  private cfg = configService;
  private notes = notifications;

  readonly planets: Record<PlanetId, PlanetInfo> = PLANETS;
  readonly regions = signal<Region[]>([]);
  readonly analogs = signal<EarthAnalog[]>([]);
  readonly source = signal<DataSource>('none');
  readonly state = signal<LoadState>('ready');
  readonly updatedAt = signal<number | null>(null);
  readonly lastIssues = signal<Issue[]>([]);
  readonly error = signal<string | null>(null);

  readonly meta = computed<CatalogMeta>(() => ({
    source: this.source(),
    label: this.source() === 'live' ? 'Live API' : this.source() === 'imported' ? 'Imported file' : 'No data connected',
    at: this.updatedAt(), regions: this.regions().length, analogs: this.analogs().length,
  }));

  /** Called at start-up when config.mode === 'live'. On failure the catalogue stays empty and a notice says why. */
  async loadLive(): Promise<void> {
    if (this.cfg.config().mode !== 'live') return;
    this.state.set('loading');
    try {
      const [regions, analogs] = await Promise.all([this.api.get('regions'), this.api.get('analogs')]);
      const res = validateBundle({ regions: unwrap(regions, 'regions'), analogs: unwrap(analogs, 'analogs') });
      this.lastIssues.set(res.issues);
      const errors = res.issues.filter(i => i.level === 'error');
      if (!res.bundle.regions.length || !res.bundle.analogs.length) throw new Error(errors[0] ? `${errors[0].path}: ${errors[0].message}` : 'The API returned no usable regions or analogs.');
      this.apply(res.bundle, 'live');
      this.notes.success('Live data connected', `${res.bundle.regions.length} regions and ${res.bundle.analogs.length} Earth sites loaded from the data service.`);
      if (errors.length) this.notes.warn('Some records were skipped', `${errors.length} invalid record${errors.length > 1 ? 's were' : ' was'} rejected.`);
    } catch (e) {
      const msg = (e as ApiError).message ?? (e as Error).message;
      this.error.set(msg);
      this.state.set('error');
      this.notes.error('Live data unavailable', `${msg} No regions or Earth sites are loaded.`, { key: 'live-fail' });
    }
  }

  /** Replace datasets with an already validated bundle. Missing halves keep their previous value. */
  apply(bundle: Bundle, source: DataSource): void {
    if (bundle.regions.length) this.regions.set(bundle.regions);
    if (bundle.analogs.length) this.analogs.set(bundle.analogs);
    this.source.set(source);
    this.updatedAt.set(Date.now());
    this.state.set('ready');
    this.error.set(null);
  }

  clear(): void {
    this.regions.set([]); this.analogs.set([]);
    this.source.set('none'); this.updatedAt.set(null); this.state.set('ready'); this.error.set(null); this.lastIssues.set([]);
  }
}

function unwrap(body: unknown, key: string): unknown {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>)[key])) return (body as Record<string, unknown>)[key];
  if (body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>)['data'])) return (body as Record<string, unknown>)['data'];
  return [];
}

export const catalog = new DataCatalog();
