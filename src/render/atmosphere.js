// 盤の外の空模様 (環境)。環境を持つユニットが場にいる間、空・霧・光・漂う粒子が変わる。
//   scorch: 焦天      — 赤く燃える空、巨大な太陽、降りそそぐ火の粉
//   rain:   恵みの霧雨 — 緑がかった霧、降りしきる雨、ときおりの稲光
//   zerog:  無重力の星海 — 深い宇宙、輪をもつ惑星、浮かび上がる岩と星屑
import * as THREE from 'three';
import { makeGlowTexture } from './textures.js';

const KINDS = ['scorch', 'rain', 'zerog', 'lab'];

const v3 = (r, g, b) => new THREE.Vector3(r, g, b);
const PALETTES = {
  base: {
    top: v3(0.03, 0.04, 0.12), mid: v3(0.16, 0.10, 0.28), low: v3(0.05, 0.03, 0.08), aur: v3(0.05, 0.25, 0.22), aurAmp: 0.5,
    fog: new THREE.Color('#1a1534'), fogD: 0.022, bg: new THREE.Color('#0a0c1c'),
    hemi: new THREE.Color('#b8c8ff'), hemiI: 0.9, sun: new THREE.Color('#ffe6c4'), sunI: 2.4,
    ring: new THREE.Color('#9b7dff'), mote: new THREE.Color('#c9b8ff'), stars: 0.85,
  },
  scorch: {
    top: v3(0.2, 0.03, 0.02), mid: v3(0.62, 0.17, 0.04), low: v3(0.18, 0.025, 0.01), aur: v3(0.9, 0.35, 0.0), aurAmp: 0.6,
    fog: new THREE.Color('#5a1e0a'), fogD: 0.026, bg: new THREE.Color('#2a0804'),
    hemi: new THREE.Color('#ffb08a'), hemiI: 1.0, sun: new THREE.Color('#ffa060'), sunI: 3.0,
    ring: new THREE.Color('#ff7a2a'), mote: new THREE.Color('#ffb040'), stars: 0.05,
  },
  rain: {
    top: v3(0.03, 0.09, 0.09), mid: v3(0.13, 0.27, 0.24), low: v3(0.02, 0.07, 0.05), aur: v3(0.25, 0.6, 0.35), aurAmp: 0.35,
    fog: new THREE.Color('#1e3c34'), fogD: 0.038, bg: new THREE.Color('#081a16'),
    hemi: new THREE.Color('#c8ffe4'), hemiI: 0.85, sun: new THREE.Color('#d8ffe8'), sunI: 1.7,
    ring: new THREE.Color('#7dff9a'), mote: new THREE.Color('#b8ffb8'), stars: 0.05,
  },
  lab: {
    top: v3(0.03, 0.0, 0.06), mid: v3(0.14, 0.05, 0.26), low: v3(0.02, 0.0, 0.05), aur: v3(0.4, 1.0, 0.85), aurAmp: 1.1,
    fog: new THREE.Color('#1a0e2e'), fogD: 0.03, bg: new THREE.Color('#06030c'),
    hemi: new THREE.Color('#c8b0ff'), hemiI: 0.85, sun: new THREE.Color('#d8c8ff'), sunI: 2.0,
    ring: new THREE.Color('#7fffd8'), mote: new THREE.Color('#9affe8'), stars: 0.2,
  },
  zerog: {
    top: v3(0.0, 0.0, 0.03), mid: v3(0.05, 0.05, 0.22), low: v3(0.0, 0.0, 0.05), aur: v3(0.35, 0.25, 1.0), aurAmp: 1.4,
    fog: new THREE.Color('#0a0a2a'), fogD: 0.012, bg: new THREE.Color('#02020a'),
    hemi: new THREE.Color('#a8b8ff'), hemiI: 0.95, sun: new THREE.Color('#e0e8ff'), sunI: 2.2,
    ring: new THREE.Color('#7fe8ff'), mote: new THREE.Color('#bfe4ff'), stars: 1.0,
  },
};

export class Atmosphere {
  constructor(view) {
    this.v = view;
    this.target = null;
    this.w = { scorch: 0, rain: 0, zerog: 0, lab: 0 };
    this.flash = 0;
    const scene = view.scene;
    const glowTex = makeGlowTexture();

    // --- 焦天: 巨大な太陽と火の粉 ---
    const sunM = new THREE.SpriteMaterial({ map: glowTex, color: '#ff5a1a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.sunSprite = new THREE.Sprite(sunM);
    this.sunSprite.position.set(-24, -10, -58); // カメラは盤を見下ろしているので、画面の上端に見えるよう地平線より下に置く
    this.sunSprite.scale.setScalar(46);
    scene.add(this.sunSprite);
    const coreM = new THREE.SpriteMaterial({ map: glowTex, color: '#fff2b0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.sunCore = new THREE.Sprite(coreM);
    this.sunCore.position.copy(this.sunSprite.position);
    this.sunCore.scale.setScalar(16);
    scene.add(this.sunCore);
    this.embers = this.makePoints(420, '#ffa040', 0.11, (p) => {
      p.x = (Math.random() - 0.5) * 20; p.y = Math.random() * 10 - 2; p.z = (Math.random() - 0.5) * 20;
    });

    // --- 霧雨: 雨の線 ---
    const N = 700;
    const rg = new THREE.BufferGeometry();
    this.rainPos = new Float32Array(N * 6);
    this.rainSpeed = new Float32Array(N);
    for (let i = 0; i < N; i++) this.resetDrop(i, true);
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#cfeeff', transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false;
    view.world.add(this.rain);

    // --- 星海: 輪のある惑星と星屑 ---
    const pg = new THREE.Group();
    pg.position.set(26, -14, -52);
    const planetM = new THREE.ShaderMaterial({
      transparent: true, fog: false,
      uniforms: { op: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix*normal); vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec3 vN; varying vec3 vP; uniform float op;
        void main(){ float l = clamp(dot(vN, normalize(vec3(-0.6,0.4,0.7))), 0.0, 1.0);
          float band = 0.5 + 0.5 * sin(vP.y * 0.9 + sin(vP.x * 0.3) * 1.5);
          vec3 c = mix(vec3(0.25,0.2,0.6), vec3(0.55,0.75,1.0), band) * (0.15 + l);
          float rim = pow(1.0 - abs(vN.z), 3.0);
          c += vec3(0.4,0.6,1.0) * rim * 0.8;
          gl_FragColor = vec4(c, op); }`,
    });
    this.planetM = planetM;
    pg.add(new THREE.Mesh(new THREE.SphereGeometry(9, 32, 24), planetM));
    const ringM = new THREE.MeshBasicMaterial({ color: '#9fc8ff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    this.planetRingM = ringM;
    const ring = new THREE.Mesh(new THREE.RingGeometry(12, 17, 64), ringM);
    ring.rotation.x = Math.PI / 2.3;
    ring.rotation.y = 0.3;
    pg.add(ring);
    pg.visible = false;
    scene.add(pg);
    this.planet = pg;
    // --- 研究室: 宙を走る火花 ---
    this.sparks = this.makePoints(320, '#9affe8', 0.07, (p) => {
      p.x = (Math.random() - 0.5) * 18; p.y = Math.random() * 8 - 3; p.z = (Math.random() - 0.5) * 18;
    });
    this.dust = this.makePoints(380, '#bfe4ff', 0.08, (p) => {
      p.x = (Math.random() - 0.5) * 22; p.y = Math.random() * 12 - 4; p.z = (Math.random() - 0.5) * 22;
    });

    this.apply(0);
  }

  makePoints(n, color, size, init) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) { init(p); pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({
      color, size, map: makeGlowTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    pts.frustumCulled = false;
    pts.userData.seed = Float32Array.from({ length: n }, () => Math.random());
    this.v.world.add(pts);
    return pts;
  }

  resetDrop(i, anywhere) {
    const x = (Math.random() - 0.5) * 20, z = (Math.random() - 0.5) * 20;
    const y = anywhere ? Math.random() * 12 - 3 : 9 + Math.random() * 3;
    const r = this.rainPos;
    r[i * 6] = x; r[i * 6 + 1] = y; r[i * 6 + 2] = z;
    r[i * 6 + 3] = x - 0.04; r[i * 6 + 4] = y - 0.45; r[i * 6 + 5] = z;
    this.rainSpeed[i] = 9 + Math.random() * 5;
  }

  setEnv(kind, instant = false) {
    this.target = kind || null;
    if (instant) for (const k of KINDS) this.w[k] = k === kind ? 1 : 0;
    else if (kind === 'rain') this.flash = 1; // 切り替わりの稲光
  }

  update(dt, t) {
    for (const k of KINDS) {
      const goal = k === this.target ? 1 : 0;
      this.w[k] += (goal - this.w[k]) * Math.min(1, dt * 1.1);
      if (Math.abs(goal - this.w[k]) < 0.002) this.w[k] = goal;
    }
    this.apply(dt, t || 0);
  }

  apply(dt, t = 0) {
    const v = this.v, w = this.w;
    const B = PALETTES.base;
    const rest = Math.max(0, 1 - w.scorch - w.rain - w.zerog - w.lab);
    const mixV = (key) => {
      const out = B[key].clone().multiplyScalar(rest);
      for (const k of KINDS) if (w[k]) out.addScaledVector(PALETTES[k][key], w[k]);
      return out;
    };
    const mixC = (key) => {
      const out = B[key].clone().multiplyScalar(rest);
      for (const k of KINDS) if (w[k]) { const c = PALETTES[k][key]; out.r += c.r * w[k]; out.g += c.g * w[k]; out.b += c.b * w[k]; }
      return out;
    };
    const mixN = (key) => B[key] * rest + KINDS.reduce((a, k) => a + PALETTES[k][key] * w[k], 0);

    const u = v.skyMat.uniforms;
    u.topC.value.copy(mixV('top'));
    u.midC.value.copy(mixV('mid'));
    u.lowC.value.copy(mixV('low'));
    u.aurC.value.copy(mixV('aur'));
    u.aurAmp.value = mixN('aurAmp');
    // 稲光
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.5);
    if (w.rain > 0.5 && Math.random() < dt * 0.08) this.flash = 1;
    if (w.lab > 0.5 && Math.random() < dt * 0.25) this.flash = 0.7; // 研究室: 放電の明滅
    const fl = this.flash * Math.max(w.rain, w.lab);
    u.flash.value = fl;

    v.scene.fog.color.copy(mixC('fog'));
    v.scene.fog.density = mixN('fogD');
    v.scene.background.copy(mixC('bg'));
    v.hemi.color.copy(mixC('hemi'));
    v.hemi.intensity = mixN('hemiI') + fl * 1.5;
    v.sun.color.copy(mixC('sun'));
    v.sun.intensity = mixN('sunI');
    v.runeRing.material.color.copy(mixC('ring'));
    v.motes.material.color.copy(mixC('mote'));
    v.stars.material.opacity = mixN('stars');

    // 太陽
    this.sunSprite.material.opacity = w.scorch * 0.9;
    this.sunCore.material.opacity = w.scorch;
    this.sunSprite.scale.setScalar(46 + Math.sin(t * 0.8) * 2.5);
    this.sunSprite.visible = this.sunCore.visible = w.scorch > 0.01;
    // 火の粉 (ゆっくり降りながら揺らぐ)
    this.stepPoints(this.embers, w.scorch * 0.9, dt, (pos, i, seed) => {
      pos[i * 3 + 1] -= dt * (0.4 + seed * 0.6);
      pos[i * 3] += Math.sin(t * 1.3 + seed * 20) * dt * 0.4;
      if (pos[i * 3 + 1] < -3) { pos[i * 3 + 1] = 8; pos[i * 3] = (Math.random() - 0.5) * 20; pos[i * 3 + 2] = (Math.random() - 0.5) * 20; }
    });
    // 雨
    this.rain.material.opacity = w.rain * 0.38;
    this.rain.visible = w.rain > 0.01;
    if (this.rain.visible) {
      const r = this.rainPos;
      for (let i = 0; i < this.rainSpeed.length; i++) {
        const d = this.rainSpeed[i] * dt;
        r[i * 6 + 1] -= d; r[i * 6 + 4] -= d;
        if (r[i * 6 + 4] < -3) this.resetDrop(i, false);
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    this.stepSparks(dt, t);
    // 惑星と星屑 (ゆっくり上昇し、無重力を感じさせる)
    this.planet.visible = w.zerog > 0.01;
    this.planetM.uniforms.op.value = w.zerog;
    this.planetRingM.opacity = w.zerog * 0.35;
    this.planet.rotation.y = t * 0.02;
    this.stepPoints(this.dust, w.zerog, dt, (pos, i, seed) => {
      pos[i * 3 + 1] += dt * (0.15 + seed * 0.35);
      pos[i * 3] += Math.sin(t * 0.4 + seed * 30) * dt * 0.15;
      if (pos[i * 3 + 1] > 8) { pos[i * 3 + 1] = -4; pos[i * 3] = (Math.random() - 0.5) * 22; pos[i * 3 + 2] = (Math.random() - 0.5) * 22; }
    });
  }

  stepSparks(dt, t) {
    this.stepPoints(this.sparks, this.w.lab, dt, (pos, i, seed) => {
      // ふだんはゆっくり漂い、ときどき跳ねる
      const jump = Math.sin(t * (3 + seed * 5) + seed * 40) > 0.97 ? 1.2 : 0.06;
      pos[i * 3] += (Math.random() - 0.5) * jump;
      pos[i * 3 + 1] += dt * (0.3 + seed * 0.5) + (Math.random() - 0.5) * jump * 0.5;
      pos[i * 3 + 2] += (Math.random() - 0.5) * jump;
      if (pos[i * 3 + 1] > 6 || Math.abs(pos[i * 3]) > 10 || Math.abs(pos[i * 3 + 2]) > 10) {
        pos[i * 3] = (Math.random() - 0.5) * 18; pos[i * 3 + 1] = -3; pos[i * 3 + 2] = (Math.random() - 0.5) * 18;
      }
    });
  }

  stepPoints(pts, opacity, dt, fn) {
    pts.material.opacity = opacity;
    pts.visible = opacity > 0.01;
    if (!pts.visible || !dt) return;
    const pos = pts.geometry.attributes.position.array;
    const seed = pts.userData.seed;
    for (let i = 0; i < seed.length; i++) fn(pos, i, seed[i]);
    pts.geometry.attributes.position.needsUpdate = true;
  }

  // 無重力のとき浮島の岩が浮かび上がる量 (0..1)
  get lift() { return this.w.zerog; }
}
