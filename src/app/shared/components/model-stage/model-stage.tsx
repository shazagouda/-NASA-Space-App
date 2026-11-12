import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { motion } from '../../../core/services/motion.service';
import './model-stage.css';

type StageState = 'idle' | 'loading' | 'ready' | 'error';

class ModelScene {
  private renderer?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.01, 200);
  private controls?: OrbitControls;
  private root = new THREE.Group();
  private raf = 0;
  private visible = false;
  private io?: IntersectionObserver;
  private ro?: ResizeObserver;
  private disposed = false;
  private started = false;
  private token = 0;
  private last = performance.now();
  private active = false;
  private draco?: DRACOLoader;
  private pmrem?: THREE.PMREMGenerator;
  private idleTimer = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private host: HTMLElement,
    private url: string,
    private tilt: number,
    private status: { state: (s: StageState) => void; progress: (n: number) => void; error: (m: string) => void },
  ) {}

  /** Starts rendering; the model itself loads lazily when the stage first scrolls into view. */
  start(): void {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    } catch { this.status.state('error'); this.status.error('WebGL is not available.'); return; }
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    const key = new THREE.DirectionalLight(0xfff1de, 2.4); key.position.set(-3, 3, 4); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x4d8dff, 0.8); fill.position.set(4, 0.5, -3); this.scene.add(fill);
    this.scene.add(this.root);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true; this.controls.enablePan = false; this.controls.enableZoom = false; this.controls.rotateSpeed = 0.7;
    this.controls.addEventListener('start', () => { this.active = true; window.clearTimeout(this.idleTimer); });
    this.controls.addEventListener('end', () => { this.idleTimer = window.setTimeout(() => (this.active = false), 2000); });
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.host);
    this.io = new IntersectionObserver(es => {
      this.visible = es[0]?.isIntersecting ?? false;
      if (this.visible && !this.started) { this.started = true; void this.load(this.url); }
    }, { rootMargin: '200px' });
    this.io.observe(this.host);
    this.resize();
    this.loop();
  }

  destroy(): void {
    this.disposed = true; cancelAnimationFrame(this.raf); window.clearTimeout(this.idleTimer);
    this.io?.disconnect(); this.ro?.disconnect(); this.controls?.dispose();
    this.dispose(this.scene); this.scene.environment?.dispose(); this.pmrem?.dispose(); this.draco?.dispose(); this.renderer?.dispose();
  }

  retry(): void { void this.load(this.url); }

  private async load(url: string): Promise<void> {
    const t = ++this.token;
    this.status.state('loading'); this.status.progress(0);
    [...this.root.children].forEach(c => { this.root.remove(c); this.dispose(c); });
    this.draco ??= new DRACOLoader().setDecoderPath('assets/draco/');
    const loader = new GLTFLoader().setDRACOLoader(this.draco);
    try {
      const gltf = await loader.loadAsync(url, e => { if (e.total) this.status.progress(Math.round((e.loaded / e.total) * 100)); });
      if (this.disposed || t !== this.token) { this.dispose(gltf.scene); return; }
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
      model.position.sub(c);
      const wrap = new THREE.Group(); wrap.add(model);
      wrap.scale.setScalar(2 / Math.max(size.x, size.y, size.z));
      this.root.add(wrap);
      this.root.rotation.set(0, 0, 0);
      const aniso = this.renderer?.capabilities.getMaxAnisotropy() ?? 4;
      model.traverse(o => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m?.map) m.map.anisotropy = aniso; });
      this.camera.position.set(0, this.tilt * 3, 5.2); this.camera.lookAt(0, 0, 0);
      this.controls?.update();
      this.status.state('ready');
    } catch {
      if (this.disposed || t !== this.token) return;
      this.status.state('error'); this.status.error(`Could not read ${url}.`);
    }
  }

  private resize(): void {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h || !this.renderer) return;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (!this.visible || !this.renderer || document.hidden) return;
    const now = performance.now(); const dt = Math.min((now - this.last) / 1000, 0.05); this.last = now;
    if (!this.active && !motion.reduced()) this.root.rotation.y += dt * 0.35;
    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
  };

  private dispose(obj: THREE.Object3D): void {
    obj.traverse(o => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach(mm => {
        Object.values(mm as unknown as Record<string, unknown>).forEach(v => { if (v instanceof THREE.Texture) v.dispose(); });
        mm.dispose();
      });
    });
  }
}

/** Generic GLB stage for mission hardware (suit, spacecraft). Loads lazily when scrolled into view. Re-mount (key) to change model. */
export function ModelStage({ url, label = '3D model', tilt = 0.12 }: { url: string; label?: string; tilt?: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ModelScene | null>(null);
  const [state, setState] = useState<StageState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const scene = new ModelScene(canvasRef.current!, hostRef.current!, url, tilt, { state: setState, progress: setProgress, error: setError });
    sceneRef.current = scene;
    scene.start();
    return () => { scene.destroy(); sceneRef.current = null; };
  }, [url, tilt]);

  return (
    <div className="c-stage">
      <div className="s" ref={hostRef}>
        <canvas ref={canvasRef} aria-label={label} role="img"></canvas>
        {(state === 'idle' || state === 'loading') && (
          <div className="st" role="status"><div className="bar"><i style={{ width: `${progress}%` }}></i></div><span className="mono">{state === 'idle' ? 'Model loads on view' : `Loading model · ${progress}%`}</span></div>
        )}
        {state === 'error' && (
          <div className="st" role="alert"><strong>Model unavailable</strong><span className="small muted">{error}</span><button className="btn ghost sm" type="button" onClick={() => sceneRef.current?.retry()}>Retry</button></div>
        )}
      </div>
    </div>
  );
}
