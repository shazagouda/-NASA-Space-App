import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import { motion } from '../../core/services/motion.service';

export interface GlobeSite { id: string; name: string; lat: number; lon: number }

const toVec = (lat: number, lon: number, r: number) => {
  const phi = (90 - lat) * Math.PI / 180, th = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
};

/** Draws real country outlines (Natural Earth, from the project's own data file) onto an equirectangular canvas. */
async function outlineTexture(): Promise<THREE.CanvasTexture> {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const sea = g.createLinearGradient(0, 0, 0, H); sea.addColorStop(0, '#0a1a33'); sea.addColorStop(.5, '#0d2747'); sea.addColorStop(1, '#0a1a33');
  g.fillStyle = sea; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(148,163,184,.12)'; g.lineWidth = 1;
  for (let x = 0; x <= W; x += W / 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y <= H; y += H / 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  try {
    const topo = await (await fetch('assets/data/countries-110m.json')).json() as Topology;
    const fc = feature(topo, topo.objects['countries']) as unknown as GeoJSON.FeatureCollection;
    const P = ([lo, la]: number[]) => [(lo + 180) / 360 * W, (90 - la) / 180 * H];
    g.fillStyle = 'rgba(72,150,170,.28)'; g.strokeStyle = 'rgba(160,230,240,.7)'; g.lineWidth = 1.2;
    const ring = (r: number[][]) => { r.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
    for (const f of fc.features) {
      const geo = f.geometry; if (!geo) continue;
      const polys = geo.type === 'Polygon' ? [geo.coordinates] : geo.type === 'MultiPolygon' ? geo.coordinates : [];
      for (const poly of polys) { g.beginPath(); poly.forEach(ring as never); g.fill(); g.stroke(); }
    }
  } catch { /* outlines are decorative; the globe still works without them */ }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

const NO_SITES: GlobeSite[] = [];

/** Interactive Earth globe: drag to rotate, wheel/pinch not captured (page scroll stays intact), click a marker to select it. */
export function AboutGlobe({ sites = NO_SITES, activeId, onPick, label }: { sites?: GlobeSite[]; activeId?: string | null; onPick?: (id: string) => void; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const pickRef = useRef(onPick); pickRef.current = onPick;
  const activeRef = useRef(activeId); activeRef.current = activeId;

  useEffect(() => {
    const el = host.current; if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab';
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50); cam.position.set(0, 0, 5.6);
    const globe = new THREE.Group(); scene.add(globe);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1.6, 64, 48), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 }));
    globe.add(earth);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.68, 48, 32), new THREE.MeshBasicMaterial({ color: 0x48d9e8, transparent: true, opacity: 0.08, side: THREE.BackSide }));
    scene.add(atmo);
    scene.add(new THREE.AmbientLight(0x8aa4d0, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(4, 2, 5); scene.add(sun);
    let disposed = false;
    outlineTexture().then(t => { if (!disposed) { (earth.material as THREE.MeshStandardMaterial).map = t; (earth.material as THREE.MeshStandardMaterial).needsUpdate = true; } });

    const pins = sites.map(s => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe8b84d }));
      m.position.copy(toVec(s.lat, s.lon, 1.62)); m.userData.id = s.id; globe.add(m);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.095, 32), new THREE.MeshBasicMaterial({ color: 0xe8b84d, side: THREE.DoubleSide, transparent: true, opacity: .8 }));
      ring.position.copy(m.position); ring.lookAt(m.position.clone().multiplyScalar(2)); globe.add(ring);
      return { m, ring };
    });

    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    let drag = false, moved = 0, lx = 0, ly = 0, vy = 0, visible = true, raf = 0;
    const cv = renderer.domElement;
    const down = (e: PointerEvent) => { drag = true; moved = 0; lx = e.clientX; ly = e.clientY; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; };
    const move = (e: PointerEvent) => { if (!drag) return; const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; moved += Math.abs(dx) + Math.abs(dy); globe.rotation.y += dx * 0.006; globe.rotation.x = Math.max(-1, Math.min(1, globe.rotation.x + dy * 0.004)); vy = dx * 0.006; };
    const up = (e: PointerEvent) => {
      drag = false; cv.style.cursor = 'grab';
      if (moved > 5) return;
      const r = cv.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, cam);
      const hit = ray.intersectObjects(pins.map(p => { p.m.scale.setScalar(2.6); const o = p.m; return o; }))[0];
      pins.forEach(p => p.m.scale.setScalar(1));
      if (hit) pickRef.current?.(hit.object.userData.id as string);
    };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up);

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.05 }); io.observe(el);
    const clock = new THREE.Clock();
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const t = clock.getElapsedTime();
      if (!drag) { if (!motion.reduced()) globe.rotation.y += 0.0018 + vy; vy *= 0.94; }
      pins.forEach((p, i) => {
        const on = sites[i].id === activeRef.current;
        (p.m.material as THREE.MeshBasicMaterial).color.set(on ? 0x48d9e8 : 0xe8b84d);
        (p.ring.material as THREE.MeshBasicMaterial).color.set(on ? 0x48d9e8 : 0xe8b84d);
        p.ring.scale.setScalar(on ? 1.4 + Math.sin(t * 3) * 0.25 : 1);
      });
      renderer.render(scene, cam);
    };
    frame();
    return () => { disposed = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); renderer.dispose(); cv.remove(); };
  }, [sites]);

  if (failed) return <div className="gl-fallback" role="img" aria-label={label}>Your device could not start the 3D globe. The sites are listed beside it.</div>;
  return <div ref={host} className="gl-host" role="img" aria-label={label} />;
}
