import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, cloneState, applyAction, reachable, calcDamage, unitAt, leaderOf, idx, W, H, tileAt, targetsFor,
} from '../src/engine/rules.js';
import { MAPS, buildMap } from '../src/engine/maps.js';
import { CARDS, DECKS } from '../src/engine/cards.js';

// 盤面をまっさらな平原にしたテスト用の局面
function blank(opts = {}) {
  const s = createGame({ factions: ['fire', 'azure'], seed: 1, first: 0, map: 'classic', ...opts });
  s.tiles.forEach((t) => { t.terrain = 'plain'; t.height = 0; });
  s.events = null;
  return s;
}

function addUnit(s, owner, cardId, x, y, extra = {}) {
  const c = CARDS[cardId];
  const u = {
    uid: s.nextUid++, owner, cardId, atk: c.atk, hp: c.hp, maxHp: c.hp, move: c.move, range: c.range, armor: c.armor,
    regen: c.regen, kw: c.keywords, x, y, moved: false, attacked: false, sick: false, frozen: false, leader: false, ...extra,
  };
  s.units.push(u);
  return u;
}

test('マップはすべて 180 度回転対称', () => {
  for (const name of Object.keys(MAPS)) {
    const tiles = buildMap(name, { rng: 1 });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = tiles[idx(x, y)], b = tiles[idx(W - 1 - x, H - 1 - y)];
      assert.equal(a.terrain, b.terrain, `${name} terrain ${x},${y}`);
      assert.equal(a.height, b.height, `${name} height ${x},${y}`);
    }
  }
  const r = buildMap('random', { rng: 42 });
  for (let i = 0; i < r.length; i++) assert.equal(r[i].terrain, r[W * H - 1 - i].terrain);
});

test('デッキは各30枚で、すべて存在するカード', () => {
  for (const [f, deck] of Object.entries(DECKS)) {
    assert.equal(deck.length, 30, f);
    for (const id of deck) assert.ok(CARDS[id], id);
  }
});

test('初期状態: 将・手札・マナ', () => {
  const s = createGame({ factions: ['fire', 'forest'], seed: 3, first: 0 });
  assert.equal(s.units.length, 2);
  assert.equal(leaderOf(s, 0).y, 0);
  assert.equal(leaderOf(s, 1).y, 6);
  assert.equal(s.players[0].hand.length, 4); // 3 + ターン開始ドロー
  assert.equal(s.players[1].hand.length, 4);
  assert.equal(s.players[0].mana, 1);
  assert.equal(s.current, 0);
});

test('移動: 高低差2以上の崖は登れず、飛行は越えられる', () => {
  const s = blank();
  const u = addUnit(s, 0, 'n_squire', 2, 2);
  tileAt(s, 3, 2).height = 2;
  let r = reachable(s, u);
  assert.ok(!r.tiles.includes(idx(3, 2)));
  const f = addUnit(s, 0, 'fi_dragon', 2, 3);
  r = reachable(s, f);
  assert.ok(r.tiles.includes(idx(3, 2)));
});

test('移動: 敵はすり抜けられず、守護に隣接すると停止する', () => {
  const s = blank();
  const u = addUnit(s, 0, 'n_cavalry', 0, 3); // 移動4
  addUnit(s, 1, 'n_spear', 2, 4); // 守護
  const r = reachable(s, u);
  // (2,3) は守護の隣なのでそこで止まり、(3,3) へは抜けられない (別経路は 5 歩)
  assert.ok(r.tiles.includes(idx(2, 3)));
  assert.ok(!r.tiles.includes(idx(3, 3)));
});

test('戦闘: 高所+1、森の遮蔽-1、鉄壁、反撃', () => {
  const s = blank();
  const a = addUnit(s, 0, 'fi_blade', 2, 2); // 3/3
  const d = addUnit(s, 1, 'n_squire', 2, 3); // 2/2
  tileAt(s, 2, 2).height = 1;
  assert.equal(calcDamage(s, a, 2, 2, d, 2, 3), 4);
  const arch = addUnit(s, 0, 'n_archer', 0, 0);
  tileAt(s, 0, 3).terrain = 'forest';
  const t = addUnit(s, 1, 'n_giant', 0, 3);
  assert.equal(calcDamage(s, arch, 0, 0, t, 0, 3), 1);
  const cog = addUnit(s, 1, 'az_cog', 5, 5);
  assert.equal(calcDamage(s, a, 5, 4, cog, 5, 5), 2);
  // 反撃
  s.events = [];
  const tank = addUnit(s, 1, 'n_shield', 4, 3);
  const att = addUnit(s, 0, 'n_squire', 4, 2);
  assert.ok(applyAction(s, { type: 'attack', uid: att.uid, target: tank.uid }));
  assert.equal(tank.hp, 6 - 1); // 2 - 鉄壁1
  assert.equal(att.hp, 2 - 1);
  assert.ok(s.events.some((e) => e.type === 'attack' && e.counter));
});

test('地脈滑動: 行が回り込み、ユニットも一緒に動く', () => {
  const s = blank();
  const u = addUnit(s, 1, 'n_squire', 6, 3);
  const ids = s.tiles.slice(idx(0, 3), idx(0, 3) + W).map((t) => t.id);
  s.players[0].hand.push({ uid: 9999, cardId: 'f_slide' });
  s.players[0].mana = 5;
  assert.ok(applyAction(s, { type: 'play', handUid: 9999, x: 3, y: 3, dir: 1 }));
  assert.equal(u.x, 0);
  assert.equal(tileAt(s, 0, 3).id, ids[6]);
  assert.equal(tileAt(s, 1, 3).id, ids[0]);
});

test('旋回陣: 3x3 が時計回りに回転し、ユニットも移動', () => {
  const s = blank();
  const u = addUnit(s, 1, 'n_squire', 2, 4); // 中心(3,3)の左上
  const before = tileAt(s, 2, 4).id;
  s.players[0].hand.push({ uid: 9998, cardId: 'f_rotate' });
  s.players[0].mana = 5;
  assert.ok(applyAction(s, { type: 'play', handUid: 9998, x: 3, y: 3, dir: 1 }));
  // 左上 -> 右上
  assert.deepEqual([u.x, u.y], [4, 4]);
  assert.equal(tileAt(s, 4, 4).id, before);
  assert.equal(tileAt(s, 3, 3).id, idx(3, 3));
});

test('地殻変動は 4 ラウンド目の開始時に起きる', () => {
  const s = blank();
  s.events = [];
  let seen = false;
  for (let i = 0; i < 6; i++) {
    applyAction(s, { type: 'end' });
    if (s.events.some((e) => e.type === 'tectonic')) { seen = true; assert.equal(s.round, 4); break; }
  }
  assert.ok(seen);
});

test('侵攻: 敵陣のユニットがターン開始時に敵の将へダメージ', () => {
  const s = blank();
  addUnit(s, 0, 'n_squire', 0, 6);
  addUnit(s, 0, 'n_squire', 6, 5);
  const foe = leaderOf(s, 1);
  applyAction(s, { type: 'end' }); // 相手のターン
  applyAction(s, { type: 'end' }); // 自分のターン開始で侵攻
  assert.equal(foe.hp, 18 - 2);
});

test('溶岩: ターン終了時に地上ユニットへ2ダメージ (耐火は無効)', () => {
  const s = blank();
  tileAt(s, 1, 1).terrain = 'lava';
  tileAt(s, 2, 1).terrain = 'lava';
  const a = addUnit(s, 0, 'n_shield', 1, 1);
  const b = addUnit(s, 0, 'fi_golem', 2, 1);
  applyAction(s, { type: 'end' });
  assert.equal(a.hp, 6 - 2);
  assert.equal(b.hp, 6);
});

test('将が倒れると決着し、以後の行動は無効', () => {
  const s = blank();
  const foe = leaderOf(s, 1);
  foe.hp = 2;
  const u = addUnit(s, 0, 'fi_blade', foe.x, foe.y - 1);
  assert.ok(applyAction(s, { type: 'attack', uid: u.uid, target: foe.uid }));
  assert.equal(s.winner, 0);
  assert.equal(applyAction(s, { type: 'end' }), false);
});

test('cloneState は独立した複製を作る', () => {
  const s = createGame({ factions: ['azure', 'fire'], seed: 5 });
  const c = cloneState(s);
  c.units[0].hp = 1;
  c.tiles[0].height = 3;
  c.players[0].hand.pop();
  assert.notEqual(s.units[0].hp, 1);
  assert.notEqual(s.tiles[0].height, 3);
  assert.equal(s.players[0].hand.length, 4);
});

test('英雄の力の対象', () => {
  const s = blank();
  addUnit(s, 1, 'n_squire', 3, 3);
  addUnit(s, 1, 'n_squire', 3, 5);
  const t = targetsFor(s, 0, 'heroEnemy3');
  assert.equal(t.length, 1);
  assert.ok(unitAt(s, t[0].x, t[0].y));
});
