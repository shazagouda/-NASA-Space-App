import { LayerId, PlanetId, Region } from '../models/science.model';
import { configService, safeAssetUrl } from '../api/app-config';

export interface LayerMeta {
  id: LayerId;
  label: string;
  kind: 'none' | 'continuous' | 'categorical';
  unit: string;
  blurb: string;
  /** colour stops for continuous layers, low → high */
  ramp?: string[];
}

export const LAYERS: LayerMeta[] = [
  { id: 'terrain', label: 'Terrain', kind: 'none', unit: '', blurb: 'The photographic surface of the model, with no overlay.' },
  { id: 'elevation', label: 'Elevation', kind: 'continuous', unit: 'm', blurb: 'Height relative to the reference surface.', ramp: ['#1f2a6b', '#2f6f9f', '#4fb59a', '#d7d38a', '#f3e9d8'] },
  { id: 'temperature', label: 'Temperature', kind: 'continuous', unit: '°C', blurb: 'Mean surface temperature.', ramp: ['#2b3a9a', '#3f87d6', '#8fd4d9', '#f1d36b', '#e8704a'] },
  { id: 'geology', label: 'Geology', kind: 'categorical', unit: '', blurb: 'Dominant rock or surface-material class.' },
  { id: 'minerals', label: 'Minerals', kind: 'categorical', unit: '', blurb: 'Dominant mineral class.' },
  { id: 'slope', label: 'Slope', kind: 'continuous', unit: '°', blurb: 'Steepness of the surface.', ramp: ['#1b3a4b', '#2f8f8a', '#c9d36a', '#f2a65a', '#e0503f'] },
];

export const CLASS_COLORS: Record<string, string> = {
  basalt: '#6b7bd6', felsic_highland: '#cfd8e8', impact_regolith: '#9aa7bd', sulfate_evaporite: '#f0d58a', clay_carbonate: '#5fc9a8',
  iron_oxide_soil: '#d9764a', ice_bearing: '#8fe3f2', sedimentary_clastic: '#c79a6b',
  olivine: '#8bd16b', pyroxene: '#6f8fe0', plagioclase: '#e3e8f2', ilmenite: '#a07fd6', iron_oxide: '#d9764a', sulfate: '#f0d58a',
  phyllosilicate: '#5fc9a8', volatile_ice: '#8fe3f2',
};

export interface LayerImage { canvas: HTMLCanvasElement | HTMLImageElement; source: 'model' | 'raster'; legend: LegendData }
export interface LegendData { kind: 'continuous' | 'categorical'; min?: number; max?: number; unit: string; ramp?: string[]; classes?: { label: string; color: string }[]; note: string }
export interface Probe { lat: number; lon: number; nearest: { region: Region; km: number } | null }

const R_KM: Record<PlanetId, number> = { moon: 1737.4, mars: 3389.5 };
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle angle (rad) between two surface points. */
function ang(la1: number, lo1: number, la2: number, lo2: number): number {
  const a = rad(la1), b = rad(la2), dl = rad(lo2 - lo1);
  return Math.acos(Math.min(1, Math.max(-1, Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos(dl))));
}

/**
 * Layer provider. No layer is generated here: an overlay exists only when config.layerRasters names an equirectangular
 * image for that planet and layer, or when the data service supplies one. Until then every layer is reported as unavailable
 * and the globe shows the plain surface.
 */
export class LayerService {
  private cfg = configService;

  meta(id: LayerId): LayerMeta { return LAYERS.find(l => l.id === id)!; }

  rasterUrl(planet: PlanetId, layer: LayerId): string | null {
    const u = this.cfg.config().layerRasters[planet]?.[layer];
    return u ? safeAssetUrl(u) : null;
  }

  /** True when this layer has data to draw. The plain terrain view always works. */
  available(planet: PlanetId, layer: LayerId): boolean {
    return this.meta(layer).kind === 'none' || this.rasterUrl(planet, layer) !== null;
  }

  /** Overlay image for a layer, or null when none is connected. Raster loading plugs in here once real layers exist. */
  render(_planet: PlanetId, _layer: LayerId, _regions: Region[]): LayerImage | null { return null; }

  /** The clicked point and the nearest target region. No values are invented for the point itself. */
  probe(planet: PlanetId, lat: number, lon: number, regions: Region[]): Probe {
    let nearest: Probe['nearest'] = null;
    for (const r of regions) {
      const km = ang(lat, lon, r.lat, r.lon) * R_KM[planet];
      if (!nearest || km < nearest.km) nearest = { region: r, km };
    }
    return { lat, lon, nearest };
  }
}

export const layers = new LayerService();
