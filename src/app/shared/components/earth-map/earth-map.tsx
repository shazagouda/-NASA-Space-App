import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { feature, mesh } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import type { RankedAnalog } from '../../../core/models/science.model';
import { fmtCoord, fmtMeasured, pct } from '../../../core/utils/format';
import { motion } from '../../../core/services/motion.service';
import './earth-map.css';

maplibregl.setWorkerUrl(new URL('assets/maplibre/maplibre-gl-worker.mjs', document.baseURI).href);

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function graticule(): GeoJSON.FeatureCollection {
  const f: GeoJSON.Feature[] = [];
  for (let lon = -180; lon <= 180; lon += 30) f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: Array.from({ length: 37 }, (_, i) => [lon, -90 + i * 5]) } });
  for (let lat = -60; lat <= 60; lat += 30) f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat]) } });
  return { type: 'FeatureCollection', features: f };
}

interface Props {
  candidates: RankedAnalog[];
  selectedId?: string | null;
  onSelectCandidate?: (id: string) => void;
}

export function EarthMap({ candidates, selectedId = null, onSelectCandidate }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef(new Map<string, { m: maplibregl.Marker; el: HTMLButtonElement }>());
  const popup = useRef<maplibregl.Popup | null>(null);
  // latest props for the long-lived map callbacks
  const live = useRef({ candidates, selectedId, onSelectCandidate });
  live.current = { candidates, selectedId, onSelectCandidate };

  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [globe, setGlobe] = useState(false);
  const [sat, setSat] = useState(false);

  const buildMarkers = (list: RankedAnalog[]) => {
    const mp = map.current; if (!mp) return;
    markers.current.forEach(v => v.m.remove()); markers.current.clear();
    list.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `em-mk ${c.band}`;
      b.setAttribute('aria-label', `${c.analog.name}, ${c.analog.country}. Similarity ${pct(c.similarity)}. Rank ${c.rank}.`);
      b.innerHTML = '<i></i>';
      b.addEventListener('click', ev => { ev.stopPropagation(); live.current.onSelectCandidate?.(c.analog.id); });
      const m = new maplibregl.Marker({ element: b }).setLngLat([c.analog.lon, c.analog.lat]).addTo(mp);
      markers.current.set(c.analog.id, { m, el: b });
    });
    applySelection(live.current.selectedId, false);
  };

  const applySelection = (id: string | null | undefined, fly: boolean) => {
    markers.current.forEach((v, k) => v.el.classList.toggle('sel', k === id));
    popup.current?.remove();
    const mp = map.current;
    if (!id || !mp) return;
    const c = live.current.candidates.find(x => x.analog.id === id); if (!c) return;
    const a = c.analog, f = a.fingerprint;
    popup.current = new maplibregl.Popup({ offset: 20, closeButton: true, className: 'em-pop', maxWidth: '260px' })
      .setLngLat([a.lon, a.lat])
      .setHTML(`<h4>${esc(a.name)}</h4><p class="c">${esc(a.country)} · ranked #${c.rank}</p><dl>
        <dt>Coordinates</dt><dd>${esc(fmtCoord(a.lat, a.lon))}</dd>
        <dt>Mean temp.</dt><dd>${esc(fmtMeasured(f.tempMean))}</dd>
        <dt>Elevation</dt><dd>${esc(fmtMeasured(f.elevation))}</dd>
        <dt>Similarity</dt><dd>${pct(c.similarity)}</dd>
        <dt>Confidence</dt><dd>${pct(c.confidence)}</dd></dl>`)
      .addTo(mp);
    if (fly) mp.flyTo({ center: [a.lon, a.lat], zoom: Math.max(mp.getZoom(), 3.2), duration: motion.reduced() ? 0 : 1200, essential: false });
  };

  const fit = (animate = true) => {
    const mp = map.current; const list = live.current.candidates;
    if (!mp || !list.length) return;
    const b = new maplibregl.LngLatBounds();
    list.forEach(c => b.extend([c.analog.lon, c.analog.lat]));
    mp.fitBounds(b, { padding: { top: 70, bottom: 60, left: 50, right: 50 }, maxZoom: 2.4, duration: animate && !motion.reduced() ? 900 : 0 });
  };

  // create / destroy the map
  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | undefined;
    (async () => {
      try {
        const topo = (await (await fetch('assets/data/countries-110m.json')).json()) as Topology;
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const countries = feature(topo, topo.objects['countries'] as any) as unknown as GeoJSON.FeatureCollection;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const borders = mesh(topo, topo.objects['countries'] as any, (a, b) => a !== b) as unknown as GeoJSON.Geometry;
        const mp = new maplibregl.Map({
          container: el.current!,
          style: {
            version: 8,
            projection: { type: 'mercator' },
            sources: {
              land: { type: 'geojson', data: countries },
              borders: { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: borders } },
              grat: { type: 'geojson', data: graticule() },
              sat: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 12, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' },
            },
            layers: [
              { id: 'bg', type: 'background', paint: { 'background-color': '#060b17' } },
              { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#0f1d34' } },
              { id: 'sat', type: 'raster', source: 'sat', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.92, 'raster-saturation': -0.35, 'raster-brightness-max': 0.8 } },
              { id: 'grat', type: 'line', source: 'grat', paint: { 'line-color': 'rgba(72,217,232,0.14)', 'line-width': 0.6 } },
              { id: 'borders', type: 'line', source: 'borders', paint: { 'line-color': 'rgba(148,163,184,0.28)', 'line-width': 0.5 } },
            ],
          },
          center: [10, 15], zoom: 1.2, minZoom: 0.8, maxZoom: 9, attributionControl: { compact: true, customAttribution: 'Natural Earth via world-atlas' },
          dragRotate: false, pitchWithRotate: false, touchPitch: false,
        });
        map.current = mp;
        mp.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        mp.on('load', () => { setReady(true); buildMarkers(live.current.candidates); fit(false); applySelection(live.current.selectedId, false); });
        mp.on('error', e => { if (!(e.error?.message ?? '').includes('tile')) setError(prev => prev || (e.error?.message ?? 'Unknown map error')); });
        ro = new ResizeObserver(() => mp.resize());
        ro.observe(el.current!);
      } catch (e) {
        if (!cancelled) setError(`Map data could not be loaded. ${(e as Error).message}`);
      }
    })();
    const markerStore = markers.current;
    return () => {
      cancelled = true;
      ro?.disconnect();
      popup.current?.remove();
      markerStore.forEach(v => v.m.remove());
      markerStore.clear();
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (ready) buildMarkers(candidates); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [candidates, ready]);
  useEffect(() => { if (ready) applySelection(selectedId, true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedId, ready]);

  const toggleProjection = () => {
    const g = !globe; setGlobe(g);
    map.current?.setProjection({ type: g ? 'globe' : 'mercator' });
  };
  const toggleSat = () => {
    const s = !sat; setSat(s);
    map.current?.setLayoutProperty('sat', 'visibility', s ? 'visible' : 'none');
    map.current?.setPaintProperty('land', 'fill-opacity', s ? 0 : 1);
  };

  return (
    <div className="c-earthmap">
      <div className="em-wrap">
        <div className="em-canvas" ref={el}></div>
        {error
          ? <div className="em-msg" role="alert"><strong>The map could not start.</strong><span>{error}</span></div>
          : !ready && <div className="em-msg" role="status"><span className="mono">Loading map…</span></div>}
        <div className="em-tools" role="group" aria-label="Map controls">
          <button type="button" onClick={toggleProjection} aria-pressed={globe}>{globe ? 'Globe' : 'Flat'}</button>
          <button type="button" onClick={toggleSat} aria-pressed={sat}>Satellite</button>
          <button type="button" onClick={() => fit()}>Fit all</button>
        </div>
        <ul className="em-legend mono" aria-label="Marker legend">
          <li><i className="strong"></i>Strong</li><li><i className="moderate"></i>Moderate</li><li><i className="partial"></i>Partial</li><li><i className="weak"></i>Weak</li>
        </ul>
      </div>
    </div>
  );
}
