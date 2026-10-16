// 各勢力のカードプールからランダムなデッキを組んで AI 対戦させ、カードごとの
// 「使われた試合の勝率」と「引いたときに使われた割合」を集計する: node scripts/cardstats.mjs [試合数/勢力]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { createGame, applyAction } from '../src/engine/rules.js';
import { planTurn, DIFFICULTY } from '../src/engine/ai.js';
import { CARDS, PRESETS, FACTIONS, cardPool, maxCopies } from '../src/engine/cards.js';

function rng(seed) { let s = seed | 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function randomDeck(f, r) {
  // 勢力カードを重めに (各1〜2枚)、残りを中立で埋める
  const own = cardPool(f).filter((id) => CARDS[id].faction === f);
  const neu = cardPool(f).filter((id) => CARDS[id].faction === 'neutral');
  const deck = [];
  for (const id of own) { const n = Math.min(maxCopies(id), 1 + (r() < 0.4 ? 1 : 0)); for (let i = 0; i < n && deck.length < 30; i++) deck.push(id); }
  while (deck.length < 30) {
    const id = neu[Math.floor(r() * neu.length)];
    if (deck.filter((x) => x === id).length < maxCopies(id)) deck.push(id);
  }
  return deck;
}

async function play(job) {
  const r = rng(job.seed);
  const me = randomDeck(job.f, r);
  const opps = Object.entries(PRESETS).filter(([of]) => of !== job.f).flatMap(([of, ps]) => ps.map((p) => ({ of, cards: p.cards })));
  const opp = opps[Math.floor(r() * opps.length)];
  const seat = job.seed % 2;
  const factions = seat ? [opp.of, job.f] : [job.f, opp.of];
  const decks = seat ? [opp.cards, me] : [me, opp.cards];
  const s = createGame({ factions, decks, seed: job.seed, first: (job.seed >> 1) % 2, map: ['classic', 'highlands', 'volcano', 'random'][job.seed % 4] });
  const drawn = new Set(), played = new Set();
  let t = 0;
  while (s.winner === null && t < 120) {
    if (s.current === seat) for (const h of s.players[seat].hand) if (h.cardId) drawn.add(h.cardId);
    const plan = await planTurn(s, DIFFICULTY.normal);
    for (const x of plan.actions) {
      if (x.type === 'play' && s.current === seat) { const h = s.players[seat].hand.find((h) => h.uid === x.handUid); if (h && h.cardId) played.add(h.cardId); }
      if (!applyAction(s, x) || s.winner !== null) break;
    }
    if (s.winner === null) applyAction(s, { type: 'end' });
    t++;
  }
  return { f: job.f, win: s.winner === seat ? 1 : s.winner === -1 ? 0.5 : 0, drawn: [...drawn], played: [...played] };
}

if (!isMainThread) {
  const out = [];
  for (const j of workerData.jobs) out.push(await play(j));
  parentPort.postMessage(out);
} else {
  const N = +process.argv[2] || 120;
  const fs = (process.argv[3] || Object.keys(FACTIONS).join(',')).split(',');
  const jobs = fs.flatMap((f, fi) => Array.from({ length: N }, (_, i) => ({ f, seed: 1000 * fi + i * 7 + 3 })));
  const W = availableParallelism();
  const res = (await Promise.all(Array.from({ length: W }, (_, w) => new Promise((ok, ng) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: { jobs: jobs.filter((_, i) => i % W === w) } });
    wk.on('message', ok); wk.on('error', ng);
  })))).flat();
  for (const f of fs) {
    const rs = res.filter((x) => x.f === f);
    const base = rs.reduce((a, x) => a + x.win, 0) / rs.length;
    const st = {};
    for (const x of rs) {
      for (const id of x.drawn) (st[id] ||= { d: 0, p: 0, w: 0 }).d++;
      for (const id of x.played) { st[id].p++; st[id].w += x.win; }
    }
    console.log(`== ${FACTIONS[f].name}  基準勝率 ${(base * 100).toFixed(1)}% (${rs.length}戦)`);
    const rows = Object.entries(st).filter(([id]) => CARDS[id].faction === f && !CARDS[id].token)
      .map(([id, o]) => ({ id, name: CARDS[id].name, use: o.p / o.d, wr: o.p ? o.w / o.p : 0, n: o.p }))
      .sort((a, b) => (a.wr + a.use * 0.3) - (b.wr + b.use * 0.3));
    for (const r of rows) console.log(`  ${r.id.padEnd(14)} 使用率 ${(r.use * 100).toFixed(0).padStart(3)}%  使用時勝率 ${(r.wr * 100).toFixed(0).padStart(3)}% (n=${r.n})  ${r.name}`);
  }
}
