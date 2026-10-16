// プリミティブを組み合わせて作る手続き的なユニットのミニチュア模型。
// 原点が足元、+Z が正面。userData.anim(t) で待機アニメーションを行う。
import * as THREE from 'three';
import { CARDS, FACTIONS } from '../engine/cards.js';

const geoCache = new Map();
function geo(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}
const G = {
  box: (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
  sph: (r, ws = 10, hs = 8) => geo(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs)),
  cyl: (rt, rb, h, s = 10) => geo(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s)),
  cone: (r, h, s = 10) => geo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s)),
  ico: (r, d = 0) => geo(`i${r},${d}`, () => new THREE.IcosahedronGeometry(r, d)),
  dod: (r) => geo(`d${r}`, () => new THREE.DodecahedronGeometry(r, 0)),
  oct: (r) => geo(`o${r}`, () => new THREE.OctahedronGeometry(r, 0)),
  torus: (r, t, rs = 8, ts = 20, arc = Math.PI * 2) => geo(`t${r},${t},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc)),
};

const matCache = new Map();
function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.08, flatShading: true, ...o });
    matCache.set(key, m);
  }
  return m;
}
const glow = (color, intensity = 1.6) => mat(color, { emissive: color, emissiveIntensity: intensity, roughness: 0.3 });
const metal = (color) => mat(color, { metalness: 0.75, roughness: 0.35 });

function part(g, m, x = 0, y = 0, z = 0, parent) {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  if (parent) parent.add(mesh);
  return mesh;
}

function pivot(parent, x, y, z) {
  const o = new THREE.Group();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

// ---------------- 武器・装飾 ----------------

function sword(parent, color = '#d8dde6', len = 0.26) {
  const g = new THREE.Group();
  part(G.box(0.025, len, 0.012), metal(color), 0, len / 2 + 0.04, 0, g);
  part(G.box(0.09, 0.02, 0.025), metal('#b08a3a'), 0, 0.04, 0, g);
  part(G.cyl(0.012, 0.012, 0.06, 6), mat('#4a2f1a'), 0, 0.005, 0, g);
  parent.add(g);
  return g;
}

function roundShield(parent, color, accent) {
  const g = new THREE.Group();
  const s = part(G.cyl(0.11, 0.11, 0.025, 14), mat(color), 0, 0, 0, g);
  s.rotation.x = Math.PI / 2;
  const b = part(G.sph(0.035, 8, 6), metal(accent), 0, 0, 0.015, g);
  b.scale.z = 0.6;
  parent.add(g);
  return g;
}

function towerShield(parent, color, accent) {
  const g = new THREE.Group();
  part(G.box(0.2, 0.32, 0.03), mat(color), 0, 0, 0, g);
  part(G.box(0.05, 0.26, 0.035), metal(accent), 0, 0, 0.005, g);
  part(G.box(0.16, 0.04, 0.035), metal(accent), 0, 0.04, 0.005, g);
  parent.add(g);
  return g;
}

function staff(parent, orbColor, wood = '#5a3a20', len = 0.5) {
  const g = new THREE.Group();
  part(G.cyl(0.014, 0.018, len, 6), mat(wood), 0, len / 2 - 0.12, 0, g);
  const orb = part(G.ico(0.045, 1), glow(orbColor, 2.2), 0, len - 0.1, 0, g);
  part(G.torus(0.05, 0.008, 4, 12), metal('#c9a64a'), 0, len - 0.1, 0, g).rotation.x = Math.PI / 2;
  parent.add(g);
  g.userData.orb = orb;
  return g;
}

function bow(parent, color = '#7a4a24') {
  const g = new THREE.Group();
  const arc = part(G.torus(0.16, 0.012, 4, 14, Math.PI), mat(color), 0, 0, 0, g);
  arc.rotation.z = -Math.PI / 2;
  part(G.cyl(0.003, 0.003, 0.32, 3), mat('#eeeeee'), -0.0, 0, 0, g).position.x = 0;
  parent.add(g);
  return g;
}

function crown(parent, color = '#ffd34a', y = 0) {
  const g = new THREE.Group();
  part(G.cyl(0.075, 0.07, 0.04, 10), metal(color), 0, 0, 0, g);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    part(G.cone(0.018, 0.05, 4), metal(color), Math.cos(a) * 0.065, 0.04, Math.sin(a) * 0.065, g);
  }
  part(G.oct(0.018), glow('#ff3a6a', 1.5), 0, 0.005, 0.072, g);
  g.position.y = y;
  parent.add(g);
  return g;
}

// ---------------- 人型 ----------------

function humanoid(o) {
  const {
    body = '#888', armor = body, skin = '#e0b48a', legs = '#3a3530', scale = 1, robe = false,
    head = 'plain', headColor = armor, bulky = 1,
  } = o;
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  root.add(g);
  const refs = { root, g };
  if (robe) {
    part(G.cone(0.17 * bulky, 0.36, 10), mat(body), 0, 0.2, 0, g);
    part(G.cyl(0.075 * bulky, 0.1 * bulky, 0.14, 10), mat(armor), 0, 0.4, 0, g);
  } else {
    refs.legL = part(G.box(0.06, 0.18, 0.07), mat(legs), -0.05, 0.1, 0, g);
    refs.legR = part(G.box(0.06, 0.18, 0.07), mat(legs), 0.05, 0.1, 0, g);
    part(G.box(0.17 * bulky, 0.08, 0.11), mat(body), 0, 0.22, 0, g);
    part(G.box(0.19 * bulky, 0.14, 0.12 * bulky), mat(armor), 0, 0.32, 0, g);
    part(G.box(0.05, 0.035, 0.12), mat('#5a3a1e'), 0, 0.255, 0, g).scale.x = 3.6 * bulky;
  }
  // 腕 (肩を支点に回転できるように)
  refs.armL = pivot(g, -0.12 * bulky, 0.38, 0);
  refs.armR = pivot(g, 0.12 * bulky, 0.38, 0);
  part(G.box(0.05, 0.16, 0.05), mat(armor), 0, -0.07, 0, refs.armL);
  part(G.box(0.05, 0.16, 0.05), mat(armor), 0, -0.07, 0, refs.armR);
  part(G.sph(0.03, 6, 5), mat(skin), 0, -0.16, 0, refs.armL);
  part(G.sph(0.03, 6, 5), mat(skin), 0, -0.16, 0, refs.armR);
  refs.handL = pivot(refs.armL, 0, -0.16, 0.02);
  refs.handR = pivot(refs.armR, 0, -0.16, 0.02);
  // 頭
  refs.head = pivot(g, 0, 0.48, 0);
  part(G.sph(0.075, 10, 8), mat(skin), 0, 0.02, 0, refs.head);
  part(G.box(0.08, 0.015, 0.01), mat('#1a1a1a'), 0, 0.03, 0.07, refs.head);
  switch (head) {
    case 'helmet': {
      const h = part(G.sph(0.085, 10, 6, 0), metal(headColor), 0, 0.04, -0.005, refs.head);
      h.scale.set(1, 0.85, 1);
      part(G.box(0.02, 0.07, 0.02), metal(headColor), 0, 0.0, 0.08, refs.head);
      part(G.cone(0.02, 0.08, 5), mat('#c23a2a'), 0, 0.13, 0, refs.head);
      break;
    }
    case 'greathelm': {
      part(G.box(0.17, 0.17, 0.17), metal(headColor), 0, 0.03, 0, refs.head);
      part(G.box(0.12, 0.02, 0.01), mat('#111'), 0, 0.04, 0.087, refs.head);
      part(G.cone(0.03, 0.1, 4), mat('#d9b04a'), 0, 0.16, 0, refs.head);
      break;
    }
    case 'hood': {
      const h = part(G.cone(0.1, 0.2, 8), mat(headColor), 0, 0.08, -0.01, refs.head);
      h.rotation.x = -0.15;
      break;
    }
    case 'wizard': {
      part(G.cyl(0.13, 0.13, 0.015, 12), mat(headColor), 0, 0.07, 0, refs.head);
      const c = part(G.cone(0.075, 0.22, 10), mat(headColor), 0, 0.18, -0.01, refs.head);
      c.rotation.x = -0.2;
      break;
    }
    case 'horns': {
      const h = part(G.sph(0.08, 10, 6), metal(headColor), 0, 0.045, 0, refs.head);
      h.scale.set(1, 0.7, 1);
      const l = part(G.cone(0.022, 0.12, 6), mat('#efe6d0'), -0.08, 0.09, 0, refs.head);
      l.rotation.z = 0.9;
      const r = part(G.cone(0.022, 0.12, 6), mat('#efe6d0'), 0.08, 0.09, 0, refs.head);
      r.rotation.z = -0.9;
      break;
    }
    case 'antlers': {
      const h = part(G.cone(0.1, 0.17, 8), mat(headColor), 0, 0.07, -0.01, refs.head);
      h.rotation.x = -0.1;
      for (const s of [-1, 1]) {
        const a = part(G.cyl(0.008, 0.012, 0.16, 4), mat('#d8c7a0'), s * 0.07, 0.16, 0, refs.head);
        a.rotation.z = -s * 0.5;
        const b = part(G.cyl(0.006, 0.008, 0.08, 4), mat('#d8c7a0'), s * 0.1, 0.2, 0.02, refs.head);
        b.rotation.z = s * 0.4;
      }
      break;
    }
    case 'halo': {
      part(G.torus(0.09, 0.01, 4, 16), glow('#ffe38a', 1.8), 0, 0.15, -0.02, refs.head).rotation.x = Math.PI / 2.4;
      const hair = part(G.sph(0.082, 10, 6), mat('#e8e0c8'), 0, 0.035, -0.015, refs.head);
      hair.scale.set(1, 1, 1.1);
      break;
    }
    case 'redcap': {
      const c = part(G.cone(0.09, 0.2, 10), mat('#c8312b'), 0, 0.13, 0, refs.head);
      c.rotation.x = -0.25;
      const beard = part(G.cone(0.06, 0.12, 8), mat('#eeeeee'), 0, -0.05, 0.04, refs.head);
      beard.rotation.x = Math.PI;
      break;
    }
    case 'wavecrown': {
      for (let i = 0; i < 5; i++) {
        const a = -0.6 + i * 0.3;
        part(G.cone(0.02, 0.09, 4), glow('#7fe8ff', 1.2), Math.sin(a) * 0.075, 0.1, Math.cos(a) * 0.075 - 0.02, refs.head);
      }
      const hair = part(G.sph(0.08, 10, 6), mat('#2d4f7a'), 0, 0.035, -0.015, refs.head);
      hair.scale.set(1, 0.9, 1.1);
      break;
    }
    case 'elf': {
      const hair = part(G.sph(0.08, 10, 6), mat('#e8d27a'), 0, 0.035, -0.02, refs.head);
      hair.scale.set(1, 0.9, 1.15);
      for (const s of [-1, 1]) {
        const e = part(G.cone(0.015, 0.08, 4), mat(skin), s * 0.08, 0.04, -0.01, refs.head);
        e.rotation.z = -s * 1.2;
      }
      break;
    }
    case 'visor': {
      part(G.box(0.15, 0.13, 0.15), metal(headColor), 0, 0.03, 0, refs.head);
      part(G.box(0.12, 0.025, 0.01), glow('#7ff4ff', 2), 0, 0.04, 0.078, refs.head);
      part(G.cyl(0.005, 0.005, 0.1, 4), metal('#aaa'), 0.05, 0.13, 0, refs.head);
      part(G.sph(0.012, 6, 4), glow('#ff4a4a', 2), 0.05, 0.18, 0, refs.head);
      break;
    }
    default:
      part(G.sph(0.078, 10, 6), mat('#3a2a1a'), 0, 0.05, -0.015, refs.head).scale.set(1, 0.7, 1);
  }
  return refs;
}

function humanoidIdle(refs, phase = 0) {
  return (t) => {
    const s = Math.sin(t * 2 + phase);
    refs.g.position.y = Math.abs(s) * 0.004;
    refs.armL.rotation.x = -0.15 + s * 0.06;
    refs.armR.rotation.x = -0.25 - s * 0.06;
    refs.head.rotation.y = Math.sin(t * 0.7 + phase) * 0.2;
  };
}

// ---------------- 四足獣 ----------------

function quadruped(o) {
  const { body = '#777', belly = body, scale = 1, legLen = 0.16, long = 1, neck = 0.1 } = o;
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  root.add(g);
  const refs = { root, g, legs: [] };
  const torso = part(G.sph(0.13, 10, 8), mat(body), 0, legLen + 0.08, 0, g);
  torso.scale.set(0.85, 0.8, 1.6 * long);
  const under = part(G.sph(0.11, 8, 6), mat(belly), 0, legLen + 0.05, 0.02, g);
  under.scale.set(0.8, 0.6, 1.4 * long);
  for (const [x, z] of [[-0.07, 0.13 * long], [0.07, 0.13 * long], [-0.07, -0.13 * long], [0.07, -0.13 * long]]) {
    const p = pivot(g, x, legLen + 0.04, z);
    part(G.box(0.045, legLen + 0.04, 0.05), mat(body), 0, -(legLen + 0.04) / 2, 0, p);
    refs.legs.push(p);
  }
  refs.neck = pivot(g, 0, legLen + 0.12, 0.2 * long);
  const n = part(G.cyl(0.05, 0.07, 0.14 + neck, 8), mat(body), 0, 0.05, 0.02, refs.neck);
  n.rotation.x = 0.6;
  refs.headP = pivot(refs.neck, 0, 0.11 + neck * 0.6, 0.08);
  const h = part(G.box(0.1, 0.09, 0.13), mat(body), 0, 0, 0, refs.headP);
  refs.headMesh = h;
  part(G.box(0.07, 0.06, 0.08), mat(belly), 0, -0.02, 0.09, refs.headP);
  part(G.sph(0.012, 6, 4), mat('#111'), -0.035, 0.02, 0.06, refs.headP);
  part(G.sph(0.012, 6, 4), mat('#111'), 0.035, 0.02, 0.06, refs.headP);
  refs.tail = pivot(g, 0, legLen + 0.12, -0.2 * long);
  return refs;
}

function quadIdle(refs, speed = 2) {
  return (t) => {
    const s = Math.sin(t * speed);
    refs.g.position.y = s * 0.004;
    refs.headP.rotation.y = Math.sin(t * 0.8) * 0.25;
    refs.headP.rotation.x = Math.sin(t * 1.3) * 0.08;
    if (refs.tail) refs.tail.rotation.y = Math.sin(t * 3) * 0.4;
  };
}

// ---------------- アーキタイプ ----------------

function paletteOf(card) {
  return FACTIONS[card.faction] ? FACTIONS[card.faction].palette : { main: '#8a8478', accent: '#e8dcb8', dark: '#3b3a36', skin: '#e0b48a' };
}

const BUILDERS = {
  soldier(card, P) {
    const r = humanoid({ body: P.dark, armor: P.main, skin: P.skin, head: 'helmet', headColor: '#b8c0c8' });
    sword(r.handR).rotation.x = Math.PI / 2.2;
    roundShield(r.handL, P.main, P.accent).position.set(-0.03, 0.04, 0.05);
    r.root.userData.anim = humanoidIdle(r);
    return r.root;
  },
  spear(card, P) {
    const r = humanoid({ body: P.dark, armor: P.main, skin: P.skin, head: 'helmet', headColor: '#a0a8b0' });
    const sp = new THREE.Group();
    part(G.cyl(0.012, 0.012, 0.7, 6), mat('#6b4a2a'), 0, 0.2, 0, sp);
    part(G.cone(0.025, 0.1, 4), metal('#dfe4ea'), 0, 0.58, 0, sp);
    r.handR.add(sp);
    sp.rotation.x = 0.1;
    towerShield(r.handL, P.main, P.accent).position.set(-0.03, 0.08, 0.06);
    r.root.userData.anim = humanoidIdle(r, 1);
    return r.root;
  },
  knight(card, P) {
    const r = humanoid({ body: '#5a5f6a', armor: '#9aa3ae', skin: P.skin, head: 'greathelm', headColor: '#a8b0bb', bulky: 1.25, scale: 1.08 });
    sword(r.handR, '#e8eef4', 0.3).rotation.x = Math.PI / 2.4;
    towerShield(r.handL, P.main, '#e8c860').position.set(-0.04, 0.08, 0.07);
    part(G.box(0.22, 0.04, 0.02), mat(P.main), 0, 0.32, 0.065, r.g);
    r.root.userData.anim = humanoidIdle(r, 2);
    return r.root;
  },
  archer(card, P) {
    const r = humanoid({ body: '#4a3a28', armor: P.main, skin: P.skin, head: 'hood', headColor: P.dark });
    const b = bow(r.handL);
    b.position.set(0, 0, 0.04);
    b.rotation.y = Math.PI / 2;
    const q = part(G.cyl(0.03, 0.03, 0.16, 6), mat('#6b4a2a'), 0.05, 0.36, -0.08, r.g);
    q.rotation.z = 0.4;
    for (let i = 0; i < 3; i++) part(G.cyl(0.004, 0.004, 0.08, 3), mat('#eeeeee'), 0.08 + i * 0.01, 0.46, -0.08, r.g);
    r.root.userData.anim = humanoidIdle(r, 0.5);
    return r.root;
  },
  elf(card, P) {
    const r = humanoid({ body: '#2f5a2a', armor: '#5f9a4a', skin: '#efd2b0', head: 'elf', legs: '#3a4a2a' });
    const b = bow(r.handL, '#c9e8a0');
    b.position.set(0, 0, 0.04);
    b.rotation.y = Math.PI / 2;
    part(G.box(0.2, 0.2, 0.02), mat('#2a4a2a', { side: THREE.DoubleSide }), 0, 0.3, -0.08, r.g);
    r.root.userData.anim = humanoidIdle(r, 0.2);
    return r.root;
  },
  gunner(card, P) {
    const r = humanoid({ body: P.dark, armor: card.faction === 'azure' ? '#7f93b0' : P.main, skin: P.skin, head: 'visor', headColor: card.faction === 'azure' ? '#8fa3c0' : '#5a4a42' });
    const cb = new THREE.Group();
    part(G.box(0.05, 0.05, 0.24), metal('#5a6a80'), 0, 0, 0.08, cb);
    part(G.box(0.24, 0.02, 0.03), metal('#c9a64a'), 0, 0.02, 0.17, cb);
    part(G.sph(0.02, 6, 4), glow('#7ff4ff', 2), 0, 0.03, 0.02, cb);
    r.handR.add(cb);
    r.armR.rotation.x = -1.2;
    r.root.userData.anim = (t) => { r.head.rotation.y = Math.sin(t * 0.6) * 0.3; r.g.position.y = Math.abs(Math.sin(t * 2)) * 0.004; };
    return r.root;
  },
  mage(card, P) {
    const r = humanoid({ body: P.main, armor: P.dark, skin: P.skin, robe: true, head: 'wizard', headColor: P.main });
    const st = staff(r.handR, P.accent);
    st.position.y = 0.08;
    r.root.userData.anim = (t) => {
      humanoidIdle(r)(t);
      st.userData.orb.rotation.y = t * 2;
      st.userData.orb.scale.setScalar(1 + Math.sin(t * 4) * 0.12);
    };
    return r.root;
  },
  druid(card, P) {
    const r = humanoid({ body: '#4a6a32', armor: '#6b4a2a', skin: P.skin, robe: true, head: 'antlers', headColor: '#3a5a2a' });
    const st = staff(r.handR, '#9aff7a', '#4a3018', 0.55);
    st.position.y = 0.08;
    part(G.ico(0.05, 0), mat('#3f8a3a'), 0, 0.42, 0, st);
    r.root.userData.anim = (t) => { humanoidIdle(r, 1)(t); st.userData.orb.rotation.y = t; };
    return r.root;
  },
  tidemage(card, P) {
    const r = humanoid({ body: '#2a5a9a', armor: '#c9d8ea', skin: P.skin, robe: true, head: 'wavecrown' });
    const orb = part(G.ico(0.07, 1), glow('#5fd8ff', 1.8), 0, 0.62, 0.12, r.g);
    const ring = part(G.torus(0.1, 0.008, 4, 20), glow('#bff4ff', 1.5), 0, 0.62, 0.12, r.g);
    r.armL.rotation.x = -1.3;
    r.armR.rotation.x = -1.3;
    r.root.userData.anim = (t) => {
      orb.position.y = 0.62 + Math.sin(t * 2) * 0.03;
      ring.rotation.x = t * 1.5;
      ring.rotation.y = t;
      ring.position.y = orb.position.y;
    };
    return r.root;
  },
  priestess(card, P) {
    const r = humanoid({ body: '#f0ead8', armor: '#5f9a4a', skin: P.skin, robe: true, head: 'halo' });
    const st = staff(r.handR, '#ffe38a', '#e8d8a0', 0.55);
    st.position.y = 0.08;
    r.root.userData.anim = humanoidIdle(r, 2);
    return r.root;
  },
  berserker(card, P) {
    const r = humanoid({ body: P.dark, armor: P.skin, skin: P.skin, head: 'horns', headColor: '#7a7a80', legs: '#4a2a1a', bulky: 1.15 });
    for (const h of [r.handL, r.handR]) {
      const ax = new THREE.Group();
      part(G.cyl(0.01, 0.01, 0.24, 5), mat('#4a2f1a'), 0, 0.08, 0, ax);
      const blade = part(G.cyl(0.07, 0.07, 0.015, 3, 1), metal('#d0d6dc'), 0.04, 0.17, 0, ax);
      blade.rotation.x = Math.PI / 2;
      h.add(ax);
      ax.rotation.x = Math.PI / 2.4;
    }
    part(G.box(0.2, 0.06, 0.13), mat(P.main), 0, 0.37, 0, r.g);
    r.root.userData.anim = (t) => { humanoidIdle(r, 0.3)(t); r.g.rotation.y = Math.sin(t * 1.5) * 0.08; };
    return r.root;
  },
  gnome(card, P) {
    const r = humanoid({ body: '#5f8a3a', armor: '#7a5a3a', skin: '#efc49a', head: 'redcap', scale: 0.78, legs: '#4a3a2a' });
    const sh = new THREE.Group();
    part(G.cyl(0.01, 0.01, 0.22, 5), mat('#6b4a2a'), 0, 0.06, 0, sh);
    part(G.box(0.06, 0.08, 0.01), metal('#aab'), 0, 0.17, 0, sh);
    r.handR.add(sh);
    r.root.userData.anim = humanoidIdle(r, 0.8);
    return r.root;
  },
  giant(card, P) {
    const r = humanoid({ body: '#6b4a2a', armor: '#c49a7a', skin: '#c49a7a', head: 'plain', legs: '#5a4030', bulky: 1.3, scale: 1.45 });
    const club = new THREE.Group();
    part(G.cyl(0.02, 0.045, 0.32, 6), mat('#5a3a1e'), 0, 0.12, 0, club);
    for (let i = 0; i < 4; i++) part(G.cone(0.015, 0.04, 4), mat('#ccc'), Math.cos(i * 1.6) * 0.04, 0.22 + i * 0.03, Math.sin(i * 1.6) * 0.04, club);
    r.handR.add(club);
    club.rotation.x = Math.PI / 2.5;
    r.root.userData.anim = (t) => { humanoidIdle(r, 0.1)(t); r.g.position.y = Math.abs(Math.sin(t * 1.2)) * 0.01; };
    return r.root;
  },
  leader(card, P) {
    const r = humanoid({ body: P.main, armor: P.accent, skin: P.skin, robe: true, head: 'plain', scale: 1.22, bulky: 1.1 });
    crown(r.head, '#ffd34a', 0.1);
    // マント
    const cape = part(G.box(0.26, 0.4, 0.02), mat(P.dark, { side: THREE.DoubleSide }), 0, 0.24, -0.1, r.g);
    cape.rotation.x = 0.12;
    const st = staff(r.handR, P.accent, '#c9a64a', 0.6);
    st.position.y = 0.08;
    // 肩当て
    for (const s of [-1, 1]) part(G.sph(0.05, 8, 6), metal(P.accent), s * 0.12, 0.44, 0, r.g).scale.set(1.2, 0.7, 1.2);
    r.root.userData.anim = (t) => {
      humanoidIdle(r, 0)(t);
      cape.rotation.x = 0.12 + Math.sin(t * 1.7) * 0.05;
      st.userData.orb.rotation.y = t * 2;
    };
    return r.root;
  },
  cavalry(card, P) {
    const h = quadruped({ body: '#7a5a3e', belly: '#8a6a4a', legLen: 0.2, long: 1.05 });
    const tail = part(G.cone(0.03, 0.18, 6), mat('#2a1e14'), 0, -0.05, -0.04, h.tail);
    tail.rotation.x = -2.4;
    part(G.box(0.03, 0.08, 0.16), mat('#2a1e14'), 0, 0.09, -0.02, h.neck);
    // 鞍と騎手
    part(G.box(0.2, 0.04, 0.2), mat(P.main), 0, 0.37, 0, h.g);
    const rider = humanoid({ body: P.dark, armor: P.main, skin: P.skin, head: 'helmet', headColor: '#b8c0c8', scale: 0.85 });
    rider.legL.visible = rider.legR.visible = false;
    rider.root.position.set(0, 0.2, -0.02);
    h.g.add(rider.root);
    const lance = new THREE.Group();
    part(G.cone(0.025, 0.55, 6), metal('#cfd6de'), 0, 0.27, 0, lance);
    rider.handR.add(lance);
    lance.rotation.x = Math.PI / 2.1;
    const banner = part(G.box(0.002, 0.07, 0.1), mat(P.accent, { side: THREE.DoubleSide }), 0, 0.42, 0, lance);
    banner.position.z = -0.05;
    h.root.userData.anim = (t) => {
      quadIdle(h, 2.5)(t);
      h.legs[0].rotation.x = Math.sin(t * 2.5) * 0.06;
      rider.head.rotation.y = Math.sin(t * 0.6) * 0.2;
    };
    return h.root;
  },
  wolf(card, P) {
    const w = quadruped({ body: '#6a6a72', belly: '#b8b8c0', legLen: 0.11, long: 0.95 });
    for (const s of [-1, 1]) part(G.cone(0.025, 0.06, 4), mat('#5a5a62'), s * 0.035, 0.07, -0.02, w.headP);
    const snout = part(G.box(0.05, 0.04, 0.06), mat('#4a4a52'), 0, -0.01, 0.1, w.headP);
    part(G.sph(0.012, 6, 4), mat('#111'), 0, 0.0, 0.13, w.headP);
    const tail = part(G.cone(0.035, 0.18, 6), mat('#6a6a72'), 0, 0.02, -0.08, w.tail);
    tail.rotation.x = -2.2;
    part(G.sph(0.01, 6, 4), glow('#9aff7a', 3), -0.035, 0.02, 0.065, w.headP);
    part(G.sph(0.01, 6, 4), glow('#9aff7a', 3), 0.035, 0.02, 0.065, w.headP);
    w.root.userData.anim = quadIdle(w, 3);
    snout.castShadow = true;
    return w.root;
  },
  stag(card, P) {
    const w = quadruped({ body: '#d8c7a0', belly: '#f0e6cc', legLen: 0.2, long: 1.1, scale: 1.25 });
    const antlerMat = glow('#9aff9a', 1.2);
    for (const s of [-1, 1]) {
      const a = part(G.cyl(0.008, 0.012, 0.2, 4), antlerMat, s * 0.05, 0.12, -0.02, w.headP);
      a.rotation.z = -s * 0.5;
      for (let i = 0; i < 3; i++) {
        const b = part(G.cyl(0.005, 0.008, 0.09, 4), antlerMat, s * (0.07 + i * 0.03), 0.14 + i * 0.04, -0.02 + i * 0.01, w.headP);
        b.rotation.z = s * 0.6;
        b.rotation.x = 0.3;
      }
    }
    // 背中に小さな樹
    part(G.cyl(0.015, 0.02, 0.12, 5), mat('#6b4a2a'), 0, 0.38, -0.02, w.g);
    const canopy = part(G.ico(0.08, 0), mat('#4f9a3a'), 0, 0.46, -0.02, w.g);
    for (let i = 0; i < 4; i++) part(G.sph(0.012, 5, 4), glow('#ffef8a', 2), Math.cos(i * 1.6) * 0.07, 0.44 + (i % 2) * 0.04, Math.sin(i * 1.6) * 0.07 - 0.02, w.g);
    w.root.userData.anim = (t) => { quadIdle(w, 1.5)(t); canopy.rotation.y = t * 0.3; };
    return w.root;
  },
  lizard(card, P) {
    const w = quadruped({ body: '#b8421a', belly: '#f0a040', legLen: 0.07, long: 1.3, neck: -0.03 });
    w.legs.forEach((l, i) => { l.rotation.z = (i % 2 ? -1 : 1) * 0.5; });
    const tail = new THREE.Group();
    w.tail.add(tail);
    for (let i = 0; i < 4; i++) {
      const seg = part(G.sph(0.06 - i * 0.012, 8, 6), mat('#b8421a'), 0, -0.02 - i * 0.01, -0.05 - i * 0.07, tail);
      seg.scale.z = 1.5;
    }
    part(G.cone(0.03, 0.08, 5), glow('#ffcf3a', 2.5), 0, 0, -0.33, tail).rotation.x = -Math.PI / 2;
    for (let i = 0; i < 5; i++) part(G.cone(0.02, 0.06, 4), glow('#ff7a1a', 1.6), 0, 0.22, -0.15 + i * 0.07, w.g);
    w.root.userData.anim = (t) => { quadIdle(w, 2)(t); tail.rotation.y = Math.sin(t * 2.4) * 0.35; };
    return w.root;
  },
  imp(card, P) {
    const g = new THREE.Group();
    const core = new THREE.Group();
    g.add(core);
    const body = part(G.sph(0.11, 10, 8), glow('#ff6a1a', 1.8), 0, 0.3, 0, core);
    const flame = part(G.cone(0.1, 0.25, 8), glow('#ffb03a', 2.2), 0, 0.46, -0.02, core);
    const inner = part(G.cone(0.05, 0.16, 6), glow('#fff07a', 3), 0, 0.42, 0.02, core);
    for (const s of [-1, 1]) {
      part(G.sph(0.018, 6, 4), mat('#200'), s * 0.04, 0.33, 0.095, core);
      const arm = part(G.cone(0.025, 0.1, 5), glow('#ff6a1a', 1.5), s * 0.12, 0.28, 0, core);
      arm.rotation.z = s * 1.9;
    }
    g.userData.anim = (t) => {
      core.position.y = Math.sin(t * 3) * 0.03 + 0.04;
      flame.scale.set(1 + Math.sin(t * 9) * 0.1, 1 + Math.sin(t * 11) * 0.15, 1);
      inner.scale.y = 1 + Math.sin(t * 13) * 0.2;
      body.rotation.y = t;
    };
    g.userData.light = '#ff8a3a';
    return g;
  },
  golem(card, P) {
    const g = new THREE.Group();
    const core = new THREE.Group();
    g.add(core);
    const rock = mat('#3a2a26');
    const lava = glow('#ff5a12', 2.2);
    const torso = part(G.dod(0.17), rock, 0, 0.36, 0, core);
    torso.scale.set(1.1, 1, 0.9);
    part(G.ico(0.07, 0), lava, 0, 0.38, 0.12, core);
    part(G.dod(0.08), rock, 0, 0.58, 0.02, core);
    part(G.box(0.08, 0.02, 0.01), lava, 0, 0.59, 0.085, core);
    const armL = pivot(core, -0.2, 0.44, 0);
    const armR = pivot(core, 0.2, 0.44, 0);
    for (const a of [armL, armR]) {
      part(G.dod(0.07), rock, 0, -0.08, 0, a);
      part(G.dod(0.08), rock, 0, -0.2, 0.02, a);
      part(G.oct(0.03), lava, 0, -0.14, 0.05, a);
    }
    for (const s of [-1, 1]) part(G.dod(0.08), rock, s * 0.08, 0.1, 0, core);
    g.userData.anim = (t) => {
      armL.rotation.x = Math.sin(t * 1.2) * 0.1;
      armR.rotation.x = -Math.sin(t * 1.2) * 0.1;
      core.position.y = Math.abs(Math.sin(t * 1.2)) * 0.006;
      lava.emissiveIntensity = 1.8 + Math.sin(t * 3) * 0.6;
    };
    return g;
  },
  treant(card, P) {
    const g = new THREE.Group();
    const bark = mat('#5a3e26');
    const trunk = part(G.cyl(0.09, 0.14, 0.5, 7), bark, 0, 0.25, 0, g);
    const crownG = pivot(g, 0, 0.55, 0);
    const leaves = mat('#3f7d3a');
    part(G.ico(0.2, 0), leaves, 0, 0.08, 0, crownG);
    part(G.ico(0.13, 0), mat('#5f9d4a'), 0.12, 0.0, 0.05, crownG);
    part(G.ico(0.12, 0), mat('#2f6a2a'), -0.12, 0.04, -0.03, crownG);
    for (const s of [-1, 1]) {
      const br = pivot(g, s * 0.1, 0.36, 0);
      part(G.cyl(0.025, 0.04, 0.22, 5), bark, 0, 0.1, 0, br);
      br.rotation.z = -s * 1.0;
      part(G.ico(0.06, 0), leaves, 0, 0.22, 0, br);
    }
    part(G.sph(0.022, 6, 4), glow('#fff07a', 2.5), -0.04, 0.38, 0.11, g);
    part(G.sph(0.022, 6, 4), glow('#fff07a', 2.5), 0.04, 0.38, 0.11, g);
    part(G.box(0.08, 0.012, 0.01), mat('#1a120a'), 0, 0.3, 0.125, g);
    for (let i = 0; i < 4; i++) {
      const root = part(G.cone(0.04, 0.16, 4), bark, Math.cos(i * 1.57) * 0.12, 0.03, Math.sin(i * 1.57) * 0.12, g);
      root.rotation.z = Math.cos(i * 1.57) * 1.2;
      root.rotation.x = -Math.sin(i * 1.57) * 1.2;
    }
    g.userData.anim = (t) => {
      crownG.rotation.z = Math.sin(t * 0.9) * 0.05;
      crownG.rotation.x = Math.sin(t * 0.7) * 0.04;
      trunk.rotation.y = Math.sin(t * 0.5) * 0.05;
    };
    return g;
  },
  dragon(card, P) {
    const g = new THREE.Group();
    const core = new THREE.Group();
    g.add(core);
    const scale = mat('#a8221a');
    const bellyM = mat('#f0a050');
    const body = part(G.sph(0.14, 10, 8), scale, 0, 0.42, 0, core);
    body.scale.set(0.9, 0.85, 1.5);
    const belly = part(G.sph(0.11, 8, 6), bellyM, 0, 0.38, 0.03, core);
    belly.scale.set(0.8, 0.7, 1.3);
    const neck = part(G.cyl(0.05, 0.07, 0.2, 8), scale, 0, 0.55, 0.17, core);
    neck.rotation.x = 0.7;
    const head = pivot(core, 0, 0.64, 0.27);
    part(G.box(0.1, 0.08, 0.16), scale, 0, 0, 0.02, head);
    part(G.box(0.08, 0.04, 0.08), bellyM, 0, -0.035, 0.08, head);
    for (const s of [-1, 1]) {
      const h = part(G.cone(0.015, 0.09, 4), mat('#2a1a1a'), s * 0.035, 0.07, -0.04, head);
      h.rotation.x = -0.8;
      part(G.sph(0.014, 6, 4), glow('#ffef3a', 3), s * 0.04, 0.02, 0.07, head);
    }
    // 翼
    const wings = [];
    for (const s of [-1, 1]) {
      const wp = pivot(core, s * 0.09, 0.5, 0.0);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(0.42, 0.12);
      shape.lineTo(0.36, -0.04);
      shape.lineTo(0.28, -0.02);
      shape.lineTo(0.22, -0.12);
      shape.lineTo(0.14, -0.06);
      shape.lineTo(0.06, -0.14);
      shape.lineTo(0, -0.06);
      const wg = geo('dragonwing', () => new THREE.ShapeGeometry(shape));
      const wm = part(wg, mat('#6a1410', { side: THREE.DoubleSide }), 0, 0, 0, wp);
      wm.rotation.x = -Math.PI / 2;
      wm.scale.x = s;
      wings.push(wp);
    }
    // 尾
    const tail = pivot(core, 0, 0.4, -0.2);
    for (let i = 0; i < 4; i++) {
      const seg = part(G.sph(0.05 - i * 0.01, 6, 5), scale, 0, -i * 0.03, -i * 0.07, tail);
      seg.scale.z = 1.6;
    }
    part(G.cone(0.04, 0.08, 3), mat('#2a1a1a'), 0, -0.12, -0.32, tail).rotation.x = -Math.PI / 2;
    for (let i = 0; i < 4; i++) part(G.cone(0.02, 0.06, 4), mat('#2a1a1a'), 0, 0.53, 0.1 - i * 0.08, core);
    // 脚
    for (const [x, z] of [[-0.07, 0.1], [0.07, 0.1], [-0.07, -0.1], [0.07, -0.1]]) {
      part(G.box(0.04, 0.12, 0.05), scale, x, 0.28, z, core);
    }
    g.userData.anim = (t) => {
      const f = Math.sin(t * 5);
      wings[0].rotation.z = 0.2 + f * 0.45;
      wings[1].rotation.z = -0.2 - f * 0.45;
      core.position.y = 0.02 + Math.sin(t * 5 + 1) * 0.03;
      tail.rotation.y = Math.sin(t * 2) * 0.3;
      head.rotation.y = Math.sin(t * 0.8) * 0.3;
    };
    g.userData.flying = true;
    return g;
  },
  cog(card, P) {
    const g = new THREE.Group();
    const core = new THREE.Group();
    g.add(core);
    const steel = metal('#8a9bb0');
    part(G.box(0.18, 0.16, 0.14), steel, 0, 0.26, 0, core);
    part(G.box(0.12, 0.1, 0.12), metal('#6a7b90'), 0, 0.4, 0, core);
    part(G.box(0.09, 0.025, 0.01), glow('#7ff4ff', 2.2), 0, 0.41, 0.062, core);
    for (const s of [-1, 1]) {
      part(G.box(0.05, 0.14, 0.06), metal('#5a6b80'), s * 0.05, 0.09, 0, core);
      part(G.box(0.04, 0.14, 0.05), steel, s * 0.12, 0.25, 0.02, core);
    }
    const gear = new THREE.Group();
    gear.position.set(0, 0.3, -0.09);
    core.add(gear);
    part(G.cyl(0.08, 0.08, 0.025, 10), metal('#c9a64a'), 0, 0, 0, gear).rotation.x = Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const tooth = part(G.box(0.03, 0.03, 0.025), metal('#c9a64a'), Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0, gear);
      tooth.rotation.z = a;
    }
    g.userData.anim = (t) => { gear.rotation.z = t * 2; core.position.y = Math.abs(Math.sin(t * 3)) * 0.008; };
    return g;
  },
  mech(card, P) {
    const g = new THREE.Group();
    const core = new THREE.Group();
    core.scale.setScalar(1.15);
    g.add(core);
    const steel = metal('#7f8fa6');
    const dark = metal('#3a4658');
    part(G.box(0.26, 0.22, 0.18), steel, 0, 0.36, 0, core);
    part(G.box(0.16, 0.08, 0.16), dark, 0, 0.22, 0, core);
    part(G.box(0.14, 0.1, 0.13), steel, 0, 0.53, 0.01, core);
    part(G.box(0.11, 0.02, 0.01), glow('#7ff4ff', 2.4), 0, 0.54, 0.077, core);
    part(G.cyl(0.04, 0.04, 0.02, 10), glow('#7ff4ff', 2), 0, 0.38, 0.095, core).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) {
      part(G.box(0.08, 0.2, 0.1), dark, s * 0.07, 0.1, 0, core);
      part(G.box(0.1, 0.04, 0.14), steel, s * 0.07, 0.01, 0.02, core);
      const arm = pivot(core, s * 0.18, 0.42, 0);
      part(G.sph(0.06, 8, 6), steel, 0, 0, 0, arm);
      part(G.box(0.08, 0.2, 0.08), dark, 0, -0.1, 0, arm);
      if (s < 0) part(G.box(0.04, 0.26, 0.2), steel, -0.03, -0.12, 0.05, arm);
      else part(G.cyl(0.03, 0.03, 0.14, 6), dark, 0, -0.2, 0.04, arm).rotation.x = Math.PI / 2;
    }
    g.userData.anim = (t) => { core.position.y = Math.abs(Math.sin(t * 1.5)) * 0.006; core.rotation.y = Math.sin(t * 0.7) * 0.08; };
    return g;
  },
  turret(card, P) {
    const g = new THREE.Group();
    const core = new THREE.Group();
    g.add(core);
    const steel = metal('#8fa3c0');
    part(G.sph(0.13, 12, 10), steel, 0, 0.45, 0, core);
    part(G.cyl(0.035, 0.045, 0.22, 8), metal('#3a4658'), 0, 0.47, 0.15, core).rotation.x = Math.PI / 2;
    part(G.torus(0.045, 0.012, 4, 10), glow('#7ff4ff', 2.4), 0, 0.47, 0.26, core);
    part(G.sph(0.04, 8, 6), glow('#7ff4ff', 2), 0, 0.5, 0.1, core);
    const ring = new THREE.Group();
    ring.position.y = 0.45;
    core.add(ring);
    part(G.torus(0.2, 0.015, 4, 24), metal('#c9a64a'), 0, 0, 0, ring).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      part(G.box(0.06, 0.02, 0.1), steel, Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2, ring).rotation.y = -a;
    }
    const thr = part(G.cone(0.06, 0.1, 8), glow('#5fd8ff', 1.5), 0, 0.28, 0, core);
    thr.rotation.x = Math.PI;
    g.userData.anim = (t) => {
      core.position.y = Math.sin(t * 2) * 0.03 + 0.05;
      ring.rotation.y = t * 1.5;
      thr.scale.y = 1 + Math.sin(t * 15) * 0.2;
    };
    g.userData.flying = true;
    return g;
  },
  whale(card, P) {
    const g = new THREE.Group();
    const core = new THREE.Group();
    g.add(core);
    const skin = mat('#2a4f7a');
    const belly = mat('#c9e0f0');
    const body = part(G.sph(0.18, 12, 10), skin, 0, 0.5, 0, core);
    body.scale.set(0.9, 0.75, 1.7);
    const b2 = part(G.sph(0.16, 10, 8), belly, 0, 0.45, 0.04, core);
    b2.scale.set(0.8, 0.55, 1.6);
    const tail = pivot(core, 0, 0.5, -0.28);
    part(G.cone(0.08, 0.2, 6), skin, 0, 0, -0.08, tail).rotation.x = -Math.PI / 2;
    const fluke = part(G.box(0.3, 0.02, 0.08), skin, 0, 0, -0.2, tail);
    fluke.rotation.z = 0;
    for (const s of [-1, 1]) {
      const fin = part(G.box(0.16, 0.015, 0.07), skin, s * 0.17, 0.43, 0.08, core);
      fin.rotation.z = s * -0.4;
      part(G.sph(0.018, 6, 4), glow('#bff4ff', 2.5), s * 0.11, 0.53, 0.2, core);
    }
    // 背中の稲妻雲
    const cloud = new THREE.Group();
    cloud.position.y = 0.78;
    core.add(cloud);
    for (let i = 0; i < 5; i++) part(G.sph(0.06, 8, 6), mat('#d8e4f0', { transparent: true, opacity: 0.85 }), (i - 2) * 0.06, Math.sin(i) * 0.02, Math.cos(i * 2) * 0.05, cloud);
    const bolt = part(G.oct(0.03), glow('#fff27a', 3), 0, -0.04, 0, cloud);
    g.userData.anim = (t) => {
      core.position.y = 0.06 + Math.sin(t * 1.4) * 0.04;
      core.rotation.z = Math.sin(t * 1.4) * 0.05;
      tail.rotation.x = Math.sin(t * 2) * 0.25;
      cloud.rotation.y = t * 0.6;
      bolt.visible = Math.sin(t * 7) > 0.6;
    };
    g.userData.flying = true;
    return g;
  },
};

// ---------------- 拡張カードの模型 ----------------
Object.assign(BUILDERS, {
  phoenix(card, P) {
    const g = BUILDERS.dragon(card, P);
    // 竜の模型を金と炎の色に塗り替え、炎の尾を足す
    g.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.color) return;
      const hex = o.material.color.getHexString();
      if (hex === 'a8221a') o.material = glow('#ff8a1a', 0.9);
      else if (hex === '6a1410') o.material = glow('#ffcf3a', 1.4);
      else if (hex === 'f0a050') o.material = glow('#fff07a', 1.2);
    });
    g.scale.setScalar(0.85);
    const anim = g.userData.anim;
    g.userData.anim = (t) => { anim(t); };
    g.userData.flying = true;
    return g;
  },
  bear(card, P) {
    const w = quadruped({ body: '#5a3a24', belly: '#7a5234', legLen: 0.14, long: 1.05, scale: 1.35, neck: -0.04 });
    for (const sgn of [-1, 1]) part(G.sph(0.022, 6, 4), mat('#4a2e1a'), sgn * 0.04, 0.055, -0.03, w.headP);
    part(G.box(0.06, 0.05, 0.07), mat('#3a2414'), 0, -0.015, 0.09, w.headP);
    part(G.sph(0.015, 6, 4), mat('#111'), 0, 0.005, 0.13, w.headP);
    w.root.userData.anim = (t) => { quadIdle(w, 1.2)(t); w.g.rotation.z = Math.sin(t * 1.2) * 0.03; };
    return w.root;
  },
  wisp(card, P) {
    const g = new THREE.Group();
    const core = new THREE.Group();
    g.add(core);
    const body = part(G.ico(0.1, 1), glow('#9aff9a', 1.6), 0, 0.42, 0, core);
    const leaves = [];
    for (let i = 0; i < 4; i++) {
      const l = part(G.cone(0.035, 0.14, 4), mat('#4f9a3a'), 0, 0.42, 0, core);
      leaves.push(l);
    }
    for (const sgn of [-1, 1]) part(G.sph(0.016, 6, 4), mat('#103010'), sgn * 0.035, 0.44, 0.085, core);
    g.userData.anim = (t) => {
      core.position.y = Math.sin(t * 2.2) * 0.05 + 0.04;
      body.rotation.y = t;
      leaves.forEach((l, i) => {
        const a = t * 1.5 + (i * Math.PI) / 2;
        l.position.set(Math.cos(a) * 0.15, 0.42 + Math.sin(t * 3 + i) * 0.03, Math.sin(a) * 0.15);
        l.rotation.z = a;
      });
    };
    g.userData.flying = true;
    return g;
  },
  sapling(card, P) {
    const g = new THREE.Group();
    part(G.cyl(0.07, 0.09, 0.06, 8), mat('#6b4a2a'), 0, 0.03, 0, g);
    const stem = part(G.cyl(0.015, 0.02, 0.2, 5), mat('#5a3e26'), 0, 0.15, 0, g);
    const top = pivot(g, 0, 0.26, 0);
    part(G.ico(0.07, 0), mat('#6fbf4a'), 0, 0, 0, top);
    part(G.ico(0.045, 0), mat('#4f9a3a'), 0.05, -0.03, 0.02, top);
    part(G.sph(0.012, 5, 4), glow('#fff07a', 2), 0, 0.06, 0.04, top);
    g.userData.anim = (t) => { top.rotation.z = Math.sin(t * 1.5) * 0.12; stem.rotation.z = Math.sin(t * 1.5) * 0.05; };
    return g;
  },
  wall(card, P) {
    const g = new THREE.Group();
    const stone = mat('#8a8478');
    const dark = mat('#5a564e');
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 3; i++) {
        const off = r % 2 ? 0.07 : 0;
        const b = part(G.box(0.15, 0.12, 0.16), (r + i) % 2 ? stone : dark, -0.16 + i * 0.16 + off - 0.035, 0.07 + r * 0.125, 0, g);
        b.rotation.y = ((i * 7 + r * 3) % 5 - 2) * 0.03;
      }
    }
    part(G.box(0.5, 0.04, 0.2), mat('#a8a090'), 0, 0.42, 0, g);
    g.userData.anim = () => {};
    return g;
  },
  drone(card, P) {
    const g = new THREE.Group();
    const core = new THREE.Group();
    g.add(core);
    part(G.sph(0.08, 10, 8), metal('#8fa3c0'), 0, 0.4, 0, core).scale.y = 0.6;
    part(G.sph(0.03, 8, 6), glow('#ff4a4a', 2.5), 0, 0.39, 0.07, core);
    const rotors = [];
    for (const [x, z] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) {
      part(G.box(0.12, 0.012, 0.012), metal('#3a4658'), x / 2, 0.42, z / 2, core).rotation.y = Math.atan2(z, x);
      const r = part(G.cyl(0.06, 0.06, 0.006, 10), mat('#cfe8ff', { transparent: true, opacity: 0.5 }), x, 0.45, z, core);
      rotors.push(r);
    }
    g.userData.anim = (t) => { core.position.y = Math.sin(t * 3) * 0.03 + 0.04; core.rotation.y = Math.sin(t * 0.8) * 0.4; rotors.forEach((r) => { r.rotation.y = t * 20; }); };
    g.userData.flying = true;
    return g;
  },
  rogue(card, P) {
    const r = humanoid({ body: '#1e1a24', armor: '#2e2838', skin: P.skin, head: 'hood', headColor: '#141018', legs: '#1a161e' });
    for (const h of [r.handL, r.handR]) {
      const d = new THREE.Group();
      part(G.box(0.018, 0.13, 0.008), metal('#dfe4ea'), 0, 0.07, 0, d);
      part(G.box(0.05, 0.012, 0.02), metal('#8a6a2a'), 0, 0.005, 0, d);
      h.add(d);
      d.rotation.x = Math.PI / 2.2;
    }
    part(G.box(0.08, 0.015, 0.01), glow('#ff4a6a', 2), 0, 0.5, 0.075, r.g);
    r.root.userData.anim = (t) => { humanoidIdle(r, 0.4)(t); r.g.position.y = -0.02 + Math.abs(Math.sin(t * 2.5)) * 0.01; };
    return r.root;
  },
  bomber(card, P) {
    const r = humanoid({ body: P.dark, armor: P.main, skin: P.skin, head: 'redcap', scale: 0.82 });
    const bomb = new THREE.Group();
    part(G.sph(0.07, 10, 8), mat('#1a1a1e', { metalness: 0.4, roughness: 0.3 }), 0, 0, 0, bomb);
    part(G.cyl(0.008, 0.008, 0.06, 4), mat('#c9a64a'), 0, 0.08, 0, bomb);
    const spark = part(G.sph(0.018, 6, 4), glow('#ffcf3a', 3), 0, 0.115, 0, bomb);
    bomb.position.set(0.02, -0.02, 0.06);
    r.handR.add(bomb);
    r.armR.rotation.x = -0.9;
    r.root.userData.anim = (t) => { humanoidIdle(r, 0.9)(t); r.armR.rotation.x = -0.9; spark.scale.setScalar(0.7 + Math.random() * 0.8); };
    return r.root;
  },
  titan(card, P) {
    const g = BUILDERS.mech(card, P);
    g.scale.setScalar(1.3);
    return g;
  },
  elder(card, P) {
    const g = BUILDERS.treant(card, P);
    g.scale.setScalar(1.22);
    // 白い花をあしらう
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      part(G.sph(0.022, 6, 4), glow('#fff6e0', 1.2), Math.cos(a) * 0.16, 0.66 + (i % 2) * 0.05, Math.sin(a) * 0.16, g);
    }
    return g;
  },
});

// ---------------- 伝説: 奥義と環境のユニット ----------------
Object.assign(BUILDERS, {
  // 煉獄竜王: 黒曜石の鱗と溶岩の割れ目、炎の冠
  inferno(card, P) {
    const g = BUILDERS.dragon(card, P);
    g.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.color) return;
      const hex = o.material.color.getHexString();
      if (hex === 'a8221a') o.material = mat('#241414', { roughness: 0.4, metalness: 0.3 });
      else if (hex === '6a1410') o.material = mat('#ff4a12', { emissive: '#ff3a00', emissiveIntensity: 0.9, side: THREE.DoubleSide });
      else if (hex === 'f0a050') o.material = glow('#ff8a2a', 1.3);
    });
    const core = g.children[0];
    // 背中の溶岩の割れ目
    for (let i = 0; i < 5; i++) part(G.box(0.012, 0.012, 0.08), glow('#ffb03a', 2.4), (i % 2 ? 1 : -1) * 0.05, 0.5 + (i % 3) * 0.02, 0.12 - i * 0.06, core).rotation.y = (i % 2 ? 0.5 : -0.5);
    // 炎の冠
    const crownG = pivot(core, 0, 0.72, 0.27);
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + i * 0.45;
      const h = part(G.cone(0.016, 0.1 + (i === 2 ? 0.05 : 0), 4), glow('#ffcf3a', 2.2), Math.sin(a) * 0.05, 0.02, -Math.cos(a) * 0.04, crownG);
      h.rotation.x = -0.4;
    }
    // 体のまわりを巡る火球
    const orbs = [];
    for (let i = 0; i < 3; i++) orbs.push(part(G.sph(0.03, 8, 6), glow('#ff7a1a', 3), 0, 0.45, 0, g));
    g.scale.setScalar(1.3);
    const anim = g.userData.anim;
    g.userData.anim = (t) => {
      anim(t * 0.8);
      crownG.position.y = 0.72 + Math.sin(t * 4) * 0.01;
      orbs.forEach((o, i) => {
        const a = t * 1.6 + (i * Math.PI * 2) / 3;
        o.position.set(Math.cos(a) * 0.32, 0.4 + Math.sin(t * 2 + i) * 0.08, Math.sin(a) * 0.32);
        o.scale.setScalar(0.8 + Math.sin(t * 8 + i) * 0.25);
      });
    };
    g.userData.flying = true;
    return g;
  },
  // 灼天の巫女: 背に回る太陽の円環、太陽の杖
  sunpriest(card, P) {
    const r = humanoid({ body: '#a8241a', armor: '#d8a03a', skin: P.skin, robe: true, head: 'halo', headColor: '#ffcf3a' });
    const disc = pivot(r.g, 0, 0.42, -0.1);
    part(G.torus(0.2, 0.018, 6, 32), glow('#ffb03a', 2.2), 0, 0, 0, disc);
    part(G.torus(0.14, 0.008, 4, 24), glow('#fff07a', 2.6), 0, 0, 0, disc);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const sp = part(G.cone(0.02, 0.08, 4), glow('#ff8a1a', 2), Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0, disc);
      sp.rotation.z = a - Math.PI / 2;
    }
    const staff = new THREE.Group();
    part(G.cyl(0.012, 0.014, 0.5, 6), metal('#c9a64a'), 0, 0.1, 0, staff);
    const orb = part(G.sph(0.045, 10, 8), glow('#fff2a0', 3), 0, 0.38, 0, staff);
    r.handR.add(staff);
    r.armR.rotation.x = -0.35;
    r.root.userData.anim = (t) => {
      humanoidIdle(r, 0.3)(t);
      r.armR.rotation.x = -0.35;
      disc.rotation.z = t * 0.6;
      orb.scale.setScalar(1 + Math.sin(t * 3) * 0.15);
    };
    return r.root;
  },
  // 世界樹の化身: 太い幹と根、幾重もの樹冠、金色の果実
  worldtree(card, P) {
    const g = new THREE.Group();
    const bark = mat('#5a3a22');
    const trunk = part(G.cyl(0.08, 0.15, 0.6, 9), bark, 0, 0.3, 0, g);
    trunk.rotation.y = 0.3;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const root = part(G.cone(0.05, 0.28, 5), bark, Math.cos(a) * 0.14, 0.05, Math.sin(a) * 0.14, g);
      root.rotation.z = Math.cos(a) * 1.25;
      root.rotation.x = -Math.sin(a) * 1.25;
    }
    // 顔
    for (const sgn of [-1, 1]) part(G.sph(0.022, 6, 4), glow('#b8ff7a', 2.5), sgn * 0.04, 0.42, 0.085, g);
    part(G.box(0.07, 0.012, 0.01), mat('#2a1a0e'), 0, 0.36, 0.09, g);
    const crown = pivot(g, 0, 0.72, 0);
    const greens = ['#2f7a2a', '#3f9a34', '#5fbf4a', '#7fd85a'];
    const blobs = [[0, 0, 0, 0.26], [0.17, -0.06, 0.05, 0.17], [-0.17, -0.05, -0.04, 0.18], [0.04, 0.16, -0.03, 0.17], [-0.06, -0.02, 0.17, 0.15], [0.05, -0.04, -0.18, 0.15]];
    blobs.forEach(([x, y, z, r], i) => part(G.ico(r, 1), mat(greens[i % greens.length]), x, y, z, crown));
    const fruits = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      fruits.push(part(G.sph(0.025, 6, 5), glow('#ffd84a', 2), Math.cos(a) * 0.24, -0.08 + (i % 3) * 0.08, Math.sin(a) * 0.24, crown));
    }
    // 舞う葉
    const leaves = [];
    for (let i = 0; i < 5; i++) leaves.push(part(G.cone(0.02, 0.06, 3), glow('#9aff7a', 1.2), 0, 0, 0, g));
    g.userData.anim = (t) => {
      crown.rotation.y = Math.sin(t * 0.4) * 0.12;
      crown.position.y = 0.72 + Math.sin(t * 0.9) * 0.012;
      fruits.forEach((f, i) => f.scale.setScalar(0.85 + Math.sin(t * 2 + i) * 0.2));
      leaves.forEach((l, i) => {
        const a = t * 0.7 + (i * Math.PI * 2) / 5;
        l.position.set(Math.cos(a) * 0.38, 0.35 + ((t * 0.25 + i * 0.2) % 1) * 0.6, Math.sin(a) * 0.38);
        l.rotation.set(t * 2 + i, t + i, 0);
      });
    };
    g.scale.setScalar(1.15);
    return g;
  },
  // 霧雨の精霊王: 雲の冠から雨を降らす水の精霊
  rainlord(card, P) {
    const g = new THREE.Group();
    const core = new THREE.Group();
    g.add(core);
    const water = mat('#5fd0c8', { transparent: true, opacity: 0.75, emissive: '#1a8a7a', emissiveIntensity: 0.6, roughness: 0.2 });
    const body = part(G.cone(0.13, 0.36, 10), water, 0, 0.36, 0, core);
    body.rotation.x = Math.PI;
    part(G.sph(0.08, 10, 8), water, 0, 0.6, 0, core);
    for (const sgn of [-1, 1]) {
      part(G.sph(0.016, 6, 4), glow('#e8fff8', 3), sgn * 0.03, 0.62, 0.065, core);
      const arm = part(G.cone(0.03, 0.2, 6), water, sgn * 0.13, 0.46, 0, core);
      arm.rotation.z = sgn * 2.1;
    }
    // 葉の冠と雲
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const l = part(G.cone(0.02, 0.07, 3), mat('#4fbf5a'), Math.cos(a) * 0.07, 0.67, Math.sin(a) * 0.07, core);
      l.rotation.z = Math.cos(a) * 0.6; l.rotation.x = -Math.sin(a) * 0.6;
    }
    const cloud = pivot(core, 0, 0.86, 0);
    const cm = mat('#eef6f8', { transparent: true, opacity: 0.9 });
    for (let i = 0; i < 7; i++) part(G.sph(0.06 + (i % 3) * 0.015, 8, 6), cm, Math.cos(i * 0.9) * 0.1, Math.sin(i * 1.7) * 0.02, Math.sin(i * 0.9) * 0.08, cloud);
    const drops = [];
    for (let i = 0; i < 9; i++) drops.push(part(G.cyl(0.004, 0.004, 0.05, 3), glow('#bfefff', 1.5), 0, 0, 0, core));
    g.userData.anim = (t) => {
      core.position.y = 0.05 + Math.sin(t * 1.6) * 0.035;
      cloud.rotation.y = t * 0.5;
      body.rotation.y = t * 0.3;
      drops.forEach((d, i) => {
        const k = (t * 0.9 + i / drops.length) % 1;
        const a = i * 2.4;
        d.position.set(Math.cos(a) * 0.1, 0.82 - k * 0.8, Math.sin(a) * 0.08);
        d.visible = k < 0.95;
      });
    };
    g.userData.flying = true;
    return g;
  },
  // 天穹機神: 光輪と浮遊する翼板を従えた巨大な機神
  astra(card, P) {
    const g = BUILDERS.mech(card, P);
    g.scale.setScalar(1.25);
    const halo = pivot(g, 0, 0.62, -0.12);
    part(G.torus(0.2, 0.012, 4, 36), glow('#7fe8ff', 2.4), 0, 0, 0, halo);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      part(G.oct(0.022), glow('#d8f8ff', 2.4), Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0, halo);
    }
    const plates = [];
    for (let i = 0; i < 4; i++) {
      const pl = part(G.box(0.03, 0.16, 0.08), metal('#c8d4e8'), 0, 0, 0, g);
      part(G.box(0.012, 0.12, 0.012), glow('#7ff4ff', 2), 0.02, 0, 0, pl);
      plates.push(pl);
    }
    const anim = g.userData.anim;
    g.userData.anim = (t) => {
      anim(t);
      halo.rotation.z = t * 0.5;
      plates.forEach((p, i) => {
        const a = t * 0.8 + (i * Math.PI) / 2;
        p.position.set(Math.cos(a) * 0.3, 0.45 + Math.sin(t * 2 + i) * 0.04, Math.sin(a) * 0.3);
        p.rotation.y = -a;
      });
    };
    return g;
  },
  // 星海の観測者: 三日月の杖と、まわりを巡る小さな惑星
  stargazer(card, P) {
    const r = humanoid({ body: '#1a2050', armor: '#2c3a80', skin: P.skin, robe: true, head: 'wizard', headColor: '#141a40' });
    for (let i = 0; i < 6; i++) part(G.oct(0.01), glow('#fff6c0', 2.5), Math.cos(i) * 0.12, 0.12 + i * 0.04, Math.sin(i * 2) * 0.12 + 0.05, r.g);
    const staff = new THREE.Group();
    part(G.cyl(0.01, 0.012, 0.5, 6), mat('#c8d0e8', { metalness: 0.6 }), 0, 0.1, 0, staff);
    const moon = part(G.torus(0.05, 0.012, 4, 16, Math.PI * 1.3), glow('#fff2b0', 2.4), 0, 0.4, 0, staff);
    moon.rotation.z = 0.8;
    r.handR.add(staff);
    r.armR.rotation.x = -0.3;
    const planets = [['#ff9a6a', 0.035, 0.26, 1.1], ['#7fd8ff', 0.028, 0.34, 0.7], ['#d8a8ff', 0.022, 0.2, 1.6]].map(([c, rad, d, sp]) => {
      const o = part(G.sph(rad, 10, 8), glow(c, 1.2), 0, 0, 0, r.root);
      o.userData = { d, sp };
      return o;
    });
    const orbitRing = part(G.torus(0.3, 0.003, 3, 48), glow('#9fb8ff', 1.2), 0, 0.42, 0, r.root);
    orbitRing.rotation.x = Math.PI / 2.4;
    r.root.userData.anim = (t) => {
      humanoidIdle(r, 0.7)(t);
      r.armR.rotation.x = -0.3;
      moon.rotation.y = t;
      planets.forEach((p, i) => {
        const a = t * p.userData.sp + i * 2;
        p.position.set(Math.cos(a) * p.userData.d, 0.42 + Math.sin(a) * p.userData.d * 0.35 + i * 0.03, Math.sin(a) * p.userData.d);
      });
    };
    return r.root;
  },
});

/** カード ID と陣営の色からユニット模型を生成する */
export function buildUnitModel(cardId) {
  const card = CARDS[cardId];
  const P = paletteOf(card);
  const b = BUILDERS[card.model] || BUILDERS.soldier;
  const m = b(card, P);
  m.userData.anim = m.userData.anim || (() => {});
  // 影
  m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return m;
}

/** チームカラーの台座 */
export function buildBase(teamColor) {
  const g = new THREE.Group();
  const disc = part(G.cyl(0.36, 0.38, 0.05, 24), mat('#22202a', { metalness: 0.4, roughness: 0.4 }), 0, 0.025, 0, g);
  disc.receiveShadow = true;
  const ringMat = new THREE.MeshStandardMaterial({ color: teamColor, emissive: teamColor, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.2 });
  const ring = new THREE.Mesh(G.torus(0.36, 0.022, 6, 32), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.05;
  g.add(ring);
  g.userData.ringMat = ringMat;
  return g;
}

export const MODEL_HEIGHT = {
  dragon: 0.85, whale: 0.95, turret: 0.75, giant: 1.05, leader: 0.95, treant: 0.95, stag: 0.95, knight: 0.82,
  imp: 0.75, golem: 0.8, mech: 0.85, cavalry: 0.85, wolf: 0.55, lizard: 0.5, gnome: 0.6, cog: 0.6,
  phoenix: 0.75, bear: 0.8, wisp: 0.65, sapling: 0.4, wall: 0.5, drone: 0.6, bomber: 0.6, titan: 1.1, elder: 1.15,
  inferno: 1.05, sunpriest: 0.8, worldtree: 1.3, rainlord: 1.05, astra: 1.1, stargazer: 0.8,
};
