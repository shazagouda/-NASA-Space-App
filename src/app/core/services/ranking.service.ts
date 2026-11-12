import {
  ClassVector, DEFAULT_WEIGHTS, DimKey, DimensionResult, DIM_LABELS, EarthAnalog, Fingerprint, GEOLOGY_CLASSES, MatchBand,
  Measured, MINERAL_CLASSES, OverallBand, RankedAnalog, Region, TERRAIN_CLASSES, Weights,
} from '../models/science.model';
import { clamp, fmtMeasured, fmtNum, joinList, topClasses } from '../utils/format';

const DIM_ORDER: DimKey[] = ['temperature', 'terrain', 'elevation', 'geology', 'mineral', 'slope', 'aridity'];

interface Raw {
  similarity: number | null;
  planetValue: string;
  earthValue: string;
  difference: string;
  confidence: number;
  explain: (band: MatchBand) => string;
  pp: Measured;
  ep: Measured;
}

function cosine(a: ClassVector, b: ClassVector): number {
  let dot = 0, na = 0, nb = 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.forEach(k => { const x = a[k] ?? 0, y = b[k] ?? 0; dot += x * y; na += x * x; nb += y * y; });
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function thermalClass(c: number): string {
  if (c < -100) return 'cryogenic';
  if (c < -30) return 'bitterly cold';
  if (c < 5) return 'cold';
  if (c < 25) return 'mild';
  return 'hot';
}
function slopeClass(d: number): string { return d < 7 ? 'gentle' : d < 15 ? 'moderate' : 'steep'; }
function aridClass(ai: number): string { return ai < 0.05 ? 'hyperarid' : ai < 0.2 ? 'arid' : ai < 0.5 ? 'semi-arid' : 'humid'; }

export class RankingService {
  readonly defaultWeights: Weights = { ...DEFAULT_WEIGHTS };

  normalise(weights: Weights): Weights {
    const sum = DIM_ORDER.reduce((s, k) => s + Math.max(0, weights[k]), 0);
    if (!sum) return { ...DEFAULT_WEIGHTS };
    const out = {} as Weights;
    DIM_ORDER.forEach(k => (out[k] = (Math.max(0, weights[k]) / sum) * 100));
    return out;
  }

  rank(region: Region, analogs: EarthAnalog[], weights: Weights): RankedAnalog[] {
    const w = this.normalise(weights);
    return analogs
      .map(a => this.compare(region, a, w))
      .sort((x, y) => y.similarity - x.similarity || y.confidence - x.confidence)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  compare(region: Region, analog: EarthAnalog, weights: Weights): RankedAnalog {
    const w = this.normalise(weights);
    const raws = DIM_ORDER.map(k => ({ k, r: this.dimension(k, region.fingerprint, analog.fingerprint) }));
    const available = raws.filter(x => x.r.similarity !== null);
    const availW = available.reduce((s, x) => s + w[x.k], 0);
    const weighted = available.reduce((s, x) => s + w[x.k] * (x.r.similarity as number), 0);
    const missingW = 100 - availW;

    const dims: DimensionResult[] = raws.map(({ k, r }) => {
      const sim = r.similarity;
      const band: MatchBand = sim === null ? 'unknown' : sim >= 0.75 ? 'close' : sim >= 0.45 ? 'partial' : 'distant';
      return {
        key: k, label: DIM_LABELS[k], weight: w[k],
        effectiveWeight: sim === null || !availW ? 0 : (w[k] / availW) * 100,
        similarity: sim, planetValue: r.planetValue, earthValue: r.earthValue, difference: r.difference,
        band, explanation: r.explain(band), confidence: r.confidence,
        planetProvenance: r.pp.provenance, earthProvenance: r.ep.provenance,
      };
    });

    const similarity = availW ? weighted / availW : 0;
    const confidence = dims.reduce((s, d) => s + (d.weight / 100) * d.confidence, 0);
    const band: OverallBand = similarity >= 0.75 ? 'strong' : similarity >= 0.55 ? 'moderate' : similarity >= 0.35 ? 'partial' : 'weak';

    const known = dims.filter(d => d.similarity !== null);
    const matches = known.filter(d => d.band === 'close').sort((a, b) => b.weight * (b.similarity as number) - a.weight * (a.similarity as number));
    const differences = known.filter(d => d.band !== 'close').sort((a, b) => (a.similarity as number) - (b.similarity as number));

    return {
      analog, rank: 0, similarity,
      low: weighted / 100,
      high: (weighted + missingW) / 100,
      confidence, coverage: availW / 100, band,
      dims, matches, differences, missing: dims.filter(d => d.band === 'unknown'),
    };
  }

  /* ───────── per-dimension models ───────── */

  private dimension(k: DimKey, p: Fingerprint, e: Fingerprint): Raw {
    switch (k) {
      case 'temperature': return this.temperature(p, e);
      case 'elevation': return this.elevation(p, e);
      case 'slope': return this.slope(p, e);
      case 'aridity': return this.aridity(p, e);
      case 'terrain': return this.classes(p.terrain, e.terrain, TERRAIN_CLASSES, 'terrain');
      case 'geology': return this.classes(p.geology, e.geology, GEOLOGY_CLASSES, 'rock and ground type');
      case 'mineral': return this.classes(p.minerals, e.minerals, MINERAL_CLASSES, 'mineral signature');
    }
  }

  private missing(pp: Measured, ep: Measured, planet: string, earth: string, what: string): Raw {
    return {
      similarity: null, planetValue: planet, earthValue: earth, difference: 'Not comparable', confidence: 0, pp, ep,
      explain: () => `No ${what} is available for one of the two sites, so it is left out of the score instead of counting as a match. Remaining weights are rescaled and the score range widens.`,
    };
  }

  private temperature(p: Fingerprint, e: Fingerprint): Raw {
    const pm = p.tempMean.value, em = e.tempMean.value;
    if (pm === null || em === null) return this.missing(p.tempMean, e.tempMean, fmtMeasured(p.tempMean), fmtMeasured(e.tempMean), 'mean temperature');
    const pr = p.tempMax.value !== null && p.tempMin.value !== null ? p.tempMax.value - p.tempMin.value : null;
    const er = e.tempMax.value !== null && e.tempMin.value !== null ? e.tempMax.value - e.tempMin.value : null;
    const sMean = 1 - clamp(Math.abs(pm - em) / 80);
    const sRange = pr !== null && er !== null ? 1 - clamp(Math.abs(pr - er) / 150) : null;
    const sim = sRange === null ? sMean : 0.6 * sMean + 0.4 * sRange;
    const conf = Math.min(p.tempMean.confidence, e.tempMean.confidence);
    const dm = Math.abs(pm - em);
    return {
      similarity: sim, confidence: conf, pp: p.tempMean, ep: e.tempMean,
      planetValue: `${fmtMeasured(p.tempMean)} mean${pr !== null ? ` · ${fmtNum(pr)} K swing` : ''}`,
      earthValue: `${fmtMeasured(e.tempMean)} mean${er !== null ? ` · ${fmtNum(er)} K swing` : ''}`,
      difference: `${fmtNum(dm)} K in mean${pr !== null && er !== null ? `, ${fmtNum(Math.abs(pr - er))} K in swing` : ''}`,
      explain: band => {
        const pc = thermalClass(pm), ec = thermalClass(em);
        if (band === 'close') return `Both sites sit in a ${pc === ec ? pc : 'similar'} thermal regime (${fmtNum(pm)} °C vs ${fmtNum(em)} °C mean), with comparable temperature swings. That gives similar freeze–thaw and thermal-stress conditions for hardware.`;
        if (band === 'partial') return `The planetary site is ${pc} and the analog is ${ec}: the means differ by ${fmtNum(dm)} K. Thermal cycling is of the same kind but not the same intensity.`;
        return `The planetary site is ${pc} (${fmtNum(pm)} °C) while the analog is ${ec} (${fmtNum(em)} °C). A ${fmtNum(dm)} K gap means thermal behaviour of soils, ice and equipment will differ a lot.`;
      },
    };
  }

  private elevation(p: Fingerprint, e: Fingerprint): Raw {
    const pv = p.elevation.value, ev = e.elevation.value;
    if (pv === null || ev === null) return this.missing(p.elevation, e.elevation, fmtMeasured(p.elevation), fmtMeasured(e.elevation), 'elevation');
    const d = Math.abs(pv - ev);
    return {
      similarity: 1 - clamp(d / 6000), confidence: Math.min(p.elevation.confidence, e.elevation.confidence), pp: p.elevation, ep: e.elevation,
      planetValue: fmtMeasured(p.elevation), earthValue: fmtMeasured(e.elevation), difference: `${fmtNum(d)} m apart`,
      explain: band => `${band === 'close' ? 'The two sites sit at similar heights' : band === 'partial' ? 'The sites differ by a few kilometres of height' : `The heights are ${fmtNum(d / 1000, 1)} km apart`}. Heights use different datums (a reference sphere on the Moon and Mars, mean sea level on Earth), so this is a weak, low-weight comparison.`,
    };
  }

  private slope(p: Fingerprint, e: Fingerprint): Raw {
    const pv = p.slope.value, ev = e.slope.value;
    if (pv === null || ev === null) return this.missing(p.slope, e.slope, fmtMeasured(p.slope), fmtMeasured(e.slope), 'slope model');
    const d = Math.abs(pv - ev);
    return {
      similarity: 1 - clamp(d / 25), confidence: Math.min(p.slope.confidence, e.slope.confidence), pp: p.slope, ep: e.slope,
      planetValue: fmtMeasured(p.slope), earthValue: fmtMeasured(e.slope), difference: `${fmtNum(d, 1)}° apart`,
      explain: band => {
        const pc = slopeClass(pv), ec = slopeClass(ev);
        return band === 'close'
          ? `Both surfaces are ${pc === ec ? pc : 'similar in steepness'} (${fmtNum(pv)}° vs ${fmtNum(ev)}° mean), so mobility and landing tests transfer reasonably.`
          : `The planetary surface is ${pc} (${fmtNum(pv)}°) and the analog is ${ec} (${fmtNum(ev)}°). Traction, tipping risk and path planning will not transfer directly.`;
      },
    };
  }

  private aridity(p: Fingerprint, e: Fingerprint): Raw {
    const pv = p.aridity.value, ev = e.aridity.value;
    if (pv === null || ev === null) return this.missing(p.aridity, e.aridity, fmtMeasured(p.aridity), fmtMeasured(e.aridity), 'aridity index');
    const dryness = (ai: number) => clamp(1 - ai / 0.65);
    const sim = 1 - Math.abs(dryness(pv) - dryness(ev));
    return {
      similarity: sim, confidence: Math.min(p.aridity.confidence, e.aridity.confidence), pp: p.aridity, ep: e.aridity,
      planetValue: `${fmtMeasured(p.aridity)} (${aridClass(pv)})`, earthValue: `${fmtMeasured(e.aridity)} (${aridClass(ev)})`,
      difference: `${aridClass(pv)} vs ${aridClass(ev)}`,
      explain: band => band === 'close'
        ? `Both are ${aridClass(pv) === aridClass(ev) ? aridClass(pv) : 'very dry'}: liquid water is almost absent at the surface, so weathering is slow and salts and fine dust persist.`
        : `The planetary site is ${aridClass(pv)} while the analog is ${aridClass(ev)}. Liquid water at the surface will shape the analog far more than it does today on the planetary site.`,
    };
  }

  private classes(pv: Measured<ClassVector>, ev: Measured<ClassVector>, labels: Record<string, string>, what: string): Raw {
    if (!pv.value || !ev.value) {
      return this.missing((pv as unknown as Measured), (ev as unknown as Measured), pv.value ? 'Available' : 'No data', ev.value ? 'Available' : 'No data', what);
    }
    const sim = cosine(pv.value, ev.value);
    const pt = topClasses(pv, labels, 3), et = topClasses(ev, labels, 3);
    const shared = pt.filter(a => (ev.value as ClassVector)[a.key] >= 0.4 && a.weight >= 0.4).map(a => a.label.toLowerCase());
    const dom = (t: typeof pt) => t.slice(0, 2).map(x => x.label.toLowerCase());
    return {
      similarity: sim, confidence: Math.min(pv.confidence, ev.confidence), pp: (pv as unknown as Measured), ep: (ev as unknown as Measured),
      planetValue: pt.map(x => x.label).join(', '), earthValue: et.map(x => x.label).join(', '),
      difference: `${fmtNum((1 - sim) * 100)}% divergence`,
      explain: band => {
        if (band === 'close') return `Both sites are characterised by ${joinList(shared.length ? shared : dom(pt))}. Their ${what} overlaps strongly, which makes them useful for comparative field work.`;
        if (band === 'partial') return `The ${what} overlaps in part${shared.length ? ` (${joinList(shared)})` : ''}. The planetary site is mainly ${joinList(dom(pt))}; the analog is mainly ${joinList(dom(et))}.`;
        return `The ${what} differs. The planetary site is mainly ${joinList(dom(pt))}, whereas the analog is mainly ${joinList(dom(et))}, so only limited transfer should be expected.`;
      },
    };
  }
}

export const ranking = new RankingService();
