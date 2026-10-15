// AI: 局面評価 + ビームサーチによるターン計画 + 相手の応手シミュレーション。
//
// 1. 評価関数 evaluate(s, p)
//    リーダーHP・ユニット価値・前進度・地形・相手から受ける脅威 (到達+射程から算出) などを合成。
// 2. planTurn: 1 手ずつ候補手を列挙 → 複製盤面に適用 → 評価 → 上位 B 局面だけ残すビームサーチ。
// 3. 上級: 最終候補に対し「相手が盤上の駒で最善に応じたら」を貪欲法で読み、スコアを補正する。

import { CARDS, FACTIONS } from './cards.js';
import {
  W, H, idx, dist, cloneState, applyAction, reachable, targetsFrom, effAtk, effAtkAt, effRangeAt,
  calcDamage, canMove, canAttack, canPlay, canHero, cardTargets, targetsFor, leaderOf, unitAt, tileAt,
  ignoresLava, isFlying, forecast, coordName, unitById, inEnemyHome,
} from './rules.js';

export const DIFFICULTY = {
  easy: { name: '見習い', beam: 2, depth: 8, noise: 9, reply: 0, moveKeep: 2, summonKeep: 2, budget: 900 },
  normal: { name: '熟練', beam: 4, depth: 12, noise: 1.2, reply: 2, moveKeep: 3, summonKeep: 3, budget: 2200 },
  // 実験の結果、探索幅を広げるより「相手の応手を重く見る」ほうが強かった
  hard: { name: '達人', beam: 4, depth: 14, noise: 0, reply: 4, replyW: 0.85, moveKeep: 3, summonKeep: 3, budget: 4200 },
};

// ------------------------------------------------------------------
// 評価関数
// ------------------------------------------------------------------

function leaderHpValue(h) {
  // HP が減るほど 1 点の重みが増す (危険域では急激に)
  return h * 4 + Math.min(0, h - 12) * 2.5 + Math.min(0, h - 6) * 6;
}

export function unitValue(u) {
  if (u.leader) return 0;
  let v = u.atk * 1.7 + u.hp * 1.0 + u.armor * 1.6 + u.move * 0.35;
  if (u.range > 1) v += 1.2 + u.range * 0.3;
  for (const k of u.kw) v += k === 'flying' ? 1.5 : k === 'guard' ? 1.0 : 0.6;
  if (u.regen) v += u.regen * 0.8;
  return v + 1;
}

// owner の駒が次のターンに各マスへ与えうる最大の総ダメージ (概算)
export function threatMap(s, owner) {
  const N = W * H;
  const map = new Float32Array(N);
  const mask = new Uint8Array(N);
  for (const u of s.units) {
    if (u.owner !== owner || u.hp <= 0 || u.frozen) continue;
    const a = u.atk;
    if (a <= 0) continue;
    mask.fill(0);
    const origins = [idx(u.x, u.y)];
    if (u.move > 0) origins.push(...reachable(s, u).tiles);
    for (const o of origins) {
      const ox = o % W, oy = (o / W) | 0;
      const r = effRangeAt(s, u, ox, oy);
      for (let dy = -r; dy <= r; dy++) {
        const y = oy + dy;
        if (y < 0 || y >= H) continue;
        const rr = r - Math.abs(dy);
        for (let dx = -rr; dx <= rr; dx++) {
          const x = ox + dx;
          if (x < 0 || x >= W) continue;
          const i = y * W + x;
          const bonus = tileAt(s, ox, oy).height > tileAt(s, x, y).height ? 1 : 0;
          const v = Math.max(0, effAtkAt(s, u, ox, oy) + bonus);
          if (v > mask[i]) mask[i] = v;
        }
      }
    }
    for (let i = 0; i < N; i++) if (mask[i]) map[i] += mask[i];
  }
  return map;
}

// nextMover: この局面の次に (まっさらな状態で) 行動するプレイヤー。
// 既定ではターン途中の局面を「このままターン終了した」とみなして相手番とする。
export function evaluate(s, p, detail, nextMover = 1 - s.current) {
  if (s.winner !== null) return s.winner === p ? 100000 : s.winner === -1 ? 0 : -100000;
  const op = 1 - p;
  const myL = leaderOf(s, p), opL = leaderOf(s, op);
  const mover = nextMover;
  const other = 1 - mover;
  const moverThreat = threatMap(s, mover);
  const otherThreat = threatMap(s, other);
  const threatOf = (owner) => (owner === mover ? moverThreat : otherThreat);

  let sc = leaderHpValue(myL.hp) - leaderHpValue(opL.hp);
  let material = 0, position = 0, danger = 0;

  for (const u of s.units) {
    if (u.hp <= 0 || u.leader) continue;
    const mine = u.owner === p;
    const sign = mine ? 1 : -1;
    const val = unitValue(u);
    let v = val;
    const enemyL = mine ? opL : myL;
    const d = dist(u.x, u.y, enemyL.x, enemyL.y);
    const t = tileAt(s, u.x, u.y);
    let pos = Math.max(0, 9 - d) * 0.42 * (0.6 + effAtk(s, u) * 0.25);
    if (t.terrain === 'crystal') pos += 1.6;
    if (t.terrain === 'lava' && !ignoresLava(u)) pos -= u.hp <= 2 ? 6 : 2.5;
    if (t.terrain === 'shrine' && u.hp < u.maxHp) pos += 1.0;
    if (t.terrain === 'forest' && u.range > 1) pos += 0.6;
    if (inEnemyHome(u.owner, u.y)) pos += 4.5;
    pos += t.height * (u.range > 1 ? 0.55 : 0.25);
    if (u.frozen) v -= 1.5;
    // 被脅威: 相手の総攻撃でこのユニットが落ちるか
    const enemyThreat = threatOf(1 - u.owner)[idx(u.x, u.y)];
    const enemyMovesNext = (1 - u.owner) === mover;
    let dz = 0;
    if (enemyThreat > 0) {
      const eff = Math.max(0, enemyThreat - u.armor);
      if (eff >= u.hp) dz = val * (enemyMovesNext ? 0.45 : 0.2);
      else dz = eff * (enemyMovesNext ? 0.25 : 0.08);
    }
    material += sign * v;
    position += sign * pos;
    danger += sign * -dz;
  }
  sc += material + position + danger;

  // リーダーへの脅威
  const tMe = threatOf(op)[idx(myL.x, myL.y)];
  const tOp = threatOf(p)[idx(opL.x, opL.y)];
  const meNext = op === mover;
  sc -= tMe * (meNext ? 1.6 : 0.5);
  sc += tOp * (meNext ? 1.0 : 1.6);
  if (meNext && tMe >= myL.hp) sc -= 260;
  if (!meNext && tOp >= opL.hp) sc += 260;
  // リーダーの位置: 前線から離れすぎず、溶岩を避ける
  const lt = tileAt(s, myL.x, myL.y);
  if (lt.terrain === 'lava') sc -= 4;
  if (lt.terrain === 'crystal') sc += 1;

  // 手札とマナ結晶
  const hp = s.players[p], ho = s.players[op];
  sc += (hp.hand.length - ho.hand.length) * 1.1;
  sc += (hp.maxMana - ho.maxMana) * 0.5;

  if (detail) {
    detail.material = material;
    detail.position = position;
    detail.danger = danger;
    detail.threatToMe = tMe;
    detail.threatToOp = tOp;
    detail.myHp = myL.hp;
    detail.opHp = opL.hp;
  }
  return sc;
}

// 評価値を勝率 (0..1) っぽく見せる
export function winProb(score) {
  if (score >= 50000) return 1;
  if (score <= -50000) return 0;
  return 1 / (1 + Math.exp(-score / 22));
}

// ------------------------------------------------------------------
// 候補手の列挙
// ------------------------------------------------------------------

function tileScoreFor(s, u, x, y, opL) {
  const t = tileAt(s, x, y);
  let v = -dist(x, y, opL.x, opL.y) * (u.range > 1 ? 0.4 : 0.9);
  if (t.terrain === 'crystal') v += 2.5;
  if (t.terrain === 'lava' && !ignoresLava(u)) v -= 4;
  if (t.terrain === 'forest') v += u.range > 1 ? 1.2 : 0.4;
  if (t.terrain === 'shrine' && u.hp < u.maxHp) v += 1.5;
  if (t.terrain === 'water' && !isFlying(u)) v -= 1.2;
  v += t.height * (u.range > 1 ? 1.0 : 0.4);
  return v;
}

export function generateActions(s, p, cfg, opts = {}) {
  const acts = [];
  const pl = s.players[p];
  const opL = leaderOf(s, 1 - p);
  const myL = leaderOf(s, p);
  const boardOnly = !!opts.boardOnly;

  // --- カード ---
  if (!boardOnly) {
    const seen = new Set();
    for (const h of pl.hand) {
      if (!h.cardId || seen.has(h.cardId) || !canPlay(s, p, h)) continue;
      seen.add(h.cardId);
      const c = CARDS[h.cardId];
      const targets = cardTargets(s, p, h.cardId);
      if (c.type === 'unit') {
        const fake = { ...c, hp: c.hp, maxHp: c.hp, range: c.range, kw: c.keywords };
        const ranked = targets
          .map((t) => ({ t, v: tileScoreFor(s, fake, t.x, t.y, opL) + (c.onSummon ? summonBonus(s, p, c, t) : 0) }))
          .sort((a, b) => b.v - a.v)
          .slice(0, cfg.summonKeep);
        for (const r of ranked) acts.push({ type: 'play', handUid: h.uid, x: r.t.x, y: r.t.y });
      } else if (targets === null) {
        acts.push({ type: 'play', handUid: h.uid });
      } else {
        for (const t of pruneSpellTargets(s, p, c, targets)) {
          if (c.dir) {
            acts.push({ type: 'play', handUid: h.uid, x: t.x, y: t.y, dir: 1 });
            acts.push({ type: 'play', handUid: h.uid, x: t.x, y: t.y, dir: -1 });
          } else acts.push({ type: 'play', handUid: h.uid, x: t.x, y: t.y });
        }
      }
    }
  }

  // --- 英雄の力 ---
  if (canHero(s, p)) {
    const h = FACTIONS[pl.faction].hero;
    let ts = targetsFor(s, p, h.target);
    if (h.target === 'friendlyAny' || h.target === 'friendlyUnit') ts = ts.filter((t) => { const u = unitAt(s, t.x, t.y); return u && u.hp < u.maxHp; });
    for (const t of ts) acts.push({ type: 'hero', x: t.x, y: t.y });
  }

  // --- ユニット ---
  for (const u of s.units) {
    if (u.owner !== p || u.hp <= 0) continue;
    const atk = canAttack(s, u);
    const mov = canMove(s, u);
    if (!atk && !mov) continue;
    if (atk) for (const t of targetsFrom(s, u, u.x, u.y)) acts.push({ type: 'attack', uid: u.uid, target: t.uid });
    if (!mov) continue;
    const r = reachable(s, u);
    // 移動して攻撃: 対象ごとに最良の立ち位置を 1 つ
    if (atk) {
      const bestFor = new Map();
      for (const i of r.tiles) {
        const x = i % W, y = (i / W) | 0;
        for (const t of targetsFrom(s, u, x, y)) {
          const f = forecastAt(s, u, x, y, t);
          const v = f.dmg * 2 + (f.kills ? 6 : 0) - f.counter * 1.5 + tileScoreFor(s, u, x, y, opL) * 0.3;
          const cur = bestFor.get(t.uid);
          if (!cur || v > cur.v) bestFor.set(t.uid, { v, x, y });
        }
      }
      for (const [tuid, b] of bestFor) acts.push({ type: 'moveAttack', uid: u.uid, x: b.x, y: b.y, target: tuid });
    }
    // 純粋な移動: 前進向きの上位 + 最も安全な退避先
    const keep = u.leader ? 2 : cfg.moveKeep;
    const scored = r.tiles.map((i) => {
      const x = i % W, y = (i / W) | 0;
      let v;
      if (u.leader) {
        const t = tileAt(s, x, y);
        const home = p === 0 ? 0 : H - 1;
        v = t.height * 0.5 - Math.abs(y - home) * 0.6;
        if (t.terrain === 'crystal') v += 2;
        if (t.terrain === 'shrine' && u.hp < u.maxHp) v += 1.5;
        if (t.terrain === 'lava') v -= 5;
      } else v = tileScoreFor(s, u, x, y, opL);
      return { x, y, v };
    }).sort((a, b) => b.v - a.v);
    for (const m of scored.slice(0, keep)) acts.push({ type: 'move', uid: u.uid, x: m.x, y: m.y });
    if (scored.length > keep) {
      // 後退案 (自リーダー寄り)
      const back = scored.slice(keep).sort((a, b) => dist(a.x, a.y, myL.x, myL.y) - dist(b.x, b.y, myL.x, myL.y))[0];
      if (back) acts.push({ type: 'move', uid: u.uid, x: back.x, y: back.y });
    }
  }
  return acts;
}

function forecastAt(s, u, x, y, t) {
  const dmg = calcDamage(s, u, x, y, t, t.x, t.y);
  const kills = dmg >= t.hp;
  let counter = 0;
  if (!kills && !t.frozen && dist(t.x, t.y, x, y) <= effRangeAt(s, t, t.x, t.y)) counter = calcDamage(s, t, t.x, t.y, u, x, y);
  return { dmg, kills, counter };
}

function summonBonus(s, p, c, t) {
  // 召喚時効果が敵を巻き込める位置を少し優遇
  let v = 0;
  for (const u of s.units) {
    if (u.owner === p || u.hp <= 0) continue;
    const d = dist(u.x, u.y, t.x, t.y);
    if (d <= 1) v += 1.5;
    else if (d <= 2) v += 0.8;
  }
  return v;
}

function pruneSpellTargets(s, p, c, targets) {
  const near = (x, y, r) => s.units.some((u) => u.hp > 0 && dist(u.x, u.y, x, y) <= r);
  switch (c.target) {
    case 'tile':
      if (c.id === 'f_eruption') return targets.filter((t) => { const u = unitAt(s, t.x, t.y); return u && u.owner !== p; });
      if (c.id === 'f_thorns' || c.id === 'f_quake') return targets.filter((t) => near(t.x, t.y, 1));
      // 隆起・陥没・潮流: ユニットがいるマスとその周辺
      return targets.filter((t) => near(t.x, t.y, 1)).slice(0, 24);
    case 'row':
      return targets.filter((t) => t.x === 3 && s.units.some((u) => u.y === t.y));
    case 'block':
      return targets.filter((t) => s.units.some((u) => Math.abs(u.x - t.x) <= 1 && Math.abs(u.y - t.y) <= 1));
    case 'friendlyAny':
      return targets.filter((t) => { const u = unitAt(s, t.x, t.y); return u && u.hp < u.maxHp; });
    default:
      return targets;
  }
}

// ------------------------------------------------------------------
// ターン計画 (ビームサーチ)
// ------------------------------------------------------------------

function stateKey(s) {
  let k = '';
  for (const u of s.units) k += u.uid + ':' + u.x + ',' + u.y + ',' + u.hp + ',' + (u.moved ? 1 : 0) + (u.attacked ? 1 : 0) + ';';
  k += '|' + s.players[s.current].mana + '|' + s.players[s.current].hand.length;
  for (const t of s.tiles) k += t.height;
  return k;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

// 乱数ノイズ (Math.random は使わず、試行ごとに決まる擬似乱数)
function noiseGen(seed) {
  let x = seed | 0 || 1;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return ((x >>> 0) / 4294967296) * 2 - 1;
  };
}

/**
 * 現在の手番プレイヤーの 1 ターン分の行動列を計画する。
 * onProgress({evaluated, depth, best, bestScore}) が適宜呼ばれる。
 */
export async function planTurn(state, cfg, onProgress, opts = {}) {
  const p = state.current;
  const t0 = now();
  const noise = noiseGen(state.rng ^ (state.turn * 7919));
  const root = { s: cloneState(state), actions: [], score: evaluate(state, p) };
  let best = root;
  let beam = [root];
  let evaluated = 1;
  const finals = [root];
  let lastYield = now();
  let stale = 0;

  for (let depth = 0; depth < cfg.depth; depth++) {
    const cand = [];
    const seen = new Set();
    for (const node of beam) {
      const acts = generateActions(node.s, p, cfg, opts);
      for (const a of acts) {
        const s2 = cloneState(node.s);
        if (!applyAction(s2, a)) continue;
        const key = stateKey(s2);
        if (seen.has(key)) continue;
        seen.add(key);
        let sc = evaluate(s2, p);
        if (cfg.noise) sc += noise() * cfg.noise;
        evaluated++;
        cand.push({ s: s2, actions: node.actions.concat([a]), score: sc });
        if (s2.winner === p) break;
        if (now() - lastYield > 30) {
          await yieldFrame();
          lastYield = now();
          if (onProgress) onProgress({ evaluated, depth: depth + 1, best: best.actions, bestScore: best.score, state: best.s });
        }
      }
    }
    if (!cand.length) break;
    cand.sort((a, b) => b.score - a.score);
    beam = cand.slice(0, cfg.beam);
    finals.push(...beam);
    if (beam[0].score > best.score + 0.01) { best = beam[0]; stale = 0; } else stale++;
    if (onProgress) onProgress({ evaluated, depth: depth + 1, best: best.actions, bestScore: best.score, state: best.s });
    if (best.s.winner === p) break;
    if (stale >= 3) break;
    if (now() - t0 > cfg.budget) break;
  }

  // 相手の応手を読んで最終候補を比較する
  if (cfg.reply > 0 && best.s.winner !== p) {
    const uniq = [];
    const keys = new Set();
    finals.sort((a, b) => b.score - a.score);
    for (const f of finals) {
      const k = stateKey(f.s);
      if (keys.has(k)) continue;
      keys.add(k);
      uniq.push(f);
      if (uniq.length >= cfg.reply + 1) break;
    }
    let bestAdj = -Infinity, pick = best;
    for (const f of uniq) {
      const reply = simulateReply(f.s, p, cfg);
      evaluated += reply.evaluated;
      const rw = cfg.replyW ?? 0.55;
      const adj = f.score * (1 - rw) + reply.score * rw;
      f.replyScore = reply.score;
      if (adj > bestAdj) { bestAdj = adj; pick = f; }
      await yieldFrame();
      if (onProgress) onProgress({ evaluated, depth: -1, best: pick.actions, bestScore: pick.score, state: pick.s });
    }
    best = pick;
  }

  return { actions: best.actions, score: best.score, evaluated, time: now() - t0, state: best.s };
}

// 相手が盤上の駒と英雄の力だけで貪欲に応じた後の局面を、p の視点で評価する
function simulateReply(sIn, p, cfg) {
  const s = cloneState(sIn);
  applyAction(s, { type: 'end' });
  let evaluated = 0;
  if (s.winner !== null) return { score: evaluate(s, p, null, s.current), evaluated };
  const op = s.current;
  const rcfg = { ...cfg, moveKeep: 2 };
  for (let step = 0; step < 8 && s.winner === null; step++) {
    const acts = generateActions(s, op, rcfg, { boardOnly: true });
    let bestS = null, bestV = evaluate(s, op);
    for (const a of acts) {
      const s2 = cloneState(s);
      if (!applyAction(s2, a)) continue;
      const v = evaluate(s2, op);
      evaluated++;
      if (v > bestV + 0.3) { bestV = v; bestS = s2; }
    }
    if (!bestS) break;
    Object.assign(s, bestS);
  }
  if (s.winner === null) applyAction(s, { type: 'end' });
  return { score: evaluate(s, p, null, s.current), evaluated };
}

// ------------------------------------------------------------------
// 行動の説明文
// ------------------------------------------------------------------

export function describeAction(s, a) {
  const p = s.current;
  switch (a.type) {
    case 'play': {
      const h = s.players[p].hand.find((x) => x.uid === a.handUid);
      const c = h && h.cardId ? CARDS[h.cardId] : null;
      if (!c) return 'カードを使用';
      if (c.type === 'unit') return `${c.name} を ${coordName(a.x, a.y)} に召喚`;
      const tgt = a.x !== undefined ? ` → ${coordName(a.x, a.y)}` : '';
      const dir = a.dir ? (c.target === 'row' ? (a.dir > 0 ? ' (右へ)' : ' (左へ)') : (a.dir > 0 ? ' (時計回り)' : ' (反時計回り)')) : '';
      return `${c.name}${tgt}${dir}`;
    }
    case 'move': {
      const u = unitById(s, a.uid);
      return `${u ? unitName(u) : '?'} が ${coordName(a.x, a.y)} へ移動`;
    }
    case 'attack': {
      const u = unitById(s, a.uid), t = unitById(s, a.target);
      return `${u ? unitName(u) : '?'} が ${t ? unitName(t) : '?'} を攻撃`;
    }
    case 'moveAttack': {
      const u = unitById(s, a.uid), t = unitById(s, a.target);
      return `${u ? unitName(u) : '?'} が ${coordName(a.x, a.y)} から ${t ? unitName(t) : '?'} を攻撃`;
    }
    case 'hero': {
      const h = FACTIONS[s.players[p].faction].hero;
      return `英雄の力「${h.name}」 → ${coordName(a.x, a.y)}`;
    }
    case 'end':
      return 'ターン終了';
  }
  return '';
}

export function unitName(u) {
  if (u.leader) return '将';
  return CARDS[u.cardId].name;
}

// 計画全体を説明文の列にする (適用しながら進める)
export function describePlan(state, actions) {
  const s = cloneState(state);
  const out = [];
  for (const a of actions) {
    out.push(describeAction(s, a));
    if (!applyAction(s, a)) break;
  }
  return out;
}

// AI の「意図」を短い言葉で
export function intentOf(state, result) {
  const p = state.current;
  const d0 = {}, d1 = {};
  evaluate(state, p, d0);
  const fin = result.state;
  if (fin && fin.winner === p) return { tag: '必勝', text: '敵リーダーを討ち取る手順を発見した。' };
  evaluate(fin || state, p, d1);
  const kills = fin ? state.units.filter((u) => u.owner !== p && !fin.units.some((v) => v.uid === u.uid)).length : 0;
  if (d0.threatToMe >= d0.myHp * 0.6 && d1.threatToMe < d0.threatToMe) return { tag: '防衛', text: `リーダーへの脅威 ${d0.threatToMe} を察知。守りを固める。` };
  if (kills >= 2) return { tag: '殲滅', text: `敵ユニット ${kills} 体の撃破を狙う。` };
  if (d1.threatToOp > d0.threatToOp + 2) return { tag: '攻勢', text: '敵リーダーへの包囲網を築く。' };
  if (kills === 1) return { tag: '交戦', text: '有利な交換で戦力を削る。' };
  if (result.actions.some((a) => a.type === 'play')) return { tag: '展開', text: '戦力を展開し盤面を整える。' };
  return { tag: '待機', text: '無理をせず次の機会を窺う。' };
}

export { forecast };
