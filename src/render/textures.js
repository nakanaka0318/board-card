// キャンバスで手続き的に生成するテクスチャ群 (画像アセット不要)。
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// 簡易な値ノイズ
function noise2(seed) {
  const p = new Uint8Array(512);
  let s = seed;
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  const fade = (t) => t * t * (3 - 2 * t);
  const v = (x, y) => p[p[x & 255] + (y & 255)] / 255;
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = fade(x - xi), yf = fade(y - yi);
    const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

function fbm(n, x, y, oct = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += n(x * f, y * f) * a; a *= 0.5; f *= 2; }
  return v;
}

function hex(c) {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// 2色をノイズで混ぜたベーステクスチャ。タイル状に繰り返せるよう周期ノイズを使う
function noiseTexture(size, c1, c2, scale, seed, extra) {
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const n = noise2(seed);
  const a = hex(c1), b = hex(c2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * scale, v = (y / size) * scale;
      // 周期化: 4 隅を混ぜる
      const fx = x / size, fy = y / size;
      const val =
        fbm(n, u, v) * (1 - fx) * (1 - fy) +
        fbm(n, u - scale, v) * fx * (1 - fy) +
        fbm(n, u, v - scale) * (1 - fx) * fy +
        fbm(n, u - scale, v - scale) * fx * fy;
      const t = Math.min(1, Math.max(0, (val - 0.25) * 1.8));
      const i = (y * size + x) * 4;
      img.data[i] = a[0] + (b[0] - a[0]) * t;
      img.data[i + 1] = a[1] + (b[1] - a[1]) * t;
      img.data[i + 2] = a[2] + (b[2] - a[2]) * t;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  if (extra) extra(g, size);
  return c;
}

function rand(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function bevelFrame(g, size, color, alpha = 0.35) {
  g.strokeStyle = color;
  g.globalAlpha = alpha;
  g.lineWidth = size * 0.035;
  g.strokeRect(size * 0.02, size * 0.02, size * 0.96, size * 0.96);
  g.globalAlpha = 1;
}

export function makeTerrainTextures() {
  const S = 256;
  const out = {};
  out.plain = tex(noiseTexture(S, '#3f7a35', '#7fb04e', 5, 11, (g) => {
    const r = rand(5);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(170,210,110,0.5)' : 'rgba(40,80,30,0.45)';
      const x = r() * S, y = r() * S;
      g.fillRect(x, y, 2, 5);
    }
    for (let i = 0; i < 10; i++) {
      g.fillStyle = ['#f6e27a', '#ffffff', '#e48bd8'][i % 3];
      g.beginPath();
      g.arc(r() * S, r() * S, 2.5, 0, Math.PI * 2);
      g.fill();
    }
    bevelFrame(g, S, '#1c3a18');
  }));
  out.forest = tex(noiseTexture(S, '#1f4a26', '#4c7a3a', 6, 23, (g) => {
    const r = rand(9);
    for (let i = 0; i < 120; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(90,60,30,0.55)' : 'rgba(20,50,20,0.6)';
      g.beginPath();
      g.ellipse(r() * S, r() * S, 4, 2, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    bevelFrame(g, S, '#0e2410');
  }));
  out.water = tex(noiseTexture(S, '#1a5fa8', '#5ec8f0', 4, 37, (g) => {
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    const r = rand(3);
    for (let i = 0; i < 18; i++) {
      const x = r() * S, y = r() * S;
      g.beginPath();
      g.arc(x, y, 6 + r() * 10, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
  }));
  out.lava = tex(noiseTexture(S, '#3a0a02', '#ff7a12', 5, 51, (g) => {
    const r = rand(7);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 40; i++) {
      const x = r() * S, y = r() * S;
      const gr = g.createRadialGradient(x, y, 0, x, y, 14);
      gr.addColorStop(0, 'rgba(255,220,90,0.7)');
      gr.addColorStop(1, 'rgba(255,80,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - 14, y - 14, 28, 28);
    }
    g.globalCompositeOperation = 'source-over';
  }));
  out.crystal = tex(noiseTexture(S, '#3b3355', '#77699a', 6, 61, (g) => {
    runeCircle(g, S, '#c9a6ff', 0.8);
    bevelFrame(g, S, '#1d1530');
  }));
  out.shrine = tex(noiseTexture(S, '#cfc6b0', '#f4efe2', 7, 71, (g) => {
    runeCircle(g, S, '#e8b84a', 0.9);
    bevelFrame(g, S, '#8c7a55', 0.5);
  }));
  // 溶岩・結晶・水の発光マップ
  out.lavaEmissive = tex(noiseTexture(S, '#000000', '#ff8a20', 5, 51), true);
  out.crystalEmissive = tex((() => {
    const c = canvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    runeCircle(g, S, '#b07cff', 1);
    return c;
  })());
  out.shrineEmissive = tex((() => {
    const c = canvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    runeCircle(g, S, '#ffcf5a', 0.8);
    return c;
  })());
  for (const k of ['water', 'lava', 'lavaEmissive']) {
    out[k].wrapS = out[k].wrapT = THREE.RepeatWrapping;
  }
  return out;
}

function runeCircle(g, S, color, alpha) {
  g.save();
  g.translate(S / 2, S / 2);
  g.globalAlpha = alpha;
  g.strokeStyle = color;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, S * 0.36, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(0, 0, S * 0.3, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = a + (Math.PI * 2) / 3;
    g.beginPath();
    g.moveTo(Math.cos(a) * S * 0.3, Math.sin(a) * S * 0.3);
    g.lineTo(Math.cos(b) * S * 0.3, Math.sin(b) * S * 0.3);
    g.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.fillStyle = color;
    g.fillRect(Math.cos(a) * S * 0.33 - 2, Math.sin(a) * S * 0.33 - 2, 4, 4);
  }
  g.restore();
}

export function makeSideTexture() {
  const c = noiseTexture(128, '#2c2620', '#6b5a48', 4, 91, (g, S) => {
    const r = rand(13);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      const y = r() * S;
      g.moveTo(0, y);
      g.lineTo(S, y + (r() - 0.5) * 20);
      g.stroke();
    }
  });
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function makeBaseTexture() {
  const S = 512;
  const c = noiseTexture(S, '#1a1724', '#3a3448', 6, 101, (g) => {
    g.save();
    g.translate(S / 2, S / 2);
    g.strokeStyle = 'rgba(160,140,255,0.55)';
    g.lineWidth = 3;
    for (const r of [0.47, 0.44]) {
      g.beginPath();
      g.arc(0, 0, S * r, 0, Math.PI * 2);
      g.stroke();
    }
    g.font = 'bold 18px serif';
    g.fillStyle = 'rgba(190,170,255,0.7)';
    const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      g.save();
      g.rotate(a);
      g.fillText(runes[i % runes.length], -6, -S * 0.455 + 6);
      g.restore();
    }
    g.restore();
  });
  return tex(c);
}

// 円形のぼかし (パーティクル・グロー用)
export function makeGlowTexture() {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return tex(c, false);
}

// ハイライト用の枠テクスチャ
export function makeFrameTexture() {
  const S = 128;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.72);
  gr.addColorStop(0, 'rgba(255,255,255,0.18)');
  gr.addColorStop(1, 'rgba(255,255,255,0.55)');
  g.fillStyle = gr;
  roundRect(g, 4, 4, S - 8, S - 8, 16);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 6;
  roundRect(g, 6, 6, S - 12, S - 12, 14);
  g.stroke();
  return tex(c, false);
}

export function makeRingTexture() {
  const S = 128;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  g.strokeStyle = '#fff';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.42, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.setLineDash([10, 8]);
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.33, 0, Math.PI * 2);
  g.stroke();
  return tex(c, false);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ユニット頭上のステータス表示 (攻撃力 / HP)
export function drawBadge(c, { atk, hp, maxHp, baseAtk, color, leader, frozen }) {
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  const r = H * 0.4;
  const cy = H / 2;
  // 攻撃力
  const ax = W * 0.27;
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath(); g.arc(ax, cy + 3, r, 0, Math.PI * 2); g.fill();
  const ga = g.createLinearGradient(0, cy - r, 0, cy + r);
  ga.addColorStop(0, '#ffd27a'); ga.addColorStop(1, '#d9761c');
  g.fillStyle = ga;
  g.beginPath(); g.arc(ax, cy, r, 0, Math.PI * 2); g.fill();
  g.lineWidth = 5; g.strokeStyle = color; g.stroke();
  // HP (盾型)
  const hx = W * 0.73;
  g.fillStyle = 'rgba(0,0,0,0.55)';
  shield(g, hx, cy + 3, r * 1.05);
  g.fill();
  const gh = g.createLinearGradient(0, cy - r, 0, cy + r);
  gh.addColorStop(0, leader ? '#ff8aa0' : '#ff6a6a'); gh.addColorStop(1, leader ? '#b0204a' : '#a51c1c');
  g.fillStyle = gh;
  shield(g, hx, cy, r * 1.05);
  g.fill();
  g.lineWidth = 5; g.strokeStyle = color; g.stroke();
  g.font = `900 ${Math.round(r * 1.25)}px "Segoe UI", "Hiragino Sans", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  const atkCol = atk > baseAtk ? '#b8ff9a' : atk < baseAtk ? '#ffb0b0' : '#fff';
  g.strokeText(String(atk), ax, cy + 2);
  g.fillStyle = atkCol;
  g.fillText(String(atk), ax, cy + 2);
  const hpCol = hp < maxHp ? '#ffe28a' : '#fff';
  g.strokeText(String(hp), hx, cy + 2);
  g.fillStyle = hpCol;
  g.fillText(String(hp), hx, cy + 2);
  if (frozen) {
    g.fillStyle = 'rgba(150,220,255,0.35)';
    g.fillRect(0, 0, W, H);
  }
}

function shield(g, x, y, r) {
  g.beginPath();
  g.moveTo(x - r * 0.85, y - r * 0.8);
  g.lineTo(x + r * 0.85, y - r * 0.8);
  g.lineTo(x + r * 0.85, y + r * 0.05);
  g.quadraticCurveTo(x + r * 0.8, y + r * 0.7, x, y + r);
  g.quadraticCurveTo(x - r * 0.8, y + r * 0.7, x - r * 0.85, y + r * 0.05);
  g.closePath();
}

export function makeBadgeCanvas() {
  return canvas(192, 96);
}

export function textCanvas(text, { color = '#fff', size = 64, stroke = '#000', font = '900', width } = {}) {
  const c = canvas(width || Math.max(128, text.length * size * 0.9), size * 1.5);
  const g = c.getContext('2d');
  g.font = `${font} ${size}px "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = size * 0.16;
  g.strokeStyle = stroke;
  g.lineJoin = 'round';
  g.strokeText(text, c.width / 2, c.height / 2);
  g.fillStyle = color;
  g.fillText(text, c.width / 2, c.height / 2);
  return c;
}

export function canvasTexture(c) {
  return tex(c);
}

export function makeSkyTexture() {
  return null;
}

// 召喚陣 (外周の文字・六芒星・内円)
export function makeSummonCircleTexture() {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineWidth = 4;
  g.beginPath(); g.arc(0, 0, S * 0.46, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, S * 0.38, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(0, 0, S * 0.18, 0, Math.PI * 2); g.stroke();
  // 六芒星
  for (const off of [0, Math.PI / 3]) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = off + (i / 3) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * S * 0.38, y = Math.sin(a) * S * 0.38;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  // 外周の文字
  g.font = 'bold 15px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.save();
    g.rotate(a);
    g.fillText(runes[i % runes.length], 0, -S * 0.42);
    g.restore();
  }
  return tex(c, false);
}

// 衝撃の星形 (放射状のとげ)
export function makeStarTexture() {
  const S = 128;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  const N = 10;
  g.beginPath();
  for (let i = 0; i <= N * 2; i++) {
    const a = (i / (N * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? S * 0.5 : S * 0.12;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
  return tex(c, false);
}
