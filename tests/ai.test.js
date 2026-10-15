import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, leaderOf, cloneState } from '../src/engine/rules.js';
import { CARDS } from '../src/engine/cards.js';
import { planTurn, evaluate, DIFFICULTY, describePlan } from '../src/engine/ai.js';

function addUnit(s, owner, cardId, x, y) {
  const c = CARDS[cardId];
  const u = { uid: s.nextUid++, owner, cardId, atk: c.atk, hp: c.hp, maxHp: c.hp, move: c.move, range: c.range, armor: c.armor, regen: c.regen, kw: c.keywords, x, y, moved: false, attacked: false, sick: false, frozen: false, leader: false };
  s.units.push(u);
  return u;
}

test('AI は討ち取れる将を見逃さない', async () => {
  const s = createGame({ factions: ['fire', 'forest'], seed: 11, first: 0 });
  s.tiles.forEach((t) => { t.terrain = 'plain'; t.height = 0; });
  const foe = leaderOf(s, 1);
  foe.hp = 5;
  addUnit(s, 0, 'fi_blade', 2, 4);
  addUnit(s, 0, 'n_giant', 4, 4);
  const res = await planTurn(s, DIFFICULTY.normal);
  const t = cloneState(s);
  for (const a of res.actions) applyAction(t, a);
  assert.equal(t.winner, 0, describePlan(s, res.actions).join(' / '));
});

test('評価関数は盤面の左右反転・陣営入れ替えで対称', () => {
  const s = createGame({ factions: ['fire', 'fire'], seed: 21, first: 0, map: 'classic' });
  addUnit(s, 0, 'fi_blade', 2, 2);
  addUnit(s, 1, 'n_archer', 5, 5);
  const m = cloneState(s);
  m.tiles = s.tiles.map((_, i) => ({ ...s.tiles[48 - i] }));
  m.units = s.units.map((u) => ({ ...u, owner: 1 - u.owner, x: 6 - u.x, y: 6 - u.y }));
  m.players = [s.players[1], s.players[0]].map((p) => ({ ...p, hand: p.hand.map((h) => ({ ...h })) }));
  m.current = 1 - s.current;
  assert.ok(Math.abs(evaluate(s, s.current) - evaluate(m, m.current)) < 1e-6);
});

test('AI 同士の対局は例外なく決着する', async () => {
  const factions = [['fire', 'azure'], ['forest', 'fire'], ['azure', 'forest']];
  for (let g = 0; g < factions.length; g++) {
    const s = createGame({ factions: factions[g], seed: 100 + g, first: g % 2, map: ['classic', 'highlands', 'volcano'][g] });
    let turns = 0;
    while (s.winner === null && turns < 120) {
      const res = await planTurn(s, DIFFICULTY.easy);
      for (const a of res.actions) { if (!applyAction(s, a) || s.winner !== null) break; }
      if (s.winner === null) applyAction(s, { type: 'end' });
      turns++;
    }
    assert.notEqual(s.winner, null, `game ${g} did not finish`);
  }
});
