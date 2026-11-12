import { signal } from '../signals';
import { api } from '../api/api-client';
import { configService } from '../api/app-config';
import { catalog } from './data-catalog.service';
import { cleanText } from '../security/validators';
import { exploration } from './exploration-state.service';
import { analogSearch } from '../../services/analog-search.service';
import { DIM_LABELS, DimKey, GEOLOGY_CLASSES, MINERAL_CLASSES, PROVENANCE_META, RankedAnalog, TERRAIN_CLASSES } from '../models/science.model';
import { ranking } from './ranking.service';
import { fmtMeasured, fmtNum, joinList, pct, topClasses } from '../utils/format';

export class AssistantService {
  private state = exploration;
  private analogs = analogSearch;
  private ranking = ranking;
  private api = api;
  private cfg = configService;
  private catalog = catalog;
  /** Whether the assistant panel is open (toggled from the navbar). */
  readonly open = signal(false);
  static readonly MAX_LEN = 300;

  /**
   * Live mode: ask the configured assistant endpoint with a minimal, non-personal context, and fall back to the local
   * rule-based answer if the service is missing, slow or returns anything unexpected.
   */
  async reply(q: string): Promise<{ text: string; remote: boolean }> {
    const question = cleanText(q, AssistantService.MAX_LEN);
    if (this.cfg.config().mode === 'live' && this.catalog.source() === 'live' && this.api.available) {
      try {
        const best = this.state.best();
        const res = await this.api.post<{ answer?: unknown }>('assistant', {
          question, context: { regionId: this.state.regionId(), analogId: best?.analog.id ?? null, similarity: best ? Math.round(best.similarity * 100) : null },
        });
        const text = cleanText(res?.answer, 1500);
        if (text) return { text, remote: true };
      } catch { /* fall through to local answer */ }
    }
    return { text: this.answer(question), remote: false };
  }

  suggestions(): string[] {
    const best = this.state.best();
    const reg = this.state.region();
    if (!reg) return ['How do I start?', 'What do the data labels mean?', 'How is the similarity score calculated?', 'Why is an Earth analog never an exact match?'];
    return [
      'Why was this location selected?',
      best ? `What makes ${best.analog.name} similar to ${reg.name}?` : 'What is the best analog?',
      'How is the similarity score calculated?',
      'What does data confidence mean?',
      'Why is this Earth analog not an exact match?',
    ];
  }

  answer(q: string): string {
    const t = q.toLowerCase();
    const reg = this.state.region();
    const planet = this.state.planet();
    const sel = this.state.selected();
    const ranked = this.state.ranked();

    // named analog?
    const named = this.analogs.all().find(a => t.includes(a.name.toLowerCase()));

    if (/(label|verified|derived|simulated|unavailable|provenance|demo data|real data|nasa data)/.test(t)) {
      return Object.values(PROVENANCE_META).map(p => `${p.label}: ${p.help}`).join('\n\n') +
        '\n\nEvery value shows where it came from. Check it against the source dataset before scientific use.';
    }
    if (/(how do i start|get started|what can you do|help)\b/.test(t) && !reg) {
      return 'Pick the Moon or Mars on the home page, rotate the globe, and select a region marker. Then choose “Analyze this location” to see its environmental fingerprint and search for Earth analogs.\n\nI can explain the data you see on each step: measurements, similarity scores, rankings and limitations.';
    }
    if (/(how|what).*(score|calculat|similarity|weight|formula)/.test(t) || /scor(e|ing) (work|model)/.test(t)) {
      const w = this.ranking.normalise(this.state.weights());
      const wtxt = (Object.keys(w) as DimKey[]).map(k => `${DIM_LABELS[k]} ${fmtNum(w[k])}%`).join(', ');
      let out = `The similarity score is a weighted average of seven normalised comparisons: ${wtxt}. ${this.state.weightsChanged() ? 'These weights have been changed from the defaults.' : 'These are the default weights.'} You can change them on the Ranking page.\n\nTemperature, elevation, slope and aridity compare numbers on a 0–1 scale. Terrain, geology and minerals compare class profiles using cosine similarity. Missing dimensions are excluded, remaining weights are rescaled, and the score range shows what it would be if the missing data were a total mismatch or a perfect match.`;
      if (sel) out += `\n\nFor ${sel.analog.name} the score is ${pct(sel.similarity)}${sel.coverage < 1 ? ` (range ${pct(sel.low)}–${pct(sel.high)}, because ${joinList(sel.missing.map(m => m.label.toLowerCase()))} could not be compared)` : ''}.`;
      return out;
    }
    if (/confiden/.test(t)) {
      let out = 'Data confidence is separate from similarity. Similarity asks how closely two environments match. Confidence asks how complete and well-supported the numbers behind that comparison are. It combines how much of the weighted data is available with the confidence of each value, which is lower for simulated values and zero for unavailable ones.\n\nA site can be a close match with low confidence, or a modest match with high confidence.';
      if (sel) {
        const low = [...sel.dims].filter(d => d.band !== 'unknown').sort((a, b) => a.confidence - b.confidence)[0];
        out += `\n\nFor ${sel.analog.name}, confidence is ${pct(sel.confidence)} with ${pct(sel.coverage)} of the weighted data available${low ? `. The weakest-supported comparison is ${low.label.toLowerCase()} at ${pct(low.confidence)}` : ''}.`;
      }
      return out;
    }
    if (/(exact|identical|same as|not a copy|limitation|why is this earth analog|caveat)/.test(t)) {
      let out = 'An Earth analog shares selected characteristics with a Moon or Mars region. It is not a copy. Earth differs in atmosphere and air pressure, gravity (9.81 m/s² against 1.62 on the Moon and 3.73 on Mars), radiation exposure, geological history and active surface processes such as liquid water and biology.\n\nUse an analog to test specific things, such as rover mobility, drilling or sampling methods, not to claim the environments are the same.';
      if (sel && reg) {
        const diff = sel.differences.slice(0, 2).map(d => `${d.label.toLowerCase()} (${d.planetValue} against ${d.earthValue})`);
        if (diff.length) out += `\n\nFor ${sel.analog.name} compared with ${reg.name}, the largest gaps in this data are ${joinList(diff)}.`;
      }
      return out;
    }
    if (named && reg) {
      const r = ranked.find(x => x.analog.id === named.id);
      if (r) return this.explainAnalog(r, reg.name);
    }
    if (/(why).*(select|chosen|this location|this region|this site)|why was this/.test(t) || /(selected|my) (region|location|target)/.test(t)) {
      if (!reg || !planet) return 'No region is selected yet. Choose a planet and click a marker on the globe to select one.';
      return `You selected ${reg.name} on the ${planet.name}: ${reg.summary}\n\nYou chose it from the regions loaded for this world. The app does not choose regions on its own. Its coordinates are ${fmtNum(Math.abs(reg.lat), 2)}° ${reg.lat >= 0 ? 'N' : 'S'}, ${fmtNum(Math.abs(reg.lon), 2)}° ${reg.lon >= 0 ? 'E' : 'W'}.`;
    }
    if (/(best|top|rank|first|winner|closest|most similar)/.test(t)) {
      if (!reg || !ranked.length) return 'Select a planetary region first. Then I can summarise the ranking.';
      const top = ranked.slice(0, 3).map(r => `${r.rank}. ${r.analog.name} — similarity ${pct(r.similarity)}, confidence ${pct(r.confidence)}`).join('\n');
      const b = ranked[0];
      return `For ${reg.name}, the highest-ranked candidates are:\n\n${top}\n\n${b.analog.name} ranks first with a ${b.band} match. ${b.band === 'weak' || b.band === 'partial' ? 'No candidate is a strong match in the loaded data, so treat the leader as the best available partial analog.' : ''}`.trim();
    }
    if (/(fingerprint|temperature|terrain|elevation|slope|arid|mineral|geolog|surface)/.test(t)) {
      if (!reg) return 'Select a region first, and I can describe its environmental fingerprint.';
      const f = reg.fingerprint;
      const lines = [
        `Temperature: ${fmtMeasured(f.tempMean)} mean, ${fmtMeasured(f.tempMin)} to ${fmtMeasured(f.tempMax)} (${PROVENANCE_META[f.tempMean.provenance].short.toLowerCase()}).`,
        `Elevation: ${fmtMeasured(f.elevation)} (${PROVENANCE_META[f.elevation.provenance].short.toLowerCase()}).`,
        `Surface slope: ${fmtMeasured(f.slope)} mean (${PROVENANCE_META[f.slope.provenance].short.toLowerCase()}).`,
        `Terrain: ${joinList(topClasses(f.terrain, TERRAIN_CLASSES, 3).map(x => x.label.toLowerCase()))}.`,
        `Geology: ${joinList(topClasses(f.geology, GEOLOGY_CLASSES, 3).map(x => x.label.toLowerCase()))}.`,
        `Minerals: ${joinList(topClasses(f.minerals, MINERAL_CLASSES, 3).map(x => x.label.toLowerCase()))}.`,
      ];
      return `${reg.name} in this app:\n\n${lines.join('\n')}\n\nValues marked simulated are modelled estimates, not measurements. Open the Fingerprint page to see the label and confidence for every value.`;
    }
    if (/(weight|configur|adjust)/.test(t)) {
      return 'On the Ranking page, the weight sliders let you change how much each characteristic counts. Weights are rescaled to total 100%, and the ranking updates immediately. The defaults are a starting point, not official weights.';
    }
    if (/(missing|no data|unavailable|n\/a)/.test(t)) {
      const m = sel?.missing ?? [];
      return m.length
        ? `For ${sel!.analog.name}, ${joinList(m.map(x => x.label.toLowerCase()))} could not be compared because no value exists. The dimension is excluded, other weights are rescaled, and the score range widens. Missing data is never counted as a match.`
        : 'Missing values are excluded from scoring, remaining weights are rescaled, and the score range widens. Missing data is never counted as a match. The selected candidate currently has full coverage.';
    }
    if (/(hello|hi|hey)\b/.test(t)) return reg ? `Hello. You are looking at ${reg.name}. Ask me about its fingerprint, the ranking, or the similarity score.` : 'Hello. I can explain the measurements, scores and rankings in this app once you have selected a region.';

    return 'I can only explain the structured data in this app, such as the selected region’s fingerprint, the similarity score, the ranking, data confidence and the limitations of analogs. I can’t answer beyond that, and I won’t invent measurements or sources.\n\nTry one of the suggested questions.';
  }

  private explainAnalog(r: RankedAnalog, regionName: string): string {
    const m = r.matches.slice(0, 3).map(d => `${d.label.toLowerCase()} (${d.planetValue} against ${d.earthValue})`);
    const x = r.differences.slice(0, 2).map(d => `${d.label.toLowerCase()} (${d.planetValue} against ${d.earthValue})`);
    return `${r.analog.name} ranks #${r.rank} for ${regionName} with a similarity of ${pct(r.similarity)} and data confidence of ${pct(r.confidence)}.\n\n${m.length ? `It matches most closely on ${joinList(m)}.` : 'It has no dimension that matches closely in this data.'} ${x.length ? `It differs most on ${joinList(x)}.` : ''}\n\n${r.analog.researchUse}`;
  }
}

export const assistant = new AssistantService();
