// 3D 盤面ビュー。タイル・ユニット・カメラ・ハイライト・イベント演出を担当する。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CARDS } from '../engine/cards.js';
import { W, H, idx } from '../engine/rules.js';
import { Animator, ease } from './tween.js';
import { FX } from './fx.js';
import { Atmosphere } from './atmosphere.js';
import { screenFlash, vignette, cutIn } from '../ui/screenfx.js';
import { buildUnitModel, buildBase, MODEL_HEIGHT } from './models.js';
import {
  makeTerrainTextures, makeSideTexture, makeBaseTexture, makeFrameTexture, makeBadgeCanvas, drawBadge,
  canvasTexture, textCanvas, makeGlowTexture,
} from './textures.js';

export const TEAM_COLORS = ['#38d0ff', '#ff4d6d'];
const S = 1.06; // マスの間隔
const BASE_Y = -0.7;
const surfaceY = (h) => 0.16 + h * 0.36;
export const wx = (x) => (x - (W - 1) / 2) * S;
export const wz = (y) => ((H - 1) / 2 - y) * S;

const HL_COLORS = {
  move: '#3ad6ff', attack: '#ff3d4d', summon: '#5dff8a', spell: '#c77dff', hero: '#ffd24a',
  select: '#ffffff', danger: '#ff3d4d', path: '#3ad6ff', field: '#ffa84a', ai: '#ff79c6',
  ready: '#ffd24a', emove: '#ff7a00', erange: '#ff1030',
};
const SOLID_HL = new Set(['ready', 'emove', 'erange']);

export class BoardView {
  constructor(container) {
    this.container = container;
    this.anim = new Animator();
    this.clock = new THREE.Clock();
    this.time = 0;
    this.quality = 'high';
    this.tiles = new Map(); // tileId -> TileView
    this.units = new Map(); // uid -> UnitView
    this.shake = 0;
    this.listeners = {};
    this.initRenderer();
    this.initScene();
    this.fx = new FX(this.world, this.anim);
    this.initPicking();
    this.initialFit();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  emit(name, ...a) { for (const f of this.listeners[name] || []) f(...a); }

  // ------------------------------------------------------------
  // 初期化
  // ------------------------------------------------------------

  initRenderer() {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(window.innerWidth, window.innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(r.domElement);
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 300);
    this.camera.position.set(0, 9.2, 9.6);
    const c = new OrbitControls(this.camera, r.domElement);
    c.target.set(0, 0, 0.4);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 5.5;
    c.maxDistance = 20;
    c.maxPolarAngle = 1.38;
    c.minPolarAngle = 0.12;
    c.screenSpacePanning = false;
    c.panSpeed = 0.6;
    c.rotateSpeed = 0.7;
    c.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    c.update();
    this.controls = c;
    this.homeView = { pos: this.camera.position.clone(), target: c.target.clone() };
    this.composer = null;

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.5, 0.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
  }

  initialFit() {
    this.resize();
    this.camera.position.copy(this.homeView.pos);
    this.controls.target.copy(this.homeView.target);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.fov = 42;
    this.camera.updateProjectionMatrix();
    // 縦長画面でも盤面の横幅が収まる距離までカメラを引く
    const base = new THREE.Vector3(0, 9.2, 9.6);
    const need = 4.5 / (Math.tan(THREE.MathUtils.degToRad(21)) * aspect);
    const landscapePhone = h <= 520 && aspect > 1;
    const dist = Math.max(base.length(), need) * (landscapePhone ? 1.04 : 1);
    // 手札などの UI に隠れないよう、盤面が画面のやや上に来るよう注視点をずらす
    const target = new THREE.Vector3(0, 0, landscapePhone ? 1.5 : aspect < 1 ? 0.9 : 1.0);
    this.homeView = { pos: base.clone().setLength(dist).add(target), target };
    this.controls.maxDistance = Math.max(20, dist * 1.3);
    const cls = landscapePhone ? 'land' : aspect < 1 ? 'port' : 'wide';
    if (this.camera.position.distanceTo(this.controls.target) < dist * 0.85 || (this.fitClass && this.fitClass !== cls)) {
      this.camera.position.copy(this.homeView.pos);
      this.controls.target.copy(target);
    }
    this.fitClass = cls;
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
    if (this.fx) this.fx.particles.resize(h);
  }

  setQuality(q) {
    this.quality = q;
    this.renderer.shadowMap.enabled = q !== 'low';
    this.sun.castShadow = q !== 'low';
    this.renderer.setPixelRatio(q === 'low' ? 1 : Math.min(window.devicePixelRatio, 2));
    this.resize();
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  initScene() {
    const scene = this.scene;
    scene.background = new THREE.Color('#0a0c1c');
    scene.fog = new THREE.FogExp2('#1a1534', 0.022);
    this.world = new THREE.Group();
    scene.add(this.world);

    // 空 (グラデーションの球)
    const skyM = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        t: { value: 0 }, flash: { value: 0 }, aurAmp: { value: 0.5 },
        topC: { value: new THREE.Vector3() }, midC: { value: new THREE.Vector3() }, lowC: { value: new THREE.Vector3() }, aurC: { value: new THREE.Vector3() },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; uniform float t; uniform float flash; uniform float aurAmp;
        uniform vec3 topC; uniform vec3 midC; uniform vec3 lowC; uniform vec3 aurC;
        void main(){ float h = vP.y;
          vec3 c = h > 0.0 ? mix(midC, topC, pow(h, 0.6)) : mix(midC, lowC, pow(-h, 0.5));
          float aur = smoothstep(0.05, 0.4, h) * (1.0 - smoothstep(0.4, 0.8, h));
          float wave = 0.5 + 0.5 * sin(vP.x * 6.0 + t * 0.2 + sin(vP.z * 4.0 + t * 0.13) * 2.0);
          c += aurC * aur * wave * aurAmp;
          c += vec3(0.75, 0.85, 1.0) * flash * (0.4 + 0.6 * smoothstep(-0.2, 0.6, h));
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.skyMat = skyM;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 16), skyM);
    sky.renderOrder = -10;
    scene.add(sky);

    // 星
    const starG = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 1600; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 1.6 - 0.6);
      const r = 100;
      sp.push(r * Math.sin(b) * Math.cos(a), r * Math.cos(b), r * Math.sin(b) * Math.sin(a));
    }
    starG.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    const stars = new THREE.Points(starG, new THREE.PointsMaterial({ color: '#ffffff', size: 0.45, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.85, map: makeGlowTexture(), depthWrite: false }));
    scene.add(stars);
    this.stars = stars;

    // 光源
    this.hemi = new THREE.HemisphereLight('#b8c8ff', '#3a2a24', 0.9);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight('#ffe6c4', 2.4);
    sun.position.set(5, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 30;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    this.sun = sun;
    const rim = new THREE.DirectionalLight('#6f8cff', 0.9);
    rim.position.set(-6, 5, -8);
    scene.add(rim);

    // テクスチャとマテリアル
    this.tex = makeTerrainTextures();
    const sideTex = makeSideTexture();
    this.sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.95, color: '#a89880' });
    const T = this.tex;
    this.terrainMats = {
      plain: new THREE.MeshStandardMaterial({ map: T.plain, roughness: 0.9 }),
      forest: new THREE.MeshStandardMaterial({ map: T.forest, roughness: 0.9 }),
      water: new THREE.MeshStandardMaterial({ map: T.water, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88, emissive: '#0a3a6a', emissiveIntensity: 0.4 }),
      lava: new THREE.MeshStandardMaterial({ map: T.lava, emissive: '#ffffff', emissiveMap: T.lavaEmissive, emissiveIntensity: 1.6, roughness: 0.6 }),
      crystal: new THREE.MeshStandardMaterial({ map: T.crystal, emissive: '#ffffff', emissiveMap: T.crystalEmissive, emissiveIntensity: 1.2, roughness: 0.5 }),
      shrine: new THREE.MeshStandardMaterial({ map: T.shrine, emissive: '#ffffff', emissiveMap: T.shrineEmissive, emissiveIntensity: 0.8, roughness: 0.5 }),
    };
    this.topGeo = new RoundedBoxGeometry(0.98, 0.1, 0.98, 2, 0.035);
    this.colGeo = new THREE.BoxGeometry(0.94, 1, 0.94);
    this.colGeo.translate(0, 0.5, 0);
    this.frameTex = makeFrameTexture();
    this.hlGeo = new THREE.PlaneGeometry(0.94, 0.94);
    this.hlGeo.rotateX(-Math.PI / 2);

    this.buildIsland();
    this.buildMotes();
    this.atmo = new Atmosphere(this);
  }

  buildIsland() {
    const w = this.world;
    // 盤の土台
    const baseMat = new THREE.MeshStandardMaterial({ map: makeBaseTexture(), roughness: 0.8, metalness: 0.2 });
    const base = new THREE.Mesh(new RoundedBoxGeometry(W * S + 1.1, 0.5, H * S + 1.1, 3, 0.18), [this.sideMat, this.sideMat, baseMat, this.sideMat, this.sideMat, this.sideMat]);
    base.position.y = BASE_Y - 0.05;
    base.receiveShadow = true;
    w.add(base);
    // 浮島の岩
    const rockMat = new THREE.MeshStandardMaterial({ color: '#4a3c34', roughness: 1, flatShading: true });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(W * 0.78, 5.5, 9, 4), rockMat);
    cone.rotation.x = Math.PI;
    cone.position.y = BASE_Y - 3.1;
    const pa = cone.geometry.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const y = pa.getY(i);
      if (y < 2.6) {
        pa.setX(i, pa.getX(i) * (0.85 + Math.random() * 0.3));
        pa.setZ(i, pa.getZ(i) * (0.85 + Math.random() * 0.3));
      }
    }
    cone.geometry.computeVertexNormals();
    w.add(cone);
    // 発光する結晶の鉱脈
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.25 + Math.random() * 0.2, 0),
        new THREE.MeshStandardMaterial({ color: '#8a5cff', emissive: '#7a4cff', emissiveIntensity: 1.5 }));
      cr.position.set(Math.cos(a) * 3.8, BASE_Y - 1.4 - Math.random() * 1.2, Math.sin(a) * 3.8);
      cr.scale.y = 2;
      cr.rotation.z = Math.random();
      w.add(cr);
    }
    // 周囲を回るルーンの輪
    const ringM = new THREE.MeshBasicMaterial({ color: '#9b7dff', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    this.runeRing = new THREE.Mesh(new THREE.TorusGeometry(W * 0.78, 0.025, 6, 96), ringM);
    this.runeRing.rotation.x = Math.PI / 2;
    this.runeRing.position.y = BASE_Y - 0.15;
    w.add(this.runeRing);
    this.runeRing2 = new THREE.Mesh(new THREE.TorusGeometry(W * 0.86, 0.012, 6, 96), ringM);
    this.runeRing2.rotation.x = Math.PI / 2;
    this.runeRing2.position.y = BASE_Y - 0.5;
    w.add(this.runeRing2);
    // 周囲に漂う岩
    this.floaters = [];
    for (let i = 0; i < 14; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + Math.random() * 0.45, 0), rockMat);
      const a = Math.random() * Math.PI * 2, d = 6.5 + Math.random() * 5;
      r.userData = { a, d, y: -2 + Math.random() * 3.5, s: 0.03 + Math.random() * 0.05, ph: Math.random() * 6 };
      r.castShadow = false;
      w.add(r);
      // 小さな草の帽子
      if (Math.random() < 0.6) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(r.geometry.parameters.radius * 0.9, r.geometry.parameters.radius * 0.7, 0.08, 7), new THREE.MeshStandardMaterial({ color: '#4f8a3a', flatShading: true }));
        cap.position.y = r.geometry.parameters.radius * 0.7;
        r.add(cap);
      }
      this.floaters.push(r);
    }
    // 両陣営の陣地ライン
    for (let p = 0; p < 2; p++) {
      const m = new THREE.MeshBasicMaterial({ color: TEAM_COLORS[p], transparent: true, opacity: 0.85 });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(W * S + 0.8, 0.05, 0.06), m);
      bar.position.set(0, BASE_Y + 0.21, p === 0 ? wz(-0.5) - 0.12 : wz(H - 0.5) + 0.12);
      w.add(bar);
    }
    // 座標ラベル
    for (let x = 0; x < W; x++) this.addLabel('ABCDEFG'[x], wx(x), wz(-0.9));
    for (let y = 0; y < H; y++) this.addLabel(String(y + 1), wx(-0.9), wz(y));
  }

  addLabel(text, x, z) {
    const c = textCanvas(text, { color: '#d8ccff', size: 56, stroke: '#1a1030', width: 96 });
    const m = new THREE.MeshBasicMaterial({ map: canvasTexture(c), transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42 * c.height / c.width), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, BASE_Y + 0.21, z);
    this.world.add(mesh);
  }

  buildMotes() {
    const N = 260;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(N * 3);
    this.moteSpeed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      p[i * 3] = (Math.random() - 0.5) * 16;
      p[i * 3 + 1] = Math.random() * 6 - 1;
      p[i * 3 + 2] = (Math.random() - 0.5) * 16;
      this.moteSpeed[i] = 0.05 + Math.random() * 0.15;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.motes = new THREE.Points(g, new THREE.PointsMaterial({
      color: '#c9b8ff', size: 0.07, map: makeGlowTexture(), transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.world.add(this.motes);
  }

  // ------------------------------------------------------------
  // 盤面構築・同期
  // ------------------------------------------------------------

  buildBoard(state) {
    for (const t of this.tiles.values()) this.world.remove(t.group);
    for (const u of this.units.values()) this.world.remove(u.group);
    this.tiles.clear();
    this.units.clear();
    state.tiles.forEach((t, i) => {
      const tv = this.createTile(t, i % W, (i / W) | 0);
      this.tiles.set(t.id, tv);
    });
    for (const u of state.units) this.createUnit(u, state.tiles[idx(u.x, u.y)].id);
  }

  createTile(t, x, y) {
    const group = new THREE.Group();
    group.position.set(wx(x), 0, wz(y));
    const col = new THREE.Mesh(this.colGeo, this.sideMat);
    col.position.y = BASE_Y;
    col.castShadow = true;
    col.receiveShadow = true;
    group.add(col);
    const top = new THREE.Mesh(this.topGeo, this.terrainMats[t.terrain]);
    top.receiveShadow = true;
    top.castShadow = true;
    group.add(top);
    const deco = new THREE.Group();
    group.add(deco);
    const hlMat = new THREE.MeshBasicMaterial({ map: this.frameTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const hl = new THREE.Mesh(this.hlGeo, hlMat);
    hl.renderOrder = 5;
    group.add(hl);
    this.world.add(group);
    const tv = { id: t.id, group, col, top, deco, hl, hlMat, hlKind: null, gx: x, gy: y, h: t.height, terrain: null, lift: 0 };
    col.userData.tile = tv;
    top.userData.tile = tv;
    this.setTerrain(tv, t.terrain);
    this.applyHeight(tv);
    return tv;
  }

  applyHeight(tv) {
    const top = surfaceY(tv.h) + tv.lift;
    tv.col.scale.y = Math.max(0.01, top - 0.05 - BASE_Y);
    tv.top.position.y = top - 0.05;
    tv.deco.position.y = top;
    tv.hl.position.y = top + (tv.terrain === 'water' ? -0.02 : 0.012);
    tv.surface = top;
    if (tv.terrain === 'water') tv.top.position.y = top - 0.09;
  }

  setTerrain(tv, terrain) {
    if (tv.terrain === terrain) return;
    tv.terrain = terrain;
    tv.top.material = this.terrainMats[terrain];
    while (tv.deco.children.length) tv.deco.remove(tv.deco.children[0]);
    const rnd = mulberry(tv.id * 977 + terrain.length * 31);
    const corners = [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]];
    if (terrain === 'forest') {
      for (const [cx, cz] of corners) {
        if (rnd() < 0.15) continue;
        const tree = new THREE.Group();
        const s = 0.7 + rnd() * 0.5;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.12, 5), new THREE.MeshStandardMaterial({ color: '#5a3e26', flatShading: true }));
        trunk.position.y = 0.06;
        tree.add(trunk);
        const shade = ['#2f6a2a', '#3f7d3a', '#1f5a2a'][Math.floor(rnd() * 3)];
        for (let k = 0; k < 2; k++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.11 - k * 0.03, 0.18, 6), new THREE.MeshStandardMaterial({ color: shade, flatShading: true }));
          c.position.y = 0.17 + k * 0.09;
          c.castShadow = true;
          tree.add(c);
        }
        tree.position.set(cx + (rnd() - 0.5) * 0.08, 0, cz + (rnd() - 0.5) * 0.08);
        tree.scale.setScalar(s);
        tree.rotation.y = rnd() * 6;
        tv.deco.add(tree);
      }
    } else if (terrain === 'crystal') {
      for (const [cx, cz] of corners) {
        const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.06 + rnd() * 0.03, 0),
          new THREE.MeshStandardMaterial({ color: '#c9a6ff', emissive: '#9a6cff', emissiveIntensity: 2.2, roughness: 0.2 }));
        c.scale.y = 2.2;
        c.position.set(cx, 0.12, cz);
        c.rotation.z = (rnd() - 0.5) * 0.6;
        tv.deco.add(c);
      }
      const big = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0),
        new THREE.MeshStandardMaterial({ color: '#e0c8ff', emissive: '#b07cff', emissiveIntensity: 2.6, roughness: 0.1, transparent: true, opacity: 0.9 }));
      big.scale.y = 1.6;
      big.position.y = 1.05;
      big.userData.spin = true;
      tv.deco.add(big);
    } else if (terrain === 'shrine') {
      for (const [cx, cz] of corners) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.26, 8), new THREE.MeshStandardMaterial({ color: '#efe8d8', roughness: 0.5 }));
        p.position.set(cx, 0.13, cz);
        p.castShadow = true;
        tv.deco.add(p);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.1), new THREE.MeshStandardMaterial({ color: '#d8b84a', metalness: 0.6, roughness: 0.3 }));
        cap.position.set(cx, 0.27, cz);
        tv.deco.add(cap);
      }
    } else if (terrain === 'lava') {
      for (let k = 0; k < 2; k++) {
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.05 + rnd() * 0.04, 0), new THREE.MeshStandardMaterial({ color: '#2a1a16', flatShading: true }));
        r.position.set((rnd() - 0.5) * 0.7, 0.02, (rnd() - 0.5) * 0.7);
        tv.deco.add(r);
      }
    } else if (terrain === 'water') {
      for (let k = 0; k < 2; k++) {
        const lily = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 10, 1, false, 0, Math.PI * 1.75), new THREE.MeshStandardMaterial({ color: '#4f9a3a' }));
        lily.position.set((rnd() - 0.5) * 0.7, -0.03, (rnd() - 0.5) * 0.7);
        lily.rotation.y = rnd() * 6;
        tv.deco.add(lily);
      }
    } else if (terrain === 'plain') {
      for (let k = 0; k < 3; k++) {
        if (rnd() < 0.5) continue;
        const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 4), new THREE.MeshStandardMaterial({ color: '#6fa84a', flatShading: true }));
        const a = rnd() * 6;
        tuft.position.set(Math.cos(a) * 0.38, 0.035, Math.sin(a) * 0.38);
        tv.deco.add(tuft);
      }
    }
    this.applyHeight(tv);
  }

  createUnit(u, tileId) {
    const card = CARDS[u.cardId];
    const group = new THREE.Group();
    const base = buildBase(TEAM_COLORS[u.owner]);
    group.add(base);
    const facing = new THREE.Group();
    group.add(facing);
    const model = buildUnitModel(u.cardId);
    facing.add(model);
    facing.rotation.y = u.owner === 0 ? Math.PI : 0;
    const height = MODEL_HEIGHT[card.model] || 0.75;
    // ステータス表示
    const bc = makeBadgeCanvas();
    const btex = canvasTexture(bc);
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: btex, depthTest: false, transparent: true }));
    badge.scale.set(0.62, 0.31, 1);
    badge.position.y = height + 0.28;
    badge.renderOrder = 20;
    badge.visible = this.badgesOn !== false;
    group.add(badge);
    // 状態アイコン (zzz / 凍結)
    const sc = textCanvas('Zz', { color: '#d8e4ff', size: 48, width: 96 });
    const stex = canvasTexture(sc);
    const status = new THREE.Sprite(new THREE.SpriteMaterial({ map: stex, depthTest: false, transparent: true }));
    status.scale.set(0.3, 0.22, 1);
    status.position.set(0.32, height + 0.05, 0);
    status.renderOrder = 21;
    status.visible = false;
    group.add(status);
    // 凍結の氷
    const ice = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), new THREE.MeshStandardMaterial({ color: '#bfefff', transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.1, emissive: '#4fbfff', emissiveIntensity: 0.4, flatShading: true }));
    ice.scale.set(0.9, height * 1.3, 0.9);
    ice.position.y = height * 0.5;
    ice.visible = false;
    group.add(ice);
    // 選択リング
    const sel = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.47, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    sel.rotation.x = -Math.PI / 2;
    sel.position.y = 0.03;
    group.add(sel);
    group.traverse((o) => { if (o.isMesh) o.userData.uid = u.uid; });
    group.scale.setScalar(u.leader ? 1.08 : 1);
    this.world.add(group);
    const uv = {
      uid: u.uid, owner: u.owner, cardId: u.cardId, leader: u.leader, group, facing, model, base, badge, bc, btex, status, ice, sel,
      tileId, override: false, phase: Math.random() * 10, height,
      stats: { atk: u.atk, hp: u.hp, maxHp: u.maxHp, baseAtk: card.atk, frozen: !!u.frozen },
      exhausted: false, sick: !!u.sick, selected: false, hover: false, flying: !!model.userData.flying,
      targetYaw: facing.rotation.y,
    };
    this.units.set(u.uid, uv);
    this.redrawBadge(uv);
    this.placeUnit(uv);
    return uv;
  }

  redrawBadge(uv) {
    drawBadge(uv.bc, { ...uv.stats, color: TEAM_COLORS[uv.owner], leader: uv.leader });
    uv.btex.needsUpdate = true;
    uv.ice.visible = uv.stats.frozen;
  }

  placeUnit(uv) {
    const tv = this.tiles.get(uv.tileId);
    if (!tv) return;
    uv.group.position.set(tv.group.position.x, tv.surface + tv.group.position.y, tv.group.position.z);
  }

  unitWorldPos(uid, yOff = 0.4) {
    const uv = this.units.get(uid);
    if (!uv) return null;
    return uv.group.position.clone().add(new THREE.Vector3(0, yOff * (uv.height / 0.75), 0));
  }

  tileWorldPos(x, y, state) {
    const tv = this.tileAtGrid(x, y);
    if (!tv) return new THREE.Vector3(wx(x), 0.2, wz(y));
    return new THREE.Vector3(tv.group.position.x, tv.surface, tv.group.position.z);
  }

  tileAtGrid(x, y) {
    for (const tv of this.tiles.values()) if (tv.gx === x && tv.gy === y) return tv;
    return null;
  }

  // 状態と完全に一致させる (演出後の整合性確保)
  sync(state, interactive) {
    const seen = new Set();
    state.tiles.forEach((t, i) => {
      const tv = this.tiles.get(t.id);
      if (!tv) return;
      tv.gx = i % W;
      tv.gy = (i / W) | 0;
      tv.group.position.x = wx(tv.gx);
      tv.group.position.z = wz(tv.gy);
      tv.group.position.y = 0;
      tv.group.rotation.set(0, 0, 0);
      tv.h = t.height;
      tv.lift = 0;
      this.setTerrain(tv, t.terrain);
      this.applyHeight(tv);
    });
    for (const u of state.units) {
      seen.add(u.uid);
      const tileId = state.tiles[idx(u.x, u.y)].id;
      let uv = this.units.get(u.uid);
      if (!uv) uv = this.createUnit(u, tileId);
      uv.tileId = tileId;
      uv.override = false;
      uv.group.visible = true;
      uv.group.scale.setScalar(u.leader ? 1.08 : 1);
      const st = { atk: u.atk, hp: u.hp, maxHp: u.maxHp, baseAtk: CARDS[u.cardId].atk, frozen: !!u.frozen };
      if (JSON.stringify(st) !== JSON.stringify(uv.stats)) { uv.stats = st; this.redrawBadge(uv); }
      uv.sick = !!u.sick;
      const isTurn = u.owner === state.current;
      uv.exhausted = isTurn && (u.sick || u.frozen || (u.attacked && u.moved) || (u.attacked));
      uv.status.visible = !!u.sick && !u.frozen;
      if (!uv.ready) uv.base.userData.ringMat.emissiveIntensity = uv.exhausted ? 0.25 : 1.4;
      this.placeUnit(uv);
    }
    for (const [uid, uv] of this.units) {
      if (!seen.has(uid)) { this.world.remove(uv.group); this.units.delete(uid); }
    }
    if ((state.envKind || null) !== this.atmo.target) this.atmo.setEnv(state.envKind, true);
  }

  // ------------------------------------------------------------
  // ハイライト・選択
  // ------------------------------------------------------------

  clearHighlights() {
    for (const tv of this.tiles.values()) {
      tv.hlKind = null;
      tv.hlMat.opacity = 0;
      if (tv.hlMat.blending !== THREE.AdditiveBlending) { tv.hlMat.blending = THREE.AdditiveBlending; tv.hlMat.needsUpdate = true; }
    }
    this.clearPath();
  }

  // list: [{x, y, kind}]
  setHighlights(list) {
    this.clearHighlights();
    for (const h of list) {
      const tv = this.tileAtGrid(h.x, h.y);
      if (!tv) continue;
      tv.hlKind = h.kind;
      tv.hlMat.color.set(HL_COLORS[h.kind] || '#ffffff');
      // 加算合成だと緑の地面の上で赤や橙が黄色っぽく見えるため、範囲表示は通常合成で塗る
      const blend = SOLID_HL.has(h.kind) ? THREE.NormalBlending : THREE.AdditiveBlending;
      if (tv.hlMat.blending !== blend) { tv.hlMat.blending = blend; tv.hlMat.needsUpdate = true; }
    }
  }

  // まだ行動できるユニット: 足元の輪が金色に脈打ち、光の粒が立ちのぼる
  setReady(uids) {
    const set = new Set(uids);
    for (const uv of this.units.values()) {
      const on = set.has(uv.uid);
      if (uv.ready === on) continue;
      uv.ready = on;
      const m = uv.base.userData.ringMat;
      if (on) { m.color.set('#ffd24a'); m.emissive.set('#ffb02a'); }
      else { m.color.set(TEAM_COLORS[uv.owner]); m.emissive.set(TEAM_COLORS[uv.owner]); m.emissiveIntensity = uv.exhausted ? 0.25 : 1.4; }
    }
  }

  setHover(x, y) {
    this.hoverTile = x === null ? null : this.tileAtGrid(x, y);
  }

  setBadges(on) {
    this.badgesOn = on;
    for (const uv of this.units.values()) uv.badge.visible = on;
  }

  setSelectedUnit(uid) {
    for (const uv of this.units.values()) uv.selected = uv.uid === uid;
  }

  showPath(points) {
    this.clearPath();
    if (!points || !points.length) return;
    this.pathMeshes = [];
    const m = new THREE.MeshBasicMaterial({ color: HL_COLORS.path, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    points.forEach((p, i) => {
      const pos = this.tileWorldPos(p.x, p.y);
      const s = new THREE.Mesh(new THREE.SphereGeometry(i === points.length - 1 ? 0.09 : 0.055, 10, 8), m);
      s.position.copy(pos).add(new THREE.Vector3(0, 0.1, 0));
      s.userData.i = i;
      this.world.add(s);
      this.pathMeshes.push(s);
    });
  }

  clearPath() {
    if (!this.pathMeshes) return;
    for (const m of this.pathMeshes) { this.world.remove(m); m.geometry.dispose(); }
    this.pathMeshes = null;
  }

  // ------------------------------------------------------------
  // 入力 (レイキャスト)
  // ------------------------------------------------------------

  initPicking() {
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointermove', (e) => {
      const hit = this.pick(e.clientX, e.clientY);
      this.emit('hover', hit, e);
    });
    let pointers = 0;
    el.addEventListener('pointerdown', (e) => {
      pointers++;
      down = pointers === 1 ? { x: e.clientX, y: e.clientY, b: e.button, t: performance.now(), long: false } : null;
      clearTimeout(this.longTimer);
      // 長押し (主にタッチ): 詳細表示
      if (down && e.pointerType !== 'mouse') {
        const d = down;
        this.longTimer = setTimeout(() => {
          if (down !== d) return;
          d.long = true;
          this.emit('longpress', this.pick(d.x, d.y), e);
        }, 480);
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 8) clearTimeout(this.longTimer);
    });
    const end = (e) => {
      pointers = Math.max(0, pointers - 1);
      clearTimeout(this.longTimer);
      if (!down || e.type === 'pointercancel') { down = null; return; }
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (!down.long && moved < 8 && performance.now() - down.t < 600) {
        if (down.b === 0) this.emit('click', this.pick(e.clientX, e.clientY), e);
        else if (down.b === 2) this.emit('rightclick', this.pick(e.clientX, e.clientY), e);
      }
      down = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerleave', () => this.emit('hover', null));
  }

  pick(cx, cy) {
    this.mouse.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const objs = [];
    for (const tv of this.tiles.values()) objs.push(tv.top, tv.col);
    for (const uv of this.units.values()) if (uv.group.visible) objs.push(uv.group);
    const hits = this.raycaster.intersectObjects(objs, true);
    for (const h of hits) {
      if (h.object.userData.uid !== undefined) {
        const uv = this.units.get(h.object.userData.uid);
        if (!uv) continue;
        const tv = this.tiles.get(uv.tileId);
        return { x: tv.gx, y: tv.gy, uid: uv.uid };
      }
      if (h.object.userData.tile) {
        const tv = h.object.userData.tile;
        return { x: tv.gx, y: tv.gy, uid: null };
      }
    }
    return null;
  }

  screenPos(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight };
  }

  // ------------------------------------------------------------
  // カメラ
  // ------------------------------------------------------------

  async rotateView(dir) {
    const c = this.controls;
    const off = this.camera.position.clone().sub(c.target);
    const start = Math.atan2(off.x, off.z);
    const r = Math.hypot(off.x, off.z);
    const goal = start + dir * Math.PI / 2;
    await this.anim.tween(0.6, (k) => {
      const a = start + (goal - start) * k;
      this.camera.position.set(c.target.x + Math.sin(a) * r, this.camera.position.y, c.target.z + Math.cos(a) * r);
    });
  }

  async resetView(top = false) {
    const p0 = this.camera.position.clone(), t0 = this.controls.target.clone();
    const p1 = top ? new THREE.Vector3(0, 14, 0.01) : this.homeView.pos.clone();
    const t1 = top ? new THREE.Vector3(0, 0, 0) : this.homeView.target.clone();
    await this.anim.tween(0.7, (k) => {
      this.camera.position.lerpVectors(p0, p1, k);
      this.controls.target.lerpVectors(t0, t1, k);
    });
  }

  // 注目地点へカメラの注視点を寄せる
  focus(x, y, amount = 0.35) {
    const goal = new THREE.Vector3(wx(x) * amount, 0, wz(y) * amount + 0.3);
    const t0 = this.controls.target.clone();
    const delta = goal.clone().sub(t0);
    const p0 = this.camera.position.clone();
    return this.anim.tween(0.5, (k) => {
      this.controls.target.copy(t0).addScaledVector(delta, k);
      this.camera.position.copy(p0).addScaledVector(delta, k);
    });
  }

  doShake(amount = 0.15) { this.shake = Math.max(this.shake, amount); }

  // 決着時: 花火を打ち上げ、カメラがゆっくり盤面を回る
  async celebrate(color, win = true, sfx = () => {}) {
    const A = this.anim;
    const c0 = this.camera.position.clone(), t0 = this.controls.target.clone();
    const r = Math.hypot(c0.x - t0.x, c0.z - t0.z), a0 = Math.atan2(c0.x - t0.x, c0.z - t0.z);
    A.tween(4.5, (k) => {
      const a = a0 + k * 0.9;
      this.camera.position.set(t0.x + Math.sin(a) * r, c0.y, t0.z + Math.cos(a) * r);
    }, ease.inOut);
    if (!win) return;
    const cols = [color, '#ffd24a', '#ffffff', '#ff8ad8', '#7fffb0'];
    for (let i = 0; i < 9; i++) {
      const p = new THREE.Vector3((Math.random() - 0.5) * 7, 2.6 + Math.random() * 1.6, (Math.random() - 0.5) * 6);
      this.fx.firework(p, cols[i % cols.length]);
      sfx('firework');
      await A.wait(0.35 + Math.random() * 0.2);
    }
  }

  // ------------------------------------------------------------
  // フレーム更新
  // ------------------------------------------------------------

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.paused) return; // 全画面の UI (デッキ編成) を開いている間は描画しない
    this.time += dt;
    const t = this.time;
    this.anim.update(dt);
    this.fx.update(dt);
    this.controls.update();
    this.skyMat.uniforms.t.value = t;
    this.atmo.update(dt, t);

    // テクスチャの流れ
    this.tex.water.offset.set(t * 0.03, t * 0.02);
    this.tex.lava.offset.set(t * 0.01, -t * 0.015);
    this.tex.lavaEmissive.offset.copy(this.tex.lava.offset);
    this.terrainMats.lava.emissiveIntensity = 1.4 + Math.sin(t * 2) * 0.4;
    this.terrainMats.crystal.emissiveIntensity = 1.0 + Math.sin(t * 1.5) * 0.4;

    // 浮遊物
    this.runeRing.rotation.z = t * 0.05;
    this.runeRing2.rotation.z = -t * 0.03;
    for (const r of this.floaters) {
      const d = r.userData;
      const a = d.a + t * d.s;
      const lift = this.atmo.lift;
      r.position.set(Math.cos(a) * d.d, d.y + Math.sin(t * 0.6 + d.ph) * (0.25 + lift * 0.5) + lift * (1.4 + Math.sin(t * 0.3 + d.ph) * 1.2), Math.sin(a) * d.d);
      r.rotation.y = t * d.s * 2;
      r.rotation.x = lift * t * d.s * 3;
    }
    const mp = this.motes.geometry.attributes.position;
    for (let i = 0; i < mp.count; i++) {
      let y = mp.getY(i) + this.moteSpeed[i] * dt;
      if (y > 5) y = -1;
      mp.setY(i, y);
      mp.setX(i, mp.getX(i) + Math.sin(t * 0.5 + i) * 0.002);
    }
    mp.needsUpdate = true;

    // タイル: ハイライトの脈動、結晶の回転、溶岩の泡
    const pulse = 0.55 + Math.sin(t * 4) * 0.2;
    for (const tv of this.tiles.values()) {
      if (tv.hlKind) tv.hlMat.opacity = tv.hlKind === 'danger' ? 0.22 + Math.sin(t * 3) * 0.08 : tv.hlKind === 'ready' ? 0.5 + Math.sin(t * 3.5) * 0.25 : tv.hlKind === 'erange' ? 0.6 : tv.hlKind === 'emove' ? 0.75 : pulse;
      else tv.hlMat.opacity = tv === this.hoverTile ? 0.35 : 0;
      if (tv === this.hoverTile) { tv.hlMat.opacity = Math.max(tv.hlMat.opacity, 0.9); if (!tv.hlKind) tv.hlMat.color.set('#ffffff'); }
      for (const d of tv.deco.children) if (d.userData.spin) { d.rotation.y = t * 1.2; d.position.y = 1.05 + Math.sin(t * 2 + tv.id) * 0.06; }
      if (tv.terrain === 'lava' && Math.random() < dt * 1.6) {
        const p = tv.group.position.clone();
        p.y = tv.surface + 0.02;
        p.x += (Math.random() - 0.5) * 0.7;
        p.z += (Math.random() - 0.5) * 0.7;
        this.fx.burst(p, { count: 3, color: '#ffcf5a', colorEnd: '#ff3a00', speed: [0.2, 0.6], dir: new THREE.Vector3(0, 1, 0), spread: 0.4, life: [0.5, 1], size: [0.05, 0.1], gravity: 0.6 });
      }
      if (tv.terrain === 'crystal' && Math.random() < dt * 2) {
        const p = tv.group.position.clone();
        p.y = tv.surface + 0.1;
        this.fx.burst(p, { count: 1, color: '#c9a6ff', speed: [0.1, 0.3], dir: new THREE.Vector3(0, 1, 0), spread: 0.3, life: [1, 1.6], size: [0.05, 0.08], area: 0.4, up: 0.3, drag: 0.5 });
      }
      if (tv.terrain === 'shrine' && Math.random() < dt * 1) {
        const p = tv.group.position.clone();
        p.y = tv.surface + 0.05;
        this.fx.burst(p, { count: 1, color: '#ffe38a', speed: [0.05, 0.1], life: [1.2, 2], size: [0.04, 0.07], area: 0.35, up: 0.35, drag: 0.3 });
      }
    }
    if (this.pathMeshes) for (const m of this.pathMeshes) m.scale.setScalar(1 + Math.sin(t * 6 - m.userData.i * 0.8) * 0.25);

    // ユニット
    for (const uv of this.units.values()) {
      if (!uv.override) this.placeUnit(uv);
      uv.model.userData.anim(t + uv.phase);
      if (uv.flying) uv.model.position.y = 0.08;
      // 向き
      const dy = angleDiff(uv.facing.rotation.y, uv.targetYaw);
      uv.facing.rotation.y += dy * Math.min(1, dt * 8);
      const selO = uv.selected ? 0.8 + Math.sin(t * 5) * 0.2 : 0;
      uv.sel.material.opacity += (selO - uv.sel.material.opacity) * Math.min(1, dt * 10);
      uv.sel.rotation.z = t;
      if (uv.ready) {
        uv.base.userData.ringMat.emissiveIntensity = 1.6 + Math.sin(t * 4 + uv.phase) * 1.0;
        if (Math.random() < dt * 5) {
          const p = uv.group.position.clone();
          const a = Math.random() * Math.PI * 2;
          p.x += Math.cos(a) * 0.36; p.z += Math.sin(a) * 0.36; p.y += 0.05;
          this.fx.burst(p, { count: 1, color: '#fff3b0', colorEnd: '#ffb02a', speed: [0.1, 0.2], dir: new THREE.Vector3(0, 1, 0), spread: 0.1, up: 0.6, life: [0.6, 0.9], size: [0.05, 0.08], drag: 0.5 });
        }
      }
      if (uv.status.visible) uv.status.position.y = uv.height + 0.05 + Math.sin(t * 2 + uv.phase) * 0.04;
    }

    // 揺れ
    if (this.shake > 0.001) {
      this.world.position.set((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake * 0.5, (Math.random() - 0.5) * this.shake);
      this.shake *= Math.pow(0.02, dt);
    } else this.world.position.set(0, 0, 0);

    if (this.quality === 'low') this.renderer.render(this.scene, this.camera);
    else this.composer.render();
    this.emit('frame', dt);
  }

  // ------------------------------------------------------------
  // イベント演出
  // ------------------------------------------------------------

  faceToward(uv, tx, ty) {
    const tv = this.tiles.get(uv.tileId);
    const from = uv.override ? uv.group.position : tv.group.position;
    const dx = wx(tx) - from.x, dz = wz(ty) - from.z;
    if (Math.abs(dx) + Math.abs(dz) < 0.01) return;
    uv.targetYaw = Math.atan2(dx, dz);
  }

  async playEvent(e, sfx) {
    const A = this.anim;
    switch (e.type) {
      case 'summon': {
        const u = e.unit;
        const uv = this.createUnit(u, e.tileId);
        const tv = this.tiles.get(e.tileId);
        const pos = new THREE.Vector3(tv.group.position.x, tv.surface, tv.group.position.z);
        const col = TEAM_COLORS[u.owner];
        const card = CARDS[u.cardId];
        const big = card.cost >= 6 || card.legend;
        const base = u.leader ? 1.08 : 1;
        uv.override = true;
        uv.group.position.copy(pos);
        uv.group.scale.setScalar(0.001);
        sfx('summon');
        // 召喚陣が開き、光が集まる
        this.fx.summonCircle(pos, col, big ? 0.85 : 0.6, big ? 1.8 : 1.2);
        this.fx.burst(pos.clone().add(new THREE.Vector3(0, 0.05, 0)), { count: big ? 50 : 26, color: col, colorEnd: '#ffffff', speed: [0.1, 0.3], up: 0.9, life: [0.4, 0.7], size: [0.05, 0.1], area: big ? 0.8 : 0.5, drag: 1 });
        if (card.legend) {
          this.fx.rays(pos, '#ffd24a', 2.2);
          sfx('cutin');
          await cutIn(u.cardId, u.owner, A.speed);
        }
        await A.wait(big ? 0.28 : 0.16);
        // 上空から降り立つ
        const drop = big ? 3.2 : 1.7;
        this.fx.pillar(pos, col, big ? 6 : 4.5, big ? 1.1 : 0.8, big ? 0.5 : 0.36);
        uv.group.scale.set(base * 0.8, base * 1.25, base * 0.8);
        await A.tween(big ? 0.3 : 0.22, (k) => { uv.group.position.y = pos.y + (1 - k) * drop; }, ease.in);
        // 着地: 衝撃波・土煙・ヒットストップ
        uv.group.position.y = pos.y;
        this.fx.ring(pos, col, big ? 1.8 : 1.0, 0.6);
        this.fx.ring(pos, '#ffffff', big ? 1.1 : 0.6, 0.35);
        this.fx.flash(pos, col, big ? 16 : 10, 0.6);
        this.fx.burst(pos, { count: big ? 90 : 50, color: '#ffffff', colorEnd: col, speed: [0.5, 2.2], dir: new THREE.Vector3(0, 1, 0), spread: 0.8, life: [0.5, 1.1], size: [0.06, 0.14], gravity: 1 });
        this.fx.burst(pos, { count: big ? 40 : 18, color: '#d8c8a8', colorEnd: '#6a5a48', speed: [0.8, 1.8], dir: new THREE.Vector3(0, 0.15, 0), spread: 1, life: [0.4, 0.8], size: [0.08, 0.16], gravity: 0.5, drag: 2 });
        if (big) { this.doShake(0.3); A.hitStop(90); sfx('explode'); if (card.legend) screenFlash('#ffe8a0', 300, 0.4); }
        else this.doShake(0.06);
        await A.tween(0.32, (k) => {
          const q = Math.sin(k * Math.PI) * (1 - k);
          uv.group.scale.set(base * (1 + q * 0.35), base * (1 - q * 0.45), base * (1 + q * 0.35));
        }, ease.linear);
        uv.group.scale.setScalar(base);
        uv.override = false;
        await A.wait(0.08);
        break;
      }
      case 'move': {
        const uv = this.units.get(e.uid);
        if (!uv) break;
        uv.override = true;
        sfx('step');
        for (const step of e.path) {
          const tv = this.tiles.get(step.tileId);
          const from = uv.group.position.clone();
          const to = new THREE.Vector3(tv.group.position.x, tv.surface, tv.group.position.z);
          this.faceToward(uv, step.x, step.y);
          const hop = 0.12 + Math.max(0, to.y - from.y) * 0.8;
          await A.tween(uv.flying ? 0.16 : 0.2, (k) => {
            uv.group.position.lerpVectors(from, to, k);
            uv.group.position.y += Math.sin(k * Math.PI) * hop;
          }, ease.linear);
          this.fx.burst(to, { count: 5, color: '#c8b89a', speed: [0.2, 0.5], life: [0.3, 0.5], size: [0.05, 0.1], area: 0.2 });
          uv.tileId = step.tileId;
        }
        uv.override = false;
        break;
      }
      case 'attack': {
        const a = this.units.get(e.uid), t = this.units.get(e.target);
        if (!a || !t) break;
        const ta = this.tiles.get(t.tileId), aa = this.tiles.get(a.tileId);
        this.faceToward(a, ta.gx, ta.gy);
        if (!e.counter) this.faceToward(t, aa.gx, aa.gy);
        const from = this.unitWorldPos(e.uid, 0.45), to = this.unitWorldPos(e.target, 0.4);
        const col = TEAM_COLORS[a.owner];
        if (e.ranged) {
          const model = e.fx;
          const kind = ['archer', 'elf', 'gunner'].includes(model) ? 'arrow' : 'orb';
          const color = model === 'turret' || model === 'gunner' ? '#7ff4ff' : model === 'mage' ? '#ffb347' : model === 'druid' ? '#9aff7a' : model === 'tidemage' ? '#5fd8ff' : '#ffffff';
          // 溜め: 力が集まる
          a.override = true;
          const p0 = a.group.position.clone();
          this.fx.flash(from, color, 5, 0.45);
          const charge = from.clone().add(new THREE.Vector3(0, 0.1, 0));
          this.fx.burst(charge, { count: 16, color: '#ffffff', colorEnd: color, speed: [0.2, 0.6], life: [0.2, 0.35], size: [0.04, 0.08], area: 0.25, drag: 3 });
          await A.tween(0.22, (k) => { a.group.position.y = p0.y - Math.sin(k * Math.PI * 0.5) * 0.05; }, ease.out);
          sfx(kind === 'arrow' ? 'bow' : 'magic');
          await A.tween(0.08, (k) => { a.group.position.y = p0.y - 0.05 + k * 0.13; });
          A.tween(0.15, (k) => { a.group.position.y = p0.y + 0.08 * (1 - k); }).then(() => { a.override = false; });
          await this.fx.projectile(from, to, kind, color);
          this.fx.impact(to, color, 0.8);
          A.hitStop(45);
        } else {
          a.override = true;
          const p0 = a.group.position.clone();
          const dir = t.group.position.clone().sub(p0);
          dir.y = 0;
          dir.normalize();
          // 振りかぶり
          await A.tween(0.16, (k) => {
            a.group.position.copy(p0).addScaledVector(dir, -0.16 * k);
            a.group.position.y = p0.y + k * 0.06;
          }, ease.out);
          sfx('swing');
          // 踏み込み
          await A.tween(0.09, (k) => { a.group.position.copy(p0).addScaledVector(dir, -0.16 + 0.6 * k); a.group.position.y = p0.y + 0.06 + Math.sin(k * Math.PI) * 0.12; }, ease.in);
          // 命中: 斬撃・閃光・ヒットストップ
          const hit = to.clone().addScaledVector(dir, -0.15);
          this.fx.slash(hit, dir, e.counter ? '#ffd0d0' : '#ffffff', 0.6);
          this.fx.impact(hit, col, 1.0);
          this.fx.burst(hit, { count: 24, color: '#ffffff', colorEnd: '#ffcf8a', speed: [1.2, 3], life: [0.15, 0.35], size: [0.05, 0.1] });
          A.hitStop(e.counter ? 50 : 85);
          this.doShake(0.08);
          A.tween(0.3, (k) => { a.group.position.copy(p0).addScaledVector(dir, 0.44 * (1 - k)); }, ease.out).then(() => { a.override = false; });
        }
        break;
      }
      case 'damage': {
        const uv = this.units.get(e.uid);
        if (!uv) break;
        const pos = this.unitWorldPos(e.uid, 0.9);
        uv.stats.hp = e.hp;
        this.redrawBadge(uv);
        if (e.amount > 0) {
          sfx(e.source === 'lava' ? 'burn' : 'hit');
          const heavy = e.amount >= 4;
          this.fx.floatText(pos, '-' + e.amount, heavy ? '#ffd24a' : '#ff5a5a', 0.6 + Math.min(0.45, e.amount * 0.07));
          this.fx.burst(this.unitWorldPos(e.uid, 0.4), { count: 14 + e.amount * 4, color: '#ff4a3a', colorEnd: '#5a0a0a', speed: [0.8, 2.2], life: [0.3, 0.6], size: [0.05, 0.11], gravity: 4 });
          if (heavy) { sfx('crit'); this.doShake(0.16); this.fx.impact(this.unitWorldPos(e.uid, 0.45), '#ffb02a', 1.4); screenFlash('#ffffff', 180, 0.25); }
          if (uv.leader) {
            this.fx.ring(this.unitWorldPos(e.uid, 0.05), '#ff4040', 0.9, 0.45);
            if (this.viewer !== null && this.viewer !== undefined && uv.owner === this.viewer) vignette('#ff2040', 750);
          }
          // 被弾: のけぞり + 潰れ
          uv.override = true;
          const p0 = uv.group.position.clone();
          const s0 = uv.group.scale.x;
          await A.tween(0.24, (k) => {
            uv.group.position.copy(p0);
            uv.group.position.x += Math.sin(k * Math.PI * 4) * 0.06 * (1 - k);
            const q = Math.sin(k * Math.PI) * (1 - k) * 0.5;
            uv.group.scale.set(s0 * (1 + q * 0.3), s0 * (1 - q * 0.35), s0 * (1 + q * 0.3));
          }, ease.linear);
          uv.group.scale.setScalar(s0);
          uv.override = false;
        } else {
          sfx('block');
          this.fx.floatText(pos, '0', '#cfd8e8', 0.45);
          await A.wait(0.12);
        }
        break;
      }
      case 'heal': {
        const uv = this.units.get(e.uid);
        if (!uv) break;
        uv.stats.hp = e.hp;
        this.redrawBadge(uv);
        sfx('heal');
        const pos = this.unitWorldPos(e.uid, 0.2);
        this.fx.floatText(this.unitWorldPos(e.uid, 0.9), '+' + e.amount, '#6aff8a', 0.5);
        this.fx.burst(pos, { count: 24, color: '#9aff9a', colorEnd: '#2a8a4a', speed: [0.2, 0.6], dir: new THREE.Vector3(0, 1, 0), spread: 0.3, up: 0.8, life: [0.6, 1], size: [0.06, 0.1], area: 0.3, drag: 1 });
        await A.wait(0.2);
        break;
      }
      case 'buff': {
        const uv = this.units.get(e.uid);
        if (!uv) break;
        uv.stats.atk = e.atk;
        uv.stats.hp = e.hp;
        uv.stats.maxHp = Math.max(uv.stats.maxHp + e.dHp, e.hp);
        this.redrawBadge(uv);
        sfx('buff');
        const pos = this.unitWorldPos(e.uid, 0.1);
        this.fx.floatText(this.unitWorldPos(e.uid, 0.95), e.label || `+${e.dAtk}/+${e.dHp}`, '#ffd24a', 0.45);
        this.fx.burst(pos, { count: 30, color: '#ffe38a', colorEnd: '#ff8a1a', speed: [0.3, 0.8], dir: new THREE.Vector3(0, 1, 0), spread: 0.2, up: 1.2, life: [0.5, 0.9], size: [0.05, 0.1], area: 0.35 });
        this.fx.ring(this.unitWorldPos(e.uid, 0), '#ffd24a', 0.5, 0.5);
        await A.wait(0.15);
        break;
      }
      case 'freeze': {
        const uv = this.units.get(e.uid);
        if (!uv) break;
        uv.stats.frozen = true;
        this.redrawBadge(uv);
        sfx('freeze');
        this.fx.burst(this.unitWorldPos(e.uid, 0.4), { count: 30, color: '#e0f8ff', colorEnd: '#4fbfff', speed: [0.5, 1.5], life: [0.4, 0.8], size: [0.05, 0.12] });
        uv.ice.scale.y = 0.01;
        await A.tween(0.3, (k) => { uv.ice.scale.y = uv.height * 1.3 * k; }, ease.outBack);
        break;
      }
      case 'vanish': {
        const uv = this.units.get(e.uid);
        if (!uv) break;
        sfx('mana');
        uv.override = true;
        const p0 = uv.group.position.clone();
        this.fx.pillar(p0, '#bfe4ff', 3, 0.7, 0.35);
        this.fx.burst(p0.clone().add(new THREE.Vector3(0, 0.3, 0)), { count: 40, color: '#ffffff', colorEnd: '#7fb8ff', speed: [0.3, 1], up: 1.2, life: [0.5, 0.9], size: [0.05, 0.1] });
        await A.tween(0.45, (k) => {
          uv.group.scale.setScalar(Math.max(0.001, 1 - k));
          uv.group.position.y = p0.y + k * 0.8;
        }, ease.in);
        this.world.remove(uv.group);
        this.units.delete(e.uid);
        break;
      }
      case 'death': {
        const uv = this.units.get(e.uid);
        if (!uv) break;
        sfx(e.leader ? 'big' : 'death');
        uv.override = true;
        const p0 = uv.group.position.clone();
        const col = TEAM_COLORS[uv.owner];
        const mid = p0.clone().add(new THREE.Vector3(0, 0.3, 0));
        if (e.leader) {
          // 将の最期: 時間が止まり、白い閃光とともに砕け散る
          A.hitStop(420);
          screenFlash('#ffffff', 600, 0.75);
          this.doShake(0.45);
          this.fx.rays(p0, col, 2.4);
          this.fx.ring(p0, '#ffffff', 3.2, 1.0);
        }
        // 白く膨らんでから砕ける
        const s0 = uv.group.scale.x;
        await A.tween(0.16, (k) => { uv.group.scale.set(s0 * (1 + k * 0.18), s0 * (1 - k * 0.12), s0 * (1 + k * 0.18)); uv.facing.rotation.z = Math.sin(k * 30) * 0.05; }, ease.out);
        this.fx.flash(mid, col, e.leader ? 22 : 10, 0.5);
        this.fx.shards(mid, [col, '#ffffff', '#40384e'], e.leader ? 46 : 18, p0.y);
        this.fx.soul(p0.clone().add(new THREE.Vector3(0, 0.5, 0)), col);
        this.fx.floatText(p0.clone().add(new THREE.Vector3(0, 1.25, 0)), e.leader ? '将 撃破' : '撃破', e.leader ? '#ffd24a' : '#ffffff', e.leader ? 0.7 : 0.42, 1.4);
        this.fx.burst(mid, { count: e.leader ? 160 : 70, color: '#ffffff', colorEnd: col, speed: [0.5, e.leader ? 3.5 : 2.2], life: [0.6, 1.2], size: [0.06, 0.14], gravity: -0.5, drag: 2 });
        this.fx.ring(p0, col, e.leader ? 2.2 : 0.9, 0.6);
        await A.tween(0.22, (k) => {
          uv.group.scale.setScalar(Math.max(0.001, s0 * 1.15 * (1 - k)));
          uv.facing.rotation.y += 0.3;
        }, ease.in);
        this.world.remove(uv.group);
        this.units.delete(e.uid);
        await A.wait(e.leader ? 0.6 : 0.15);
        break;
      }
      case 'tile': {
        const tv = this.tiles.get(e.id);
        if (!tv) break;
        const h0 = tv.h;
        if (tv.terrain !== e.terrain) {
          sfx('terrain');
          const c = { forest: '#5fd068', lava: '#ff6a1a', water: '#5ec8f0', plain: '#9fd070', crystal: '#c9a6ff', shrine: '#ffe38a' }[e.terrain];
          this.fx.burst(new THREE.Vector3(tv.group.position.x, tv.surface + 0.1, tv.group.position.z), { count: 30, color: c, speed: [0.3, 1.2], dir: new THREE.Vector3(0, 1, 0), spread: 0.6, life: [0.4, 0.8], size: [0.06, 0.12], area: 0.4 });
          this.setTerrain(tv, e.terrain);
        }
        if (h0 !== e.height) {
          sfx(e.height > h0 ? 'rise' : 'sink');
          this.doShake(0.06);
          await A.tween(0.45, (k) => { tv.h = h0 + (e.height - h0) * k; this.applyHeight(tv); }, ease.outBack);
          this.fx.burst(new THREE.Vector3(tv.group.position.x, tv.surface, tv.group.position.z), { count: 20, color: '#b8a088', speed: [0.4, 1], life: [0.4, 0.7], size: [0.06, 0.12], area: 0.5, gravity: 2 });
        } else await A.wait(0.15);
        break;
      }
      case 'tilesMoved':
        await this.animateTileMoves(e, sfx);
        break;
      case 'skill':
        await this.playSkill(e, sfx);
        break;
      case 'enhance': {
        // エンハンス: 金色の衝撃波と文字
        const uv = e.uid && this.units.get(e.uid);
        const L = [...this.units.values()].find((u) => u.leader && u.owner === e.player);
        const at = uv || L;
        if (!at) break;
        const p = at.group.position.clone();
        sfx('buff');
        this.fx.ring(p, '#ffd24a', 1.6, 0.7);
        this.fx.pillar(p, '#ffcf6a', 3.5, 0.8, 0.42);
        this.fx.burst(p.clone().add(new THREE.Vector3(0, 0.3, 0)), { count: 60, color: '#fff6c8', colorEnd: '#ffb02a', speed: [0.6, 2], up: 1.4, life: [0.5, 1], size: [0.06, 0.12], drag: 1 });
        this.fx.floatText(p.clone().add(new THREE.Vector3(0, 1.3, 0)), 'エンハンス!', '#ffd24a', 0.55, 1.3);
        await A.wait(0.45);
        break;
      }
      case 'mana': {
        if (!e.label) break;
        const L = [...this.units.values()].find((u) => u.leader && u.owner === e.player);
        if (!L) break;
        sfx('mana');
        const p = L.group.position.clone();
        this.fx.burst(p.clone().add(new THREE.Vector3(0, 0.4, 0)), { count: 40, color: '#e0f4ff', colorEnd: '#4a8aff', speed: [0.3, 1.2], up: 1.6, life: [0.6, 1], size: [0.06, 0.12], drag: 1 });
        this.fx.floatText(p.clone().add(new THREE.Vector3(0, 1.4, 0)), e.label, '#9fd8ff', 0.5, 1.3);
        await A.wait(0.35);
        break;
      }
      case 'fieldChange':
        await this.animateFieldChange(e, sfx);
        break;
      case 'env': {
        // 空模様が切り替わる。環境ユニットから天へ光の柱
        sfx('env');
        const uv = e.uid && this.units.get(e.uid);
        const col = { scorch: '#ff7a2a', rain: '#7dffb0', zerog: '#9fb8ff', lab: '#c9a6ff', dragonsky: '#ffd27a' }[e.kind] || '#d8ccff';
        if (uv) {
          const p = uv.group.position.clone();
          this.fx.pillar(p, col, 14, 1.6, 0.45);
          this.fx.ring(p, col, 3.5, 1.2);
          this.fx.burst(p.clone().add(new THREE.Vector3(0, 0.4, 0)), { count: 90, color: '#ffffff', colorEnd: col, speed: [0.6, 2.4], up: 2.5, life: [0.8, 1.5], size: [0.06, 0.14], drag: 1 });
        }
        screenFlash(col, 500, 0.3);
        this.atmo.setEnv(e.kind);
        this.doShake(0.12);
        await A.wait(1.3);
        break;
      }
      case 'push': {
        const uv = this.units.get(e.uid);
        if (!uv) break;
        const tv = this.tiles.get(e.tileId);
        uv.override = true;
        const from = uv.group.position.clone();
        const to = new THREE.Vector3(tv.group.position.x, tv.surface, tv.group.position.z);
        sfx('push');
        await A.tween(0.3, (k) => { uv.group.position.lerpVectors(from, to, k); uv.group.position.y += Math.sin(k * Math.PI) * 0.15; }, ease.out);
        uv.tileId = e.tileId;
        uv.override = false;
        break;
      }
      case 'bump': {
        const uv = this.units.get(e.uid);
        if (!uv) break;
        uv.override = true;
        const p0 = uv.group.position.clone();
        await A.tween(0.25, (k) => {
          const s = Math.sin(k * Math.PI) * 0.18;
          uv.group.position.set(p0.x + e.dx * s * S, p0.y, p0.z - e.dy * s * S);
        });
        uv.override = false;
        break;
      }
      case 'tectonic': {
        sfx('quake');
        this.doShake(0.35);
        await A.wait(0.4);
        break;
      }
      case 'fx':
        await this.playFx(e, sfx);
        break;
      case 'spell':
      case 'hero':
        await this.playSpell(e, sfx);
        break;
      case 'crystal': {
        sfx('mana');
        for (const tv of this.tiles.values()) {
          if (tv.terrain !== 'crystal') continue;
          const p = new THREE.Vector3(tv.group.position.x, tv.surface, tv.group.position.z);
          this.fx.burst(p, { count: 30, color: '#e0c8ff', colorEnd: '#7a4cff', speed: [0.5, 1.5], dir: new THREE.Vector3(0, 1, 0), spread: 0.4, life: [0.6, 1], size: [0.06, 0.12] });
        }
        await A.wait(0.3);
        break;
      }
      case 'fatigue': {
        const L = [...this.units.values()].find((u) => u.leader && u.owner === e.player);
        if (L) this.fx.floatText(L.group.position.clone().add(new THREE.Vector3(0, 1.4, 0)), '山札切れ', '#ff9a9a', 0.4);
        await A.wait(0.3);
        break;
      }
    }
  }

  // 奥義: 力をため、カットインとともに放つ
  async playSkill(e, sfx) {
    const A = this.anim;
    const uv = this.units.get(e.uid);
    const col = { inferno: '#ff5a1a', forest: '#7dff8a', invert: '#7fe8ff', discharge: '#c9a6ff' }[e.fx] || '#ffd24a';
    sfx('skill');
    if (!uv) { await cutIn(e.cardId, e.player, A.speed, { tag: '奥義', name: `「${e.name}」`, sub: CARDS[e.cardId].name }); return; }
    const p0 = uv.group.position.clone();
    uv.override = true;
    this.fx.summonCircle(p0, col, 1.4, 2.6);
    this.fx.rays(p0, col, 2.6);
    this.fx.burst(p0, { count: 70, color: col, colorEnd: '#ffffff', speed: [0.2, 0.6], up: 1.6, life: [0.6, 1.1], size: [0.05, 0.12], area: 1.2, drag: 1.5 });
    this.doShake(0.15);
    const s0 = uv.group.scale.x;
    const rise = A.tween(0.9, (k) => {
      uv.group.position.y = p0.y + Math.sin(k * Math.PI * 0.5) * 0.45;
      uv.facing.rotation.y += 0.12 * (1 - k);
      uv.group.scale.setScalar(s0 * (1 + k * 0.15));
    }, ease.out);
    await cutIn(e.cardId, e.player, A.speed, { tag: '奥義', name: `「${e.name}」`, sub: CARDS[e.cardId].name });
    await rise;
    this.fx.flash(p0.clone().add(new THREE.Vector3(0, 0.6, 0)), col, 30, 0.8);
    this.fx.pillar(p0, col, 10, 1.0, 0.6);
    screenFlash('#ffffff', 300, 0.5);
    A.hitStop(120);
    A.tween(0.4, (k) => {
      uv.group.position.y = p0.y + 0.45 * (1 - k);
      uv.group.scale.setScalar(s0 * (1.15 - 0.15 * k));
    }, ease.in).then(() => { uv.override = false; });
  }

  // 盤面全体の地形変化: 奥義の主から波紋のように広がる
  async animateFieldChange(e, sfx) {
    const A = this.anim;
    const col = { inferno: '#ff5a1a', forest: '#5fd068', invert: '#7fe8ff', discharge: '#c9a6ff' }[e.kind] || '#ffffff';
    const origin = this.tileWorldPos(e.x, e.y);
    sfx(e.kind === 'inferno' ? 'explode' : 'quake');
    this.fx.ring(origin, col, 9, 1.6);
    this.fx.ring(origin, '#ffffff', 5, 1.0);
    this.fx.flash(origin, col, 24, 1.2);
    screenFlash(col, 450, 0.35);
    this.doShake(e.kind === 'invert' ? 0.45 : 0.35);
    const items = e.tiles.map((t) => {
      const tv = this.tiles.get(t.id);
      return { tv, t, d: Math.hypot(tv.gx - e.x, tv.gy - e.y), h0: tv.h, started: false };
    }).filter((it) => it.tv);
    const step = 0.09, dur = e.kind === 'invert' ? 0.7 : 0.45;
    const total = Math.max(0, ...items.map((it) => it.d)) * step + dur;
    let lastSfx = -1;
    await A.tween(total, (k, raw) => {
      const time = raw * total;
      for (const it of items) {
        const lt = (time - it.d * step) / dur;
        if (lt < 0) continue;
        const tv = it.tv;
        if (!it.started) {
          it.started = true;
          const ring = Math.round(it.d);
          if (ring !== lastSfx) { lastSfx = ring; sfx(e.kind === 'invert' ? (it.t.height > it.h0 ? 'rise' : 'sink') : 'terrain'); }
          if (tv.terrain !== it.t.terrain) this.setTerrain(tv, it.t.terrain);
          const p = new THREE.Vector3(tv.group.position.x, tv.surface + 0.1, tv.group.position.z);
          if (e.kind === 'inferno') this.fx.burst(p, { count: 26, color: '#ffef8a', colorEnd: '#ff2a00', speed: [0.8, 2.2], dir: new THREE.Vector3(0, 1, 0), spread: 0.5, life: [0.4, 0.9], size: [0.07, 0.15], gravity: 2, area: 0.4 });
          else if (e.kind === 'discharge') { this.fx.lightning(p.clone().add(new THREE.Vector3(0, 0.2, 0)), '#d8c8ff'); this.fx.burst(p, { count: 14, color: '#ffffff', colorEnd: '#9a6aff', speed: [0.6, 1.8], life: [0.2, 0.5], size: [0.05, 0.1], area: 0.4 }); }
          else if (e.kind === 'forest') this.fx.burst(p, { count: 22, color: '#c8ff9a', colorEnd: '#2a8a3a', speed: [0.4, 1.4], dir: new THREE.Vector3(0, 1, 0), spread: 0.7, life: [0.6, 1.1], size: [0.06, 0.12], gravity: 0.6, area: 0.45 });
          else this.fx.burst(p, { count: 16, color: '#ffffff', colorEnd: col, speed: [0.3, 1], up: 0.8, life: [0.5, 0.9], size: [0.05, 0.1], area: 0.45, drag: 1 });
        }
        if (it.h0 !== it.t.height) {
          const kk = lt >= 1 ? 1 : ease.outBack(lt);
          tv.h = it.h0 + (it.t.height - it.h0) * kk;
          this.applyHeight(tv);
        } else if (lt < 1) {
          // 変化したマスは一度跳ねる
          tv.lift = Math.sin(lt * Math.PI) * 0.18;
          this.applyHeight(tv);
        } else if (tv.lift) { tv.lift = 0; this.applyHeight(tv); }
      }
    }, ease.linear);
    for (const it of items) { it.tv.h = it.t.height; it.tv.lift = 0; this.applyHeight(it.tv); }
    await A.wait(0.2);
  }

  async animateTileMoves(e, sfx) {
    sfx('quake');
    this.doShake(0.12);
    const A = this.anim;
    const items = e.moves.map((m) => ({ tv: this.tiles.get(m.id), ...m }));
    if (e.kind === 'shift') {
      await A.tween(0.9, (k) => {
        for (const it of items) {
          const dx = it.tx - it.fx;
          const wrap = Math.abs(dx) > 1;
          if (!wrap) {
            it.tv.group.position.x = wx(it.fx + dx * k);
            it.tv.lift = 0;
          } else {
            // 端から反対側へ: 沈んで潜り、浮かび上がる
            const kk = k;
            const sink = Math.sin(kk * Math.PI) * 1.4;
            const startX = it.fx, endX = it.tx;
            const outX = startX + e.dir * 0.5;
            const inX = endX - e.dir * 0.5;
            let x;
            if (kk < 0.35) x = startX + (outX - startX) * (kk / 0.35);
            else if (kk < 0.65) x = outX + (inX - outX) * ((kk - 0.35) / 0.3);
            else x = inX + (endX - inX) * ((kk - 0.65) / 0.35);
            it.tv.group.position.x = wx(x);
            it.tv.group.position.y = -sink;
          }
          this.applyHeight(it.tv);
        }
      }, ease.inOut);
    } else {
      // 回転: 中心 (cx,cy) まわりの極座標で補間
      const cxw = wx(e.cx), czw = wz(e.cy);
      const total = -e.dir * e.steps * (Math.PI / 4); // 盤面座標での角度変化 (時計回りは負)
      const data = items.map((it) => {
        const bx = it.fx - e.cx, by = it.fy - e.cy;
        return { it, a0: Math.atan2(by, bx), r0: Math.hypot(bx, by), r1: Math.hypot(it.tx - e.cx, it.ty - e.cy) };
      });
      await A.tween(1.0, (k) => {
        for (const d of data) {
          const a = d.a0 + total * k;
          const r = d.r0 + (d.r1 - d.r0) * k;
          d.it.tv.group.position.x = cxw + Math.cos(a) * r * S;
          d.it.tv.group.position.z = czw - Math.sin(a) * r * S;
          d.it.tv.group.position.y = Math.sin(k * Math.PI) * 0.35;
        }
      }, ease.inOut);
    }
    for (const it of items) {
      it.tv.gx = it.tx;
      it.tv.gy = it.ty;
      it.tv.group.position.set(wx(it.tx), 0, wz(it.ty));
      it.tv.lift = 0;
      this.applyHeight(it.tv);
    }
    this.doShake(0.1);
  }

  async playSpell(e, sfx) {
    const A = this.anim;
    const target = e.x !== undefined ? this.tileWorldPos(e.x, e.y) : null;
    const from = e.from ? this.unitWorldPos(e.from.uid, 0.9) : null;
    const tu = target ? [...this.units.values()].find((u) => { const tv = this.tiles.get(u.tileId); return tv.gx === e.x && tv.gy === e.y; }) : null;
    const tpos = tu ? this.unitWorldPos(tu.uid, 0.4) : target ? target.clone().add(new THREE.Vector3(0, 0.3, 0)) : null;
    // 詠唱: 術者の足元に魔法陣
    if (e.from && this.units.get(e.from.uid)) {
      const feet = this.unitWorldPos(e.from.uid, 0);
      this.fx.summonCircle(feet, TEAM_COLORS[e.player] || '#ffffff', 0.5, 0.9);
      this.fx.burst(feet, { count: 18, color: TEAM_COLORS[e.player] || '#ffffff', colorEnd: '#ffffff', speed: [0.2, 0.5], up: 1, life: [0.4, 0.7], size: [0.04, 0.08], area: 0.35, drag: 1 });
    }
    if (target) this.fx.summonCircle(target, '#ffffff', 0.42, 0.8);
    if (e.cardId && CARDS[e.cardId]?.legend) { sfx('cutin'); await cutIn(e.cardId, e.player, A.speed); }
    await A.wait(0.15);
    switch (e.fx) {
      case 'lightning':
        sfx('thunder');
        await this.fx.lightning(tpos);
        this.doShake(0.15);
        break;
      case 'fireball':
        sfx('fire');
        await this.fx.projectile(from, tpos, 'orb', '#ff7a1a');
        this.fx.burst(tpos, { count: 80, color: '#ffef8a', colorEnd: '#ff2a00', speed: [1, 3], life: [0.4, 0.9], size: [0.08, 0.18], gravity: -0.5 });
        this.fx.ring(tpos, '#ff8a3a', 1.3, 0.6);
        this.fx.flash(tpos, '#ff7a1a', 12, 0.6);
        this.doShake(0.2);
        sfx('explode');
        break;
      case 'spark':
        sfx('magic');
        await this.fx.projectile(from, tpos, 'bolt', '#ffb347');
        this.fx.burst(tpos, { count: 25, color: '#ffef8a', colorEnd: '#ff4a00', speed: [0.8, 2], life: [0.3, 0.5], size: [0.05, 0.1] });
        break;
      case 'heal':
        sfx('heal');
        this.fx.pillar(target, '#9aff9a', 2.5, 0.8, 0.35);
        await A.wait(0.2);
        break;
      case 'freeze':
        sfx('freeze');
        await this.fx.projectile(from, tpos, 'bolt', '#9fe8ff');
        this.fx.burst(tpos, { count: 50, color: '#ffffff', colorEnd: '#4fbfff', speed: [0.6, 2], life: [0.4, 0.8], size: [0.06, 0.12] });
        break;
      case 'wave':
        sfx('wave');
        this.fx.ring(this.unitWorldPos(e.from.uid, 0), '#7fe8ff', 3, 0.6);
        await this.fx.projectile(from, tpos, 'bolt', '#7fe8ff');
        break;
      case 'buff':
      case 'warcry':
        sfx('buff');
        if (from) this.fx.ring(this.unitWorldPos(e.from.uid, 0), '#ffd24a', 3.5, 0.8);
        await A.wait(0.3);
        break;
      case 'draw':
      case 'mana':
        sfx('mana');
        if (from) this.fx.burst(this.unitWorldPos(e.from.uid, 0.5), { count: 30, color: '#9fd8ff', colorEnd: '#6a4cff', speed: [0.3, 1], up: 0.8, life: [0.5, 1], size: [0.06, 0.1], area: 0.3 });
        await A.wait(0.3);
        break;
      case 'crow': {
        // 黒い羽と稲光が術者から舞い上がる
        sfx('thunder');
        if (from) {
          this.fx.burst(from, { count: 60, color: '#3a2a4a', colorEnd: '#0a0610', speed: [0.6, 2], up: 1.2, life: [0.6, 1.2], size: [0.07, 0.14], drag: 1.2 });
          this.fx.flash(from, '#b48aff', 10, 0.5);
        }
        this.doShake(0.12);
        await A.wait(0.35);
        break;
      }
      case 'raise':
      case 'lower':
      case 'quake':
      case 'eruption':
      case 'thorns':
      case 'flood':
      case 'slide':
      case 'rotate': {
        sfx('field');
        const col = { eruption: '#ff6a1a', thorns: '#5fd068', flood: '#5ec8f0', slide: '#7fe8ff', rotate: '#7fe8ff', quake: '#e3d27a' }[e.fx] || '#e3d27a';
        if (target) {
          this.fx.ring(target, col, e.fx === 'quake' || e.fx === 'rotate' ? 1.8 : 0.8, 0.6);
          this.fx.burst(target.clone().add(new THREE.Vector3(0, 0.1, 0)), { count: 40, color: col, speed: [0.5, 1.6], dir: new THREE.Vector3(0, 1, 0), spread: 0.6, life: [0.4, 0.9], size: [0.06, 0.12], area: 0.5 });
          if (e.fx === 'eruption') { this.fx.pillar(target, '#ff6a1a', 3, 0.8, 0.4); this.doShake(0.25); sfx('explode'); }
        }
        await A.wait(0.35);
        break;
      }
      default:
        await A.wait(0.2);
    }
  }

  async playFx(e, sfx) {
    const A = this.anim;
    const fromPos = e.from && e.from.uid ? this.unitWorldPos(e.from.uid, 0.5) : e.from ? this.tileWorldPos(e.from.x, e.from.y) : null;
    const toPos = e.to && e.to.uid && this.units.get(e.to.uid) ? this.unitWorldPos(e.to.uid, 0.4) : e.to ? this.tileWorldPos(e.to.x, e.to.y) : null;
    switch (e.kind) {
      case 'nova': {
        sfx('explode');
        const c = e.color || '#ffffff';
        this.fx.ring(fromPos, c, (e.radius || 2) * 1.1, 0.8);
        this.fx.burst(fromPos, { count: 120, color: '#ffffff', colorEnd: c, speed: [2, 4.5], life: [0.4, 0.8], size: [0.08, 0.16], dir: new THREE.Vector3(0, 0.2, 0), spread: 1 });
        this.fx.flash(fromPos, c, 16, 0.8);
        this.doShake(0.3);
        await A.wait(0.35);
        break;
      }
      case 'storm': {
        sfx('thunder');
        this.fx.ring(fromPos, '#bfe4ff', 2.4, 0.9);
        const near = [...this.units.values()].filter((u) => u.owner !== this.units.get(e.from.uid)?.owner && u.group.position.distanceTo(fromPos) < 3.6);
        for (const u of near) this.fx.lightning(this.unitWorldPos(u.uid, 0.4), '#d8f0ff');
        this.doShake(0.3);
        await A.wait(0.5);
        break;
      }
      case 'wave':
        sfx('wave');
        this.fx.ring(fromPos, '#7fe8ff', 1.4, 0.6);
        await A.wait(0.25);
        break;
      case 'bolt':
        sfx('magic');
        await this.fx.projectile(fromPos, toPos, 'bolt', '#c9a6ff');
        break;
      case 'burn':
        this.fx.burst(toPos, { count: 40, color: '#ffcf5a', colorEnd: '#ff2a00', speed: [0.4, 1.2], dir: new THREE.Vector3(0, 1, 0), spread: 0.4, life: [0.4, 0.8], size: [0.08, 0.14] });
        await A.wait(0.2);
        break;
      case 'splash':
        this.fx.ring(toPos, '#ff8a3a', 1.1, 0.5);
        this.fx.burst(toPos, { count: 40, color: '#ffcf5a', colorEnd: '#ff3a00', speed: [1, 2.4], life: [0.3, 0.6], size: [0.06, 0.12] });
        await A.wait(0.15);
        break;
      case 'siege':
        sfx('magic');
        if (fromPos && toPos) {
          this.fx.burst(fromPos, { count: 20, color: '#ffd24a', colorEnd: '#ff4a2a', speed: [0.4, 1], up: 0.6, life: [0.4, 0.7], size: [0.06, 0.1] });
          await this.fx.projectile(fromPos, toPos.clone().add(new THREE.Vector3(0, 0.3, 0)), 'bolt', '#ffb02a');
        }
        break;
      case 'pierce':
        this.fx.burst(toPos, { count: 30, color: '#ffffff', colorEnd: '#ff8a3a', speed: [1.5, 3], life: [0.2, 0.4], size: [0.05, 0.1] });
        await A.wait(0.1);
        break;
    }
  }
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function mulberry(seed) {
  let s = seed | 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
