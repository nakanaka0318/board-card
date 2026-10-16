// 構築済みデッキ同士を AI で総当たりさせ、ティア表 (src/data/tier.js) を作る: npm run tier [-- 対戦数]
// 各組み合わせを「対戦数」回 (先後・席・マップを入れ替えて) 戦わせる。
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { createGame, applyAction } from '../src/engine/rules.js';
import { planTurn, DIFFICULTY } from '../src/engine/ai.js';
import { PRESETS, FACTIONS } from '../src/engine/cards.js';
import { CURRENT_VERSION } from '../src/data/changelog.js';

const DECKS = Object.entries(PRESETS).flatMap(([f, ps]) => ps.map((p) => ({ f, id: p.id, name: p.name, cards: p.cards })));
const MAPS = ['classic', 'highlands', 'volcano', 'random'];

async function playGame(job) {
  const A = DECKS[job.a], B = DECKS[job.b];
  const s = createGame({ factions: [A.f, B.f], decks: [A.cards, B.cards], seed: job.seed, first: job.first, map: MAPS[job.map] });
  let t = 0;
  while (s.winner === null && t < 120) {
    const plan = await planTurn(s, DIFFICULTY.normal);
    for (const x of plan.actions) if (!applyAction(s, x) || s.winner !== null) break;
    if (s.winner === null) applyAction(s, { type: 'end' });
    t++;
  }
  return { a: job.a, b: job.b, winner: s.winner, rounds: s.round };
}

if (!isMainThread) {
  const out = [];
  for (const job of workerData.jobs) out.push(await playGame(job));
  parentPort.postMessage(out);
} else {
  const N = Math.max(2, +process.argv[2] || 12);
  const jobs = [];
  for (let a = 0; a < DECKS.length; a++) for (let b = a + 1; b < DECKS.length; b++) {
    for (let g = 0; g < N; g++) {
      // 偶数回目は席を入れ替える
      const [x, y] = g % 2 ? [b, a] : [a, b];
      jobs.push({ a: x, b: y, seed: 7919 * a + 104729 * b + 31 * g + 1, first: (g >> 1) % 2, map: g % MAPS.length });
    }
  }
  const W = Math.max(1, availableParallelism());
  console.log(`${DECKS.length} デッキ / ${jobs.length} 戦 / ${W} スレッド`);
  const t0 = Date.now();
  const chunks = Array.from({ length: W }, (_, i) => jobs.filter((_, j) => j % W === i));
  const results = (await Promise.all(chunks.map((c) => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { jobs: c } });
    w.on('message', res);
    w.on('error', rej);
  })))).flat();

  const deckStat = DECKS.map(() => ({ w: 0, l: 0, d: 0 }));
  const fac = Object.fromEntries(Object.keys(FACTIONS).map((f) => [f, { w: 0, l: 0, d: 0 }]));
  const mu = {};
  let rounds = 0;
  for (const r of results) {
    rounds += r.rounds;
    const A = DECKS[r.a], B = DECKS[r.b];
    const res = r.winner === 0 ? [1, 0] : r.winner === 1 ? [0, 1] : [0.5, 0.5];
    for (const [i, k] of [[r.a, 0], [r.b, 1]]) {
      if (res[k] === 1) deckStat[i].w++; else if (res[k] === 0) deckStat[i].l++; else deckStat[i].d++;
    }
    if (A.f === B.f) continue; // 同じ勢力どうしは勢力の勝率に数えない
    for (const [f, k] of [[A.f, 0], [B.f, 1]]) {
      if (res[k] === 1) fac[f].w++; else if (res[k] === 0) fac[f].l++; else fac[f].d++;
    }
    const key = (x, y) => ((mu[x] ||= {})[y] ||= { w: 0, n: 0 });
    key(A.f, B.f).w += res[0]; key(A.f, B.f).n++;
    key(B.f, A.f).w += res[1]; key(B.f, A.f).n++;
  }
  const rate = (o) => (o.w + o.d / 2) / Math.max(1, o.w + o.l + o.d);
  const tierOf = (r) => (r >= 0.56 ? 'S' : r >= 0.52 ? 'A' : r >= 0.48 ? 'B' : r >= 0.44 ? 'C' : 'D');
  const factions = Object.entries(fac).map(([id, o]) => ({ id, name: FACTIONS[id].name, wins: o.w, losses: o.l, draws: o.d, rate: +rate(o).toFixed(3) }))
    .sort((a, b) => b.rate - a.rate).map((x) => ({ ...x, tier: tierOf(x.rate) }));
  const decks = DECKS.map((d, i) => ({ id: d.id, faction: d.f, name: d.name, wins: deckStat[i].w, losses: deckStat[i].l, draws: deckStat[i].d, rate: +rate(deckStat[i]).toFixed(3) }))
    .sort((a, b) => b.rate - a.rate).map((x) => ({ ...x, tier: tierOf(x.rate) }));
  const matchups = Object.fromEntries(Object.entries(mu).map(([a, o]) => [a, Object.fromEntries(Object.entries(o).map(([b, v]) => [b, +(v.w / v.n).toFixed(3)]))]));
  const data = {
    version: CURRENT_VERSION,
    date: new Date().toISOString().slice(0, 10),
    games: results.length,
    perPair: N,
    avgRounds: +(rounds / results.length).toFixed(1),
    factions, decks, matchups,
  };
  const js = `// npm run tier で生成 (構築済みデッキ同士の AI 総当たり)。手で編集しない。\nexport const TIER = ${JSON.stringify(data, null, 2)};\n`;
  writeFileSync(new URL('../src/data/tier.js', import.meta.url), js);
  console.log(`完了 ${((Date.now() - t0) / 1000).toFixed(0)}秒  平均 ${data.avgRounds} ラウンド`);
  for (const f of factions) console.log(`${f.tier}  ${f.name}  ${(f.rate * 100).toFixed(1)}%  (${f.wins}-${f.losses}${f.draws ? '-' + f.draws : ''})`);
  for (const d of decks) console.log(`   ${d.tier} ${d.name} (${d.faction}) ${(d.rate * 100).toFixed(1)}%`);
}
