// ゲームのルールエンジン。描画には一切依存しない純粋なロジック。
// applyAction(state, action) が状態を書き換え、state.events (配列なら) に
// 演出用のイベントを積む。AI のシミュレーションでは events = null で高速に回す。

import { CARDS, FACTIONS, DECKS, TERRAIN, ENVIRONMENTS } from './cards.js';
import { buildMap } from './maps.js';
import { rand, randInt, shuffle, pick } from './rng.js';

export const W = 7;
export const H = 7;
export const MAX_HEIGHT = 3;
export const MAX_MANA = 10;
export const HAND_LIMIT = 9;
export const TECTONIC_PERIOD = 3;
export const LAVA_DAMAGE = 2;
export const SHRINE_HEAL = 2;
export const SIEGE_DAMAGE = 1;
// 指揮力: 1 ターンにユニットを動かせる回数。移動 1・攻撃 1 を消費する
export const COMMAND_POINTS = 3;
export const inEnemyHome = (p, y) => (p === 0 ? y >= H - 2 : y <= 1);

export const idx = (x, y) => y * W + x;
export const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
export const dist = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ------------------------------------------------------------------
// 生成と複製
// ------------------------------------------------------------------

export function createGame(opts) {
  const { factions, seed = 12345, first = 0, map = 'classic' } = opts;
  const s = {
    rng: seed | 0,
    tiles: null,
    units: [],
    players: [],
    current: first,
    first,
    turn: 0,
    round: 0,
    tectonicIn: TECTONIC_PERIOD,
    tectonicCount: 0,
    nextUid: 1,
    winner: null,
    events: [],
    sim: false,
    envKind: null,
    envSeq: 0,
    stats: [newStats(), newStats()],
  };
  s.tiles = buildMap(map, s);
  for (let p = 0; p < 2; p++) {
    const f = factions[p];
    const list = (opts.decks && opts.decks[p]) || DECKS[f];
    const deck = shuffle(s, list.slice());
    s.players.push({ faction: f, deck, deckList: list.slice(), hand: [], mana: 0, maxMana: 0, cp: COMMAND_POINTS, heroUsed: false, fatigue: 0, leader: 0 });
    const L = makeUnit(s, p, 'leader_' + f, 3, p === 0 ? 0 : H - 1);
    L.leader = true;
    L.sick = false;
    s.units.push(L);
    s.players[p].leader = L.uid;
  }
  // 先手 3 枚、後手 4 枚。ターン開始時にさらに 1 枚引く (opts.coin で後手にマナの欠片)。
  drawCards(s, first, 3);
  drawCards(s, 1 - first, 4);
  if (opts.coin) addToHand(s, 1 - first, 'coin');
  emit(s, { type: 'gameStart' });
  startTurn(s);
  return s;
}

function newStats() {
  return { damage: 0, kills: 0, cards: 0, summons: 0, fields: 0 };
}

export function cloneState(s) {
  const t = {
    rng: s.rng,
    tiles: s.tiles.map((x) => ({ id: x.id, terrain: x.terrain, height: x.height })),
    units: s.units.map((u) => ({ ...u, kw: u.kw })),
    players: s.players.map((p) => ({ ...p, deck: p.deck.slice(), hand: p.hand.map((h) => ({ ...h })) })),
    current: s.current,
    first: s.first,
    turn: s.turn,
    round: s.round,
    tectonicIn: s.tectonicIn,
    tectonicCount: s.tectonicCount,
    nextUid: s.nextUid,
    winner: s.winner,
    events: null,
    sim: true,
    envKind: s.envKind,
    envSeq: s.envSeq,
    stats: [newStats(), newStats()],
  };
  return t;
}

function makeUnit(s, owner, cardId, x, y) {
  const c = CARDS[cardId];
  return {
    uid: s.nextUid++,
    owner,
    cardId,
    atk: c.atk,
    hp: c.hp,
    maxHp: c.hp,
    move: c.move,
    range: c.range || 1,
    armor: c.armor || 0,
    regen: c.regen || 0,
    kw: c.keywords || [],
    x,
    y,
    moved: false,
    attacked: false,
    sick: !(c.keywords || []).includes('haste'),
    frozen: false,
    leader: false,
    skillUsed: false,
  };
}

// ------------------------------------------------------------------
// 参照系ユーティリティ
// ------------------------------------------------------------------

export const tileAt = (s, x, y) => s.tiles[idx(x, y)];
export const has = (u, k) => u.kw.includes(k);
export const unitAt = (s, x, y) => {
  for (const u of s.units) if (u.x === x && u.y === y && u.hp > 0) return u;
  return null;
};
export const unitById = (s, uid) => s.units.find((u) => u.uid === uid && u.hp > 0) || null;
export const leaderOf = (s, p) => s.units.find((u) => u.uid === s.players[p].leader);
export const isFlying = (u) => u.kw.includes('flying');
export const ignoresLava = (u) => u.kw.includes('flying') || u.kw.includes('lavaWalk');

export function effAtkAt(s, u, x, y) {
  let a = u.atk;
  const t = tileAt(s, x, y);
  if (t.terrain === 'forest' && has(u, 'forestKin')) a += 1;
  if (t.terrain === 'water' && !isFlying(u)) a -= 1;
  if (s.envKind === 'scorch') a += 1;
  return Math.max(0, a);
}
export const effAtk = (s, u) => effAtkAt(s, u, u.x, u.y);

export function effRangeAt(s, u, x, y) {
  let r = u.range;
  if (r >= 2 && tileAt(s, x, y).height >= 2) r += 1;
  return r;
}

// 攻撃者が (ax,ay) から 防御者 (dx,dy) を攻撃したときのダメージ
export function calcDamage(s, att, ax, ay, def, dx, dy) {
  let d = effAtkAt(s, att, ax, ay);
  if (d <= 0) return 0;
  const ha = tileAt(s, ax, ay).height;
  const hd = tileAt(s, dx, dy).height;
  if (ha > hd) d += 1;
  if (dist(ax, ay, dx, dy) >= 2 && tileAt(s, dx, dy).terrain === 'forest') d -= 1;
  d -= def.armor;
  return Math.max(0, d);
}

// 攻撃の予測 (UI の予報表示と AI 用)
export function forecast(s, att, ax, ay, def) {
  const dmg = calcDamage(s, att, ax, ay, def, def.x, def.y);
  const kills = dmg >= def.hp;
  let counter = 0;
  if (!kills && canCounter(s, def, ax, ay)) counter = calcDamage(s, def, def.x, def.y, att, ax, ay);
  return { dmg, kills, counter, dies: counter >= att.hp };
}

function canCounter(s, def, ax, ay) {
  if (def.frozen) return false;
  return dist(def.x, def.y, ax, ay) <= effRangeAt(s, def, def.x, def.y);
}

export function canAct(s, u) {
  return u.owner === s.current && !u.sick && !u.frozen && s.winner === null;
}
export const cpOf = (s, p) => s.players[p].cp ?? COMMAND_POINTS;
// 将の移動は指揮力を使わない
export const moveCp = (u) => (u.leader ? 0 : 1);
export const canSkill = (s, u) => !!(u && CARDS[u.cardId].skill) && canAct(s, u) && !u.attacked && !u.skillUsed && cpOf(s, u.owner) >= 1;
export const canMove = (s, u) => canAct(s, u) && !u.moved && !u.attacked && cpOf(s, u.owner) >= moveCp(u);
export const canAttack = (s, u) => canAct(s, u) && !u.attacked && effAtk(s, u) > 0 && cpOf(s, u.owner) >= 1;

// ガード (ZOC) マップ: owner にとって「敵の守護ユニットに隣接」するマス
function zocMap(s, owner) {
  const z = new Uint8Array(W * H);
  for (const g of s.units) {
    if (g.hp <= 0 || g.owner === owner || !g.kw.includes('guard')) continue;
    for (const [dx, dy] of DIRS4) {
      const x = g.x + dx, y = g.y + dy;
      if (inBounds(x, y)) z[idx(x, y)] = 1;
    }
  }
  return z;
}

export function moveCost(s, u, fx, fy, tx, ty) {
  if (isFlying(u)) return 1;
  const a = tileAt(s, fx, fy), b = tileAt(s, tx, ty);
  const dh = b.height - a.height;
  if ((dh >= 2 || dh <= -2) && s.envKind !== 'zerog') return Infinity;
  if (u.leader) return 1; // 将は地形・1段の段差の影響を受けない
  return TERRAIN[b.terrain].cost + (dh >= 1 ? 1 : 0);
}

// ダイクストラ法で移動可能範囲を求める。
// 戻り値: { cost: Float32Array, prev: Int16Array, tiles: [idx...] (停止可能マス) }
// 環境「無重力の星海」で移動力+1 (動けないユニットは除く)
export const moveOf = (s, u) => (u.move > 0 && s.envKind === 'zerog' ? u.move + 1 : u.move);

export function reachable(s, u, budget = moveOf(s, u)) {
  const N = W * H;
  const cost = new Float32Array(N).fill(Infinity);
  const prev = new Int16Array(N).fill(-1);
  const done = new Uint8Array(N);
  const occ = new Int8Array(N).fill(-1);
  for (const o of s.units) if (o.hp > 0) occ[idx(o.x, o.y)] = o.owner;
  const fly = isFlying(u);
  const zoc = fly ? null : zocMap(s, u.owner);
  const start = idx(u.x, u.y);
  cost[start] = 0;
  for (;;) {
    let n = -1, best = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && cost[i] < best) { best = cost[i]; n = i; }
    if (n < 0) break;
    done[n] = 1;
    if (n !== start && zoc && zoc[n]) continue; // 守護に隣接したらそこで停止
    const nx = n % W, ny = (n / W) | 0;
    for (const [dx, dy] of DIRS4) {
      const mx = nx + dx, my = ny + dy;
      if (!inBounds(mx, my)) continue;
      const m = idx(mx, my);
      if (!fly && occ[m] >= 0 && occ[m] !== u.owner) continue; // 敵はすり抜けられない
      const c = best + moveCost(s, u, nx, ny, mx, my);
      if (c <= budget && c < cost[m]) { cost[m] = c; prev[m] = n; }
    }
  }
  const tiles = [];
  for (let i = 0; i < N; i++) if (i !== start && cost[i] <= budget && occ[i] < 0) tiles.push(i);
  return { cost, prev, tiles };
}

export function pathTo(r, from, to) {
  const path = [];
  let n = to;
  while (n !== -1 && n !== from) { path.push(n); n = r.prev[n]; }
  path.reverse();
  return path.map((i) => ({ x: i % W, y: (i / W) | 0 }));
}

// (x,y) にいると仮定したユニットが攻撃できる敵
export function targetsFrom(s, u, x, y) {
  const r = effRangeAt(s, u, x, y);
  const out = [];
  for (const e of s.units) {
    if (e.hp <= 0 || e.owner === u.owner) continue;
    if (dist(x, y, e.x, e.y) <= r) out.push(e);
  }
  return out;
}

// ------------------------------------------------------------------
// カードの対象
// ------------------------------------------------------------------

export function summonTiles(s, p) {
  const L = leaderOf(s, p);
  const out = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (unitAt(s, x, y)) continue;
      const home = p === 0 ? y <= 1 : y >= H - 2;
      const nearLeader = Math.max(Math.abs(x - L.x), Math.abs(y - L.y)) <= 1;
      if (home || nearLeader) out.push({ x, y });
    }
  }
  return out;
}

// target 種別ごとの有効な対象マス一覧
export function targetsFor(s, p, kind) {
  const out = [];
  const L = leaderOf(s, p);
  const units = s.units.filter((u) => u.hp > 0);
  switch (kind) {
    case 'summon':
      return summonTiles(s, p);
    case 'enemyUnit':
      for (const u of units) if (u.owner !== p && !u.leader) out.push({ x: u.x, y: u.y });
      return out;
    case 'enemyAny':
      for (const u of units) if (u.owner !== p) out.push({ x: u.x, y: u.y });
      return out;
    case 'friendlyUnit':
      for (const u of units) if (u.owner === p && !u.leader) out.push({ x: u.x, y: u.y });
      return out;
    case 'friendlyAny':
      for (const u of units) if (u.owner === p) out.push({ x: u.x, y: u.y });
      return out;
    case 'heroEnemy3':
      for (const u of units) if (u.owner !== p && dist(u.x, u.y, L.x, L.y) <= 3) out.push({ x: u.x, y: u.y });
      return out;
    case 'heroPush3':
      for (const u of units) if (u.owner !== p && !u.leader && dist(u.x, u.y, L.x, L.y) <= 3) out.push({ x: u.x, y: u.y });
      return out;
    case 'tile':
    case 'row':
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out.push({ x, y });
      return out;
    case 'block':
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) out.push({ x, y });
      return out;
    default:
      return out;
  }
}

export function cardTargets(s, p, cardId) {
  const c = CARDS[cardId];
  if (c.type === 'unit') return summonTiles(s, p);
  if (!c.target) return null;
  return targetsFor(s, p, c.target);
}

export function canPlay(s, p, handCard) {
  if (s.winner !== null || s.current !== p || !handCard.cardId) return false;
  const c = CARDS[handCard.cardId];
  if (c.cost > s.players[p].mana) return false;
  const t = cardTargets(s, p, handCard.cardId);
  return t === null || t.length > 0;
}

export function canHero(s, p) {
  const pl = s.players[p];
  const h = FACTIONS[pl.faction].hero;
  return s.winner === null && s.current === p && !pl.heroUsed && pl.mana >= h.cost && targetsFor(s, p, h.target).length > 0;
}

// ------------------------------------------------------------------
// イベント・状態変化 (効果 API)
// ------------------------------------------------------------------

function emit(s, e) {
  if (s.events) s.events.push(e);
}

function snapshotUnit(u) {
  return {
    uid: u.uid, owner: u.owner, cardId: u.cardId, atk: u.atk, hp: u.hp, maxHp: u.maxHp,
    x: u.x, y: u.y, leader: u.leader, sick: u.sick, frozen: u.frozen,
  };
}

function damage(s, u, amount, source, attacker) {
  if (u.hp <= 0 || amount <= 0) {
    if (u.hp > 0) emit(s, { type: 'damage', uid: u.uid, amount: 0, hp: u.hp, source });
    return 0;
  }
  u.hp -= amount;
  if (attacker !== undefined) s.stats[attacker].damage += amount;
  emit(s, { type: 'damage', uid: u.uid, amount, hp: u.hp, source });
  return amount;
}

function heal(s, u, amount) {
  if (u.hp <= 0) return 0;
  const n = Math.min(amount, u.maxHp - u.hp);
  if (n <= 0) return 0;
  u.hp += n;
  emit(s, { type: 'heal', uid: u.uid, amount: n, hp: u.hp });
  return n;
}

function buff(s, u, atk, hp) {
  if (u.hp <= 0) return;
  u.atk += atk;
  u.maxHp += hp;
  u.hp += hp;
  emit(s, { type: 'buff', uid: u.uid, atk: u.atk, hp: u.hp, dAtk: atk, dHp: hp });
}

function setTerrain(s, x, y, terrain) {
  if (!inBounds(x, y)) return;
  const t = tileAt(s, x, y);
  if (t.terrain === terrain) return;
  t.terrain = terrain;
  emit(s, { type: 'tile', id: t.id, x, y, terrain, height: t.height });
}

function changeHeight(s, x, y, d) {
  if (!inBounds(x, y)) return;
  const t = tileAt(s, x, y);
  const h = Math.max(0, Math.min(MAX_HEIGHT, t.height + d));
  if (h === t.height) return;
  t.height = h;
  emit(s, { type: 'tile', id: t.id, x, y, terrain: t.terrain, height: h });
}

// 盤面の一部を並び替える。moves: [[fromIdx, toIdx], ...] (置換)
function permuteTiles(s, moves, kind, info) {
  const old = s.tiles.slice();
  const unitMoves = [];
  const at = new Map();
  for (const u of s.units) if (u.hp > 0) at.set(idx(u.x, u.y), u);
  for (const [f, t] of moves) {
    s.tiles[t] = old[f];
    const u = at.get(f);
    if (u) unitMoves.push([u, t]);
  }
  for (const [u, t] of unitMoves) { u.x = t % W; u.y = (t / W) | 0; }
  emit(s, {
    type: 'tilesMoved', kind, ...info,
    moves: moves.map(([f, t]) => ({ id: old[f].id, fx: f % W, fy: (f / W) | 0, tx: t % W, ty: (t / W) | 0 })),
  });
}

function shiftRow(s, y, dir) {
  const moves = [];
  for (let x = 0; x < W; x++) moves.push([idx(x, y), idx((x + dir + W) % W, y)]);
  permuteTiles(s, moves, 'shift', { row: y, dir });
}

// 時計回り (dir=1) / 反時計回り (dir=-1) に 3x3 を 90 度回転
function rotateBlock(s, cx, cy, dir) {
  const moves = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      // 盤面座標 (x 右, y 奥) を上から見たときの時計回り: (dx,dy) -> (dy,-dx)
      const nx = dir > 0 ? dy : -dy;
      const ny = dir > 0 ? -dx : dx;
      moves.push([idx(cx + dx, cy + dy), idx(cx + nx, cy + ny)]);
    }
  }
  permuteTiles(s, moves, 'rotate', { cx, cy, dir, steps: 2 });
}

// 中央の 8 マスを時計回りに 1 つずらす (地殻変動)
const RING = [[-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0]];
function rotateRing(s, cx, cy, dir) {
  const moves = [];
  for (let i = 0; i < 8; i++) {
    const a = RING[i];
    const b = RING[(i + dir + 8) % 8];
    moves.push([idx(cx + a[0], cy + a[1]), idx(cx + b[0], cy + b[1])]);
  }
  permuteTiles(s, moves, 'rotate', { cx, cy, dir, steps: 1 });
}

function push(s, u, fromX, fromY) {
  let dx = Math.sign(u.x - fromX), dy = Math.sign(u.y - fromY);
  if (dx && dy) {
    if (Math.abs(u.x - fromX) >= Math.abs(u.y - fromY)) dy = 0; else dx = 0;
  }
  if (!dx && !dy) dy = u.owner === 0 ? -1 : 1;
  const nx = u.x + dx, ny = u.y + dy;
  const ok = inBounds(nx, ny) && !unitAt(s, nx, ny) &&
    (isFlying(u) || Math.abs(tileAt(s, nx, ny).height - tileAt(s, u.x, u.y).height) <= 1);
  if (!ok) {
    emit(s, { type: 'bump', uid: u.uid, dx, dy });
    damage(s, u, 1, 'push');
    return false;
  }
  u.x = nx; u.y = ny;
  emit(s, { type: 'push', uid: u.uid, x: nx, y: ny, tileId: tileAt(s, nx, ny).id });
  return true;
}

function freeze(s, u) {
  if (u.hp <= 0) return;
  u.frozen = true;
  emit(s, { type: 'freeze', uid: u.uid });
}

function addToHand(s, p, cardId) {
  const pl = s.players[p];
  const uid = s.nextUid++;
  if (pl.hand.length >= HAND_LIMIT) {
    emit(s, { type: 'burn', player: p, cardId });
    return;
  }
  pl.hand.push({ uid, cardId });
  emit(s, { type: 'draw', player: p, uid, cardId });
}

function drawCards(s, p, n) {
  const pl = s.players[p];
  for (let i = 0; i < n; i++) {
    if (!pl.deck.length) {
      pl.fatigue++;
      emit(s, { type: 'fatigue', player: p, amount: pl.fatigue });
      damage(s, leaderOf(s, p), pl.fatigue, 'fatigue');
      continue;
    }
    const cardId = pl.deck.pop();
    // シミュレーション中は山札の中身を知らないものとして扱う
    addToHand(s, p, s.sim ? null : cardId);
  }
}

function cleanupDead(s) {
  // 遺言 (onDeath) が新たな死者を生むことがあるので、落ち着くまで繰り返す
  for (let guard = 0; guard < 12; guard++) {
    const dying = s.units.filter((u) => u.hp <= 0 && !u.dead);
    if (!dying.length) break;
    for (const u of dying) {
      u.dead = true;
      emit(s, { type: 'death', uid: u.uid, x: u.x, y: u.y, owner: u.owner, leader: u.leader });
      if (!u.leader) s.stats[1 - u.owner].kills++;
    }
    s.units = s.units.filter((u) => u.hp > 0);
    for (const u of dying) {
      const c = CARDS[u.cardId];
      if (c.onDeath && !u.leader) c.onDeath(makeApi(s), { self: u, player: u.owner });
    }
  }
  syncEnv(s);
  const d0 = !s.units.some((u) => u.uid === s.players[0].leader);
  const d1 = !s.units.some((u) => u.uid === s.players[1].leader);
  if ((d0 || d1) && s.winner === null) {
    s.winner = d0 && d1 ? -1 : d0 ? 1 : 0;
    emit(s, { type: 'gameOver', winner: s.winner });
  }
}

// 場にいる「環境」持ちのうち最後に召喚されたものが有効
function syncEnv(s) {
  let best = null;
  for (const u of s.units) if (u.hp > 0 && u.envSeq && (!best || u.envSeq > best.envSeq)) best = u;
  const kind = best ? CARDS[best.cardId].env : null;
  if (kind === s.envKind) return;
  const prev = s.envKind;
  s.envKind = kind;
  emit(s, { type: 'env', kind, prev, uid: best ? best.uid : null, owner: best ? best.owner : null });
}

function makeApi(s) {
  const G = {
    s,
    damage: (u, n, src) => damage(s, u, n, src, s.current),
    heal: (u, n) => heal(s, u, n),
    buff: (u, a, h) => buff(s, u, a, h),
    setTerrain: (x, y, t) => setTerrain(s, x, y, t),
    changeHeight: (x, y, d) => changeHeight(s, x, y, d),
    shiftRow: (y, d) => shiftRow(s, y, d),
    // 盤面全体の地形変化をひとまとめの演出イベントにする
    fieldWide: (kind, origin, fn) => {
      const outer = s.events;
      if (outer) s.events = [];
      fn();
      if (outer) {
        const tiles = s.events.filter((e) => e.type === 'tile');
        outer.push({ type: 'fieldChange', kind, x: origin.x, y: origin.y, uid: origin.uid, tiles }, ...s.events.filter((e) => e.type !== 'tile'));
        s.events = outer;
      }
    },
    rotateBlock: (x, y, d) => rotateBlock(s, x, y, d),
    push: (u, fx, fy) => push(s, u, fx, fy),
    freeze: (u) => freeze(s, u),
    draw: (p, n) => drawCards(s, p, n),
    addMana: (p, n) => { s.players[p].mana += n; emit(s, { type: 'mana', player: p, mana: s.players[p].mana }); },
    addCard: (p, id) => addToHand(s, p, id),
    returnToHand: (u) => {
      if (u.hp <= 0 || u.leader) return;
      s.units = s.units.filter((x) => x !== u);
      u.dead = true;
      emit(s, { type: 'vanish', uid: u.uid, owner: u.owner });
      addToHand(s, u.owner, u.cardId);
    },
    refresh: (u) => {
      if (u.hp <= 0 || u.sick || u.frozen) return;
      u.moved = false;
      u.attacked = false;
      emit(s, { type: 'buff', uid: u.uid, atk: u.atk, hp: u.hp, dAtk: 0, dHp: 0, label: '再行動!' });
    },
    addMove: (u, n) => {
      if (u.hp <= 0) return;
      u.move += n;
      emit(s, { type: 'buff', uid: u.uid, atk: u.atk, hp: u.hp, dAtk: 0, dHp: 0, label: `移動+${n}` });
    },
    // (x,y) の方向へ 1 マス引き寄せる
    pull: (u, x, y) => push(s, u, 2 * u.x - x, 2 * u.y - y),
    friendlyAll: (p) => s.units.filter((u) => u.hp > 0 && u.owner === p),
    unitAt: (x, y) => unitAt(s, x, y),
    leaderOf: (p) => leaderOf(s, p),
    enemyUnits: (p) => s.units.filter((u) => u.hp > 0 && u.owner !== p && !u.leader),
    friendlyUnits: (p) => s.units.filter((u) => u.hp > 0 && u.owner === p && !u.leader),
    enemiesWithin: (p, x, y, r) => s.units.filter((u) => u.hp > 0 && u.owner !== p && dist(u.x, u.y, x, y) <= r),
    friendsWithin: (p, x, y, r) => s.units.filter((u) => u.hp > 0 && u.owner === p && dist(u.x, u.y, x, y) <= r),
    cross: (x, y) => [[x, y], [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => inBounds(a, b)),
    pickRandom: (arr) => pick(s, arr),
    rand: () => rand(s),
    fx: (kind, from, to, opt) => emit(s, {
      type: 'fx', kind,
      from: from ? { x: from.x, y: from.y, uid: from.uid } : null,
      to: to ? { x: to.x, y: to.y, uid: to.uid } : null,
      ...opt,
    }),
  };
  return G;
}

// ------------------------------------------------------------------
// ターン進行
// ------------------------------------------------------------------

function startTurn(s) {
  const p = s.current;
  const pl = s.players[p];
  s.turn++;
  if (p === s.first) {
    s.round++;
    if (s.round > 1) {
      s.tectonicIn--;
      if (s.tectonicIn <= 0) {
        tectonic(s);
        s.tectonicIn = TECTONIC_PERIOD;
        cleanupDead(s);
        if (s.winner !== null) return;
      }
    }
  }
  pl.maxMana = Math.min(MAX_MANA, pl.maxMana + 1);
  pl.mana = pl.maxMana;
  pl.heroUsed = false;
  pl.cp = COMMAND_POINTS;
  emit(s, { type: 'turnStart', player: p, turn: s.turn, round: s.round });

  let bonus = 0;
  const G = makeApi(s);
  for (const u of s.units.slice()) {
    if (u.owner !== p || u.hp <= 0) continue;
    u.moved = false;
    u.attacked = false;
    u.sick = false;
    if (u.frozen) { u.moved = true; u.attacked = true; }
    const t = tileAt(s, u.x, u.y);
    if (t.terrain === 'crystal') bonus++;
    if (t.terrain === 'shrine') heal(s, u, SHRINE_HEAL);
    if (u.regen) heal(s, u, u.regen);
    const c = CARDS[u.cardId];
    if (c.onTurnStart) c.onTurnStart(G, { self: u, player: p });
  }
  if (s.envKind === 'rain') {
    for (const u of s.units) if (u.owner === p && !u.leader && u.hp > 0) heal(s, u, 1);
  }
  if (bonus) {
    pl.mana += bonus;
    emit(s, { type: 'crystal', player: p, amount: bonus, mana: pl.mana });
  }
  // 侵攻: 敵陣 (相手側の 2 列) にいる自軍ユニット 1 体につき敵の将に 1 ダメージ
  const foe = leaderOf(s, 1 - p);
  for (const u of s.units) {
    if (u.owner !== p || u.leader || u.hp <= 0 || !inEnemyHome(p, u.y) || foe.hp <= 0) continue;
    emit(s, { type: 'fx', kind: 'siege', from: { x: u.x, y: u.y, uid: u.uid }, to: { x: foe.x, y: foe.y, uid: foe.uid } });
    damage(s, foe, SIEGE_DAMAGE, 'siege', p);
  }
  cleanupDead(s);
  if (s.winner !== null) return;
  emit(s, { type: 'mana', player: p, mana: pl.mana, maxMana: pl.maxMana });
  drawCards(s, p, 1);
  cleanupDead(s);
}

function endTurn(s) {
  const p = s.current;
  emit(s, { type: 'turnEnd', player: p });
  for (const u of s.units.slice()) {
    if (u.owner !== p || u.hp <= 0) continue;
    if (tileAt(s, u.x, u.y).terrain === 'lava' && !ignoresLava(u)) {
      emit(s, { type: 'fx', kind: 'burn', to: { x: u.x, y: u.y, uid: u.uid } });
      damage(s, u, LAVA_DAMAGE, 'lava');
    }
  }
  cleanupDead(s);
  for (const u of s.units) if (u.owner === p) u.frozen = false;
  if (s.winner !== null) return;
  s.current = 1 - p;
  startTurn(s);
}

function tectonic(s) {
  s.tectonicCount++;
  if (s.tectonicCount % 2 === 1) {
    emit(s, { type: 'tectonic', kind: 'ring' });
    rotateRing(s, 3, 3, 1);
  } else {
    emit(s, { type: 'tectonic', kind: 'quake' });
    // 対称な2組のマスが隆起・沈降する
    const up = randInt(s, W * H), down = randInt(s, W * H);
    for (const [i, d] of [[up, 1], [down, -1]]) {
      const x = i % W, y = (i / W) | 0;
      changeHeight(s, x, y, d);
      if (x !== W - 1 - x || y !== H - 1 - y) changeHeight(s, W - 1 - x, H - 1 - y, d);
    }
  }
}

// ------------------------------------------------------------------
// アクション
// ------------------------------------------------------------------
// { type:'play', handUid, x, y, dir }
// { type:'move', uid, x, y }
// { type:'attack', uid, target }
// { type:'moveAttack', uid, x, y, target }
// { type:'hero', x, y }
// { type:'end' }

export function applyAction(s, a) {
  if (s.winner !== null) return false;
  let ok = false;
  switch (a.type) {
    case 'play': ok = doPlay(s, a); break;
    case 'move': ok = doMove(s, a); break;
    case 'attack': ok = doAttack(s, a); break;
    case 'moveAttack': {
      // 移動して攻撃するには指揮力が 2 必要 (その場で攻撃なら 1)。途中で失敗しないよう先に確認する
      const u = unitById(s, a.uid);
      const moving = u && !(u.x === a.x && u.y === a.y);
      if (!u || cpOf(s, u.owner) < (moving ? moveCp(u) : 0) + 1) { ok = false; break; }
      ok = doMove(s, a) && doAttack(s, a);
      break;
    }
    case 'hero': ok = doHero(s, a); break;
    case 'skill': ok = doSkill(s, a); break;
    case 'end': endTurn(s); ok = true; break;
  }
  return ok;
}

function doPlay(s, a) {
  const p = s.current;
  const pl = s.players[p];
  const hi = pl.hand.findIndex((h) => h.uid === a.handUid);
  if (hi < 0) return false;
  const hc = pl.hand[hi];
  if (!canPlay(s, p, hc)) return false;
  const c = CARDS[hc.cardId];
  const targets = cardTargets(s, p, hc.cardId);
  if (targets && !targets.some((t) => t.x === a.x && t.y === a.y)) return false;
  if (c.dir && a.dir !== 1 && a.dir !== -1) return false;
  pl.mana -= c.cost;
  pl.hand.splice(hi, 1);
  s.stats[p].cards++;
  emit(s, { type: 'play', player: p, cardId: hc.cardId, handUid: hc.uid, x: a.x, y: a.y, dir: a.dir, mana: pl.mana });
  const G = makeApi(s);
  if (c.type === 'unit') {
    const u = makeUnit(s, p, hc.cardId, a.x, a.y);
    if (c.env) u.envSeq = ++s.envSeq;
    s.units.push(u);
    s.stats[p].summons++;
    emit(s, { type: 'summon', unit: snapshotUnit(u), tileId: tileAt(s, a.x, a.y).id });
    if (c.onSummon) c.onSummon(G, { self: u, player: p });
  } else {
    if (c.type === 'field') s.stats[p].fields++;
    const target = targets ? unitAt(s, a.x, a.y) : null;
    emit(s, { type: 'spell', player: p, cardId: hc.cardId, fx: c.fx, x: a.x, y: a.y, dir: a.dir, from: leaderPos(s, p) });
    c.effect(G, { player: p, x: a.x, y: a.y, dir: a.dir, target });
  }
  cleanupDead(s);
  return true;
}

function leaderPos(s, p) {
  const L = leaderOf(s, p);
  return { x: L.x, y: L.y, uid: L.uid };
}

function doHero(s, a) {
  const p = s.current;
  const pl = s.players[p];
  if (!canHero(s, p)) return false;
  const h = FACTIONS[pl.faction].hero;
  const targets = targetsFor(s, p, h.target);
  if (!targets.some((t) => t.x === a.x && t.y === a.y)) return false;
  pl.mana -= h.cost;
  pl.heroUsed = true;
  const target = unitAt(s, a.x, a.y);
  emit(s, { type: 'hero', player: p, fx: h.fx, x: a.x, y: a.y, from: leaderPos(s, p), mana: pl.mana });
  h.effect(makeApi(s), { player: p, x: a.x, y: a.y, target });
  cleanupDead(s);
  return true;
}

// 奥義: 1体につき1回。攻撃の代わりに使い、そのターンの行動を終える
function doSkill(s, a) {
  const u = unitById(s, a.uid);
  if (!u || u.owner !== s.current || !canSkill(s, u)) return false;
  const sk = CARDS[u.cardId].skill;
  u.skillUsed = true;
  u.attacked = true;
  u.moved = true;
  spendCp(s, u.owner);
  emit(s, { type: 'skill', uid: u.uid, player: u.owner, cardId: u.cardId, name: sk.name, fx: sk.fx, x: u.x, y: u.y });
  sk.effect(makeApi(s), { self: u, player: u.owner });
  cleanupDead(s);
  return true;
}

function doMove(s, a) {
  const u = unitById(s, a.uid);
  if (u && a.type === 'moveAttack' && a.x === u.x && a.y === u.y) return true; // その場で攻撃
  if (!u || !canMove(s, u)) return false;
  const r = reachable(s, u);
  const to = idx(a.x, a.y);
  if (!r.tiles.includes(to)) return false;
  const path = pathTo(r, idx(u.x, u.y), to);
  emit(s, {
    type: 'move', uid: u.uid,
    path: path.map((p) => ({ x: p.x, y: p.y, tileId: tileAt(s, p.x, p.y).id })),
  });
  u.x = a.x;
  u.y = a.y;
  u.moved = true;
  if (moveCp(u)) spendCp(s, u.owner);
  return true;
}

function spendCp(s, p) {
  const pl = s.players[p];
  pl.cp = cpOf(s, p) - 1;
  emit(s, { type: 'cp', player: p, cp: pl.cp });
}

function doAttack(s, a) {
  const u = unitById(s, a.uid);
  const t = unitById(s, a.target);
  if (!u || !t || !canAttack(s, u) || t.owner === u.owner) return false;
  const d = dist(u.x, u.y, t.x, t.y);
  if (d > effRangeAt(s, u, u.x, u.y)) return false;
  const p = u.owner;
  const dmg = calcDamage(s, u, u.x, u.y, t, t.x, t.y);
  u.attacked = true;
  u.moved = true;
  spendCp(s, p);
  emit(s, { type: 'attack', uid: u.uid, target: t.uid, ranged: d >= 2, fx: CARDS[u.cardId].model });
  damage(s, t, dmg, 'attack', p);
  // 貫通: 後ろの敵にも
  if (has(u, 'pierce') && d === 1) {
    const bx = t.x + (t.x - u.x), by = t.y + (t.y - u.y);
    const b = inBounds(bx, by) ? unitAt(s, bx, by) : null;
    if (b && b.owner !== p) {
      emit(s, { type: 'fx', kind: 'pierce', from: { x: t.x, y: t.y }, to: { x: bx, y: by, uid: b.uid } });
      damage(s, b, calcDamage(s, u, u.x, u.y, b, bx, by), 'attack', p);
    }
  }
  // 爆炎: 対象の周囲の敵に 1
  if (has(u, 'splash')) {
    emit(s, { type: 'fx', kind: 'splash', to: { x: t.x, y: t.y } });
    for (const [dx, dy] of DIRS4) {
      const e = unitAt(s, t.x + dx, t.y + dy);
      if (e && e.owner !== p && e !== u) damage(s, e, 1, 'splash', p);
    }
  }
  // 反撃
  if (t.hp > 0 && u.hp > 0 && canCounter(s, t, u.x, u.y)) {
    const c = calcDamage(s, t, t.x, t.y, u, u.x, u.y);
    if (c > 0 || effAtk(s, t) > 0) {
      emit(s, { type: 'attack', uid: t.uid, target: u.uid, ranged: d >= 2, counter: true, fx: CARDS[t.cardId].model });
      damage(s, u, c, 'attack', 1 - p);
    }
  }
  cleanupDead(s);
  return true;
}

// ------------------------------------------------------------------
// 行動の列挙 (AI とヒント用)
// ------------------------------------------------------------------

export function hasAnyAction(s, p) {
  if (s.current !== p || s.winner !== null) return false;
  const pl = s.players[p];
  if (pl.hand.some((h) => canPlay(s, p, h))) return true;
  if (canHero(s, p)) return true;
  for (const u of s.units) {
    if (u.owner !== p || u.hp <= 0) continue;
    if (canSkill(s, u)) return true;
    if (canAttack(s, u)) {
      if (targetsFrom(s, u, u.x, u.y).length) return true;
      if (canMove(s, u) && cpOf(s, p) >= moveCp(u) + 1) {
        const r = reachable(s, u);
        for (const i of r.tiles) if (targetsFrom(s, u, i % W, (i / W) | 0).length) return true;
      }
    }
  }
  return false;
}

export function coordName(x, y) {
  return 'ABCDEFG'[x] + (y + 1);
}
