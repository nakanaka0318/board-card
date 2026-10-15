// 盤面 (7x7) の定義。y=0 が先手側 (プレイヤー)、y=6 が後手側 (AI)。
// 文字: . 平原 / F 森 / W 水辺 / L 溶岩 / C マナ結晶 / S 聖域
// 数字は高さ (0-3)。上の行が y=6。全マップ 180 度回転対称。

import { rand, randInt } from './rng.js';

const T = { '.': 'plain', F: 'forest', W: 'water', L: 'lava', C: 'crystal', S: 'shrine' };

export const MAPS = {
  classic: {
    name: '古戦場',
    desc: '中央に3つのマナ結晶。両陣の前に聖域がある標準的な戦場。',
    terrain: [
      '..F.F..',
      '.L....W',
      'F..S...',
      'CW.C.WC',
      '...S..F',
      'W....L.',
      '..F.F..',
    ],
    height: [
      '0010100',
      '0100000',
      '1021000',
      '0001000',
      '0001201',
      '0000010',
      '0010100',
    ],
  },
  highlands: {
    name: '天空の段丘',
    desc: '高低差の激しい山岳地帯。高所を制する者が戦場を制す。',
    terrain: [
      '...F...',
      '.F...C.',
      'L..W..S',
      '.F.C.F.',
      'S..W..L',
      '.C...F.',
      '...F...',
    ],
    height: [
      '0001000',
      '1200210',
      '0100120',
      '2101012',
      '0210010',
      '0120021',
      '0001000',
    ],
  },
  volcano: {
    name: '灼熱の火口',
    desc: '中央が火口となった危険な戦場。溶岩を越える覚悟はあるか。',
    terrain: [
      '.F...F.',
      '..C.C..',
      'W.LLL.S',
      '..LCL..',
      'S.LLL.W',
      '..C.C..',
      '.F...F.',
    ],
    height: [
      '0100010',
      '0011100',
      '0120210',
      '1212121',
      '0120210',
      '0011100',
      '0100010',
    ],
  },
};

export function buildMap(name, state) {
  if (name === 'random') return randomMap(state);
  const m = MAPS[name] || MAPS.classic;
  const tiles = [];
  for (let y = 0; y < 7; y++) {
    const tr = m.terrain[6 - y];
    const hr = m.height[6 - y];
    for (let x = 0; x < 7; x++) {
      tiles.push({ id: y * 7 + x, terrain: T[tr[x]], height: +hr[x] });
    }
  }
  return tiles;
}

// 180 度回転対称のランダム地形。リーダーの初期位置周辺は平坦にする。
function randomMap(s) {
  const tiles = new Array(49);
  const kinds = ['plain', 'plain', 'plain', 'plain', 'forest', 'forest', 'water', 'lava'];
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const i = y * 7 + x;
      const mi = (6 - y) * 7 + (6 - x);
      if (mi < i) {
        tiles[i] = { id: i, terrain: tiles[mi].terrain, height: tiles[mi].height };
        continue;
      }
      let terrain = kinds[randInt(s, kinds.length)];
      let height = rand(s) < 0.55 ? 0 : rand(s) < 0.7 ? 1 : 2;
      const nearHome = Math.abs(x - 3) <= 1 && (y <= 1 || y >= 5);
      if (nearHome) { terrain = 'plain'; height = 0; }
      if (y === 0 || y === 6) { if (terrain === 'lava' || terrain === 'water') terrain = 'plain'; }
      tiles[i] = { id: i, terrain, height };
    }
  }
  // 中央の結晶と、対称な結晶・聖域を配置
  const set = (x, y, t) => {
    tiles[y * 7 + x].terrain = t;
    tiles[(6 - y) * 7 + (6 - x)].terrain = t;
  };
  set(3, 3, 'crystal');
  const cx = randInt(s, 3);
  set(cx === 1 ? 0 : cx, 3, 'crystal');
  set(1 + randInt(s, 5), 2, 'shrine');
  return tiles;
}

export const MAP_LIST = [
  ...Object.entries(MAPS).map(([id, m]) => ({ id, name: m.name, desc: m.desc })),
  { id: 'random', name: 'ランダム', desc: '毎回生成される対称な地形。' },
];
