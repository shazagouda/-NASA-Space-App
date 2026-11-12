import { Fingerprint, TERRAIN_CLASSES, GEOLOGY_CLASSES } from '../models/science.model';
import { topClasses } from './format';

export interface QualRow { key: string; label: string; value: string; known: boolean }

const TERRAIN_WORD: Record<string, string> = {
  rocky_regolith: 'Rocky', basaltic_plain: 'Flat basaltic', impact_crater: 'Cratered', volcanic_edifice: 'Volcanic, rugged',
  canyon_escarpment: 'Rugged, steep-walled', polar_ice: 'Icy', dune_sand: 'Sandy dunes', evaporite_flat: 'Flat, salt-crusted',
};
const GEOLOGY_WORD: Record<string, string> = {
  basalt: 'Volcanic (basalt)', felsic_highland: 'Highland crust', impact_regolith: 'Impact-reworked', sulfate_evaporite: 'Evaporite',
  clay_carbonate: 'Aqueous alteration', iron_oxide_soil: 'Iron-oxide soil', ice_bearing: 'Ice-bearing', sedimentary_clastic: 'Sedimentary',
};

export const tempWord = (c: number): string =>
  c < -120 ? 'Extremely cold' : c < -50 ? 'Very cold' : c < -5 ? 'Cold' : c < 15 ? 'Cool' : c < 30 ? 'Mild' : 'Hot';
export const aridWord = (a: number): string => (a < 0.05 ? 'Extremely high' : a < 0.2 ? 'High' : a < 0.5 ? 'Moderate' : 'Low');
export const slopeWord = (d: number): string => (d < 4 ? 'Gentle' : d < 12 ? 'Moderate' : d < 25 ? 'Steep' : 'Very steep');

/** Plain-language read-out of a fingerprint. Words are derived from the numbers, never typed by hand per site. */
export function qualitative(fp: Fingerprint): QualRow[] {
  const t = fp.tempMean.value, a = fp.aridity.value, s = fp.slope.value;
  const terrKey = topClasses(fp.terrain, TERRAIN_CLASSES, 1, 0)[0]?.key;
  const geoKey = topClasses(fp.geology, GEOLOGY_CLASSES, 1, 0)[0]?.key;
  const dusty = fp.surfaceTraits.some(x => /regolith|dust|soil|sand/i.test(x));
  const rocky = fp.surfaceTraits.some(x => /rock|block|bedrock|boulder/i.test(x)) || terrKey === 'rocky_regolith';
  return [
    { key: 'temperature', label: 'Temperature', value: t == null ? 'Not available' : tempWord(t), known: t != null },
    { key: 'terrain', label: 'Terrain', value: terrKey ? TERRAIN_WORD[terrKey] : 'Not available', known: !!terrKey },
    { key: 'geology', label: 'Geology', value: geoKey ? GEOLOGY_WORD[geoKey] : 'Not available', known: !!geoKey },
    { key: 'aridity', label: 'Aridity', value: a == null ? 'Not available' : aridWord(a), known: a != null },
    { key: 'slope', label: 'Slope', value: s == null ? 'Not available' : slopeWord(s), known: s != null },
    { key: 'surface', label: 'Surface', value: rocky && dusty ? 'Rocky / dusty' : rocky ? 'Rocky' : dusty ? 'Dusty' : 'Mixed', known: true },
  ];
}
