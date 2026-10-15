// デッキの保存と選択 (ブラウザの localStorage に保存。使えない環境でも動く)
import { PRESETS, validateDeck, DECK_SIZE } from '../engine/cards.js';

const KEY = 'arcana-decks-v1';
export const SLOT_COUNT = 3;

function emptyData() {
  const d = {};
  for (const f of Object.keys(PRESETS)) {
    d[f] = Array.from({ length: SLOT_COUNT }, (_, i) => ({ id: `${f}_my${i + 1}`, name: `マイデッキ${i + 1}`, cards: [] }));
  }
  return d;
}

let cache = null;

export function loadCustom() {
  if (cache) return cache;
  cache = emptyData();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw) {
      for (const f of Object.keys(cache)) {
        (raw[f] || []).forEach((slot, i) => {
          if (cache[f][i] && slot && Array.isArray(slot.cards)) {
            cache[f][i].name = String(slot.name || cache[f][i].name).slice(0, 16);
            cache[f][i].cards = slot.cards.filter((x) => typeof x === 'string');
          }
        });
      }
    }
  } catch { /* 保存データが壊れていても初期状態で続行 */ }
  return cache;
}

export function saveCustom() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* 保存できない環境 */ }
}

/** 勢力ごとの選択肢: 構築済み + マイデッキ */
export function deckOptions(faction) {
  const out = PRESETS[faction].map((p) => ({ ...p, preset: true, valid: true }));
  for (const slot of loadCustom()[faction]) {
    out.push({ ...slot, preset: false, desc: '', valid: validateDeck(faction, slot.cards).length === 0 });
  }
  return out;
}

export function findDeck(faction, id) {
  return deckOptions(faction).find((d) => d.id === id) || null;
}

/** 実際に使うデッキ。未完成のマイデッキなら構築済みの 1 つ目にする */
export function resolveDeck(faction, id) {
  const d = findDeck(faction, id);
  if (d && d.valid) return d;
  return { ...PRESETS[faction][0], preset: true, valid: true };
}

export function randomPreset(faction) {
  const list = PRESETS[faction];
  return list[Math.floor(Math.random() * list.length)];
}

export { DECK_SIZE };
