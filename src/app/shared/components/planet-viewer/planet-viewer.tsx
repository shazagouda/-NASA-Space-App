import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PlanetId, Region } from '../../../core/models/science.model';
import { LayerImage } from '../../../core/services/layer.service';
import { planetLonOffset, surfaceCoordinate, surfaceDirection } from '../../../core/utils/planet-geometry';
import { motion } from '../../../core/services/motion.service';
import { notifications } from '../../../core/services/notification.service';
import './planet-viewer.css';

interface MarkerObj { region: Region; group: THREE.Group; ring: THREE.Mesh; dot: THREE.Mesh; dir: THREE.Vector3 }

export interface PlanetViewerProps {
  planet: PlanetId;
  modelUrl: string;
  regions?: Region[];
  selectedId?: string | null;
  interactive?: boolean;
  autoRotate?: boolean;
  zoomable?: boolean;
  showMarkers?: boolean;
  /** camera distance in planet radii */
  distance?: number;
  /** show a faint atmosphere rim */
  rim?: boolean;
  /** colour overlay for the active data layer (null = plain surface) */
  layerImage?: LayerImage | null;
  layerOpacity?: number;
  surfacePickEnabled?: boolean;
  /** emits the surface coordinate under a click that was not a drag */
  onSurfacePick?: (p: { lat: number; lon: number }) => void;
  onMarkerClick?: (id: string) => void;
  onReady?: () => void;
}
export interface PlanetViewerHandle { resetCamera(): void; zoom(factor: number): void }

type LoadState = 'loading' | 'ready' | 'error';
const NO_REGIONS: Region[] = [];

/** Everything three.js: owns the renderer, scene, loop and the cleanup. React only feeds it props and reads its status. */
class PlanetScene {
  props!: Required<Omit<PlanetViewerProps, 'onSurfacePick' | 'onMarkerClick' | 'onReady'>> & Pick<PlanetViewerProps, 'onSurfacePick' | 'onMarkerClick' | 'onReady'>;

  private renderer?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
  private controls?: OrbitControls;
  private planetGroup = new THREE.Group();
  private spin = new THREE.Group();
  private markers: MarkerObj[] = [];
  private markerRoot = new THREE.Group();
  private modelRoot = new THREE.Group();
  private raf = 0;
  private visible = true;
  private io?: IntersectionObserver;
  private ro?: ResizeObserver;
  private last = performance.now();
  private disposed = false;
  private focusTarget: { from: THREE.Vector3; to: THREE.Vector3; t: number; dist: number; fromDist: number } | null = null;
  private userActive = false;
  private idleTimer = 0;
  private loadToken = 0;
  private stars?: THREE.Points;
  private hover = { x: 0, y: 0 };
  private overlay?: THREE.Mesh;
  private overlayTex?: THREE.Texture;
  private pickSphere?: THREE.Mesh;
  private down = { x: 0, y: 0, t: 0 };
  private ray = new THREE.Raycaster();
  private tmp = new THREE.Vector3();
  private camDir = new THREE.Vector3();
  // what the scene currently shows, so repeated prop pushes are no-ops
  private loadedUrl: string | null = null;
  private shownRegions: Region[] | null = null;
  private shownOverlay: { img: LayerImage | null; op: number } | null = null;
  private shownSelection: string | null | undefined = undefined;

  constructor(
    private canvas: HTMLCanvasElement,
    private host: HTMLElement,
    private status: { state: (s: LoadState) => void; progress: (n: number) => void; error: (m: string) => void },
  ) {}

  start(props: PlanetScene['props']): void {
    this.props = props;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      this.status.state('error');
      this.status.error('WebGL is not available in this browser, so the 3D model cannot be shown.');
      notifications.warn('3D view unavailable', 'WebGL is not available here. Region lists, scores and reports still work.', { key: 'webgl' });
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.camera.position.set(0, 0.25, this.props.distance);
    this.scene.add(this.spin);
    this.spin.add(this.planetGroup);
    this.planetGroup.add(this.modelRoot, this.markerRoot);
    this.scene.add(this.camera);
    this.setupLights();
    this.setupStars();

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.35;
    this.controls.maxDistance = 6;
    this.controls.rotateSpeed = 0.6;
    this.controls.zoomSpeed = 0.7;
    this.controls.enabled = this.props.interactive;
    this.controls.enableZoom = this.props.zoomable;
    this.controls.addEventListener('start', () => { this.userActive = true; this.focusTarget = null; window.clearTimeout(this.idleTimer); });
    this.controls.addEventListener('end', () => { this.idleTimer = window.setTimeout(() => (this.userActive = false), 2500); });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.host);
    this.io = new IntersectionObserver(entries => { this.visible = entries[0]?.isIntersecting ?? true; }, { threshold: 0 });
    this.io.observe(this.host);
    this.host.addEventListener('pointermove', this.onPointer, { passive: true });
    this.canvas.addEventListener('pointerdown', this.onDown, { passive: true });
    this.canvas.addEventListener('pointerup', this.onUp, { passive: true });
    document.addEventListener('visibilitychange', this.onVis);
    this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); });

    this.resize();
    this.setModel(this.props.modelUrl);
    this.setRegions(this.props.regions);
    this.loop();
  }

  destroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.idleTimer);
    this.io?.disconnect();
    this.ro?.disconnect();
    this.host.removeEventListener('pointermove', this.onPointer);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.overlayTex?.dispose();
    document.removeEventListener('visibilitychange', this.onVis);
    this.controls?.dispose();
    this.disposeObject(this.scene);
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
  }

  /* ───────── prop sync (all idempotent) ───────── */

  setModel(url: string): void {
    if (!this.renderer || url === this.loadedUrl) return;
    this.loadedUrl = url;
    void this.load(url);
  }
  reload(): void { this.loadedUrl = null; this.setModel(this.props.modelUrl); }

  setRegions(regions: Region[]): void {
    if (!this.renderer || regions === this.shownRegions) return;
    this.shownRegions = regions;
    this.buildMarkers(regions);
  }

  setSelection(id: string | null): void {
    if (!this.renderer || id === this.shownSelection) return;
    const first = this.shownSelection === undefined;
    this.shownSelection = id;
    this.applySelection(id, !first);
  }

  setOverlay(img: LayerImage | null, opacity: number): void {
    if (!this.renderer) return;
    if (this.shownOverlay && this.shownOverlay.img === img && this.shownOverlay.op === opacity) return;
    this.shownOverlay = { img, op: opacity };
    this.applyOverlay(img, opacity);
  }

  setControls(interactive: boolean, zoomable: boolean): void {
    if (this.controls) { this.controls.enabled = interactive; this.controls.enableZoom = zoomable; }
  }

  /* ───────── public camera actions ───────── */

  resetCamera(): void { this.focusTo(new THREE.Vector3(0.25, 0.2, 1).normalize(), this.props.distance); }
  zoom(factor: number): void {
    if (!this.controls) return;
    const d = THREE.MathUtils.clamp(this.camera.position.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.focusTo(this.camera.position.clone().normalize(), d);
  }

  /* ───────── events ───────── */

  private onVis = () => { this.visible = !document.hidden; };
  private onPointer = (e: PointerEvent) => {
    const r = this.host.getBoundingClientRect();
    this.hover.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.hover.y = ((e.clientY - r.top) / r.height) * 2 - 1;
  };
  private onDown = (e: PointerEvent) => { this.down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  private onUp = (e: PointerEvent) => {
    if (!this.props.surfacePickEnabled || !this.pickSphere) return;
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5 || performance.now() - this.down.t > 600) return;
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    this.camera.updateMatrixWorld(); this.scene.updateMatrixWorld(true);
    const hit = this.ray.intersectObject(this.pickSphere, false)[0];
    if (!hit) return;
    const local = this.planetGroup.worldToLocal(hit.point.clone()).normalize();
    const { lat, lon } = surfaceCoordinate(this.props.planet, local);
    this.props.onSurfacePick?.({ lat, lon });
  };

  /* ───────── overlay ───────── */

  private applyOverlay(img: LayerImage | null, opacity: number): void {
    if (this.overlay) {
      this.planetGroup.remove(this.overlay);
      (this.overlay.material as THREE.Material).dispose(); this.overlay.geometry.dispose();
      this.overlay = undefined;
    }
    this.overlayTex?.dispose(); this.overlayTex = undefined;
    if (!img) return;
    const tex = img.canvas instanceof HTMLCanvasElement ? new THREE.CanvasTexture(img.canvas) : new THREE.Texture(img.canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.anisotropy = 4; tex.needsUpdate = true;
    this.overlayTex = tex;
    const offset = THREE.MathUtils.degToRad(planetLonOffset(this.props.planet));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: tex }, op: { value: opacity }, off: { value: offset } },
      vertexShader: 'varying vec3 vD; varying vec3 vN; void main(){ vD=normalize(position); vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform sampler2D map; uniform float op; uniform float off; varying vec3 vD; varying vec3 vN;
        void main(){
          float lat = asin(clamp(vD.y,-1.,1.));
          float lon = atan(-vD.z, vD.x) - off;
          lon = mod(lon + 3.14159265, 6.2831853) - 3.14159265;
          vec4 c = texture2D(map, vec2(lon/6.2831853 + 0.5, lat/3.14159265 + 0.5));
          float l = 0.38 + 0.8 * max(dot(normalize(vN), normalize(vec3(-3.2,2.4,2.6))), 0.);
          gl_FragColor = vec4(c.rgb * l, c.a * op);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.012, 128, 96), mat);
    mesh.renderOrder = 1;
    this.overlay = mesh;
    this.planetGroup.add(mesh);
  }

  /* ───────── scene setup ───────── */

  private setupLights(): void {
    // key light rides with the camera so the region in focus is always lit from the upper left
    const sun = new THREE.DirectionalLight(0xfff4e6, 3.0);
    sun.position.set(-3.2, 2.4, 2.6);
    this.camera.add(sun);
    this.scene.add(new THREE.HemisphereLight(0x7f95c8, 0x0a0d18, 0.5));
    const rimLight = new THREE.DirectionalLight(0x4d8dff, 0.55);
    rimLight.position.set(4, -1, -3);
    this.scene.add(rimLight);
  }

  private setupStars(): void {
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(30 + Math.random() * 20);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.09, color: 0xcfe0ff, transparent: true, opacity: 0.7, sizeAttenuation: true, depthWrite: false }));
    this.scene.add(this.stars);
  }

  private async load(url: string): Promise<void> {
    const token = ++this.loadToken;
    this.status.state('loading');
    this.status.progress(0);
    // remove old model
    [...this.modelRoot.children].forEach(c => { this.modelRoot.remove(c); this.disposeObject(c); });
    this.clearMarkers();
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync(url, ev => {
        if (ev.total) this.status.progress(Math.round((ev.loaded / ev.total) * 100));
      });
      if (this.disposed || token !== this.loadToken) { this.disposeObject(gltf.scene); return; }
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const s = 2 / Math.max(size.x, size.y, size.z);
      model.position.sub(center);
      const wrap = new THREE.Group();
      wrap.add(model);
      wrap.scale.setScalar(s);
      this.modelRoot.add(wrap);
      const maxAniso = this.renderer?.capabilities.getMaxAnisotropy() ?? 4;
      model.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material as THREE.MeshStandardMaterial & { clearcoat?: number; specularIntensity?: number };
        if (this.props.planet === 'moon') {
          mat.roughness = 1; mat.metalness = 0;
          if ('clearcoat' in mat) mat.clearcoat = 0;
          if ('specularIntensity' in mat) mat.specularIntensity = 0.05;
          if (mat.map) { mat.bumpMap = mat.map; mat.bumpScale = 1.6; }
          mat.color = new THREE.Color(1.25, 1.25, 1.25);
        } else {
          mat.roughness = 0.95; mat.metalness = 0;
          if (mat.normalScale) mat.normalScale.set(1.1, 1.1);
        }
        [mat.map, mat.normalMap, mat.bumpMap].forEach(t => { if (t) t.anisotropy = maxAniso; });
        mat.needsUpdate = true;
      });
      if (!this.pickSphere) {
        this.pickSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshBasicMaterial({ visible: false }));
        this.planetGroup.add(this.pickSphere);
      }
      this.applyOverlay(this.props.layerImage, this.props.layerOpacity);
      this.shownOverlay = { img: this.props.layerImage, op: this.props.layerOpacity };
      if (this.props.rim) this.addRim(this.props.planet === 'mars' ? 0xe99a6b : 0x9bb4ff);
      this.buildMarkers(this.props.regions);
      this.shownRegions = this.props.regions;
      this.applySelection(this.props.selectedId, true);
      this.shownSelection = this.props.selectedId;
      this.status.state('ready');
      this.props.onReady?.();
    } catch (e) {
      if (this.disposed || token !== this.loadToken) return;
      this.status.state('error');
      this.status.error(`Could not read ${url}. ${(e as Error)?.message ?? ''}`.trim());
      notifications.error('Model failed to load', `The ${this.props.planet} model could not be read.`, { key: 'model-' + this.props.planet });
    }
  }

  private addRim(color: number): void {
    const old = this.scene.getObjectByName('rim');
    if (old) { this.scene.remove(old); this.disposeObject(old); }
    const geo = new THREE.SphereGeometry(1.0, 64, 48);
    const mat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { c: { value: new THREE.Color(color) }, s: { value: this.props.planet === 'mars' ? 0.55 : 0.28 } },
      vertexShader: 'varying vec3 n; varying vec3 v; void main(){ n=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); v=-mv.xyz; gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 c; uniform float s; varying vec3 n; varying vec3 v; void main(){ float f=pow(0.72-dot(normalize(n),normalize(v))*-1.,3.); f=clamp(f,0.,1.); gl_FragColor=vec4(c, f*s); }',
    });
    const m = new THREE.Mesh(geo, mat);
    m.scale.setScalar(1.075);
    m.renderOrder = 2;
    m.name = 'rim';
    this.scene.add(m);
    this.spin.userData['rim'] = m;
  }

  /* ───────── markers ───────── */

  private buildMarkers(regions: Region[]): void {
    this.clearMarkers();
    if (!this.props.showMarkers || !this.modelRoot.children.length) return;
    const ringGeo = new THREE.RingGeometry(0.03, 0.036, 40);
    const dotGeo = new THREE.SphereGeometry(0.011, 12, 12);
    regions.forEach(region => {
      const dir = surfaceDirection(this.props.planet, region.lat, region.lon);
      const group = new THREE.Group();
      group.position.copy(dir).multiplyScalar(1.02);
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x48d9e8, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xf4f7fc }));
      group.add(ring, dot);
      this.markerRoot.add(group);
      this.markers.push({ region, group, ring, dot, dir });
    });
    this.applySelection(this.props.selectedId, false);
  }

  private clearMarkers(): void {
    [...this.markerRoot.children].forEach(c => { this.markerRoot.remove(c); (c as THREE.Group).traverse(o => { const m = o as THREE.Mesh; (m.material as THREE.Material | undefined)?.dispose(); }); });
    this.markers = [];
  }

  private applySelection(id: string | null | undefined, animate: boolean): void {
    this.markers.forEach(m => {
      const sel = m.region.id === id;
      (m.ring.material as THREE.MeshBasicMaterial).color.set(sel ? 0xffffff : 0x48d9e8);
      m.dot.scale.setScalar(sel ? 1.6 : 1);
    });
    if (!id || !animate) return;
    const mk = this.markers.find(m => m.region.id === id);
    if (!mk) return;
    // direction in world space (planet group may be rotated by spin)
    const world = mk.dir.clone().applyQuaternion(this.planetGroup.getWorldQuaternion(new THREE.Quaternion()));
    this.focusTo(world.normalize(), Math.min(this.camera.position.length(), 3.2));
  }

  private focusTo(dir: THREE.Vector3, dist: number): void {
    const from = this.camera.position.clone();
    const fromDist = from.length();
    if (motion.reduced()) {
      this.camera.position.copy(dir).multiplyScalar(dist);
      return;
    }
    this.focusTarget = { from: from.normalize(), to: dir.clone().normalize(), t: 0, dist, fromDist };
  }

  /* ───────── loop ───────── */

  private resize(): void {
    const el = this.host;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h || !this.renderer) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the planet fully framed on narrow viewports
    this.camera.fov = w / h < 0.9 ? 50 : 32;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (!this.visible || !this.renderer) return;
    const now = performance.now(); const dt = Math.min((now - this.last) / 1000, 0.05); this.last = now;
    const reduced = motion.reduced();

    if (this.focusTarget) {
      const f = this.focusTarget;
      f.t = Math.min(1, f.t + dt / 1.1);
      const e = 1 - Math.pow(1 - f.t, 3);
      const dir = f.from.clone().lerp(f.to, e).normalize();
      this.camera.position.copy(dir).multiplyScalar(THREE.MathUtils.lerp(f.fromDist, f.dist, e));
      if (f.t >= 1) this.focusTarget = null;
    } else if (this.props.autoRotate && !this.userActive && !reduced && !this.props.selectedId) {
      this.spin.rotation.y += dt * 0.06;
    }

    // subtle parallax tilt on non-interactive viewers
    if (!this.props.interactive && !reduced) {
      this.spin.rotation.x += ((this.hover.y * 0.12) - this.spin.rotation.x) * 0.04;
      this.spin.rotation.y += this.hover.x * 0.0008;
    }

    this.controls?.update();
    const rim = this.spin.userData['rim'] as THREE.Mesh | undefined;
    if (rim) rim.position.copy(this.spin.position);
    if (this.stars) this.stars.rotation.y += dt * 0.002;
    this.updateMarkers();
    this.renderer.render(this.scene, this.camera);
  };

  private updateMarkers(): void {
    if (!this.markers.length) return;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const t = performance.now() / 1000;
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld(true);
    this.camDir.copy(this.camera.position).normalize();
    const byId = new Map<string | undefined, HTMLElement>();
    this.host.querySelectorAll<HTMLElement>('.lbl').forEach(l => byId.set(l.dataset['id'], l));
    this.markers.forEach((m, i) => {
      m.group.getWorldPosition(this.tmp);
      const facing = this.tmp.clone().normalize().dot(this.camDir);
      const visible = facing > 0.12;
      const pulse = 1 + 0.18 * Math.sin(t * 2.4 + i);
      m.ring.scale.setScalar(m.region.id === this.props.selectedId ? 1.5 + 0.35 * Math.sin(t * 3) : pulse);
      m.group.visible = visible;
      const btn = byId.get(m.region.id) as HTMLButtonElement | undefined;
      if (!btn) return;
      this.tmp.project(this.camera);
      const x = (this.tmp.x * 0.5 + 0.5) * w, y = (-this.tmp.y * 0.5 + 0.5) * h;
      btn.style.transform = `translate(${x - 6}px, ${y - 6}px)`;
      btn.style.opacity = visible ? '1' : '0';
      btn.style.pointerEvents = visible ? 'auto' : 'none';
      btn.tabIndex = visible ? 0 : -1;
    });
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach(mm => {
        Object.values(mm as unknown as Record<string, unknown>).forEach(v => { if (v instanceof THREE.Texture) v.dispose(); });
        mm.dispose();
      });
    });
  }
}

export const PlanetViewer = forwardRef<PlanetViewerHandle, PlanetViewerProps>(function PlanetViewer(raw, ref) {
  const props = {
    regions: NO_REGIONS, selectedId: null, interactive: true, autoRotate: true, zoomable: true, showMarkers: false,
    distance: 4.3, rim: true, layerImage: null, layerOpacity: 0.75, surfacePickEnabled: false, ...raw,
  } as PlanetScene['props'];

  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<PlanetScene | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  // the scene always reads the latest props (callbacks included) without being rebuilt
  if (sceneRef.current) sceneRef.current.props = props;

  useEffect(() => {
    const scene = new PlanetScene(canvasRef.current!, hostRef.current!, { state: setState, progress: setProgress, error: setError });
    sceneRef.current = scene;
    scene.start(props);
    return () => { scene.destroy(); sceneRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { sceneRef.current?.setModel(props.modelUrl); }, [props.modelUrl, props.planet]);
  useEffect(() => { sceneRef.current?.setRegions(props.regions); }, [props.regions, props.showMarkers]);
  useEffect(() => { sceneRef.current?.setSelection(props.selectedId); }, [props.selectedId, props.regions]);
  useEffect(() => { sceneRef.current?.setOverlay(props.layerImage, props.layerOpacity); }, [props.layerImage, props.layerOpacity]);
  useEffect(() => { sceneRef.current?.setControls(props.interactive, props.zoomable); }, [props.interactive, props.zoomable]);

  useImperativeHandle(ref, () => ({
    resetCamera: () => sceneRef.current?.resetCamera(),
    zoom: (f: number) => sceneRef.current?.zoom(f),
  }), []);

  return (
    <div className="c-viewer">
      <div className={`stage${props.interactive ? ' interactive' : ''}`} ref={hostRef}>
        <canvas ref={canvasRef} aria-hidden="true"></canvas>
        {state === 'loading' && (
          <div className="status" role="status">
            <div className="bar"><i style={{ width: `${progress}%` }}></i></div>
            <span className="mono">Loading {props.planet} model · {progress}%</span>
          </div>
        )}
        {state === 'error' && (
          <div className="status err" role="alert">
            <strong>The {props.planet} model could not be loaded.</strong>
            <span className="small">{error}</span>
            <button className="btn ghost sm" type="button" onClick={() => sceneRef.current?.reload()}>Retry</button>
          </div>
        )}
        {props.showMarkers && (
          <div className="labels">
            {props.regions.map(r => (
              <button key={r.id} type="button" className={`lbl${r.id === props.selectedId ? ' sel' : ''}`} data-id={r.id}
                aria-pressed={r.id === props.selectedId} onClick={() => props.onMarkerClick?.(r.id)}>
                <span className="pin"></span><span className="txt">{r.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
