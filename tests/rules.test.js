import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, cloneState, applyAction, reachable, calcDamage, unitAt, leaderOf, idx, W, H, tileAt, targetsFor, effAtk, canSkill,
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
  assert.equal(foe.hp, 16 - 2);
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

test('アップデート履歴: 新しい順で、バージョンが package.json と一致', async () => {
  const { CHANGELOG, CURRENT_VERSION } = await import('../src/data/changelog.js');
  const { readFileSync } = await import('node:fs');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(CURRENT_VERSION, pkg.version);
  const num = (v) => v.split('.').map(Number).reduce((a, b) => a * 1000 + b, 0);
  for (let i = 1; i < CHANGELOG.length; i++) assert.ok(num(CHANGELOG[i - 1].version) > num(CHANGELOG[i].version));
  for (const v of CHANGELOG) for (const it of v.items) assert.ok(['新機能', '改善', '調整', '修正'].includes(it.tag));
});

test('指揮力: 移動・攻撃は1ターン合計3回、移動して攻撃は2消費、次のターンに回復', () => {
  const s = blank();
  const us = [0, 1, 2, 3].map((x) => addUnit(s, 0, 'fi_blade', x, 2));
  assert.equal(s.players[0].cp, 3);
  for (let i = 0; i < 3; i++) assert.ok(applyAction(s, { type: 'move', uid: us[i].uid, x: us[i].x, y: 3 }), `move ${i}`);
  assert.equal(s.players[0].cp, 0);
  assert.equal(applyAction(s, { type: 'move', uid: us[3].uid, x: 3, y: 3 }), false);
  applyAction(s, { type: 'end' });
  applyAction(s, { type: 'end' });
  assert.equal(s.players[0].cp, 3);
  // 敵を置き、移動して攻撃 (2消費) → 残り1では移動して攻撃できない
  const e1 = addUnit(s, 1, 'fi_blade', 0, 5);
  const e2 = addUnit(s, 1, 'fi_blade', 3, 5);
  e1.hp = e2.hp = 20; e1.maxHp = e2.maxHp = 20;
  assert.ok(applyAction(s, { type: 'moveAttack', uid: us[0].uid, x: 0, y: 4, target: e1.uid }));
  assert.equal(s.players[0].cp, 1);
  assert.equal(applyAction(s, { type: 'moveAttack', uid: us[3].uid, x: 3, y: 4, target: e2.uid }), false);
  assert.ok(applyAction(s, { type: 'move', uid: us[3].uid, x: 3, y: 4 }));
  assert.equal(s.players[0].cp, 0);
});

test('将の移動: 指揮力を使わず、森・水辺や1段の段差も1マス、崖は登れない', () => {
  const s = blank();
  const L = leaderOf(s, 0);
  L.x = 3; L.y = 2;
  tileAt(s, 3, 3).terrain = 'forest'; tileAt(s, 3, 3).height = 1;
  tileAt(s, 4, 2).height = 2;
  s.players[0].cp = 0;
  const r = reachable(s, L);
  assert.ok(r.tiles.includes(idx(3, 3)), '森+1段に移動できる');
  assert.ok(!r.tiles.includes(idx(4, 2)), '段差2は登れない');
  assert.ok(applyAction(s, { type: 'move', uid: L.uid, x: 3, y: 3 }));
  assert.equal(s.players[0].cp, 0);
  // 移動して攻撃は攻撃分の指揮力 1 だけ
  const s2 = blank();
  const L2 = leaderOf(s2, 0);
  L2.x = 3; L2.y = 2;
  const e = addUnit(s2, 1, 'fi_blade', 3, 4);
  e.hp = e.maxHp = 20;
  s2.players[0].cp = 1;
  assert.ok(applyAction(s2, { type: 'moveAttack', uid: L2.uid, x: 3, y: 3, target: e.uid }));
  assert.equal(s2.players[0].cp, 0);
});

// 手札に入れて召喚する (onSummon・環境の登録を通すため)
function summon(s, p, cardId, x, y) {
  s.players[p].hand.push({ uid: s.nextUid++, cardId });
  s.players[p].mana = 10;
  const h = s.players[p].hand[s.players[p].hand.length - 1];
  assert.ok(applyAction(s, { type: 'play', handUid: h.uid, x, y }), 'summon ' + cardId);
  return s.units[s.units.length - 1];
}

test('奥義「煉獄変」: 森と水辺が溶岩に、敵に1ダメージ。1回だけ・召喚ターンは不可', () => {
  const s = blank();
  s.events = [];
  tileAt(s, 0, 3).terrain = 'forest'; tileAt(s, 6, 4).terrain = 'water';
  const d = summon(s, 0, 'fi_inferno', 3, 1);
  const e = addUnit(s, 1, 'fi_blade', 5, 5);
  const hp = e.hp;
  assert.equal(canSkill(s, d), false, '召喚したターンは使えない');
  d.sick = false;
  assert.ok(applyAction(s, { type: 'skill', uid: d.uid }));
  assert.equal(tileAt(s, 0, 3).terrain, 'lava');
  assert.equal(tileAt(s, 6, 4).terrain, 'lava');
  assert.equal(e.hp, hp - 1);
  assert.equal(s.players[0].cp, 2);
  assert.ok(s.events.some((ev) => ev.type === 'fieldChange' && ev.tiles.length === 2));
  assert.ok(!s.events.some((ev) => ev.type === 'tile'), '個別の tile イベントはまとめられる');
  d.attacked = false;
  assert.equal(applyAction(s, { type: 'skill', uid: d.uid }), false, '2回目は使えない');
});

test('奥義「天地反転」: 高さが反転し、敵ユニットが凍結', () => {
  const s = blank();
  tileAt(s, 1, 1).height = 3; tileAt(s, 2, 2).height = 1;
  const a = summon(s, 0, 'az_astra', 3, 1);
  a.sick = false;
  const e = addUnit(s, 1, 'fi_blade', 4, 4);
  assert.ok(applyAction(s, { type: 'skill', uid: a.uid }));
  assert.equal(tileAt(s, 1, 1).height, 0);
  assert.equal(tileAt(s, 2, 2).height, 2);
  assert.equal(tileAt(s, 5, 5).height, 3);
  assert.ok(e.frozen);
  assert.ok(!leaderOf(s, 1).frozen, '将は凍結しない');
});

test('奥義「大樹海」: 平原と溶岩が森に、味方を3回復', () => {
  const s = blank();
  tileAt(s, 2, 2).terrain = 'lava'; tileAt(s, 4, 4).terrain = 'water';
  const t = summon(s, 0, 'fo_worldtree', 3, 1);
  t.sick = false;
  leaderOf(s, 0).hp = 10;
  assert.ok(applyAction(s, { type: 'skill', uid: t.uid }));
  assert.equal(tileAt(s, 2, 2).terrain, 'forest');
  assert.equal(tileAt(s, 0, 6).terrain, 'forest');
  assert.equal(tileAt(s, 4, 4).terrain, 'water');
  assert.equal(leaderOf(s, 0).hp, 13);
});

test('環境: 焦天で攻撃力+1、最後に召喚した環境が有効、倒れると戻る', () => {
  const s = blank();
  s.events = [];
  const L = leaderOf(s, 0);
  assert.equal(effAtk(s, L), 2);
  const sun = summon(s, 0, 'fi_sunpriest', 2, 1);
  assert.equal(s.envKind, 'scorch');
  assert.equal(effAtk(s, L), 3);
  assert.ok(s.events.some((e) => e.type === 'env' && e.kind === 'scorch'));
  const star = summon(s, 0, 'az_stargazer', 4, 1);
  assert.equal(s.envKind, 'zerog');
  assert.equal(effAtk(s, L), 2);
  // 無重力: 移動力+1、崖を登れる
  const u = addUnit(s, 0, 'fi_blade', 0, 3);
  tileAt(s, 0, 4).height = 3;
  const r = reachable(s, u);
  assert.ok(r.tiles.includes(idx(0, 4)), '崖を登れる');
  assert.ok(r.tiles.includes(idx(0, 5)) || r.tiles.includes(idx(3, 3)), '移動力+1');
  // 星海の観測者が倒れると焦天に戻り、灼天の巫女も倒れると元に戻る
  s.current = 1;
  s.players[1].cp = 3;
  for (const [target, x] of [[star, 4], [sun, 2]]) {
    target.hp = 1;
    const e = addUnit(s, 1, 'fi_blade', x, 2);
    assert.ok(applyAction(s, { type: 'attack', uid: e.uid, target: target.uid }));
  }
  assert.ok(s.events.some((e) => e.type === 'env' && e.kind === 'scorch' && e.prev === 'zerog'));
  assert.equal(s.envKind, null);
});

test('環境: 恵みの霧雨でターン開始時に手番側のユニットが1回復', () => {
  const s = blank();
  const rl = summon(s, 0, 'fo_rainlord', 2, 1);
  const a = addUnit(s, 0, 'fi_blade', 3, 3);
  const b = addUnit(s, 1, 'fi_blade', 3, 5);
  a.hp = 1; b.hp = 1;
  leaderOf(s, 0).hp = 10;
  applyAction(s, { type: 'end' });
  assert.equal(b.hp, 2, '相手の手番で相手側が回復');
  assert.equal(a.hp, 1);
  applyAction(s, { type: 'end' });
  assert.equal(a.hp, 2);
  assert.equal(leaderOf(s, 0).hp, 10, '将は回復しない');
  assert.ok(rl.hp > 0);
});

test('雷研究室: 研究者が実験体を出し、研究室で+2/+2、フィーリンが倒れると戻る', () => {
  const s = createGame({ factions: ['lab', 'fire'], seed: 5, first: 0 });
  s.tiles.forEach((t) => { t.terrain = 'plain'; t.height = 0; });
  s.events = [];
  summon(s, 0, 'lb_devotee', 2, 1);
  const subj = s.units.find((u) => u.cardId === 'lb_subject');
  assert.ok(subj, '実験体が出る');
  assert.equal(subj.sick, false, '突撃');
  const fe = summon(s, 0, 'lb_feelin', 4, 1);
  assert.equal(s.envKind, 'lab');
  assert.equal(subj.atk, 4);
  assert.equal(subj.hp, 3);
  // 研究室の間に出た実験体にも効く
  summon(s, 0, 'lb_devotee', 5, 1);
  const subs = s.units.filter((u) => u.cardId === 'lb_subject');
  assert.equal(subs.length, 2);
  assert.ok(subs.every((u) => u.atk === 4 && u.maxHp === 3));
  // フィーリンが倒れると元に戻る
  s.current = 1;
  fe.hp = 1;
  const e = addUnit(s, 1, 'fi_blade', 4, 2);
  assert.ok(applyAction(s, { type: 'attack', uid: e.uid, target: fe.uid }));
  assert.equal(s.envKind, null);
  assert.ok(subs.every((u) => u.atk === 2 && u.maxHp === 1 && u.hp === 1));
});

test('人らしい愛: 2種類の実験体を手札に加える / 監視員で+1/+1', () => {
  const s = blank({ factions: ['lab', 'fire'] });
  const before = s.players[0].hand.length;
  summonSpell(s, 0, 's_lb_love');
  const added = s.players[0].hand.slice(before).map((h) => h.cardId);
  assert.deepEqual(added, ['lb_subject_a', 'lb_subject_b']);
  assert.equal(CARDS.lb_subject_a.cost, 0);
  assert.equal(CARDS.lb_subject_b.atk, 3);
  const a = summon(s, 0, 'lb_subject_a', 1, 1);
  summon(s, 0, 'lb_warden', 2, 1);
  assert.equal(a.atk, 3);
  assert.equal(a.hp, 3);
});

test('セフィー: 自分のターン終了時、実験体の数だけ敵にランダム1ダメージ', () => {
  const s = blank({ factions: ['lab', 'fire'] });
  summon(s, 0, 'lb_sephy', 3, 1);
  summon(s, 0, 'lb_subject', 1, 1);
  summon(s, 0, 'lb_subject', 5, 1);
  const L = leaderOf(s, 1);
  const hp0 = L.hp;
  applyAction(s, { type: 'end' });
  assert.equal(L.hp, hp0 - 2, '敵が将だけなら将に2ダメージ');
});

test('烏ノ涅: 敵ユニット2体に3ダメージ、実験体を出す', () => {
  const s = blank({ factions: ['lab', 'fire'] });
  const a = addUnit(s, 1, 'n_giant', 1, 5), b = addUnit(s, 1, 'n_giant', 5, 5);
  summonSpell(s, 0, 's_lb_crow');
  assert.equal(a.hp, CARDS.n_giant.hp - 3);
  assert.equal(b.hp, CARDS.n_giant.hp - 3);
  assert.ok(s.units.some((u) => u.cardId === 'lb_subject' && u.owner === 0));
});

function summonSpell(s, p, cardId) {
  s.players[p].hand.push({ uid: s.nextUid++, cardId });
  s.players[p].mana = 10;
  const h = s.players[p].hand[s.players[p].hand.length - 1];
  assert.ok(applyAction(s, { type: 'play', handUid: h.uid }), 'play ' + cardId);
}
