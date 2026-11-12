export type PlanetId = 'moon' | 'mars';
export type SiteType = 'base' | 'landing';
export const SITE_TYPE_LABEL: Record<SiteType, string> = { base: 'Base candidate', landing: 'Landing site' };
export type LayerId = 'terrain' | 'elevation' | 'temperature' | 'geology' | 'minerals' | 'slope';

/** How a value was obtained. The UI keeps these four classes visually distinct. */
export type Provenance = 'verified' | 'derived' | 'simulated' | 'unavailable';

export const PROVENANCE_META: Record<Provenance, { label: string; short: string; help: string }> = {
  verified: { label: 'Verified reference', short: 'Verified', help: 'Published reference figure (e.g. gazetteer coordinates, mission-reported extremes). Rounded.' },
  derived: { label: 'Derived measurement', short: 'Derived', help: 'Computed or summarised from published observations, not read directly from a dataset in this app.' },
  simulated: { label: 'Modelled estimate', short: 'Simulated', help: 'Estimated by a model or assumption. It is not a measurement.' },
  unavailable: { label: 'Unavailable', short: 'No data', help: 'No value is available. It is excluded from scoring instead of being treated as a match.' },
};

export interface Measured<T = number> {
  value: T | null;
  unit: string;
  provenance: Provenance;
  source: string;
  /** 0..1 — completeness / reliability of this single value */
  confidence: number;
}

/** Normalised class weights, 0..1 per class. */
export type ClassVector = Record<string, number>;

export const TERRAIN_CLASSES: Record<string, string> = {
  rocky_regolith: 'Rocky regolith',
  basaltic_plain: 'Basaltic plain',
  impact_crater: 'Impact crater',
  volcanic_edifice: 'Volcanic edifice',
  canyon_escarpment: 'Canyon / escarpment',
  polar_ice: 'Polar ice terrain',
  dune_sand: 'Dune field',
  evaporite_flat: 'Evaporite flat',
};
export const GEOLOGY_CLASSES: Record<string, string> = {
  basalt: 'Basalt',
  felsic_highland: 'Felsic / highland crust',
  impact_regolith: 'Impact breccia & regolith',
  sulfate_evaporite: 'Sulfate / evaporite',
  clay_carbonate: 'Clay & carbonate alteration',
  iron_oxide_soil: 'Iron-oxide soil',
  ice_bearing: 'Ice-bearing ground',
  sedimentary_clastic: 'Clastic sedimentary rock',
};
export const MINERAL_CLASSES: Record<string, string> = {
  olivine: 'Olivine',
  pyroxene: 'Pyroxene',
  plagioclase: 'Plagioclase',
  ilmenite: 'Ilmenite (Fe-Ti oxide)',
  iron_oxide: 'Iron oxides',
  sulfate: 'Sulfates',
  phyllosilicate: 'Phyllosilicates (clays)',
  volatile_ice: 'Volatile ices',
};

export interface Fingerprint {
  tempMean: Measured;
  tempMin: Measured;
  tempMax: Measured;
  elevation: Measured;
  slope: Measured;
  /** UNEP-style aridity index P/PET. 0 = no precipitation relative to demand. */
  aridity: Measured;
  terrain: Measured<ClassVector>;
  geology: Measured<ClassVector>;
  minerals: Measured<ClassVector>;
  surfaceTraits: string[];
}

export interface PlanetInfo {
  id: PlanetId;
  name: string;
  label: string;
  tagline: string;
  description: string;
  facts: { k: string; v: string }[];
  modelUrl: string;
  /** Rotation about the polar axis that brings lon=0 toward the camera (rad), applied to the model group. */
  accent: string;
}

export interface Region {
  id: string;
  planet: PlanetId;
  name: string;
  kind: string;
  /** degrees, north positive */
  lat: number;
  /** degrees east, -180..180 */
  lon: number;
  featureSizeKm: number;
  /** Whether this is a candidate base location or a landing site. */
  siteType?: SiteType;
  summary: string;
  surfaceDescription: string;
  geologicalNotes: string[];
  fingerprint: Fingerprint;
}

export interface EarthAnalog {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  blurb: string;
  researchUse: string;
  /** True when the site is an established, published analog research site (used as a benchmark). */
  known?: boolean;
  fingerprint: Fingerprint;
}

export type DimKey = 'temperature' | 'terrain' | 'elevation' | 'geology' | 'mineral' | 'slope' | 'aridity';
export type Weights = Record<DimKey, number>;

export const DIM_LABELS: Record<DimKey, string> = {
  temperature: 'Temperature',
  terrain: 'Terrain',
  elevation: 'Elevation',
  geology: 'Geology',
  mineral: 'Minerals',
  slope: 'Surface slope',
  aridity: 'Aridity',
};

export const DEFAULT_WEIGHTS: Weights = {
  temperature: 20, terrain: 20, elevation: 15, geology: 20, mineral: 10, slope: 10, aridity: 5,
};

export type MatchBand = 'close' | 'partial' | 'distant' | 'unknown';

export interface DimensionResult {
  key: DimKey;
  label: string;
  weight: number;
  effectiveWeight: number;
  similarity: number | null;
  planetValue: string;
  earthValue: string;
  difference: string;
  band: MatchBand;
  explanation: string;
  confidence: number;
  planetProvenance: Provenance;
  earthProvenance: Provenance;
}

export type OverallBand = 'strong' | 'moderate' | 'partial' | 'weak';

export interface RankedAnalog {
  analog: EarthAnalog;
  rank: number;
  similarity: number;
  /** Score if every missing dimension were a total mismatch / a perfect match. */
  low: number;
  high: number;
  confidence: number;
  coverage: number;
  band: OverallBand;
  dims: DimensionResult[];
  matches: DimensionResult[];
  differences: DimensionResult[];
  missing: DimensionResult[];
}
