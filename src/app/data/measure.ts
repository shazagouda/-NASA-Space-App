import { ClassVector, Measured, Provenance } from '../core/models/science.model';

const DEFAULT_CONF: Record<Provenance, number> = { verified: 0.95, derived: 0.75, simulated: 0.4, unavailable: 0 };

export function m(value: number, unit: string, provenance: Provenance, source: string, confidence?: number): Measured {
  return { value, unit, provenance, source, confidence: confidence ?? DEFAULT_CONF[provenance] };
}

export function vec(value: ClassVector, source: string, provenance: Provenance = 'simulated', confidence?: number): Measured<ClassVector> {
  return { value, unit: 'class weights', provenance, source, confidence: confidence ?? DEFAULT_CONF[provenance] };
}

export function none<T = number>(unit: string, source = 'No dataset connected'): Measured<T> {
  return { value: null, unit, provenance: 'unavailable', source, confidence: 0 };
}

export const SRC = {
  gazetteer: 'USGS Gazetteer of Planetary Nomenclature',
  lola: 'LRO LOLA topography, published summary',
  diviner: 'LRO Diviner thermal maps, published summary',
  mola: 'MGS MOLA topography, published summary',
  rover: 'Mars rover REMS / MEDA records, published summary',
  climate: 'Regional climatology summary',
  field: 'Field-site literature, rounded',
};
