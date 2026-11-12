import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { motion } from '../../../core/services/motion.service';
import './planet-trio.css';

type V3 = [number, number, number];
interface Spec {
  id: 'earth' | 'mars' | 'moon';
  url: string;
  /** radius in scene units */
  r: number;
  /** position on wide screens / on tall (phone) screens */
  wide: V3;
  tall: V3;
  /** spin speed, rad/s */
  spin: number;
  /** axial tilt, rad */
  tilt: number;
  rim?: { color: number; k: number };
}

/*
 * One shared scene, one sun, one camera: the planets overlap by depth (z), not by CSS layering.
 * Mars sits furthest back, the Earth in the middle plane, the Moon nearest the viewer,
 * so each body partly hides the one behind it.
 */
const SPECS: Spec[] = [
  { id: 'mars', url: 'assets/models/mars.glb', r: 1.6, wide: [4.6, 0.9, -3.2], tall: [1.2, 1.8, -3.2], spin: 0.05, tilt: 0.44, rim: { color: 0xe99a6b, k: 0.45 } },
  { id: 'earth', url: 'assets/models/earth.glb', r: 2.2, wide: [1.3, -0.2, 0.5], tall: [-0.9, -1.0, 0.5], spin: 0.07, tilt: 0.41, rim: { color: 0x5aa8ff, k: 1.0 } },
  { id: 'moon', url: 'assets/models/moon.glb', r: 0.8, wide: [2.9, -1.0, 2.2], tall: [1.0, -2.3, 2.2], spin: 0.02, tilt: 0.12 },
];

const SUN = new THREE.Vector3(-6, 3.5, 5).normalize();

const RIM_VERT = `
  varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * mv;
  }`;
const RIM_FRAG = `
  uniform vec3 c; uniform float k; uniform vec3 sun;
  varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main() {
    float f = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), 3.2);
    float lit = smoothstep(-0.25, 0.55, dot(normalize(vW), normalize(sun)));
    gl_FragColor = vec4(c * f * k * lit, 1.0);
  }`;

interface Body { spec: Spec; anchor: THREE.Group; spin: THREE.Group; base: THREE.Vector3 }

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse(o => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach(m => {
      Object.values(m as unknown as Record<string, unknown>).forEach(v => { if (v instanceof THREE.Texture) v.dispose(); });
      m.dispose();
    });
  });
}

/** Earth, Mars and the Moon in one WebGL scene. Loads when scrolled near, pauses when off screen, mirrors for RTL. */
export function PlanetTrio({ mirror = false, label }: { mirror?: boolean; label: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mirrorRef = useRef(mirror);
  const relayout = useRef<() => void>(() => {});
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [progress, setProgress] = useState(0);

  useEffect(() => { mirrorRef.current = mirror; relayout.current(); }, [mirror]);

  useEffect(() => {
    const host = hostRef.current, canvas = canvasRef.current;
    if (!host || !canvas) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
    catch { setState('error'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

    const sun = new THREE.DirectionalLight(0xfff1e0, 3.4);
    sun.position.copy(SUN).multiplyScalar(20);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0x6f86b8, 0x04060d, 0.32));

    // background stars
    const n = 800, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(60 + Math.random() * 30); pos.set([v.x, v.y, v.z], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.16, color: 0xcfe0ff, transparent: true, opacity: 0.75, sizeAttenuation: true, depthWrite: false })));

    const bodies: Body[] = SPECS.map(spec => {
      const anchor = new THREE.Group();
      anchor.scale.setScalar(spec.r);
      const tilt = new THREE.Group(); tilt.rotation.z = spec.tilt;
      const spin = new THREE.Group();
      tilt.add(spin); anchor.add(tilt);
      if (spec.rim) {
        const shell = new THREE.Mesh(
          new THREE.SphereGeometry(1.045, 64, 48),
          new THREE.ShaderMaterial({
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
            uniforms: { c: { value: new THREE.Color(spec.rim.color) }, k: { value: spec.rim.k }, sun: { value: SUN.clone() } },
            vertexShader: RIM_VERT, fragmentShader: RIM_FRAG,
          }),
        );
        anchor.add(shell);
      }
      scene.add(anchor);
      return { spec, anchor, spin, base: new THREE.Vector3() };
    });
    const earth = bodies.find(b => b.spec.id === 'earth');
    if (earth) earth.spin.rotation.y = -1.1;

    let disposed = false, visible = false, started = false, raf = 0;
    let tx = 0, ty = 0, px = 0, py = 0, last = performance.now();

    const layout = () => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const tall = camera.aspect < 0.95;
      const fitW = tall ? 9.5 : 14.5, fitH = tall ? 11 : 8.4;
      const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const dist = Math.max(fitW / (2 * t * camera.aspect), fitH / (2 * t));
      camera.position.set(0, 0, dist); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
      const sx = mirrorRef.current ? -1 : 1;
      bodies.forEach(b => { const p = tall ? b.spec.tall : b.spec.wide; b.base.set(p[0] * sx, p[1], p[2]); b.anchor.position.copy(b.base); });
    };
    relayout.current = layout;
    const ro = new ResizeObserver(layout); ro.observe(host);
    layout();

    const onPointer = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      if (!r.width || !r.height) return;
      tx = THREE.MathUtils.clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      ty = THREE.MathUtils.clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    };
    window.addEventListener('pointermove', onPointer, { passive: true });

    const mount = (b: Body, model: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      model.position.sub(c);
      const wrap = new THREE.Group(); wrap.add(model);
      wrap.scale.setScalar(2 / Math.max(size.x, size.y, size.z));
      b.spin.add(wrap);
      const aniso = renderer.capabilities.getMaxAnisotropy();
      model.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material as THREE.MeshStandardMaterial & { clearcoat?: number; specularIntensity?: number };
        mat.metalness = 0;
        if (b.spec.id === 'moon') {
          mat.roughness = 1;
          if ('clearcoat' in mat) mat.clearcoat = 0;
          if ('specularIntensity' in mat) mat.specularIntensity = 0.05;
          if (mat.map) { mat.bumpMap = mat.map; mat.bumpScale = 1.6; }
          mat.color = new THREE.Color(1.25, 1.25, 1.25);
        } else {
          mat.roughness = b.spec.id === 'earth' ? 0.85 : 0.95;
        }
        [mat.map, mat.normalMap, mat.bumpMap].forEach(t => { if (t) t.anisotropy = aniso; });
        mat.needsUpdate = true;
      });
    };

    const loadAll = async () => {
      setState('loading');
      const loader = new GLTFLoader();
      const part = bodies.map(() => 0);
      const results = await Promise.allSettled(bodies.map((b, i) =>
        loader.loadAsync(b.spec.url, e => {
          if (!e.total) return;
          part[i] = e.loaded / e.total;
          setProgress(Math.round(part.reduce((a, v) => a + v, 0) / part.length * 100));
        }).then(g => { if (disposed) disposeObject(g.scene); else mount(b, g.scene); }),
      ));
      if (disposed) return;
      setState(results.every(r => r.status === 'rejected') ? 'error' : 'ready');
    };

    const io = new IntersectionObserver(es => {
      visible = es[0]?.isIntersecting ?? false;
      if (visible && !started) { started = true; void loadAll(); }
    }, { rootMargin: '300px' });
    io.observe(host);

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      const now = performance.now(), dt = Math.min((now - last) / 1000, 0.05); last = now;
      const still = motion.reduced();
      if (!still) bodies.forEach(b => { b.spin.rotation.y += dt * b.spec.spin; });
      px += ((still ? 0 : tx) - px) * 0.05; py += ((still ? 0 : ty) - py) * 0.05;
      // nearer bodies drift more than distant ones, which reads as depth
      bodies.forEach(b => { const k = (b.base.z + 4) * 0.11; b.anchor.position.set(b.base.x + px * k, b.base.y - py * k * 0.6, b.base.z); });
      renderer.render(scene, camera);
    };
    frame();

    return () => {
      disposed = true; cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      window.removeEventListener('pointermove', onPointer);
      relayout.current = () => {};
      disposeObject(scene);
      renderer.dispose(); renderer.forceContextLoss();
    };
  }, []);

  return (
    <div className={`c-trio${state === 'ready' ? ' ready' : ''}`} ref={hostRef}>
      <canvas ref={canvasRef} role="img" aria-label={label}></canvas>
      {(state === 'idle' || state === 'loading') && (
        <div className="st" role="status"><div className="bar"><i style={{ width: `${progress}%` }}></i></div></div>
      )}
      {state === 'error' && <div className="st" role="alert"><span>The 3D scene could not start on this device.</span></div>}
    </div>
  );
}
