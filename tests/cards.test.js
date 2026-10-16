import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, cloneState, applyAction, cardTargets, leaderOf } from '../src/engine/rules.js';
import { CARDS, PRESETS, validateDeck, cardPool, DECK_SIZE } from '../src/engine/cards.js';

function addUnit(s, owner, cardId, x, y) {
  const c = CARDS[cardId];
  const u = { uid: s.nextUid++, owner, cardId, atk: c.atk, hp: c.hp, maxHp: c.hp, move: c.move, range: c.range, armor: c.armor, regen: c.regen, kw: c.keywords, x, y, moved: false, attacked: false, sick: false, frozen: false, leader: false };
  s.units.push(u);
  return u;
}

test('構築済みデッキはすべてルールを満たす', () => {
  for (const [f, list] of Object.entries(PRESETS)) {
    for (const p of list) assert.deepEqual(validateDeck(f, p.cards), [], `${f}/${p.id}`);
  }
});

test('デッキ検証: 枚数・上限・勢力違いを検出', () => {
  const pool = cardPool('fire');
  assert.ok(validateDeck('fire', pool.slice(0, 10)).length > 0);
  const tooMany = Array(DECK_SIZE).fill('fi_imp');
  assert.ok(validateDeck('fire', tooMany).some((e) => e.includes('2枚まで')));
  const legend = [...PRESETS.fire[0].cards.slice(0, 28), 'fi_phoenix', 'fi_phoenix'];
  assert.ok(validateDeck('fire', legend).some((e) => e.includes('1枚まで')));
  const other = [...PRESETS.fire[0].cards.slice(0, 29), 'fo_wolf'];
  assert.ok(validateDeck('fire', other).some((e) => e.includes('使えません')));
});

test('全カードを有効な対象すべてに使っても例外が出ない', () => {
  const base = createGame({ factions: ['fire', 'azure'], seed: 9, first: 0 });
  base.tiles.forEach((t, i) => { t.terrain = ['plain', 'forest', 'lava', 'water'][i % 4]; t.height = i % 3; });
  addUnit(base, 0, 'n_squire', 2, 2);
  addUnit(base, 0, 'fo_treant', 4, 1);
  addUnit(base, 1, 'n_giant', 3, 3);
  addUnit(base, 1, 'az_cog', 2, 4);
  addUnit(base, 1, 'fi_bomber', 4, 3);
  base.events = [];
  let plays = 0;
  for (const id of Object.keys(CARDS)) {
    const c = CARDS[id];
    if (c.type === 'leader') continue;
    const s0 = cloneState(base);
    s0.events = [];
    s0.players[0].hand.push({ uid: 99999, cardId: id });
    s0.players[0].mana = 10;
    const targets = cardTargets(s0, 0, id) || [{}];
    for (const t of targets) {
      for (const dir of c.dir ? [1, -1] : [undefined]) {
        const s = cloneState(s0);
        s.events = [];
        assert.ok(applyAction(s, { type: 'play', handUid: 99999, x: t.x, y: t.y, dir }), `${id} at ${t.x},${t.y}`);
        // ターンを回して開始時効果・溶岩などもまとめて確認
        applyAction(s, { type: 'end' });
        applyAction(s, { type: 'end' });
        plays++;
      }
    }
  }
  assert.ok(plays > 500);
});

test('遺言: 爆弾魔は倒れると隣接する敵に2ダメージ、不死鳥は手札に戻る', () => {
  const s = createGame({ factions: ['fire', 'forest'], seed: 4, first: 0 });
  s.tiles.forEach((t) => { t.terrain = 'plain'; t.height = 0; });
  const bomber = addUnit(s, 1, 'fi_bomber', 3, 3);
  const a = addUnit(s, 0, 'n_giant', 3, 2);
  const b = addUnit(s, 0, 'n_squire', 2, 3);
  s.events = [];
  assert.ok(applyAction(s, { type: 'attack', uid: a.uid, target: bomber.uid }));
  assert.equal(a.hp, CARDS.n_giant.hp - 2);
  assert.ok(s.events.some((e) => e.type === 'death' && e.uid === b.uid));
  const ph = addUnit(s, 0, 'fi_phoenix', 5, 5);
  ph.hp = 0;
  const before = s.players[0].hand.length;
  s.players[1].hand.length = 0;
  // 呪文で倒す
  s.players[0].hand.push({ uid: 777, cardId: 's_lightning' });
  s.players[0].mana = 5;
  const foe = addUnit(s, 1, 'n_squire', 6, 6);
  ph.hp = 1;
  const g = addUnit(s, 1, 'n_archer', 5, 3);
  g.sick = false;
  applyAction(s, { type: 'end' });
  // 相手の弓兵で不死鳥を撃つ
  applyAction(s, { type: 'attack', uid: g.uid, target: ph.uid });
  assert.ok(s.players[0].hand.some((h) => h.cardId === 'fi_phoenix'));
  void before; void foe;
});

test('撤退命令でユニットが手札に戻る', () => {
  const s = createGame({ factions: ['azure', 'fire'], seed: 6, first: 0 });
  const u = addUnit(s, 0, 'az_guardian', 2, 1);
  s.players[0].hand.push({ uid: 555, cardId: 's_recall' });
  s.players[0].mana = 5;
  assert.ok(applyAction(s, { type: 'play', handUid: 555, x: 2, y: 1 }));
  assert.ok(!s.units.includes(u));
  assert.ok(s.players[0].hand.some((h) => h.cardId === 'az_guardian'));
  void leaderOf;
});

test('完全下位互換のユニットが存在しない', () => {
  // x が y と同じデッキに入れられ、コストが同じか高く、能力値・キーワードがすべて y 以下で、
  // 固有の効果も持たないなら x は y の完全下位互換
  // デッキに入れられない派生カード (token) は比較しない
  const units = Object.values(CARDS).filter((c) => c.type === 'unit' && !c.token);
  const hasFx = (c) => !!(c.onSummon || c.onDeath || c.onTurnStart || c.text);
  const shareDeck = (a, b) => a.faction === 'neutral' || b.faction === 'neutral' || a.faction === b.faction;
  const found = [];
  for (const x of units) {
    if (hasFx(x)) continue;
    for (const y of units) {
      if (x === y || !shareDeck(x, y) || (y.legend && !x.legend)) continue;
      const worse = x.cost >= y.cost && x.atk <= y.atk && x.hp <= y.hp && x.move <= y.move && x.range <= y.range
        && x.armor <= y.armor && x.regen <= y.regen && x.keywords.every((k) => y.keywords.includes(k));
      if (worse) found.push(`${x.name} は ${y.name} の下位互換`);
    }
  }
  assert.deepEqual(found, []);
});
