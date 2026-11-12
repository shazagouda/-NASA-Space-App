import { EarthAnalog, Region } from '../core/models/science.model';
import { catalog } from '../core/services/data-catalog.service';
import { api } from '../core/api/api-client';
import { configService } from '../core/api/app-config';
import { validateBundle } from '../core/security/validators';

export class AnalogSearchService {
  private cat = catalog;
  private api = api;
  private cfg = configService;

  all(): EarthAnalog[] { return this.cat.analogs(); }
  byId(id: string | null | undefined): EarthAnalog | undefined { return this.cat.analogs().find(a => a.id === id); }

  /**
   * Live mode: POST the region id to the search endpoint; the response is validated like any other payload.
   * Imported data: the whole loaded catalogue is returned and scoring does the filtering.
   * `signal` lets a caller cancel (the page unmounting, or the region changing mid-search).
   */
  async search(region: Region | undefined | null, signal?: AbortSignal): Promise<EarthAnalog[]> {
    if (!region) throw new Error('No planetary region selected.');
    if (this.cfg.config().mode === 'live' && this.cat.source() === 'live' && this.api.available) {
      const body = await this.api.post<unknown>('search', { regionId: region.id });
      const arr = Array.isArray(body) ? body : (body as { analogs?: unknown })?.analogs;
      const res = validateBundle({ analogs: arr });
      if (!res.bundle.analogs.length) throw new Error('The search service returned no valid candidate sites.');
      return res.bundle.analogs;
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!this.cat.analogs().length) throw new Error('No Earth sites are loaded yet.');
    return [...this.cat.analogs()];
  }
}
export const analogSearch = new AnalogSearchService();
