import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EarthMap } from '../../shared/components/earth-map/earth-map';
import { ProvenanceBadge } from '../../shared/components/provenance-badge/provenance-badge';
import { exploration as state } from '../../core/services/exploration-state.service';
import { analogSearch } from '../../services/analog-search.service';
import { GEOLOGY_CLASSES, RankedAnalog, Region, TERRAIN_CLASSES } from '../../core/models/science.model';
import { notifications as notes } from '../../core/services/notification.service';
import { useSig } from '../../core/signals';
import { useT } from '../../core/services/i18n.service';
import { assessConfidence } from '../../core/utils/confidence';
import { fmtCoord as coord, fmtMeasured as fmtM, joinList, pct, topClasses } from '../../core/utils/format';
import './earth-analogs.css';

const STAGES_AR = ['قراءة بصمة المنطقة', 'الاستعلام من فهرس النظائر', 'توحيد المعايير السبعة', 'تقييم المواقع المرشَّحة'];
const STAGES = ['Reading the region fingerprint', 'Querying the analog catalogue', 'Normalising seven parameters', 'Scoring candidate sites'];

const terrainOf = (r: RankedAnalog) => joinList(topClasses(r.analog.fingerprint.terrain, TERRAIN_CLASSES, 2).map(t => t.label.toLowerCase())) || 'No data';
const geologyOf = (r: RankedAnalog) => joinList(topClasses(r.analog.fingerprint.geology, GEOLOGY_CLASSES, 2).map(t => t.label.toLowerCase())) || 'No data';
const rangeOf = (r: RankedAnalog) => { const f = r.analog.fingerprint; return `${fmtM(f.tempMin)} to ${fmtM(f.tempMax)}`; };

export function EarthAnalogsPage() {
  const region = useSig(() => state.region());
  if (!region) return null;
  return <EarthAnalogs region={region} key={region.id} />;
}

function EarthAnalogs({ region }: { region: Region }) {
  const t = useT();
  const navigate = useNavigate();
  const planet = useSig(() => state.planet());
  const ranked = useSig(() => state.ranked());
  const selected = useSig(() => state.selected());
  const selId = useSig(() => state.analogId() ?? state.best()?.analog.id ?? null);

  const [status, setStatus] = useState<'searching' | 'error' | 'done'>('searching');
  const [errorMsg, setErrorMsg] = useState('');
  const [stage, setStage] = useState(0);
  const [compare, setCompare] = useState<string[]>([]);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef(0);

  const run = () => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setStatus('searching'); setStage(0);
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => setStage(s => Math.min(s + 1, STAGES.length - 1)), 380);
    analogSearch.search(state.region(), ctl.signal).then(() => {
      if (ctl.signal.aborted) return;
      window.clearInterval(timer.current); setStatus('done');
      if (!state.analogId()) state.selectAnalog(state.best()!.analog.id);
      const b = state.best(), r = state.region();
      if (b && r) {
        notes.success('Search complete', `${state.ranked().length} Earth sites scored. Closest: ${b.analog.name} at ${pct(b.similarity)}.`, { key: 'search-done' });
        const c = assessConfidence(r, b);
        if (c.band !== 'High') notes.warn(`${c.band} data confidence`, `${pct(c.score)} — several inputs for ${r.name} are simulated or missing. Read the ranking with that in mind.`, { key: 'low-conf' });
      }
    }).catch((e: Error) => {
      if (ctl.signal.aborted) return;
      window.clearInterval(timer.current); setErrorMsg(e.message); setStatus('error'); notes.error('Search failed', e.message, { key: 'search-fail' });
    });
  };

  // keep the search tied to the current region (the page is re-keyed per region)
  useEffect(() => {
    run();
    return () => { abort.current?.abort(); window.clearInterval(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region.id]);

  const compared = useMemo(() => ranked.filter(r => compare.includes(r.analog.id)), [ranked, compare]);
  const select = (id: string) => state.selectAnalog(id);
  const toggleCompare = (id: string) => setCompare(c => c.includes(id) ? c.filter(x => x !== id) : c.length >= 3 ? [...c.slice(1), id] : [...c, id]);

  return (
    <div className="pg-analogs">
      <div className="page an">
        <div className="container">
          <header className="page-head">
            <p className="mono ctx">{t('Searching from', 'البحث انطلاقًا من')} {planet?.name} · {region.name}</p>
            <h1 className="h1">{t('Finding Earth in another world', 'العثور على الأرض في عالم آخر')}</h1>
            <p className="lede">{t('Discover terrestrial environments that share measurable characteristics with your selected planetary region.', 'اكتشف بيئات أرضية تشترك في خصائص قابلة للقياس مع المنطقة الكوكبية التي اخترتها.')}</p>
          </header>

          {status === 'searching' && (
            <section className="searching" role="status" aria-live="polite">
              <div className="scan"><i></i><i></i><i></i></div>
              <ol className="mono">
                {STAGES.map((s, i) => <li key={s} className={`${i < stage ? 'done' : ''}${i === stage ? ' cur' : ''}`.trim() || undefined}>{t(s, STAGES_AR[i])}</li>)}
              </ol>
            </section>
          )}

          {status === 'error' && (
            <section className="err" role="alert">
              <h2 className="h2">{t('The analog search failed', 'فشل البحث عن النظائر')}</h2>
              <p className="muted">{errorMsg} Check that a region is selected, then try again.</p>
              <div className="row"><button className="btn" type="button" onClick={run}>{t('Retry search', 'أعد البحث')}</button><button className="btn ghost" type="button" onClick={() => navigate('/explore')}>{t('Choose another region', 'اختر منطقة أخرى')}</button></div>
            </section>
          )}

          {status === 'done' && (!ranked.length ? (
            <section className="err"><h2 className="h2">{t('No candidates found', 'لم يُعثر على مرشَّحين')}</h2><p className="muted">{t('The catalogue returned no Earth sites for this region.', 'لم يُرجع الفهرس أي مواقع أرضية لهذه المنطقة.')}</p></section>
          ) : (
            <>
              <p className="found mono"><b>{ranked.length}</b> {t('candidate sites found. Candidates are examples, not validated matches. Ordered here by similarity.', 'موقعًا مرشَّحًا. المرشَّحون أمثلة وليسوا تطابقات مُتحقَّقًا منها. مرتَّبون حسب التشابه.')}</p>
              <div className="workspace">
                <ul className="cands scrollbar-thin" aria-label={t('Candidate sites', 'المواقع المرشَّحة')}>
                  {ranked.map(r => (
                    <li key={r.analog.id} className={selId === r.analog.id ? 'sel' : undefined}>
                      <button type="button" className="pick" onClick={() => select(r.analog.id)} aria-pressed={selId === r.analog.id}>
                        <span className="rk mono">#{r.rank}</span>
                        <span className="nm"><b>{r.analog.name}</b><em>{r.analog.country}{r.analog.known && <> · <span className="kn">{t('known analog', 'نظير معروف')}</span></>}</em></span>
                        <span className={`sc mono band-${r.band}`}>{pct(r.similarity)}</span>
                      </button>
                      <label className="cmp"><input type="checkbox" checked={compare.includes(r.analog.id)} onChange={() => toggleCompare(r.analog.id)} /> {t('Compare', 'قارن')}</label>
                    </li>
                  ))}
                </ul>
                <div className="mapbox"><EarthMap candidates={ranked} selectedId={selId} onSelectCandidate={select} /></div>
              </div>

              {selected && (
                <section className="detail" aria-live="polite" aria-labelledby="d-h">
                  <div className="d-head">
                    <div>
                      <p className="mono ctx">{t('Selected candidate', 'المرشَّح المختار')} · {t('rank', 'المرتبة')} #{selected.rank}</p>
                      <h2 id="d-h" className="h2">{selected.analog.name}, {selected.analog.country}</h2>
                      <p className="lede">{selected.analog.blurb}</p>
                    </div>
                    <div className="scores">
                      <div><span className="mono lab">{t('Similarity', 'التشابه')}</span><b className="mono">{pct(selected.similarity)}</b></div>
                      <div><span className="mono lab">{t('Data confidence', 'موثوقية البيانات')}</span><b className="mono">{pct(selected.confidence)}</b></div>
                    </div>
                  </div>
                  <dl className="facts">
                    <div><dt>{t('Coordinates', 'الإحداثيات')}</dt><dd className="mono">{coord(selected.analog.lat, selected.analog.lon)}</dd></div>
                    <div><dt>{t('Terrain', 'التضاريس')}</dt><dd>{terrainOf(selected)}</dd></div>
                    <div><dt>{t('Temperature', 'درجة الحرارة')}</dt><dd className="mono">{fmtM(selected.analog.fingerprint.tempMean)} {t('mean', 'متوسط')}<br /><span className="muted">{rangeOf(selected)}</span></dd></div>
                    <div><dt>{t('Elevation', 'الارتفاع')}</dt><dd className="mono">{fmtM(selected.analog.fingerprint.elevation)} <ProvenanceBadge provenance={selected.analog.fingerprint.elevation.provenance} /></dd></div>
                    <div><dt>{t('Geology', 'الجيولوجيا')}</dt><dd>{geologyOf(selected)}</dd></div>
                    <div><dt>{t('Research use', 'الاستخدام البحثي')}</dt><dd>{selected.analog.researchUse}</dd></div>
                  </dl>
                </section>
              )}

              <section className="compare" aria-labelledby="c-h">
                <h2 id="c-h" className="h2">{t('Compare candidates', 'قارن المرشَّحين')}</h2>
                {!compared.length ? (
                  <p className="muted">{t('Tick “Compare” on up to three candidates to see them next to', 'علِّم «قارن» على ثلاثة مرشَّحين كحد أقصى لرؤيتهم بجانب')} {region.name}.</p>
                ) : (
                  <div className="ctable" style={{ '--n': compared.length + 1 } as CSSProperties} role="table" aria-label={t('Candidate comparison', 'مقارنة المرشَّحين')}>
                    <div className="crow chead" role="row"><span role="columnheader"></span>
                      <span role="columnheader" className="ref"><em className="mono">{planet?.name}</em>{region.name}</span>
                      {compared.map(c => <span key={c.analog.id} role="columnheader"><em className="mono">#{c.rank}</em>{c.analog.name}</span>)}
                    </div>
                    {compared[0].dims.map((d, i) => (
                      <div className="crow" role="row" key={d.key}>
                        <span className="rl" role="rowheader">{d.label}</span>
                        <span className="mono ref" role="cell">{d.planetValue}</span>
                        {compared.map(c => (
                          <span key={c.analog.id} className={`mono band-${c.dims[i].band}`} role="cell">{c.dims[i].earthValue}<small>{c.dims[i].similarity === null ? t('excluded', 'مستبعد') : pct(c.dims[i].similarity!) + t(' match', ' تطابق')}</small></span>
                        ))}
                      </div>
                    ))}
                    <div className="crow total" role="row"><span className="rl" role="rowheader">{t('Similarity · confidence', 'التشابه · الموثوقية')}</span><span className="ref"></span>
                      {compared.map(c => <span key={c.analog.id} className="mono" role="cell"><b>{pct(c.similarity)}</b> · {pct(c.confidence)}</span>)}
                    </div>
                  </div>
                )}
              </section>

              <footer className="next">
                <p className="muted">{t('Next, see how each candidate scores and why.', 'بعد ذلك، شاهد درجة كل مرشَّح ولماذا.')}</p>
                <button className="btn" type="button" onClick={() => navigate('/ranking')}>{t('Rank candidate sites', 'رتِّب المواقع المرشَّحة')} <i className="arrow"></i></button>
              </footer>
            </>
          ))}
        </div>
      </div>
    </div>
  );
}
