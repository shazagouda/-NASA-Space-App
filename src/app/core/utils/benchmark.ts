import { RankedAnalog } from '../models/science.model';

export interface BenchmarkEntry { item: RankedAnalog; known: boolean; label: string }
export interface Benchmark { chain: BenchmarkEntry[]; text: string; knownBeaten: number }

/**
 * Compares the best result with established analog sites, ranked by the same score.
 * "Candidate" marks a site that is not a published analog; known sites keep their names.
 */
export function benchmark(ranked: RankedAnalog[], selected: RankedAnalog): Benchmark {
  const known = ranked.filter(r => r.analog.known && r.analog.id !== selected.analog.id).slice(0, 2);
  const items = [selected, ...known].sort((a, b) => b.similarity - a.similarity);
  const chain = items.map(i => ({ item: i, known: !!i.analog.known, label: i.analog.known ? i.analog.name : `${i.analog.name} (candidate)` }));
  const knownBeaten = chain.filter(c => c.item.analog.id !== selected.analog.id && c.known && c.item.similarity < selected.similarity).length;
  const text = chain.map(c => c.item.analog.name).join(' > ');
  return { chain, text, knownBeaten };
}
