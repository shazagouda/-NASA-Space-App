import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notifications as notes } from '../../core/services/notification.service';
import { exploration as state } from '../../core/services/exploration-state.service';
import { ranking } from '../../core/services/ranking.service';
import { SciTip } from '../../shared/components/scientific-tooltip/scientific-tooltip';
import { InView } from '../../shared/in-view';
import { useSig } from '../../core/signals';
import { useT } from '../../core/services/i18n.service';
import { DIM_LABELS, DimKey, Region } from '../../core/models/science.model';
import { fmtNum as n, pct } from '../../core/utils/format';
import './candidate-ranking.css';

const ROW_H = 122;
const KEYS = Object.keys(DIM_LABELS) as DimKey[];
const BAND_AR: Record<string, string> = { strong: 'تطابق قوي', moderate: 'تطابق متوسط', partial: 'تطابق جزئي', weak: 'تطابق ضعيف' };
const DIM_AR: Record<string, string> = { temperature: 'درجة الحرارة', terrain: 'التضاريس', elevation: 'الارتفاع', geology: 'الجيولوجيا', mineral: 'المعادن', slope: 'انحدار السطح', aridity: 'الجفاف' };
const bandText = (b: string) => ({ strong: 'Strong match', moderate: 'Moderate match', partial: 'Partial match', weak: 'Weak match' } as Record<string, string>)[b] ?? b;

export function CandidateRankingPage() {
  const region = useSig(() => state.region());
  if (!region) return null;
  return <CandidateRanking region={region} />;
}

function CandidateRanking({ region }: { region: Region }) {
  const t = useT();
  const navigate = useNavigate();
  const planet = useSig(() => state.planet());
  const ranked = useSig(() => state.ranked());
  const sel = useSig(() => state.selected());
  const best = useSig(() => state.best());
  const weights = useSig(() => state.weights());
  const weightsChanged = useSig(() => state.weightsChanged());
  const [showWeights, setShowWeights] = useState(false);

  const norm = useMemo(() => ranking.normalise(weights), [weights]);
  /** Rows keep a stable DOM order (by id) and slide into position by rank, so they animate when weights change. */
  const order = useMemo(() => [...ranked].sort((a, b) => a.analog.id.localeCompare(b.analog.id)), [ranked]);

  // Tells the user when changing a weight changes which site is first, which is the one change worth interrupting for.
  const lastBest = useRef<string | null>(null);
  useEffect(() => {
    if (best && lastBest.current && best.analog.id !== lastBest.current && weightsChanged) {
      notes.info('Ranking changed', `${best.analog.name} is now first with the new weights.`, { key: 'leader' });
    }
    lastBest.current = best?.analog.id ?? null;
  }, [best, weightsChanged]);

  return (
    <div className="pg-ranking">
      <div className="page rk">
        <div className="container">
          <header className="head">
            <div className="hl">
              <p className="mono ctx">{planet?.name} · {region.name}</p>
              <h1 className="h1">{t('Earth analog ranking', 'ترتيب النظائر الأرضية')}</h1>
              <p className="lede">{t('Each site is scored against', 'يُقيَّم كل موقع مقابل')} {region.name} {t('on seven parameters. Similarity and data confidence are shown separately, because a close match built on weak data is still a weak finding.', 'على سبعة معايير. يُعرض التشابه وموثوقية البيانات منفصلين، لأن التطابق القريب المبني على بيانات ضعيفة يظل نتيجة ضعيفة.')}</p>
            </div>
            <div className="defs">
              <p><b>{t('Similarity', 'التشابه')}</b> {t('How closely does this site match the selected planetary environment?', 'ما مدى تطابق هذا الموقع مع البيئة الكوكبية المختارة؟')}</p>
              <p><b>{t('Confidence', 'الموثوقية')}</b> {t('How complete, reliable and well-supported is the data behind that comparison?', 'ما مدى اكتمال البيانات وراء هذه المقارنة وموثوقيتها ودعمها؟')}</p>
            </div>
          </header>

          <div className="model">
            <button type="button" className="toggle" aria-expanded={showWeights} aria-controls="weights" onClick={() => setShowWeights(v => !v)}>
              <span>{t('Scoring model', 'نموذج التقييم')}</span><span className="mono muted">{weightsChanged ? t('Custom weights', 'أوزان مخصّصة') : t('Demo defaults', 'الافتراضيات التجريبية')}</span><i className={showWeights ? 'open' : undefined}></i>
            </button>
            {showWeights && (
              <div id="weights" className="weights">
                <p className="muted small">{t('Weights are illustrative and configurable. They are not official NASA weights. They rescale to 100% and the ranking updates as you move them.', 'الأوزان توضيحية وقابلة للتعديل وليست أوزان ناسا الرسمية. تُعاد معايرتها إلى 100% ويتحدّث الترتيب أثناء تحريكها.')}</p>
                <div className="wgrid">
                  {KEYS.map(k => (
                    <label key={k}>
                      <span className="wl">{t(DIM_LABELS[k], DIM_AR[k] ?? DIM_LABELS[k])} <b className="mono">{n(norm[k])}%</b></span>
                      <input type="range" min="0" max="50" step="1" value={weights[k]} onChange={e => state.setWeight(k, +e.target.value)} aria-label={`${DIM_LABELS[k]} weight`} />
                    </label>
                  ))}
                </div>
                <button type="button" className="btn ghost sm" onClick={() => state.resetWeights()} disabled={!weightsChanged}>{t('Reset to defaults', 'إعادة الضبط للافتراضي')}</button>
              </div>
            )}
          </div>

          <div className="board">
            <ol className="list" style={{ height: ranked.length * ROW_H }} aria-label="Ranked Earth analog candidates">
              {order.map(r => (
                <li key={r.analog.id} className={`item${sel?.analog.id === r.analog.id ? ' sel' : ''}`} data-rank={r.rank}
                  style={{ transform: `translateY(${(r.rank - 1) * ROW_H}px)`, height: ROW_H, order: r.rank }}>
                  <button type="button" className="row" onClick={() => state.selectAnalog(r.analog.id)} aria-pressed={sel?.analog.id === r.analog.id}>
                    <span className="rank mono" aria-label={`Rank ${r.rank}`}>{r.rank < 10 ? '0' : ''}{r.rank}</span>
                    <span className="who"><b>{r.analog.name}</b><em>{r.analog.country} · <span className={`band-${r.band}`}>{t(bandText(r.band), BAND_AR[r.band] ?? bandText(r.band))}</span>{r.analog.known && <> · <span className="kn">{t('known analog', 'نظير معروف')}</span></>}</em></span>
                    <span className="meters">
                      <span className="m"><i className="mono">{t('Similarity', 'التشابه')}</i>
                        <span className="bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.similarity * 100)} aria-label={`Similarity ${pct(r.similarity)}`}>
                          {r.coverage < 1 && <span className="whisk" style={{ left: `${r.low * 100}%`, width: `${(r.high - r.low) * 100}%` }} title="Possible range if missing data were a total mismatch or a perfect match"></span>}
                          <span className="fill" style={{ width: `${r.similarity * 100}%` }}></span></span><b className="mono">{pct(r.similarity)}</b></span>
                      <span className="m c"><i className="mono">{t('Confidence', 'الموثوقية')}</i>
                        <span className="bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.confidence * 100)} aria-label={`Data confidence ${pct(r.confidence)}`}><span className="fill" style={{ width: `${r.confidence * 100}%` }}></span></span><b className="mono">{pct(r.confidence)}</b></span>
                    </span>
                    <span className="chips">
                      {r.matches.slice(0, 3).map(d => <i key={d.key} className="ok">{d.label}</i>)}
                      {r.differences.slice(0, 2).map(d => <i key={d.key} className="no">{d.label}</i>)}
                    </span>
                  </button>
                </li>
              ))}
            </ol>

            {sel && (
              <aside className="why" aria-live="polite" aria-labelledby="w-h">
                <p className="mono ctx">{t('Rank', 'المرتبة')} {sel.rank} {t('of', 'من')} {ranked.length}</p>
                <h2 id="w-h" className="h2">{sel.analog.name}</h2>
                <div className="big">
                  <div><span className="mono lab">{t('Similarity', 'التشابه')}</span><b className="mono">{pct(sel.similarity)}</b>
                    {sel.coverage < 1 && <small className="mono">{t('range', 'النطاق')} {pct(sel.low)}–{pct(sel.high)}</small>}</div>
                  <div><span className="mono lab"><SciTip text="How complete and well-supported the data behind this comparison is. It is not a measure of how similar the sites are.">{t('Confidence', 'الموثوقية')}</SciTip></span><b className="mono">{pct(sel.confidence)}</b>
                    <small className="mono">{pct(sel.coverage)} {t('of weighted data available', 'من البيانات الموزونة متاحة')}</small></div>
                </div>

                <h3 className="sub">{t('How the score is built', 'كيف تُبنى الدرجة')}</h3>
                <InView as="ul" className="dims">
                  {sel.dims.map((d, i) => (
                    <li key={d.key} className={`b-${d.band}`}>
                      <span className="dl">{d.label}</span>
                      <span className="dw mono">{n(d.weight)}%</span>
                      <span className="db" aria-label={d.similarity === null ? 'Excluded: no data' : `${d.label} similarity ${pct(d.similarity)}`}>
                        <span className="fill" style={{ width: `${(d.similarity ?? 0) * 100}%`, transitionDelay: `${i * 60}ms` }}></span>
                        {d.similarity === null && <span className="ex mono">{t('excluded · no data', 'مستبعد · لا بيانات')}</span>}
                      </span>
                      <span className="dv mono">{d.similarity === null ? '—' : pct(d.similarity)}</span>
                    </li>
                  ))}
                </InView>
                {sel.missing.length > 0 && <p className="note mono">{t('Excluded dimensions are not counted as matches. Remaining weights are rescaled.', 'الأبعاد المستبعدة لا تُحتسب كتطابق، وتُعاد معايرة بقية الأوزان.')}</p>}

                <div className="mt">
                  <div><h3 className="sub">{t('Matches', 'أوجه التطابق')}</h3>
                    {sel.matches.length ? <ul>{sel.matches.map(d => <li key={d.key} className="ok">{d.label}<span className="mono">{d.earthValue}</span></li>)}</ul> : <p className="muted small">{t('No parameter matches closely.', 'لا يوجد معيار يتطابق عن قرب.')}</p>}</div>
                  <div><h3 className="sub">{t('Differences', 'الفروقات')}</h3>
                    {sel.differences.length ? <ul>{sel.differences.slice(0, 4).map(d => <li key={d.key} className="no">{d.label}<span className="mono">{d.difference}</span></li>)}</ul> : <p className="muted small">{t('No major differences.', 'لا فروقات كبيرة.')}</p>}</div>
                </div>
                <button className="btn" type="button" onClick={() => navigate('/compare')}>{t('Why does this site match?', 'لماذا يتطابق هذا الموقع؟')} <i className="arrow"></i></button>
              </aside>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
