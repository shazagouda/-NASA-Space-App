import { exploration } from '../core/services/exploration-state.service';
import { ranking } from '../core/services/ranking.service';
import { DIM_LABELS, DimKey, GEOLOGY_CLASSES, MINERAL_CLASSES, PROVENANCE_META, RankedAnalog, Region, TERRAIN_CLASSES } from '../core/models/science.model';
import { fmtCoord, fmtMeasured, fmtNum, joinList, pct, topClasses } from '../core/utils/format';
import { ConfidenceAssessment, assessConfidence } from '../core/utils/confidence';
import { Benchmark, benchmark } from '../core/utils/benchmark';
import { QualRow, qualitative } from '../core/utils/qualitative';
import { PHYSICS, PhysicsRow } from '../data/planet-physics';
import { SITE_TYPE_LABEL } from '../core/models/science.model';
import { catalog } from '../core/services/data-catalog.service';

export interface ReportRow { label: string; value: string; provenance: string; source: string; confidence: string; }
export interface ReportModel {
  id: string;
  generated: string;
  planet: string;
  region: Region;
  coord: string;
  rows: ReportRow[];
  weights: { label: string; value: string }[];
  ranked: RankedAnalog[];
  best: RankedAnalog;
  summary: string;
  limitations: string[];
  caveats: string[];
  siteTypeLabel: string;
  qual: QualRow[];
  confidence: ConfidenceAssessment;
  bench: Benchmark;
  physics: PhysicsRow[];
  whyMatches: string[];
  dataSource: string;
}

export class ReportService {
  private state = exploration;
  private ranking = ranking;
  private catalog = catalog;

  build(): ReportModel | null {
    const region = this.state.region(), planet = this.state.planet(), best = this.state.selected(), ranked = this.state.ranked();
    if (!region || !planet || !best) return null;
    const f = region.fingerprint;
    const row = (label: string, value: string, m: { provenance: keyof typeof PROVENANCE_META; source: string; confidence: number }): ReportRow =>
      ({ label, value, provenance: PROVENANCE_META[m.provenance].label, source: m.source, confidence: m.provenance === 'unavailable' ? 'n/a' : pct(m.confidence) });
    const cls = (v: typeof f.terrain, l: Record<string, string>) => topClasses(v, l, 3).map(x => `${x.label} (${(x.weight * 100).toFixed(0)})`).join(', ');
    const now = new Date();
    const w = this.ranking.normalise(this.state.weights());
    const m = best.matches.slice(0, 2).map(d => d.label.toLowerCase()), x = best.differences.slice(0, 2).map(d => d.label.toLowerCase());
    const WHY: Record<string, string> = { terrain: 'Similar terrain', geology: 'Similar geology', aridity: 'Similar aridity', temperature: 'Similar temperature behavior', mineral: 'Similar mineral content', slope: 'Similar surface slope', elevation: 'Similar elevation' };
    const whyMatches = best.matches.length ? best.matches.map(d => WHY[d.key]) : ['No dimension matches closely'];
    return {
      siteTypeLabel: SITE_TYPE_LABEL[region.siteType ?? 'landing'],
      qual: qualitative(f), confidence: assessConfidence(region, best), bench: benchmark(ranked, best),
      physics: PHYSICS[region.planet], whyMatches, dataSource: this.catalog.meta().label,
      id: `BE-${region.id.toUpperCase().slice(0, 4)}-${best.analog.id.toUpperCase().slice(0, 4)}-${now.toISOString().slice(0, 10).replace(/-/g, '')}`,
      generated: now.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' }),
      planet: planet.name, region, coord: fmtCoord(region.lat, region.lon),
      rows: [
        row('Mean temperature', fmtMeasured(f.tempMean), f.tempMean),
        row('Temperature range', `${fmtMeasured(f.tempMin)} to ${fmtMeasured(f.tempMax)}`, f.tempMin),
        row('Elevation', fmtMeasured(f.elevation), f.elevation),
        row('Mean surface slope', fmtMeasured(f.slope), f.slope),
        row('Aridity index (P/PET)', fmtMeasured(f.aridity, 4), f.aridity),
        row('Terrain classes', cls(f.terrain, TERRAIN_CLASSES), f.terrain),
        row('Geological composition', cls(f.geology, GEOLOGY_CLASSES), f.geology),
        row('Mineral characteristics', cls(f.minerals, MINERAL_CLASSES), f.minerals),
      ],
      weights: (Object.keys(w) as DimKey[]).map(k => ({ label: DIM_LABELS[k], value: `${fmtNum(w[k])}%` })),
      ranked, best,
      summary: `${best.analog.name} (${best.analog.country}) is the selected analog for ${region.name} on the ${planet.name}, ranked #${best.rank} of ${ranked.length}. It is a ${best.band} match with similarity ${pct(best.similarity)} and data confidence ${pct(best.confidence)}${m.length ? `. It matches most closely on ${joinList(m)}` : ''}${x.length ? ` and differs most on ${joinList(x)}` : ''}.`,
      limitations: [
        'An Earth analog shares selected characteristics with a Moon or Mars region. It is not an identical copy.',
        'Earth differs in atmosphere, gravity, radiation exposure, geological history and active surface processes.',
        'Use analogs to study chosen comparable characteristics, not to claim that the environments are the same.',
      ],
      caveats: [
        `Dataset source: ${this.catalog.meta().label}. Check each value's provenance label before citing it.`,
        'Values labelled Simulated are modelled estimates, not measurements.',
        'Scoring weights are configurable and are not official NASA weights.',
        'Missing data is excluded from the score and never counted as a match.',
      ],
    };
  }

  async downloadPdf(): Promise<void> {
    const r = this.build();
    if (!r) throw new Error('Nothing to report yet. Select a region first.');
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 18, CW = W - M * 2;
    let y = M;
    const clean = (s: string) => s.replace(/−/g, '-').replace(/[–—]/g, '-').replace(/≈/g, '~').replace(/₂/g, '2').replace(/[“”]/g, '"').replace(/[’]/g, "'").replace(/·/g, '|');
    const ensure = (h: number) => { if (y + h > 280) { doc.addPage(); y = M; } };
    const h2 = (t: string) => { ensure(14); y += 4; doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(10, 20, 40).text(clean(t), M, y); y += 2; doc.setDrawColor(72, 217, 232).setLineWidth(0.5).line(M, y, M + 24, y); y += 6; };
    const p = (t: string, size = 9.5, color: [number, number, number] = [40, 50, 70]) => { doc.setFont('helvetica', 'normal').setFontSize(size).setTextColor(...color); const lines = doc.splitTextToSize(clean(t), CW) as string[]; ensure(lines.length * (size * 0.45) + 2); doc.text(lines, M, y); y += lines.length * (size * 0.45) + 2; };

    doc.setFillColor(5, 8, 18).rect(0, 0, W, 38, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(72, 217, 232).text('TERRATWIN', M, 14);
    doc.setFontSize(20).setTextColor(244, 247, 252).text('Final analog report', M, 26);
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(148, 163, 184).text(clean(`${r.id}  |  Generated ${r.generated}`), M, 33);
    y = 48;

    h2('1. Result');
    const kv = (k: string, v: string) => { ensure(7); doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(10, 20, 40).text(clean(k), M, y); doc.setFont('helvetica', 'normal').setTextColor(40, 50, 70); const l = doc.splitTextToSize(clean(v), CW - 48) as string[]; doc.text(l, M + 48, y); y += Math.max(l.length * 4.2, 5.5) + 1.5; };
    kv('Selected region', `${r.region.name}, ${r.planet} (${r.siteTypeLabel})`);
    kv('Best Earth analog', `${r.best.analog.name}, ${r.best.analog.country}${r.best.analog.known ? ' (established analog)' : ' (candidate site)'}`);
    kv('Similarity', `${pct(r.best.similarity)}${r.best.coverage < 1 ? ` (range ${pct(r.best.low)}-${pct(r.best.high)})` : ''}`);
    kv('Why it matches', r.whyMatches.join('; '));
    kv('Major differences', r.physics.map(d => `${d.label}: ${d.planet} vs ${d.earth}`).join('; '));
    kv('Confidence', `${pct(r.confidence.score)} - ${r.confidence.band}`);
    kv('Known-analog comparison', r.bench.text);
    y += 2;
    p(r.summary, 10, [10, 20, 40]);

    h2('Data confidence: why');
    r.confidence.reasons.forEach(c => p(`${c.ok ? '[+]' : '[-]'} ${c.text}`, 8.8));

    h2('Environmental summary');
    p(r.qual.map(q => `${q.label}: ${q.value}`).join('   |   '), 9.5);

    h2('2. Selected target');
    p(`Planet: ${r.planet}.  Region: ${r.region.name} (${r.region.kind}).  Coordinates: ${r.coord}.`);
    p(r.region.summary);

    h2('3. Environmental fingerprint');
    r.rows.forEach(row => {
      ensure(12);
      doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(10, 20, 40).text(clean(row.label), M, y);
      doc.setFont('helvetica', 'normal').setTextColor(40, 50, 70);
      const v = doc.splitTextToSize(clean(row.value), 72) as string[];
      doc.text(v, M + 48, y);
      doc.setFontSize(7.5).setTextColor(100, 115, 140).text(clean(`${row.provenance} | confidence ${row.confidence}`), W - M, y, { align: 'right' });
      y += Math.max(v.length * 4, 5) + 2.2;
      doc.setDrawColor(225, 230, 240).setLineWidth(0.2).line(M, y - 3, W - M, y - 3);
    });

    h2('4. Ranked Earth analog candidates');
    p(`Scoring weights: ${r.weights.map(w => `${w.label} ${w.value}`).join(', ')}.`, 8.5, [100, 115, 140]);
    r.ranked.forEach(c => {
      ensure(18);
      doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(10, 20, 40).text(clean(`${c.rank}. ${c.analog.name}, ${c.analog.country}`), M, y);
      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(100, 115, 140).text(clean(`similarity ${pct(c.similarity)}  |  confidence ${pct(c.confidence)}`), W - M, y, { align: 'right' });
      y += 3;
      doc.setFillColor(228, 234, 244).rect(M, y, CW, 2, 'F');
      doc.setFillColor(40, 180, 200).rect(M, y, CW * c.similarity, 2, 'F');
      doc.setFillColor(77, 141, 255).rect(M, y + 2.6, CW * c.confidence, 0.8, 'F');
      y += 7;
      doc.setFontSize(7.5).setTextColor(70, 85, 110);
      const t = clean(`Matches: ${c.matches.map(d => d.label).join(', ') || 'none'}.  Differs: ${c.differences.map(d => d.label).join(', ') || 'none'}.${c.missing.length ? `  Excluded (no data): ${c.missing.map(d => d.label).join(', ')}.` : ''}`);
      const l = doc.splitTextToSize(t, CW) as string[]; doc.text(l, M, y); y += l.length * 3.4 + 3;
    });

    h2(`5. Best-ranked candidate: ${r.best.analog.name}`);
    p(`Similarity ${pct(r.best.similarity)} (range ${pct(r.best.low)}-${pct(r.best.high)}). Data confidence ${pct(r.best.confidence)}. ${r.best.analog.researchUse}`);
    r.best.dims.forEach(d => p(`${d.label}: ${d.planetValue} vs ${d.earthValue}. ${d.explanation}`, 8.5));

    h2('6. Scientific limitations');
    r.limitations.forEach(l => p('- ' + l));
    h2('7. Data notes');
    r.caveats.forEach(l => p('- ' + l, 8.5, [100, 115, 140]));

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(7.5).setTextColor(148, 163, 184).text(clean(`${r.id}  |  Page ${i} of ${pages}  |  Not an official NASA product`), M, 291); }
    doc.save(`${r.id}.pdf`);
  }
}

export const reportService = new ReportService();
