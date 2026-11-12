import { computed, effect, signal } from '../signals';
import { DEFAULT_WEIGHTS, DimKey, PlanetId, Weights } from '../models/science.model';
import { planetaryData } from '../../services/planetary-data.service';
import { analogSearch } from '../../services/analog-search.service';
import { ranking } from './ranking.service';

const KEY = 'beyond-earth.exploration.v1';

export class ExplorationState {
  private data = planetaryData;
  private analogs = analogSearch;
  private ranking = ranking;

  readonly planetId = signal<PlanetId | null>(null);
  readonly regionId = signal<string | null>(null);
  readonly analogId = signal<string | null>(null);
  readonly weights = signal<Weights>({ ...DEFAULT_WEIGHTS });

  readonly planet = computed(() => (this.planetId() ? this.data.planet(this.planetId()!) : null));
  readonly region = computed(() => this.data.region(this.regionId()) ?? null);
  readonly ranked = computed(() => {
    const r = this.region();
    return r ? this.ranking.rank(r, this.analogs.all(), this.weights()) : [];
  });
  readonly best = computed(() => this.ranked()[0] ?? null);
  readonly selected = computed(() => this.ranked().find(r => r.analog.id === this.analogId()) ?? this.best());
  readonly weightsChanged = computed(() => (Object.keys(DEFAULT_WEIGHTS) as DimKey[]).some(k => Math.abs(this.ranking.normalise(this.weights())[k] - DEFAULT_WEIGHTS[k]) > 0.5));

  constructor() {
    this.restore();
    effect(() => {
      const snap = { p: this.planetId(), r: this.regionId(), a: this.analogId(), w: this.weights() };
      try { sessionStorage.setItem(KEY, JSON.stringify(snap)); } catch { /* storage unavailable */ }
    });
  }

  selectPlanet(id: PlanetId): void {
    if (this.planetId() !== id) { this.regionId.set(null); this.analogId.set(null); }
    this.planetId.set(id);
  }
  selectRegion(id: string): void {
    const r = this.data.region(id);
    if (!r) return;
    this.planetId.set(r.planet);
    if (this.regionId() !== id) this.analogId.set(null);
    this.regionId.set(id);
  }
  selectAnalog(id: string): void { this.analogId.set(id); }
  setWeight(k: DimKey, v: number): void { this.weights.update(w => ({ ...w, [k]: v })); }
  resetWeights(): void { this.weights.set({ ...DEFAULT_WEIGHTS }); }
  reset(): void { this.planetId.set(null); this.regionId.set(null); this.analogId.set(null); this.resetWeights(); }

  /** Compact, URL-safe snapshot of the current analysis (ids and weights only — no data). */
  shareParam(): string | null {
    if (!this.regionId()) return null;
    const snap = { p: this.planetId(), r: this.regionId(), a: this.analogId(), w: this.weights() };
    return btoa(JSON.stringify(snap)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /** Applies a share parameter after validating every field. Returns false (and changes nothing) if anything is off. */
  applyShare(param: string): boolean {
    if (!/^[A-Za-z0-9_-]{8,700}$/.test(param)) return false;
    try {
      const b64 = param.replace(/-/g, '+').replace(/_/g, '/');
      return this.applySnapshot(JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))));
    } catch { return false; }
  }

  private sanitiseWeights(w: unknown): Weights | null {
    if (!w || typeof w !== 'object') return null;
    const out = { ...DEFAULT_WEIGHTS };
    for (const k of Object.keys(DEFAULT_WEIGHTS) as DimKey[]) {
      const v = (w as Record<string, unknown>)[k];
      if (v === undefined) continue;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) return null;
      out[k] = v;
    }
    return out;
  }

  private applySnapshot(s: unknown): boolean {
    if (!s || typeof s !== 'object') return false;
    const o = s as Record<string, unknown>;
    const region = typeof o['r'] === 'string' ? this.data.region(o['r']) : undefined;
    if (!region) return false;
    const w = o['w'] === undefined ? { ...DEFAULT_WEIGHTS } : this.sanitiseWeights(o['w']);
    if (!w) return false;
    this.planetId.set(region.planet);
    this.regionId.set(region.id);
    this.analogId.set(typeof o['a'] === 'string' && this.analogs.byId(o['a']) ? o['a'] : null);
    this.weights.set(w);
    return true;
  }

  private restore(): void {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw && raw.length < 2000) this.applySnapshot(JSON.parse(raw));
    } catch { /* ignore corrupt state */ }
  }
}

export const exploration = new ExplorationState();
