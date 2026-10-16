// エフェクト: パーティクル・浮かぶ数字・飛び道具・稲妻・衝撃波など
import * as THREE from 'three';
import { makeGlowTexture, makeRingTexture, textCanvas, canvasTexture, makeSummonCircleTexture, makeStarTexture } from './textures.js';
import { ease } from './tween.js';

const MAX = 5000;

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 4);
    this.col0 = new Float32Array(MAX * 3);
    this.col1 = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.size0 = new Float32Array(MAX);
    this.size1 = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.alive = 0;
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('pcolor', this.colAttr);
    g.setAttribute('psize', this.sizeAttr);
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: makeGlowTexture() }, scale: { value: window.innerHeight / 2 } },
      vertexShader: `
        attribute vec4 pcolor; attribute float psize; varying vec4 vC; uniform float scale;
        void main(){ vC = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = psize * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        uniform sampler2D map; varying vec4 vC;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb * 1.6, vC.a * t.a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.material = m;
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this.geometry = g;
    this.tmpC = new THREE.Color();
    this.tmpC2 = new THREE.Color();
  }

  resize(h) { this.material.uniforms.scale.value = h / 2; }

  emit(o) {
    const {
      pos, count = 20, color = '#ffffff', colorEnd, speed = [0.5, 1.5], dir = null, spread = 1,
      life = [0.5, 1], size = [0.1, 0.2], sizeEnd = 0, gravity = 0, drag = 1.5, area = 0, up = 0,
    } = o;
    const c0 = this.tmpC.set(color);
    const c1 = this.tmpC2.set(colorEnd || color);
    for (let n = 0; n < count; n++) {
      if (this.alive >= MAX) return;
      const i = this.alive++;
      const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1);
      let vx = Math.sin(b) * Math.cos(a), vy = Math.cos(b), vz = Math.sin(b) * Math.sin(a);
      if (dir) {
        vx = dir.x + vx * spread; vy = dir.y + vy * spread; vz = dir.z + vz * spread;
        const l = Math.hypot(vx, vy, vz) || 1;
        vx /= l; vy /= l; vz /= l;
      }
      const sp = speed[0] + Math.random() * (speed[1] - speed[0]);
      const r = area ? Math.sqrt(Math.random()) * area : 0;
      const ra = Math.random() * Math.PI * 2;
      this.pos[i * 3] = pos.x + Math.cos(ra) * r;
      this.pos[i * 3 + 1] = pos.y + (area ? Math.random() * 0.05 : 0);
      this.pos[i * 3 + 2] = pos.z + Math.sin(ra) * r;
      this.vel[i * 3] = vx * sp;
      this.vel[i * 3 + 1] = vy * sp + up;
      this.vel[i * 3 + 2] = vz * sp;
      this.col0[i * 3] = c0.r; this.col0[i * 3 + 1] = c0.g; this.col0[i * 3 + 2] = c0.b;
      this.col1[i * 3] = c1.r; this.col1[i * 3 + 1] = c1.g; this.col1[i * 3 + 2] = c1.b;
      const L = life[0] + Math.random() * (life[1] - life[0]);
      this.life[i] = L;
      this.maxLife[i] = L;
      const s = size[0] + Math.random() * (size[1] - size[0]);
      this.size0[i] = s;
      this.size1[i] = sizeEnd === 0 ? 0 : s * sizeEnd;
      this.grav[i] = gravity;
      this.drag[i] = drag;
    }
  }

  update(dt) {
    let n = this.alive;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        this.copy(n, i);
        i--;
        continue;
      }
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      this.col[i * 4] = this.col0[i * 3] + (this.col1[i * 3] - this.col0[i * 3]) * t;
      this.col[i * 4 + 1] = this.col0[i * 3 + 1] + (this.col1[i * 3 + 1] - this.col0[i * 3 + 1]) * t;
      this.col[i * 4 + 2] = this.col0[i * 3 + 2] + (this.col1[i * 3 + 2] - this.col0[i * 3 + 2]) * t;
      this.col[i * 4 + 3] = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
    }
    this.alive = n;
    this.geometry.setDrawRange(0, n);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }

  copy(from, to) {
    for (let k = 0; k < 3; k++) {
      this.pos[to * 3 + k] = this.pos[from * 3 + k];
      this.vel[to * 3 + k] = this.vel[from * 3 + k];
      this.col0[to * 3 + k] = this.col0[from * 3 + k];
      this.col1[to * 3 + k] = this.col1[from * 3 + k];
    }
    for (let k = 0; k < 4; k++) this.col[to * 4 + k] = this.col[from * 4 + k];
    this.size[to] = this.size[from];
    this.size0[to] = this.size0[from];
    this.size1[to] = this.size1[from];
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.grav[to] = this.grav[from];
    this.drag[to] = this.drag[from];
  }
}

export class FX {
  constructor(scene, animator) {
    this.scene = scene;
    this.anim = animator;
    this.particles = new Particles(scene);
    this.ringTex = makeRingTexture();
    this.glowTex = makeGlowTexture();
    this.lights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 6, 2);
      l.visible = false;
      scene.add(l);
      this.lights.push(l);
    }
    this.lightIdx = 0;
    this.loops = [];
  }

  update(dt) {
    this.particles.update(dt);
    for (const l of this.loops) l(dt);
  }

  burst(pos, o = {}) { this.particles.emit({ pos, ...o }); }

  flash(pos, color = '#ffffff', intensity = 8, dur = 0.4) {
    const l = this.lights[this.lightIdx++ % this.lights.length];
    l.color.set(color);
    l.position.copy(pos).add(new THREE.Vector3(0, 0.6, 0));
    l.visible = true;
    this.anim.tween(dur, (t) => { l.intensity = intensity * (1 - t); if (t >= 1) l.visible = false; }, ease.out);
  }

  floatText(pos, text, color = '#ffffff', size = 0.55, dur = 1.2) {
    const c = textCanvas(text, { color, size: 72 });
    const t = canvasTexture(c);
    const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false });
    const s = new THREE.Sprite(m);
    s.renderOrder = 30;
    const aspect = c.width / c.height;
    s.scale.set(size * aspect, size, 1);
    s.position.copy(pos);
    this.scene.add(s);
    const y0 = pos.y;
    return this.anim.tween(dur, (k, raw) => {
      s.position.y = y0 + ease.out(raw) * 0.7;
      const pop = raw < 0.15 ? 0.6 + raw / 0.15 * 0.6 : 1.2 - Math.min(0.2, (raw - 0.15));
      s.scale.set(size * aspect * pop, size * pop, 1);
      m.opacity = raw < 0.7 ? 1 : 1 - (raw - 0.7) / 0.3;
      if (raw >= 1) { this.scene.remove(s); t.dispose(); m.dispose(); }
    }, ease.linear);
  }

  // 衝撃波リング (地面と平行)
  ring(pos, color = '#ffffff', radius = 1.5, dur = 0.6) {
    const m = new THREE.MeshBasicMaterial({ map: this.ringTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(pos);
    mesh.position.y += 0.05;
    mesh.renderOrder = 9;
    this.scene.add(mesh);
    return this.anim.tween(dur, (k, raw) => {
      const r = 0.2 + k * radius * 2;
      mesh.scale.set(r, r, 1);
      m.opacity = 1 - raw;
      if (raw >= 1) { this.scene.remove(mesh); mesh.geometry.dispose(); m.dispose(); }
    }, ease.out);
  }

  // 召喚時などの光の柱
  pillar(pos, color = '#ffffff', height = 4, dur = 0.9, radius = 0.38) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const g = new THREE.CylinderGeometry(radius, radius, height, 24, 1, true);
    g.translate(0, height / 2, 0);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.copy(pos);
    mesh.renderOrder = 8;
    this.scene.add(mesh);
    return this.anim.tween(dur, (k, raw) => {
      mesh.scale.set(1 - raw * 0.6, Math.min(1, raw * 4), 1 - raw * 0.6);
      m.opacity = (1 - raw) * 0.6;
      if (raw >= 1) { this.scene.remove(mesh); g.dispose(); m.dispose(); }
    }, ease.linear);
  }

  // 空から落ちる稲妻
  lightning(pos, color = '#bfe4ff') {
    const pts = [];
    const top = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 7, (Math.random() - 0.5) * 1.5));
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const p = top.clone().lerp(pos, i / N);
      if (i > 0 && i < N) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5));
      pts.push(p);
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, linewidth: 2 });
    const line = new THREE.Line(g, m);
    line.renderOrder = 12;
    this.scene.add(line);
    // 太い光の筋 (グロー)
    const glowM = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const glowMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, top.distanceTo(pos), 6, 1, true), glowM);
    glowMesh.position.copy(top).lerp(pos, 0.5);
    glowMesh.lookAt(pos);
    glowMesh.rotateX(Math.PI / 2);
    this.scene.add(glowMesh);
    this.flash(pos, color, 14, 0.5);
    this.burst(pos, { count: 40, color: '#ffffff', colorEnd: color, speed: [1, 3], life: [0.2, 0.6], size: [0.08, 0.16], gravity: 3 });
    return this.anim.tween(0.45, (k, raw) => {
      const vis = raw < 0.6 ? Math.random() > 0.3 : raw < 0.8;
      line.visible = vis;
      m.opacity = 1 - raw;
      glowM.opacity = (1 - raw) * 0.7;
      if (raw >= 1) {
        this.scene.remove(line); this.scene.remove(glowMesh);
        g.dispose(); m.dispose(); glowMesh.geometry.dispose(); glowM.dispose();
      }
    }, ease.linear);
  }

  // 飛び道具。from/to は Vector3
  projectile(from, to, kind = 'arrow', color = '#ffffff') {
    const group = new THREE.Group();
    let trail = null;
    if (kind === 'arrow') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 5), new THREE.MeshStandardMaterial({ color: '#d8c8a0' }));
      shaft.rotation.x = Math.PI / 2;
      group.add(shaft);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 5), new THREE.MeshStandardMaterial({ color: '#cfd6de', metalness: 0.8 }));
      tip.rotation.x = Math.PI / 2;
      tip.position.z = 0.2;
      group.add(tip);
      trail = { color: '#ffffff', size: [0.03, 0.05], count: 1 };
    } else {
      const core = new THREE.Mesh(new THREE.SphereGeometry(kind === 'bolt' ? 0.07 : 0.12, 12, 10),
        new THREE.MeshBasicMaterial({ color }));
      group.add(core);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      halo.scale.setScalar(kind === 'bolt' ? 0.5 : 0.8);
      group.add(halo);
      trail = { color, size: kind === 'bolt' ? [0.06, 0.12] : [0.12, 0.24], count: 3 };
    }
    group.position.copy(from);
    this.scene.add(group);
    const d = from.distanceTo(to);
    const arc = kind === 'arrow' ? 0.25 + d * 0.12 : 0.15 + d * 0.08;
    const dur = 0.25 + d * (kind === 'arrow' ? 0.06 : 0.09);
    const prev = from.clone();
    return this.anim.tween(dur, (k, raw) => {
      const p = from.clone().lerp(to, raw);
      p.y += Math.sin(raw * Math.PI) * arc;
      group.position.copy(p);
      if (kind === 'arrow') group.lookAt(p.clone().add(p.clone().sub(prev)));
      prev.copy(p);
      if (trail) this.particles.emit({ pos: p, count: trail.count, color: trail.color, speed: [0, 0.2], life: [0.2, 0.45], size: trail.size, sizeEnd: 0.2 });
      if (raw >= 1) {
        this.scene.remove(group);
        group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      }
    }, ease.linear);
  }

  // 地面に浮かぶ召喚陣。回りながら広がり、消える
  summonCircle(pos, color = '#ffffff', radius = 0.55, dur = 1.1) {
    if (!this.circleTex) this.circleTex = makeSummonCircleTexture();
    const m = new THREE.MeshBasicMaterial({ map: this.circleTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(pos);
    mesh.position.y += 0.03;
    mesh.renderOrder = 9;
    this.scene.add(mesh);
    return this.anim.tween(dur, (k, raw) => {
      const sc = radius * 2 * (raw < 0.25 ? ease.outBack(raw / 0.25) : 1);
      mesh.scale.set(sc, sc, 1);
      mesh.rotation.z = raw * Math.PI * 1.2;
      m.opacity = raw < 0.7 ? 0.95 : 0.95 * (1 - (raw - 0.7) / 0.3);
      if (raw >= 1) { this.scene.remove(mesh); mesh.geometry.dispose(); m.dispose(); }
    }, ease.linear);
  }

  // 斬撃の軌跡 (三日月形)。dir は攻撃方向 (水平)
  slash(pos, dir, color = '#ffffff', size = 0.55) {
    const g = new THREE.RingGeometry(size * 0.72, size, 24, 1, -1.1, 2.2);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.copy(pos);
    mesh.lookAt(pos.clone().add(new THREE.Vector3(dir.x, 0, dir.z)));
    mesh.rotateZ((Math.random() - 0.5) * 1.6);
    mesh.renderOrder = 12;
    this.scene.add(mesh);
    return this.anim.tween(0.32, (k, raw) => {
      mesh.scale.setScalar(0.6 + k * 0.7);
      mesh.rotateZ(0.08);
      m.opacity = 1 - raw;
      if (raw >= 1) { this.scene.remove(mesh); g.dispose(); m.dispose(); }
    }, ease.out);
  }

  // 打撃の閃光
  impact(pos, color = '#ffffff', size = 0.9) {
    if (!this.starTex) this.starTex = makeStarTexture();
    const m = new THREE.SpriteMaterial({ map: this.starTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const sp = new THREE.Sprite(m);
    sp.position.copy(pos);
    sp.renderOrder = 25;
    this.scene.add(sp);
    const rot = Math.random() * Math.PI;
    return this.anim.tween(0.28, (k, raw) => {
      const sc = size * (0.3 + ease.out(raw) * 0.9);
      sp.scale.set(sc, sc, 1);
      m.rotation = rot + raw * 0.6;
      m.opacity = 1 - raw * raw;
      if (raw >= 1) { this.scene.remove(sp); m.dispose(); }
    }, ease.linear);
  }

  // 砕け散る破片 (重力と回転つき)
  shards(pos, colors, count = 14, floorY = pos.y) {
    const group = [];
    for (let i = 0; i < count; i++) {
      const col = colors[i % colors.length];
      const mesh = new THREE.Mesh(new THREE.TetrahedronGeometry(0.035 + Math.random() * 0.05),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, flatShading: true }));
      mesh.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.2, Math.random() * 0.4, (Math.random() - 0.5) * 0.2));
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2;
      mesh.userData.v = new THREE.Vector3(Math.cos(a) * sp, 1.5 + Math.random() * 2.5, Math.sin(a) * sp);
      mesh.userData.w = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      mesh.castShadow = true;
      this.scene.add(mesh);
      group.push(mesh);
    }
    let last = 0;
    return this.anim.tween(1.4, (k, raw) => {
      const dt = Math.max(0, raw * 1.4 - last);
      last = raw * 1.4;
      for (const m of group) {
        const v = m.userData.v;
        v.y -= 9 * dt;
        m.position.addScaledVector(v, dt);
        if (m.position.y < floorY + 0.03) { m.position.y = floorY + 0.03; v.y *= -0.35; v.x *= 0.6; v.z *= 0.6; }
        m.rotation.x += m.userData.w.x * dt;
        m.rotation.y += m.userData.w.y * dt;
        m.scale.setScalar(raw < 0.7 ? 1 : 1 - (raw - 0.7) / 0.3);
      }
      if (raw >= 1) for (const m of group) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    }, ease.linear);
  }

  // 天へ昇る魂
  soul(pos, color = '#ffffff') {
    const m = new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const sp = new THREE.Sprite(m);
    sp.position.copy(pos);
    this.scene.add(sp);
    const x0 = pos.x, z0 = pos.z;
    return this.anim.tween(1.6, (k, raw) => {
      sp.position.set(x0 + Math.sin(raw * 9) * 0.08, pos.y + raw * 1.8, z0 + Math.cos(raw * 7) * 0.06);
      sp.scale.setScalar(0.45 * (1 - raw * 0.6));
      m.opacity = raw < 0.2 ? raw / 0.2 : 1 - (raw - 0.2) / 0.8;
      if (Math.random() < 0.5) this.particles.emit({ pos: sp.position, count: 1, color, speed: [0, 0.1], life: [0.3, 0.5], size: [0.04, 0.07] });
      if (raw >= 1) { this.scene.remove(sp); m.dispose(); }
    }, ease.linear);
  }

  // 伝説級の登場時に立ちのぼる光条
  rays(pos, color = '#ffd24a', dur = 1.6) {
    const group = new THREE.Group();
    group.position.copy(pos);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 10; i++) {
      const g = new THREE.PlaneGeometry(0.12, 3.2);
      g.translate(0, 1.6, 0);
      const ray = new THREE.Mesh(g, m);
      ray.rotation.y = (i / 10) * Math.PI;
      ray.rotation.z = (Math.random() - 0.5) * 0.5;
      group.add(ray);
    }
    group.renderOrder = 8;
    this.scene.add(group);
    return this.anim.tween(dur, (k, raw) => {
      group.rotation.y = raw * 1.5;
      group.scale.set(1, Math.min(1, raw * 3), 1);
      m.opacity = raw < 0.2 ? raw / 0.2 * 0.55 : 0.55 * (1 - (raw - 0.2) / 0.8);
      if (raw >= 1) { this.scene.remove(group); group.children.forEach((c) => c.geometry.dispose()); m.dispose(); }
    }, ease.linear);
  }

  // 勝利の花火
  firework(pos, color) {
    const p = pos.clone();
    this.particles.emit({ pos: p, count: 90, color: '#ffffff', colorEnd: color, speed: [1.5, 3.2], life: [0.8, 1.4], size: [0.06, 0.12], gravity: 1.2, drag: 1.2 });
    this.flash(p, color, 8, 0.6);
  }

  // 一定時間ループするエミッター (溶岩の泡など)
  addLoop(fn) { this.loops.push(fn); }
}
