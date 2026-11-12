import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PlanetViewer, PlanetViewerHandle } from '../../shared/components/planet-viewer/planet-viewer';
import { ProvenanceBadge } from '../../shared/components/provenance-badge/provenance-badge';
import { planetaryData as data } from '../../services/planetary-data.service';
import { exploration as state } from '../../core/services/exploration-state.service';
import { LayerId, PlanetId, SITE_TYPE_LABEL, SiteType, TERRAIN_CLASSES } from '../../core/models/science.model';
import { LAYERS, layers as layerSvc, Probe } from '../../core/services/layer.service';
import { useSig } from '../../core/signals';
import { i18n, useT } from '../../core/services/i18n.service';
import { qualitative } from '../../core/utils/qualitative';
import { fmtCoord, fmtMeasured, fmtNum, topClasses } from '../../core/utils/format';
import './planetary-exploration.css';

const fmtKm = (v: number) => fmtNum(Math.round(v / 10) * 10);
const fmtV = (v: number, unit: string) => `${v < 0 ? '−' : ''}${fmtNum(Math.abs(Math.round(v)))} ${unit}`;

const LAYER_AR: Record<string, string> = { terrain: 'التضاريس', elevation: 'الارتفاع', temperature: 'الحرارة', geology: 'الجيولوجيا', minerals: 'المعادن', slope: 'الانحدار' };
const PLANET_AR: Record<string, string> = { moon: 'القمر', mars: 'المريخ' };

export function PlanetaryExplorationPage() {
  const t = useT();
  const ar = useSig(() => i18n.lang() === 'ar');
  const lname = (id: string, en: string) => (ar ? LAYER_AR[id] ?? en : en);
  const pname = (id: string, en: string) => (ar ? PLANET_AR[id] ?? en : en);
  const navigate = useNavigate();
  const { planet: param } = useParams();
  const [query] = useSearchParams();
  const needRegion = query.has('needRegion');
  const viewer = useRef<PlanetViewerHandle>(null);

  const statePlanetId = useSig(() => state.planetId());
  const catalogRegions = useSig(() => data.all());
  const selectedRegion = useSig(() => state.region());

  const valid = !!param && data.isPlanet(param);
  const planetId: PlanetId = valid ? (param as PlanetId) : statePlanetId ?? 'moon';
  const planet = data.planet(planetId);

  const [layer, setLayer] = useState<LayerId>('terrain');
  const [opacity, setOpacity] = useState(0.75);
  const [siteFilter, setSiteFilter] = useState<'all' | SiteType>('all');
  const [probe, setProbe] = useState<Probe | null>(null);

  // invalid or missing :planet → go to the remembered planet; otherwise keep the shared state in sync with the URL
  useEffect(() => {
    if (!valid) { navigate({ pathname: `/explore/${state.planetId() ?? 'moon'}`, search: location.search }, { replace: true }); return; }
    if (state.planetId() !== param) state.selectPlanet(param as PlanetId);
    setProbe(null);
    setSiteFilter('all');
  }, [param, valid, navigate]);

  const allRegions = useMemo(() => catalogRegions.filter(r => r.planet === planetId), [catalogRegions, planetId]);
  const regions = useMemo(() => allRegions.filter(r => siteFilter === 'all' || (r.siteType ?? 'landing') === siteFilter), [allRegions, siteFilter]);
  const counts = useMemo(() => ({
    base: allRegions.filter(r => r.siteType === 'base').length,
    landing: allRegions.filter(r => (r.siteType ?? 'landing') === 'landing').length,
  }), [allRegions]);
  const layerImage = useMemo(() => layerSvc.render(planetId, layer, allRegions), [planetId, layer, allRegions]);
  const layerMeta = layerSvc.meta(layer);
  const selected = selectedRegion && selectedRegion.planet === planetId ? selectedRegion : null;
  const qual = useMemo(() => (selected ? qualitative(selected.fingerprint) : []), [selected]);
  const rampCss = layerImage?.legend.ramp ? `linear-gradient(90deg, ${layerImage.legend.ramp.join(', ')})` : '';
  const others = data.planets().filter(p => p.id !== planetId);
  const terrain = selected ? topClasses(selected.fingerprint.terrain, TERRAIN_CLASSES, 2).map(t => t.label).join(' · ') : '';

  const chooseLayer = (id: LayerId) => { setLayer(id); setProbe(null); };
  const onPick = (p: { lat: number; lon: number }) => setProbe(layerSvc.probe(planetId, p.lat, p.lon, allRegions));
  const choose = (id: string) => state.selectRegion(id);
  const useNearest = () => { const n = probe?.nearest; if (n) { choose(n.region.id); setProbe(null); } };

  return (
    <div className="pg-explore">
      <section className="explore">
        <div className="viewer-wrap">
          <PlanetViewer key={planet.id} ref={viewer} planet={planet.id} modelUrl={planet.modelUrl} regions={regions} selectedId={selected?.id ?? null}
            showMarkers interactive distance={4.5} onMarkerClick={choose}
            layerImage={layerImage} layerOpacity={opacity} surfacePickEnabled onSurfacePick={onPick} />
          <div className="layers" role="radiogroup" aria-label={t('Map layer', 'طبقة الخريطة')}>
            {LAYERS.map(l => (
              <button key={l.id} type="button" role="radio" aria-checked={layer === l.id} className={layer === l.id ? 'on' : undefined} disabled={!layerSvc.available(planetId, l.id)} title={layerSvc.available(planetId, l.id) ? undefined : t('No data connected for this layer', 'لا توجد بيانات متصلة بهذه الطبقة')} onClick={() => chooseLayer(l.id)}>{lname(l.id, l.label)}</button>
            ))}
          </div>

          <div className="dock">
            {probe && (
              <div className="probe glass-s" role="status">
                <header className="mono"><span dir="ltr">{probe.lat.toFixed(1)}°, {probe.lon.toFixed(1)}°</span><button type="button" onClick={() => setProbe(null)} aria-label={t('Close', 'إغلاق')}>×</button></header>
                {probe.nearest && (
                  <p className="nr">{t('Nearest target:', 'أقرب هدف:')} <b>{probe.nearest.region.name}</b>{t(`, about ${fmtKm(probe.nearest.km)} km away.`, `، على بُعد ${fmtKm(probe.nearest.km)} كم تقريبًا.`)}{' '}
                    <button type="button" className="lnk" onClick={useNearest}>{t('Select it', 'اختره')}</button></p>
                )}
              </div>
            )}
            {layerImage ? (
              <div className="legend glass-s">
                <div className="lh"><strong>{lname(layerMeta.id, layerMeta.label)}</strong>
                  <label className="op mono">{t('Opacity', 'الشفافية')} <input type="range" min="0.2" max="1" step="0.05" value={opacity} onChange={e => setOpacity(+e.target.value)} aria-label={t('Layer opacity', 'شفافية الطبقة')} /></label></div>
                {layerImage.legend.kind === 'continuous' ? (
                  <>
                    <div className="ramp" style={{ background: rampCss }}></div>
                    <div className="scale mono"><span>{fmtV(layerImage.legend.min ?? 0, layerImage.legend.unit)}</span><span>{fmtV(layerImage.legend.max ?? 0, layerImage.legend.unit)}</span></div>
                  </>
                ) : (
                  <ul className="sw">{layerImage.legend.classes?.map(c => <li key={c.label}><i style={{ background: c.color }}></i>{c.label}</li>)}</ul>
                )}
                <p className="note">{layerImage.legend.note}</p>
              </div>
            ) : (
              <p className="hint mono">{t('Drag to rotate · scroll to zoom · click the surface to probe a point', 'اسحب للتدوير · مرّر للتكبير · اضغط على السطح لفحص نقطة')}</p>
            )}
            <div className="cam" role="group" aria-label={t('Camera controls', 'التحكم بالكاميرا')}>
              <button type="button" onClick={() => viewer.current?.zoom(0.8)} aria-label={t('Zoom in', 'تكبير')}>+</button>
              <button type="button" onClick={() => viewer.current?.zoom(1.25)} aria-label={t('Zoom out', 'تصغير')}>−</button>
              <button type="button" className="wide" onClick={() => viewer.current?.resetCamera()}>{t('Reset view', 'إعادة الضبط')}</button>
            </div>
          </div>
        </div>

        <aside className="targets glass" aria-label={t('Target regions', 'المناطق المستهدفة')}>
          <div className="tabs" role="tablist" aria-label={t('World', 'العالم')}>
            <button role="tab" type="button" aria-selected={true} className="on">{pname(planet.id, planet.name)}</button>
            {others.map(o => <button key={o.id} role="tab" type="button" aria-selected={false} onClick={() => navigate(`/explore/${o.id}`)}>{pname(o.id, o.name)}</button>)}
          </div>
          <h1 className="h2">{t('Where do we land or build?', 'أين نهبط أو نبني؟')}</h1>
          <div className="seg" role="radiogroup" aria-label={t('Site type', 'نوع الموقع')}>
            <button type="button" role="radio" aria-checked={siteFilter === 'all'} className={siteFilter === 'all' ? 'on' : undefined} onClick={() => setSiteFilter('all')}>{t('All', 'الكل')}</button>
            <button type="button" role="radio" aria-checked={siteFilter === 'base'} className={siteFilter === 'base' ? 'on' : undefined} onClick={() => setSiteFilter('base')}>{planet.id === 'moon' ? t('Lunar', 'قاعدة قمرية') : t('Mars', 'قاعدة مريخية')}{ar ? '' : ' base'} · {counts.base}</button>
            <button type="button" role="radio" aria-checked={siteFilter === 'landing'} className={siteFilter === 'landing' ? 'on' : undefined} onClick={() => setSiteFilter('landing')}>{t('Landing site', 'موقع هبوط')} · {counts.landing}</button>
          </div>
          {needRegion && !selected && <p className="notice" role="alert">{t('Select a region first. The next steps analyse a specific location.', 'اختر منطقة أولًا. الخطوات التالية تحلّل موقعًا محددًا.')}</p>}
          {allRegions.length === 0 && (
            <p className="empty-list">{t('No regions are loaded for this world yet. They appear here once the data service is connected.', 'لم تُحمَّل أي مناطق لهذا العالم بعد. ستظهر هنا عند ربط خدمة البيانات.')}</p>
          )}
          <ul className="list">
            {regions.map(r => (
              <li key={r.id}>
                <button type="button" className={selected?.id === r.id ? 'on' : undefined} aria-pressed={selected?.id === r.id} onClick={() => choose(r.id)}>
                  <span className="n">{r.name}</span>
                  <span className="k mono"><b className={`st${r.siteType === 'base' ? ' base' : ''}`}>{SITE_TYPE_LABEL[r.siteType ?? 'landing']}</b> · {r.kind} · {fmtCoord(r.lat, r.lon)}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <aside className={`detail glass${selected ? '' : ' blank'}`} aria-label={t('Region information', 'معلومات المنطقة')} aria-live="polite">
          {selected ? (
            <>
              <header>
                <p className="mono k">{pname(planet.id, planet.name)} · {SITE_TYPE_LABEL[selected.siteType ?? 'landing']} · {selected.kind}</p>
                <h2 className="h2">{selected.name}</h2>
                <p className="sum">{selected.summary}</p>
              </header>
              <dl className="rows mono">
                <div><dt>{t('Latitude', 'خط العرض')}</dt><dd>{selected.lat >= 0 ? '+' : '−'}{(selected.lat < 0 ? -selected.lat : selected.lat).toFixed(2)}°</dd></div>
                <div><dt>{t('Longitude', 'خط الطول')}</dt><dd>{selected.lon >= 0 ? '+' : '−'}{(selected.lon < 0 ? -selected.lon : selected.lon).toFixed(2)}° E</dd></div>
                <div><dt>{t('Feature size', 'حجم المعلَم')}</dt><dd>{selected.featureSizeKm.toLocaleString('en-US')} km</dd></div>
                <div><dt>{t('Elevation', 'الارتفاع')}</dt><dd>{fmtMeasured(selected.fingerprint.elevation)} <ProvenanceBadge provenance={selected.fingerprint.elevation.provenance} /></dd></div>
                <div><dt>{t('Mean temperature', 'متوسط الحرارة')}</dt><dd>{fmtMeasured(selected.fingerprint.tempMean)} <ProvenanceBadge provenance={selected.fingerprint.tempMean.provenance} /></dd></div>
                <div><dt>{t('Surface slope', 'انحدار السطح')}</dt><dd>{fmtMeasured(selected.fingerprint.slope)} <ProvenanceBadge provenance={selected.fingerprint.slope.provenance} /></dd></div>
                <div className="full"><dt>{t('Terrain', 'التضاريس')}</dt><dd className="txt">{terrain}</dd></div>
              </dl>
              <div className="block">
                <h3>{t('Environmental summary', 'ملخص بيئي')}</h3>
                <ul className="qual">{qual.map(q => <li key={q.key}><span>{q.label}</span><b className={q.known ? undefined : 'na'}>{q.value}</b></li>)}</ul>
              </div>
              <div className="block">
                <h3>{t('Surface', 'السطح')}</h3>
                <p>{selected.surfaceDescription}</p>
              </div>
              <div className="block">
                <h3>{t('Geological characteristics', 'الخصائص الجيولوجية')}</h3>
                <ul>{selected.geologicalNotes.map(g => <li key={g}>{g}</li>)}</ul>
              </div>
              <button className="btn cta" type="button" onClick={() => navigate('/fingerprint')}>{t('Analyze this location', 'حلّل هذا الموقع')}</button>
            </>
          ) : (
            <div className="empty">
              <h2 className="h2">{t('No region selected', 'لم تُختر منطقة')}</h2>
              <p className="muted">{t('Select a marker on the globe, or pick a region from the list. Its location, terrain and measurements will appear here.', 'اختر علامة على الكرة أو منطقة من القائمة. سيظهر هنا موقعها وتضاريسها وقياساتها.')}</p>
              <p className="mono small muted">{t('Camera moves to the region you choose.', 'تنتقل الكاميرا إلى المنطقة التي تختارها.')}</p>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
