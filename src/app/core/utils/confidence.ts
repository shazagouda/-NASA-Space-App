import { Fingerprint, Measured, RankedAnalog, Region } from '../models/science.model';
import { pct } from './format';

export type ConfidenceBand = 'High' | 'Moderate' | 'Low';
export interface ConfidenceReason { ok: boolean; text: string }
export interface ConfidenceAssessment { score: number; band: ConfidenceBand; reasons: ConfidenceReason[]; headline: string }

export const bandOf = (score: number): ConfidenceBand => (score >= 0.75 ? 'High' : score >= 0.5 ? 'Moderate' : 'Low');

/**
 * Turns the numbers behind a result into reasons a person can read. Every line is derived from a field's
 * provenance and confidence, so the explanation cannot drift away from the data.
 */
export function assessConfidence(region: Region, best: RankedAnalog): ConfidenceAssessment {
  const f: Fingerprint = region.fingerprint;
  const reasons: ConfidenceReason[] = [];
  const one = (m: Measured<unknown>, good: string, weak: string, none: string) => {
    if (m.value === null || m.provenance === 'unavailable') reasons.push({ ok: false, text: none });
    else if (m.provenance === 'simulated' || m.confidence < 0.6) reasons.push({ ok: false, text: `${weak} (${m.provenance}, ${pct(m.confidence)})` });
    else reasons.push({ ok: true, text: `${good} (${m.provenance}, ${pct(m.confidence)})` });
  };
  one(f.terrain as Measured<unknown>, 'Terrain data available', 'Terrain classes are low-confidence', 'No terrain data');
  one(f.geology as Measured<unknown>, 'Geological coverage available', 'Geological coverage is thin or simulated', 'No geological data');
  one(f.tempMean as Measured<unknown>, 'Temperature data available', 'Temperature is estimated rather than measured', 'No temperature data');
  one(f.elevation as Measured<unknown>, 'Elevation data available', 'Elevation is low-confidence', 'No elevation data');
  one(f.slope as Measured<unknown>, 'Slope data available', 'Slope is simulated', 'No slope data');
  one(f.minerals as Measured<unknown>, 'Mineral data available', 'Mineral data is partial or simulated', 'Some mineral data is missing');
  const earthGaps = best.missing.map(d => d.label.toLowerCase());
  if (earthGaps.length) reasons.push({ ok: false, text: `Missing for ${best.analog.name}: ${earthGaps.join(', ')}. These are left out of the score, not counted as a match` });
  if (best.coverage < 1) reasons.push({ ok: false, text: `${pct(best.coverage)} of the weighted data could be compared` });
  else reasons.push({ ok: true, text: 'All weighted dimensions could be compared' });
  // good reasons first, then the weak ones
  reasons.sort((a, b) => Number(b.ok) - Number(a.ok));
  const band = bandOf(best.confidence);
  return { score: best.confidence, band, reasons, headline: `Confidence: ${pct(best.confidence)} — ${band}` };
}
