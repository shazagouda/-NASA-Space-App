import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Chart as ChartType } from 'chart.js';
import { exploration as state } from '../../core/services/exploration-state.service';
import { PlanetViewer } from '../../shared/components/planet-viewer/planet-viewer';
import { EarthMap } from '../../shared/components/earth-map/earth-map';
import { ProvenanceBadge } from '../../shared/components/provenance-badge/provenance-badge';
import { InView } from '../../shared/in-view';
import { motion } from '../../core/services/motion.service';
import { useSig } from '../../core/signals';
import { useT } from '../../core/services/i18n.service';
import { PlanetInfo, RankedAnalog, Region } from '../../core/models/science.model';
import { fmtCoord as coord, joinList, pct } from '../../core/utils/format';
import './site-comparison.css';

export function SiteComparisonPage() {
  const region = useSig(() => state.region());
  const planet = useSig(() => state.planet());
  const r = useSig(() => state.selected());
  if (!region || !planet || !r) return null;
  return <SiteComparison region={region} planet={planet} r={r} />;
}

function SiteComparison({ region, planet, r }: { region: Region; planet: PlanetInfo; r: RankedAnalog }) {
  const t = useT();
  const navigate = useNavigate();
  const ranked = useSig(() => state.ranked());
  const regionList = useMemo(() => [region], [region]);
  const single = useMemo(() => [r], [r]);
  const ringC = 2 * Math.PI * 52;
  const ringDash = `${ringC * r.similarity} ${ringC}`;

  const summary = useMemo(() => {
    const m = r.matches.slice(0, 2).map(d => d.label.toLowerCase()), x = r.differences.slice(0, 2).map(d => d.label.toLowerCase());
    return `${r.analog.name} is a ${r.band} analog for ${region.name}${m.length ? `, with its closest overlap in ${joinList(m)}` : ''}${x.length ? ` and its largest gaps in ${joinList(x)}` : ''}. Data confidence for this comparison is ${pct(r.confidence)}.`;
  }, [r, region]);

  const limits = useMemo(() => {
    const moon = planet.id === 'moon';
    return [
      { k: 'Atmosphere', p: moon ? 'Virtually none (exosphere)' : '≈ 6 mbar, mostly CO₂', e: '≈ 1,013 mbar, N₂ and O₂', n: 'Wind, weathering, heat transfer and dust behave differently.' },
      { k: 'Gravity', p: moon ? '1.62 m/s²' : '3.73 m/s²', e: '9.81 m/s²', n: 'Slope stability, regolith flow and rover traction do not scale directly.' },
      { k: 'Radiation', p: moon ? '≈ 1.4 mSv/day at the surface' : '≈ 0.7 mSv/day at the surface', e: '≈ 0.007 mSv/day (natural background)', n: 'Surface chemistry and any biology are exposed to far more radiation off Earth.' },
      { k: 'Geological history', p: moon ? 'Billions of years of impacts, almost no erosion' : 'Ancient water, volcanism and a cold dry present', e: 'Active plate tectonics and a global water cycle', n: 'Similar landforms can have formed through different processes.' },
      { k: 'Surface processes', p: 'No liquid water on the surface today', e: 'Liquid water and living organisms shape most sites', n: 'Biology and water alter rocks and soils on Earth.' },
    ];
  }, [planet]);

  /* charts (chart.js is loaded lazily) */
  const radar = useRef<HTMLCanvasElement>(null);
  const bars = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let charts: ChartType[] = [];
    (async () => {
      const C = await import('chart.js');
      if (cancelled || !radar.current || !bars.current) return;
      C.Chart.register(C.RadarController, C.RadialLinearScale, C.PointElement, C.LineElement, C.Filler, C.BarController, C.BarElement, C.CategoryScale, C.LinearScale, C.Tooltip);
      const animation = motion.reduced() ? false : { duration: 900 };
      const grid = 'rgba(148,163,184,0.18)', txt = '#94a3b8';
      const labels = r.dims.map(d => d.label);
      charts = [
        new C.Chart(radar.current, {
          type: 'radar',
          data: { labels, datasets: [{ label: 'Similarity', data: r.dims.map(d => (d.similarity ?? 0) * 100), backgroundColor: 'rgba(72,217,232,0.18)', borderColor: '#48d9e8', pointBackgroundColor: r.dims.map(d => d.similarity === null ? '#94a3b8' : '#48d9e8'), borderWidth: 1.5 }] },
          options: { animation, maintainAspectRatio: false, scales: { r: { min: 0, max: 100, ticks: { display: false, stepSize: 25 }, grid: { color: grid }, angleLines: { color: grid }, pointLabels: { color: '#c3cde0', font: { size: 11 } } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => r.dims[ctx.dataIndex].similarity === null ? 'No data (excluded)' : `${(Number(ctx.raw)).toFixed(0)}% similar` } } } },
        }),
        new C.Chart(bars.current, {
          type: 'bar',
          data: { labels, datasets: [{ label: 'Points of score', data: r.dims.map(d => d.similarity === null ? 0 : (d.similarity * d.effectiveWeight)), backgroundColor: r.dims.map(d => d.band === 'close' ? '#48d9e8' : d.band === 'partial' ? '#4d8dff' : d.band === 'distant' ? '#8b7cff' : '#94a3b8'), borderRadius: 0, barThickness: 14 }] },
          options: { animation, indexAxis: 'y', maintainAspectRatio: false, scales: { x: { grid: { color: grid }, ticks: { color: txt, callback: v => v + '' }, title: { display: true, text: 'Points contributed to the similarity score', color: txt, font: { size: 10 } } }, y: { grid: { display: false }, ticks: { color: '#c3cde0', font: { size: 11 } } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${(Number(ctx.raw)).toFixed(1)} points` } } } },
        }),
      ];
    })();
    return () => { cancelled = true; charts.forEach(c => c.destroy()); };
  }, [r]);

  return (
    <div className="pg-compare">
      <div className="page sc">
        <div className="container">
          <header className="page-head">
            <p className="mono ctx">{planet.name} · {region.name} compared with {r.analog.name}</p>
            <h1 className="h1">{t('Why does this site match?', 'لماذا يتطابق هذا الموقع؟')}</h1>
            <p className="lede">{summary}</p>
          </header>

          <nav className="picker scrollbar-thin" aria-label="Choose an Earth site to compare">
            {ranked.map(c => (
              <button key={c.analog.id} type="button" className={c.analog.id === r.analog.id ? 'on' : undefined} aria-pressed={c.analog.id === r.analog.id} onClick={() => state.selectAnalog(c.analog.id)}>
                <span className="mono">#{c.rank}</span>{c.analog.name}<em className="mono">{pct(c.similarity)}</em>
              </button>
            ))}
          </nav>

          <section className="split" aria-label="Side-by-side comparison">
            <div className="side left">
              <div className="vis">
                <PlanetViewer key={planet.id} planet={planet.id} modelUrl={planet.modelUrl} regions={regionList} selectedId={region.id} showMarkers autoRotate={false} zoomable={false} distance={3.6} />
              </div>
              <p className="mono k">{planet.name} region</p>
              <h2 className="h2">{region.name}</h2>
              <p className="mono xy">{coord(region.lat, region.lon)}</p>
            </div>

            <div className="bridge" aria-hidden="false">
              <svg viewBox="0 0 120 120" className="ring" role="img" aria-label={`Overall similarity ${pct(r.similarity)}`}>
                <circle cx="60" cy="60" r="52" className="bg" />
                <circle cx="60" cy="60" r="52" className="fg" strokeDasharray={ringDash} transform="rotate(-90 60 60)" />
                <text x="60" y="62" textAnchor="middle" className="pv">{(r.similarity * 100).toFixed(0)}%</text>
                <text x="60" y="80" textAnchor="middle" className="pl">{t('similarity', 'تشابه')}</text>
              </svg>
              <p className="mono bc">Confidence {pct(r.confidence)}</p>
              <span className="line"></span>
            </div>

            <div className="side right">
              <div className="vis map"><EarthMap candidates={single} selectedId={r.analog.id} /></div>
              <p className="mono k">Earth analog · {r.analog.country}</p>
              <h2 className="h2">{r.analog.name}</h2>
              <p className="mono xy">{coord(r.analog.lat, r.analog.lon)}</p>
            </div>
          </section>

          <InView as="section" className="params" aria-labelledby="p-h">
            <h2 id="p-h" className="h2">{t('Parameter by parameter', 'معيارًا بمعيار')}</h2>
            <ul>
              {r.dims.map((d, i) => (
                <li key={d.key} className={`b-${d.band}`}>
                  <div className="vals">
                    <div className="pv"><span className="mono lab">{planet.name}</span><b className="mono">{d.planetValue}</b><ProvenanceBadge provenance={d.planetProvenance} /></div>
                    <div className="mid">
                      <span className="nm">{d.label}</span>
                      <span className="mirror" role="img" aria-label={d.similarity === null ? 'No data' : `${pct(d.similarity)} similar`}>
                        <span className="half l"><i style={{ width: `${(d.similarity ?? 0) * 100}%`, transitionDelay: `${i * 70}ms` }}></i></span>
                        <span className="half r"><i style={{ width: `${(d.similarity ?? 0) * 100}%`, transitionDelay: `${i * 70}ms` }}></i></span>
                      </span>
                      <span className="mono dd">{d.similarity === null ? 'Excluded' : `${pct(d.similarity)} · ${d.difference}`}</span>
                    </div>
                    <div className="ev"><span className="mono lab">{r.analog.name}</span><b className="mono">{d.earthValue}</b><ProvenanceBadge provenance={d.earthProvenance} /></div>
                  </div>
                  <p className="exp">{d.explanation}</p>
                </li>
              ))}
            </ul>
          </InView>

          <section className="charts" aria-label="Comparison charts">
            <figure><figcaption>{t('Similarity profile', 'ملف التشابه')}</figcaption><div className="cv"><canvas ref={radar} aria-label="Radar chart of similarity per parameter" role="img"></canvas></div></figure>
            <figure><figcaption>{t('What built the score', 'ما الذي بنى الدرجة')}</figcaption><div className="cv"><canvas ref={bars} aria-label="Bar chart of each parameter's contribution to the similarity score" role="img"></canvas></div></figure>
          </section>

          <section className="sim-diff">
            <div>
              <h2 className="h3">{t('Similarities', 'أوجه التشابه')}</h2>
              {r.matches.length ? <ul>{r.matches.map(d => <li key={d.key}>{d.explanation}</li>)}</ul> : <p className="muted">{t('No parameter matches closely. The overall score reflects partial overlap only.', 'لا يوجد معيار يتطابق عن قرب. الدرجة الكلية تعكس تداخلًا جزئيًا فقط.')}</p>}
            </div>
            <div>
              <h2 className="h3">{t('Differences', 'الفروقات')}</h2>
              {r.differences.length ? <ul className="dif">{r.differences.map(d => <li key={d.key}><b>{d.label}.</b> {d.planetValue} against {d.earthValue}.</li>)}</ul> : <p className="muted">{t('No major differences in the available data.', 'لا فروقات كبيرة في البيانات المتاحة.')}</p>}
            </div>
          </section>

          <section className="limits" aria-labelledby="l-h">
            <div className="lead">
              <h2 id="l-h" className="h2">{t('An analog is not a copy', 'النظير ليس نسخة')}</h2>
              <p className="lede">{t('Earth sites are useful for studying selected characteristics. They do not reproduce the Moon or Mars, and results should be transferred with care.', 'المواقع الأرضية مفيدة لدراسة خصائص محددة. هي لا تعيد إنتاج القمر أو المريخ، ويجب نقل النتائج بحذر.')}</p>
            </div>
            <dl>
              {limits.map(l => (
                <div key={l.k}><dt>{l.k}</dt><dd><span className="mono"><em>{planet.name}</em> {l.p}</span><span className="mono"><em>{t('Earth', 'الأرض')}</em> {l.e}</span><p>{l.n}</p></dd></div>
              ))}
            </dl>
          </section>

          <footer className="next">
            <p className="muted">{t('Figures above are approximate published values. This build is a demo, not a validated model.', 'الأرقام أعلاه قيم منشورة تقريبية. هذه النسخة تجريبية وليست نموذجًا مُتحقَّقًا منه.')}</p>
            <button className="btn" type="button" onClick={() => navigate('/report')}>{t('Review final report', 'راجع التقرير النهائي')} <i className="arrow"></i></button>
          </footer>
        </div>
      </div>
    </div>
  );
}
