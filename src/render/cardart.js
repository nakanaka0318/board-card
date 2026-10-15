// カードのイラストを、盤上と同じ 3D 模型から撮影して生成する。
import * as THREE from 'three';
import { CARDS } from '../engine/cards.js';
import { buildUnitModel, MODEL_HEIGHT } from './models.js';

let ctx = null;
const cache = new Map();

function init() {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(256, 256);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#dfe6ff', '#4a3a30', 1.3));
  const key = new THREE.DirectionalLight('#fff0dc', 2.6);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#8fb0ff', 1.6);
  rim.position.set(-3, 2, -3);
  scene.add(rim);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  ctx = { r, scene, cam };
}

export function cardArt(cardId) {
  if (cache.has(cardId)) return cache.get(cardId);
  const card = CARDS[cardId];
  if (!card || (card.type !== 'unit' && card.type !== 'leader')) return null;
  try {
    if (!ctx) init();
    const { r, scene, cam } = ctx;
    const m = buildUnitModel(cardId);
    m.userData.anim(0.6);
    if (m.userData.flying) m.position.y = 0.1;
    m.rotation.y = -0.45;
    scene.add(m);
    const h = MODEL_HEIGHT[card.model] || 0.75;
    const box = new THREE.Box3().setFromObject(m);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.y, size.x * 0.9, h * 0.8);
    cam.position.set(c.x + span * 0.35, c.y + span * 0.35, c.z + span * 2.3);
    cam.lookAt(c.x, c.y + span * 0.02, c.z);
    r.render(scene, cam);
    const url = r.domElement.toDataURL('image/png');
    scene.remove(m);
    cache.set(cardId, url);
    return url;
  } catch (e) {
    console.warn('card art failed', e);
    cache.set(cardId, null);
    return null;
  }
}
