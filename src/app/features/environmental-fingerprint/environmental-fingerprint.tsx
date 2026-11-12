import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { exploration as state } from '../../core/services/exploration-state.service';
import { ProvenanceBadge } from '../../shared/components/provenance-badge/provenance-badge';
import { Metric } from '../../shared/components/metric-display/metric-display';
import { SciTip } from '../../shared/components/scientific-tooltip/scientific-tooltip';
import { InView } from '../../shared/in-view';
import { useSig } from '../../core/signals';
import { useT } from '../../core/services/i18n.service';
import { ClassVector, GEOLOGY_CLASSES, MINERAL_CLASSES, Measured, PROVENANCE_META, PlanetInfo, Provenance, Region, TERRAIN_CLASSES } from '../../core/models/science.model';
import { qualitative } from '../../core/utils/qualitative';
import { clamp, fmtCoord, fmtMeasured as fmt, pct, topClasses } from '../../core/utils/format';
import './environmental-fingerprint.css';

const ELEV_DOMAIN = { moon: [-9100, 10800], mars: [-8200, 21200] } as const;
const GEO_COLORS = ['#48d9e8', '#4d8dff', '#8b7cff', '#7fd1b9', '#c3cde0', '#e8b84d', '#6b7a99', '#a7b6d4'];
const PROV_ORDER: Provenance[] = ['verified', 'derived', 'simulated', 'unavailable'];

/* temperature scale: −210 … +130 °C */
const T0 = -210, T1 = 130;
const tPos = (v: number | null) => (v === null ? 0 : clamp((v - T0) / (T1 - T0)) * 100);
const T_TICKS = [-200, -100, 0, 100];
const PIPS = Array.from({ length: 10 }, (_, i) => i);
const logPos = (v: number) => { const lo = Math.log10(1e-4), hi = Math.log10(2); return clamp((Math.log10(Math.max(v, 1e-4)) - lo) / (hi - lo)) * 100; };
const ARI_BANDS = [
  { label: 'Hyperarid', from: 0, to: logPos(0.05) },
  { label: 'Arid', from: logPos(0.05), to: logPos(0.2) },
  { label: 'Semi-arid', from: logPos(0.2), to: logPos(0.5) },
  { label: 'Humid', from: logPos(0.5), to: 100 },
];
const confSegs = (c: number) => Array.from({ length: 5 }, (_, i) => i < Math.round(c * 5));
const bars = (v: Measured<ClassVector>, labels: Record<string, string>, n: number) => topClasses(v, labels, n, 0.05);

function Conf({ c }: { c: number }) {
  const t = useT();
  return (
    <p className="conf mono" aria-label={`${t('Confidence', 'الموثوقية')} ${pct(c)}`}>
      <span className="segs">{confSegs(c).map((s, i) => <i key={i} className={s ? 'on' : undefined}></i>)}</span>
      {t('Confidence', 'الموثوقية')} {c ? pct(c) : t('n/a', 'غير متاح')}
    </p>
  );
}

export function EnvironmentalFingerprintPage() {
  const region = useSig(() => state.region());
  const planet = useSig(() => state.planet());
  if (!region || !planet) return null;
  return <Fingerprint region={region} planet={planet} />;
}

function Fingerprint({ region, planet }: { region: Region; planet: PlanetInfo }) {
  const t = useT();
  const navigate = useNavigate();
  const f = region.fingerprint;
  const qual = useMemo(() => qualitative(f), [f]);

  const quality = useMemo(() => {
    const items: Measured<any>[] = [f.tempMean, f.tempMin, f.tempMax, f.elevation, f.slope, f.aridity, f.terrain, f.geology, f.minerals];
    const counts: Record<Provenance, number> = { verified: 0, derived: 0, simulated: 0, unavailable: 0 };
    items.forEach(i => counts[i.provenance as Provenance]++);
    return { counts, conf: items.reduce((s, i) => s + i.confidence, 0) / items.length, total: items.length };
  }, [f]);

  const [e0, e1] = ELEV_DOMAIN[planet.id];
  const elevPos = clamp(((f.elevation.value ?? 0) - e0) / (e1 - e0)) * 100;
  const zeroPos = clamp((0 - e0) / (e1 - e0)) * 100;

  const slopeLen = Math.PI * 80;
  const slopeDash = `${slopeLen * clamp((f.slope.value ?? 0) / 35)} ${slopeLen}`;
  const slopeClass = f.slope.value === null ? 'No data' : f.slope.value < 7 ? 'Gentle' : f.slope.value < 15 ? 'Moderate' : 'Steep';

  const terrain = useMemo(() => bars(f.terrain, TERRAIN_CLASSES, 6), [f]);
  const minerals = useMemo(() => bars(f.minerals, MINERAL_CLASSES, 8), [f]);
  const geology = useMemo(() => {
    const items = bars(f.geology, GEOLOGY_CLASSES, 8);
    const sum = items.reduce((s, i) => s + i.weight, 0) || 1;
    return items.map((i, n) => ({ ...i, share: (i.weight / sum) * 100, color: GEO_COLORS[n % GEO_COLORS.length] }));
  }, [f]);
  const q = quality;

  return (
    <div className="pg-fingerprint">
      <div className="page fp">
        <div className="container">
          <header className="head">
            <div>
              <p className="mono ctx">{planet.name} · {region.name} · {fmtCoord(region.lat, region.lon)}</p>
              <h1 className="h1">{t('Environmental fingerprint', 'البصمة البيئية')}</h1>
              <p className="lede">{t('Understanding the environment is the first step toward finding its closest match on Earth.', 'فهم البيئة هو الخطوة الأولى نحو إيجاد أقرب نظير لها على الأرض.')}</p>
            </div>
            <InView className="quality">
              <p className="qt">{t('Data quality of this fingerprint', 'جودة بيانات هذه البصمة')}</p>
              <div className="qbar" role="img" aria-label={`Of ${q.total} values: ${q.counts.verified} verified, ${q.counts.derived} derived, ${q.counts.simulated} simulated, ${q.counts.unavailable} unavailable`}>
                {PROV_ORDER.map(p => q.counts[p] ? <i key={p} className={`prov-${p}`} style={{ flexGrow: q.counts[p] }}></i> : null)}
              </div>
              <ul className="qleg mono">
                {PROV_ORDER.map(p => <li key={p} className={`prov-${p}`}><i></i>{q.counts[p]} {PROVENANCE_META[p].short.toLowerCase()}</li>)}
              </ul>
              <p className="qc mono">Mean confidence <b>{pct(q.conf)}</b></p>
            </InView>
          </header>

          <section className="qsum" aria-label="Environmental summary in plain language">
            <h2 className="h3">{t('In plain language', 'بلغة بسيطة')}</h2>
            <ul>{qual.map(x => <li key={x.key} className={x.known ? undefined : 'na'}><span className="mono">{x.label}</span><b>{x.value}</b></li>)}</ul>
            <p className="muted small">{t('Words are derived from the measured values below, with fixed thresholds. They make the numbers comparable; they do not replace them.', 'الكلمات مشتقة من القيم المقيسة أدناه بحدود ثابتة. هي تجعل الأرقام قابلة للمقارنة ولا تحلّ محلّها.')}</p>
          </section>

          <div className="sheet">

            {/* temperature */}
            <InView as="section" className="row" aria-labelledby="t-h">
              <div className="meta">
                <h2 id="t-h" className="h3">{t('Temperature', 'درجة الحرارة')}</h2>
                <p className="big"><Metric value={f.tempMean.value} unit="°C" /></p>
                <p className="why">Mean surface temperature, with the full range between the coldest and hottest values recorded for the site.</p>
                <p className="src mono"><ProvenanceBadge provenance={f.tempMean.provenance} /> {f.tempMean.source}</p>
                <Conf c={f.tempMean.confidence} />
              </div>
              <div className="viz">
                <div className="scale tscale">
                  <div className="track">
                    <span className="rng" style={{ left: `${tPos(f.tempMin.value)}%`, width: `${tPos(f.tempMax.value) - tPos(f.tempMin.value)}%` }}></span>
                    <span className="mean" style={{ left: `${tPos(f.tempMean.value)}%` }}><b className="mono">{fmt(f.tempMean)}</b></span>
                    {T_TICKS.map(t => <span key={t} className="tick" style={{ left: `${tPos(t)}%` }}><em className="mono">{t}°</em></span>)}
                  </div>
                </div>
                <div className="trio mono">
                  <span>Min <b>{fmt(f.tempMin)}</b></span><span>Max <b>{fmt(f.tempMax)}</b></span><span>Swing <b>{(f.tempMax.value ?? 0) - (f.tempMin.value ?? 0)} K</b></span>
                </div>
              </div>
            </InView>

            {/* elevation */}
            <InView as="section" className="row" aria-labelledby="e-h">
              <div className="meta">
                <h2 id="e-h" className="h3">{t('Elevation', 'الارتفاع')}</h2>
                <p className="big"><Metric value={f.elevation.value} unit="m" /></p>
                <p className="why">Height relative to the body's reference datum, placed within the full range of elevations on {planet.name}.</p>
                <p className="src mono"><ProvenanceBadge provenance={f.elevation.provenance} /> {f.elevation.source}</p>
                <Conf c={f.elevation.confidence} />
              </div>
              <div className="viz">
                <div className="scale">
                  <div className="track elev">
                    <span className="zero" style={{ left: `${zeroPos}%` }}><em className="mono">datum</em></span>
                    <span className="mean" style={{ left: `${elevPos}%` }}><b className="mono">{fmt(f.elevation)}</b></span>
                  </div>
                  <div className="ends mono"><span>{e0.toLocaleString('en-US')} m</span><span>{e1.toLocaleString('en-US')} m</span></div>
                </div>
              </div>
            </InView>

            {/* terrain */}
            <InView as="section" className="row" aria-labelledby="te-h">
              <div className="meta">
                <h2 id="te-h" className="h3">{t('Terrain type', 'نوع التضاريس')}</h2>
                <p className="big txt">{terrain[0]?.label}</p>
                <p className="why">Terrain classes present at the site. Bar length shows how strongly each class characterises it.</p>
                <p className="src mono"><ProvenanceBadge provenance={f.terrain.provenance} /> {f.terrain.source}</p>
                <Conf c={f.terrain.confidence} />
              </div>
              <div className="viz">
                <ul className="hbars">
                  {terrain.map((t, i) => (
                    <li key={t.key}><span className="l">{t.label}</span><span className="b"><i style={{ width: `${t.weight * 100}%`, transitionDelay: `${i * 70}ms` }}></i></span><span className="v mono">{(t.weight * 100).toFixed(0)}</span></li>
                  ))}
                </ul>
              </div>
            </InView>

            {/* geology */}
            <InView as="section" className="row" aria-labelledby="g-h">
              <div className="meta">
                <h2 id="g-h" className="h3">{t('Geological composition', 'التركيب الجيولوجي')}</h2>
                <p className="big txt">{geology[0]?.label}</p>
                <p className="why">Relative share of rock and ground types, normalised to 100%. These are class weights, not mapped area.</p>
                <p className="src mono"><ProvenanceBadge provenance={f.geology.provenance} /> {f.geology.source}</p>
                <Conf c={f.geology.confidence} />
              </div>
              <div className="viz">
                <div className="stack" role="img" aria-label="Geological composition breakdown">
                  {geology.map((g, i) => <i key={g.key} style={{ flexGrow: g.share, background: g.color, transitionDelay: `${i * 80}ms` }} title={`${g.label} ${g.share.toFixed(0)}%`}></i>)}
                </div>
                <ul className="legend">
                  {geology.map(g => <li key={g.key}><i style={{ background: g.color }}></i>{g.label} <span className="mono">{g.share.toFixed(0)}%</span></li>)}
                </ul>
              </div>
            </InView>

            {/* minerals */}
            <InView as="section" className="row" aria-labelledby="m-h">
              <div className="meta">
                <h2 id="m-h" className="h3">{t('Mineral characteristics', 'الخصائص المعدنية')}</h2>
                <p className="big txt">{minerals[0]?.label}</p>
                <p className="why">Expected mineral signature, ranked by strength. More lit pips mean a stronger signal.</p>
                <p className="src mono"><ProvenanceBadge provenance={f.minerals.provenance} /> {f.minerals.source}</p>
                <Conf c={f.minerals.confidence} />
              </div>
              <div className="viz">
                <ul className="pipsl">
                  {minerals.map((m, i) => (
                    <li key={m.key}><span className="l">{m.label}</span>
                      <span className="pips" aria-label={`${(m.weight * 10).toFixed(0)} of 10`}>{PIPS.map(p => <i key={p} className={p < m.weight * 10 ? 'on' : undefined} style={{ transitionDelay: `${i * 40 + p * 25}ms` }}></i>)}</span></li>
                  ))}
                </ul>
              </div>
            </InView>

            {/* slope */}
            <InView as="section" className="row" aria-labelledby="s-h">
              <div className="meta">
                <h2 id="s-h" className="h3">Surface slope</h2>
                <p className="big"><Metric value={f.slope.value} unit="°" /></p>
                <p className="why">Mean slope across the site. It affects landing, driving and where loose material collects.</p>
                <p className="src mono"><ProvenanceBadge provenance={f.slope.provenance} /> {f.slope.source}</p>
                <Conf c={f.slope.confidence} />
              </div>
              <div className="viz gauge">
                <svg viewBox="0 0 200 112" role="img" aria-label={`Mean slope ${fmt(f.slope)}`}>
                  <path d="M20 100 A80 80 0 0 1 180 100" className="g-bg" />
                  <path d="M20 100 A80 80 0 0 1 180 100" className="g-fg" strokeDasharray={slopeDash} />
                  <text x="20" y="112" className="gl">0°</text><text x="180" y="112" className="gl" textAnchor="end">35°</text>
                  <text x="100" y="92" textAnchor="middle" className="gv">{fmt(f.slope)}</text>
                </svg>
                <p className="mono gc">{slopeClass}</p>
              </div>
            </InView>

            {/* aridity */}
            <InView as="section" className="row" aria-labelledby="a-h">
              <div className="meta">
                <h2 id="a-h" className="h3">Aridity</h2>
                <p className="big"><Metric value={f.aridity.value} digits={4} unit="P/PET" /></p>
                <p className="why"><SciTip text="Aridity index = precipitation divided by potential evapotranspiration. Below 0.05 is hyperarid.">Aridity index</SciTip> on a log scale. Lower is drier. The Moon has no precipitation at all.</p>
                <p className="src mono"><ProvenanceBadge provenance={f.aridity.provenance} /> {f.aridity.source}</p>
                <Conf c={f.aridity.confidence} />
              </div>
              <div className="viz">
                <div className="scale">
                  <div className="track ari">
                    {ARI_BANDS.map(b => <span key={b.label} className="band" style={{ left: `${b.from}%`, width: `${b.to - b.from}%` }}><em className="mono">{b.label}</em></span>)}
                    <span className="mean" style={{ left: `${logPos(f.aridity.value ?? 0)}%` }}><b className="mono">{fmt(f.aridity, 4)}</b></span>
                  </div>
                  <div className="ends mono"><span>0.0001</span><span>2.0</span></div>
                </div>
              </div>
            </InView>

            {/* surface */}
            <InView as="section" className="row" aria-labelledby="sc-h">
              <div className="meta">
                <h2 id="sc-h" className="h3">Surface characteristics</h2>
                <p className="why">Qualitative traits that describe what the ground is like at the site.</p>
                              </div>
              <div className="viz">
                <ul className="traits">{f.surfaceTraits.map(t => <li key={t}>{t}</li>)}</ul>
              </div>
            </InView>
          </div>

          <footer className="next">
            <p className="muted">{t('Next, compare this fingerprint with Earth sites that have been studied as analogs.', 'بعد ذلك، قارن هذه البصمة بمواقع أرضية دُرست كنظائر.')}</p>
            <button className="btn" type="button" onClick={() => navigate('/analogs')}>{t('Find Earth analogs', 'ابحث عن نظائر أرضية')} <i className="arrow"></i></button>
          </footer>
        </div>
      </div>
    </div>
  );
}
