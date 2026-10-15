// 対局の進行役: ルールエンジン・3D ビュー・HUD・AI をつなぐ。
import { CARDS, FACTIONS } from './engine/cards.js';
import {
  W, idx, dist, createGame, applyAction, reachable, pathTo, targetsFrom, canMove, canAttack, canPlay,
  canHero, cardTargets, targetsFor, unitAt, unitById, forecast, hasAnyAction, effRangeAt, tileAt, coordName,
} from './engine/rules.js';
import { DIFFICULTY, planTurn, describePlan, intentOf, evaluate, winProb, threatMap } from './engine/ai.js';
import { randomSeed } from './engine/rng.js';
import { cardLink } from './ui/hud.js';
import { showCardDetail, openDeckViewer, targetText } from './ui/cardinfo.js';

const isTouch = () => window.matchMedia('(hover: none)').matches;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Game {
  constructor({ view, hud, sound, settings, opts, onExit }) {
    this.view = view;
    this.hud = hud;
    this.sound = sound;
    this.settings = settings;
    this.opts = opts;
    this.onExit = onExit;
    this.aborted = false;
    this.busy = false;
    this.sel = { mode: 'idle' };
    this.showThreat = false;
    this.unitCard = new Map();
    this.played = [[], []];
    this.ai = opts.watch ? [true, true] : [false, true];
    this.human = opts.watch ? null : 0;
    this.diff = [opts.diff, opts.diff];
    this.names = opts.watch
      ? [`青軍 (${FACTIONS[opts.factions[0]].short})`, `赤軍 (${FACTIONS[opts.factions[1]].short})`]
      : ['あなた', 'AI'];
  }

  isAI(p) { return this.ai[p]; }
  get humanTurn() { return this.human !== null && this.state.current === this.human && this.state.winner === null && !this.busy; }
  sfx(name) { this.sound.play(name); }

  // ------------------------------------------------------------
  // 開始
  // ------------------------------------------------------------

  start() {
    const o = this.opts;
    const first = o.first === 'random' ? (Math.random() < 0.5 ? 0 : 1) : +o.first;
    this.state = createGame({ factions: o.factions, seed: o.seed ?? randomSeed(), first, map: o.map });
    const s = this.state;
    for (const u of s.units) this.unitCard.set(u.uid, u.cardId);
    s.events = [];
    this.view.buildBoard(s);
    this.view.sync(s);
    this.view.clearHighlights();
    this.hud.clearLog();
    this.hud.setupPanels(s, this.names, { isHuman: (p) => !this.ai[p], onHero: () => this.armHero() });
    this.hud.aiReset(this.opts.watch ? 'AI 思考エンジン' : 'AI 思考エンジン', DIFFICULTY[this.opts.diff].name);
    this.hud.hoverCb = (uid, on) => this.onHandHover(uid, on);
    this.hud.clickCb = (uid) => this.onHandClick(uid);
    this.hud.dragCb = { begin: (uid) => this.dragBegin(uid), over: (e) => this.dragOver(e), drop: (e) => this.dragDrop(e) };
    document.body.classList.toggle('watch', !!this.opts.watch);
    this.hud.addLog(`${FACTIONS[o.factions[0]].name} 対 ${FACTIONS[o.factions[1]].name} — ${first === 0 ? this.names[0] : this.names[1]}の先攻`, 'sys');
    this.refreshUI();
    this.view.resetView();
    (async () => {
      await sleep(300);
      await this.hud.banner('戦闘開始', `${this.names[first]}の先攻`, first === 0 ? 'me' : 'ai', 1800);
      await this.playEvents([{ type: 'turnStart', player: s.current, turn: s.turn, round: s.round }], true);
      this.refreshUI();
      this.drive();
    })();
  }

  abort() {
    this.aborted = true;
    this.hud.setActionBar(null);
    this.view.clearHighlights();
    this.hud.tooltip(0, 0, null);
  }

  // ------------------------------------------------------------
  // アクションの実行と演出
  // ------------------------------------------------------------

  async perform(action) {
    if (this.aborted) return false;
    const s = this.state;
    this.busy = true;
    this.clearSelection(false);
    s.events = [];
    const ok = applyAction(s, action);
    const ev = s.events;
    s.events = [];
    if (!ok) {
      this.busy = false;
      this.refreshUI();
      return false;
    }
    await this.playEvents(ev);
    if (this.aborted) return false;
    this.view.sync(s);
    this.busy = false;
    this.refreshUI();
    if (s.winner !== null) this.gameOver();
    return true;
  }

  async playEvents(events, skipTurnStart) {
    const s = this.state;
    const sfx = (n) => this.sfx(n);
    const speed = this.settings.speed;
    for (const e of events) {
      if (this.aborted) return;
      switch (e.type) {
        case 'turnStart': {
          if (skipTurnStart === undefined && e.turn === 1) break;
          const mine = this.human !== null ? e.player === this.human : e.player === 0;
          this.hud.addLog(`── ラウンド${e.round} : ${this.names[e.player]}のターン ──`, 'turn');
          this.refreshUI();
          sfx(mine ? 'turn' : 'enemyturn');
          const label = this.opts.watch ? `${this.names[e.player]}` : mine ? 'あなたのターン' : 'AI のターン';
          await this.hud.banner(label, `ラウンド ${e.round}`, e.player === 0 ? 'me' : 'ai', 1500 / speed);
          continue;
        }
        case 'play': {
          const c = CARDS[e.cardId];
          const at = e.x !== undefined ? ` (${coordName(e.x, e.y)})` : '';
          this.hud.addLog(`${this.names[e.player]}: ${cardLink(e.cardId)}${at}`, 'p' + e.player);
          this.played[e.player].push(e.cardId);
          sfx('card');
          this.hud.setMana(e.player, e.mana, s.players[e.player].maxMana);
          if (this.human === null || e.player !== this.human) {
            await this.hud.showPlayedCard(e.cardId, e.player, `${this.names[e.player]}の使用カード`, speed);
          }
          continue;
        }
        case 'hero': {
          const h = FACTIONS[s.players[e.player].faction].hero;
          this.hud.addLog(`${this.names[e.player]}: 英雄の力「${h.name}」 (${coordName(e.x, e.y)})`, 'p' + e.player);
          this.hud.setMana(e.player, e.mana, s.players[e.player].maxMana);
          break;
        }
        case 'summon':
          this.unitCard.set(e.unit.uid, e.unit.cardId);
          break;
        case 'draw':
          if (e.player === this.human) { sfx('draw'); this.refreshUI(); }
          break;
        case 'burn':
          this.hud.addLog(`${this.names[e.player]}の手札があふれ${cardLink(e.cardId)}が燃え尽きた`, 'sys');
          if (e.player !== this.human) this.played[e.player].push(e.cardId);
          if (e.player === this.human) this.hud.toast(`手札が上限 (9枚) のため「${CARDS[e.cardId].name}」を失いました`);
          break;
        case 'fatigue':
          this.hud.addLog(`${this.names[e.player]}の山札が尽きた! 将に${e.amount}ダメージ`, 'sys');
          break;
        case 'mana':
          this.hud.setMana(e.player, e.mana, s.players[e.player].maxMana);
          break;
        case 'crystal':
          this.hud.addLog(`${this.names[e.player]}: マナ結晶から +${e.amount} マナ`, 'p' + e.player);
          break;
        case 'attack': {
          const a = this.unitName(e.uid), t = this.unitName(e.target);
          this.hud.addLog(e.counter ? `　↳ ${a} の反撃` : `${a} → ${t} を攻撃`, 'p' + this.ownerOf(e.uid));
          break;
        }
        case 'damage': {
          const L = s.players.findIndex((p) => p.leader === e.uid);
          if (L >= 0) this.hud.setHp(L, e.hp, CARDS["leader_" + s.players[L].faction].hp);
          if (e.amount > 0) this.hud.addLog(`　${this.unitName(e.uid)} に ${e.amount} ダメージ`, '');
          break;
        }
        case 'death':
          this.hud.addLog(`　${this.unitName(e.uid)} は倒れた`, 'p' + (1 - e.owner));
          break;
        case 'fx':
          if (e.kind === 'siege') this.hud.addLog(`${this.unitName(e.from.uid)} が敵陣を侵攻! 敵の将に1ダメージ`, 'p' + this.ownerOf(e.from.uid));
          break;
        case 'tectonic':
          this.hud.addLog(e.kind === 'ring' ? '⛰ 地殻変動! 中央の大地が回転する' : '⛰ 地殻変動! 大地が隆起し、沈降する', 'sys');
          await this.hud.banner('地殻変動', e.kind === 'ring' ? '中央の大地が回転する' : '大地が隆起し、沈降する', 'quake', 1700 / speed);
          break;
        case 'gameOver':
          break;
      }
      await this.view.playEvent(e, sfx);
    }
  }

  unitName(uid) {
    let id = this.unitCard.get(uid);
    if (!id) {
      const u = this.state.units.find((x) => x.uid === uid) || this.view.units.get(uid);
      if (u) { id = u.cardId; this.unitCard.set(uid, id); }
    }
    if (!id) return '?';
    const c = CARDS[id];
    if (c.type === 'leader') {
      const p = this.state.players.findIndex((pl) => pl.leader === uid);
      return `${this.names[p] || ''}の将`;
    }
    return c.name;
  }

  ownerOf(uid) {
    const u = this.state.units.find((x) => x.uid === uid);
    if (u) return u.owner;
    const v = this.view.units.get(uid);
    return v ? v.owner : 0;
  }

  refreshUI() {
    if (this.aborted) return;
    const s = this.state;
    const humanTurn = this.humanTurn;
    this.hud.refresh(s, {
      human: this.human ?? 0,
      watch: !!this.opts.watch,
      humanTurn,
      selectedHand: this.sel.mode === 'card' ? this.sel.handUid : null,
      heroArmed: this.sel.mode === 'hero',
      aiThinking: this.thinking,
      noMoves: humanTurn && !hasAnyAction(s, this.human),
    });
    const p0 = winProb(evaluate(s, 0, null, s.current));
    this.hud.setBalance(p0, this.opts.watch ? ['青軍', '赤軍'] : ['あなた', 'AI']);
    if (this.sel.mode === 'idle') this.updateHighlights();
    else this.updateActionBar();
  }

  // ------------------------------------------------------------
  // AI
  // ------------------------------------------------------------

  async drive() {
    if (this.driving) return;
    this.driving = true;
    try {
      while (!this.aborted && this.state.winner === null && this.isAI(this.state.current)) {
        await this.runAI(this.state.current);
      }
    } catch (err) {
      console.error(err);
      this.hud.toast('AI の処理中にエラーが発生しました: ' + err.message, 5000);
    } finally {
      this.driving = false;
    }
    if (!this.aborted) {
      this.refreshUI();
      this.hud.aiThinking(false, this.state.winner === null ? 'あなたの番です' : '対局終了');
    }
  }

  async runAI(p) {
    const s = this.state;
    const cfg = DIFFICULTY[this.diff[p]];
    const speed = this.settings.speed;
    let replans = 0;
    this.hud.aiReset(this.opts.watch ? `${this.names[p]} の思考` : 'AI 思考エンジン', cfg.name);
    while (!this.aborted && s.winner === null && s.current === p && replans < 8) {
      this.thinking = true;
      this.refreshUI();
      this.hud.aiThinking(true, replans ? '状況の変化を受けて再考中…' : '盤面を読んでいます…');
      const t0 = performance.now();
      let lastUI = 0;
      const res = await planTurn(s, cfg, (pr) => {
        const now = performance.now();
        if (now - lastUI < 110 || this.aborted) return;
        lastUI = now;
        this.hud.aiProgress({ evaluated: pr.evaluated, depth: pr.depth, time: now - t0, plan: describePlan(s, pr.best) });
        if (this.settings.gaze) this.showGaze(pr.best);
        this.sfx('think');
      });
      if (this.aborted) return;
      const minT = (replans === 0 ? 1100 : 400) / speed;
      const spent = performance.now() - t0;
      if (spent < minT) {
        // 思考の様子を少し見せる
        const steps = Math.ceil((minT - spent) / 120);
        for (let i = 0; i < steps; i++) {
          await sleep(120);
          this.hud.aiProgress({ evaluated: res.evaluated, depth: '-', time: performance.now() - t0 });
        }
      }
      this.thinking = false;
      const plan = describePlan(s, res.actions);
      this.hud.aiProgress({ evaluated: res.evaluated, depth: cfg.depth, time: performance.now() - t0, plan });
      document.getElementById('ai-depth').textContent = String(res.actions.length) + '手';
      const intent = intentOf(s, res);
      this.hud.aiIntent(intent.tag, intent.text);
      this.view.clearHighlights();
      if (!res.actions.length) break;
      this.hud.aiThinking(true, '計画を実行中…', 'acting');
      let replan = false;
      for (let i = 0; i < res.actions.length; i++) {
        if (this.aborted) return;
        this.hud.aiPlan(plan, i);
        const a = res.actions[i];
        await this.previewAI(a);
        const deckBefore = s.players[p].deck.length;
        const ok = await this.perform(a);
        if (!ok) { replan = true; break; }
        if (s.winner !== null || s.current !== p) return;
        if (s.players[p].deck.length !== deckBefore) { replan = true; break; }
        await sleep(160 / speed);
      }
      this.hud.aiPlan(plan, replan ? -1 : plan.length);
      if (!replan) break;
      replans++;
    }
    if (!this.aborted && s.winner === null && s.current === p) {
      this.hud.aiThinking(false, 'ターン終了');
      await sleep(250 / speed);
      await this.perform({ type: 'end' });
    }
  }

  // 計画中の手が関わるマスを盤上にうっすら表示 (AI の視線)
  showGaze(actions) {
    const list = [];
    for (const a of actions || []) {
      if (a.x !== undefined) list.push({ x: a.x, y: a.y, kind: 'ai' });
      if (a.target) {
        const t = unitById(this.state, a.target);
        if (t) list.push({ x: t.x, y: t.y, kind: 'attack' });
      }
    }
    this.view.setHighlights(list);
  }

  async previewAI(a) {
    const s = this.state;
    const speed = this.settings.speed;
    const list = [];
    let focus = null;
    if (a.uid) {
      const u = unitById(s, a.uid);
      if (u) { this.view.setSelectedUnit(u.uid); list.push({ x: u.x, y: u.y, kind: 'select' }); focus = u; }
    }
    if (a.x !== undefined) { list.push({ x: a.x, y: a.y, kind: a.type === 'play' ? 'ai' : 'move' }); focus = focus || a; }
    if (a.target) {
      const t = unitById(s, a.target);
      if (t) { list.push({ x: t.x, y: t.y, kind: 'attack' }); focus = t; }
    }
    this.view.setHighlights(list);
    if (a.type === 'move' || a.type === 'moveAttack') {
      const u = unitById(s, a.uid);
      if (u && !(u.x === a.x && u.y === a.y)) this.view.showPath(pathTo(reachable(s, u), idx(u.x, u.y), idx(a.x, a.y)));
    }
    if (focus && this.settings.follow) this.view.focus(focus.x, focus.y, 0.3);
    await sleep(420 / speed);
    this.view.clearHighlights();
    this.view.setSelectedUnit(null);
  }

  // ------------------------------------------------------------
  // 助言
  // ------------------------------------------------------------

  async hint() {
    if (!this.humanTurn || this.hinting) return;
    this.hinting = true;
    this.busy = true;
    this.clearSelection();
    const s = this.state;
    this.hud.aiReset('AI の助言', DIFFICULTY.normal.name);
    this.hud.aiThinking(true, 'あなたの最善手を検討中…', 'advice');
    const t0 = performance.now();
    const res = await planTurn(s, DIFFICULTY.normal, (pr) => {
      this.hud.aiProgress({ evaluated: pr.evaluated, depth: pr.depth, time: performance.now() - t0 });
    });
    this.busy = false;
    this.hinting = false;
    if (this.aborted) return;
    const plan = describePlan(s, res.actions);
    this.hud.aiProgress({ evaluated: res.evaluated, depth: res.actions.length, time: performance.now() - t0, plan: plan.length ? plan : ['このままターン終了するのが良さそうです'] });
    this.hud.aiThinking(true, '提案: 上から順に実行すると良いでしょう', 'advice');
    const intent = intentOf(s, res);
    this.hud.aiIntent('助言', intent.text.replace('敵リーダー', '敵の将'));
    if (res.actions.length) this.showGaze(res.actions.slice(0, 1));
    this.hud.toast(plan.length ? `💡 ${plan[0]}` : '💡 これ以上の良い手は見つかりませんでした。ターン終了しましょう');
    this.refreshUI();
  }

  toggleThreat() {
    this.showThreat = !this.showThreat;
    document.getElementById('btn-threat').classList.toggle('on', this.showThreat);
    if (this.sel.mode === 'idle') this.updateHighlights();
    else this.updateActionBar();
  }

  // ------------------------------------------------------------
  // 入力
  // ------------------------------------------------------------

  clearSelection(update = true) {
    this.sel = { mode: 'idle' };
    this.view.setSelectedUnit(null);
    this.view.clearPath();
    this.hud.tooltip(0, 0, null);
    if (update) { this.updateHighlights(); this.refreshUI(); }
  }

  updateHighlights() {
    const s = this.state;
    const sel = this.sel;
    const list = [];
    if (sel.mode === 'idle') {
      if (this.showThreat && this.human !== null) {
        const tm = threatMap(s, 1 - this.human);
        for (let i = 0; i < tm.length; i++) if (tm[i] > 0) list.push({ x: i % W, y: (i / W) | 0, kind: 'danger' });
      }
    } else if (sel.mode === 'unit') {
      const u = unitById(s, sel.uid);
      if (!u) { this.clearSelection(); return; }
      list.push({ x: u.x, y: u.y, kind: 'select' });
      if (sel.reach) for (const i of sel.reach.tiles) list.push({ x: i % W, y: (i / W) | 0, kind: 'move' });
      for (const t of sel.direct) list.push({ x: t.x, y: t.y, kind: 'attack' });
      for (const [tuid] of sel.viaMove) { const t = unitById(s, tuid); if (t) list.push({ x: t.x, y: t.y, kind: 'attack' }); }
    } else if (sel.mode === 'card' || sel.mode === 'hero') {
      const kind = sel.mode === 'hero' ? 'hero' : CARDS[sel.cardId].type === 'unit' ? 'summon' : CARDS[sel.cardId].type === 'field' ? 'field' : 'spell';
      for (const t of sel.targets || []) list.push({ x: t.x, y: t.y, kind });
      if (sel.preview) for (const t of sel.preview) list.push({ x: t.x, y: t.y, kind: 'select' });
    }
    this.view.setHighlights(list);
    this.updateActionBar();
  }

  selectUnit(u) {
    const s = this.state;
    const sel = { mode: 'unit', uid: u.uid, reach: null, direct: [], viaMove: new Map() };
    if (canMove(s, u)) sel.reach = reachable(s, u);
    if (canAttack(s, u)) {
      sel.direct = targetsFrom(s, u, u.x, u.y);
      if (sel.reach) {
        for (const i of sel.reach.tiles) {
          const x = i % W, y = (i / W) | 0;
          for (const t of targetsFrom(s, u, x, y)) {
            if (sel.direct.includes(t)) continue;
            const f = forecast(s, u, x, y, t);
            const sc = f.dmg * 3 + (f.kills ? 10 : 0) - f.counter * 2 + tileAt(s, x, y).height * 0.5 - sel.reach.cost[i] * 0.2;
            const cur = sel.viaMove.get(t.uid);
            if (!cur || sc > cur.sc) sel.viaMove.set(t.uid, { x, y, sc, f });
          }
        }
      }
    }
    this.sel = sel;
    this.view.setSelectedUnit(u.uid);
    this.sfx('select');
    this.updateHighlights();
    this.refreshUI();
  }

  onHover(hit, e) {
    if (this.aborted) return;
    if (e && e.pointerType === 'touch') return;
    const s = this.state;
    this.view.setHover(hit ? hit.x : null, hit ? hit.y : null);
    if (!hit) { this.hud.tooltip(0, 0, null); this.hud.hideInspector(); return; }
    const u = unitAt(s, hit.x, hit.y);
    if (u) this.hud.inspectUnit(s, u, this.names);
    else this.hud.inspectTile(s, hit.x, hit.y);
    const sel = this.sel;
    let tip = null;
    if (sel.mode === 'unit') {
      const me = unitById(s, sel.uid);
      const i = idx(hit.x, hit.y);
      this.view.clearPath();
      if (me && u && u.owner !== me.owner) {
        let ax = me.x, ay = me.y, via = null;
        if (!sel.direct.includes(u)) via = sel.viaMove.get(u.uid);
        if (sel.direct.includes(u) || via) {
          if (via) { ax = via.x; ay = via.y; this.view.showPath(pathTo(sel.reach, idx(me.x, me.y), idx(ax, ay))); }
          const f = forecast(s, me, ax, ay, u);
          tip = `<div class="fc-row"><span>⚔ 与ダメージ</span><span class="fc-dmg">${f.dmg}</span>${f.kills ? '<span class="fc-kill">撃破</span>' : ''}</div>`;
          tip += f.kills ? '' : `<div class="fc-row"><span>↩ 反撃</span><span class="fc-ctr">${f.counter}</span>${f.dies ? '<span class="fc-die">自軍消滅</span>' : ''}</div>`;
          if (via) tip += `<div class="tt-sub">${coordName(ax, ay)} へ移動して攻撃</div>`;
          const notes = [];
          if (tileAt(s, ax, ay).height > tileAt(s, u.x, u.y).height) notes.push('高所 +1');
          if (dist(ax, ay, u.x, u.y) >= 2 && tileAt(s, u.x, u.y).terrain === 'forest') notes.push('森の遮蔽 -1');
          if (u.armor) notes.push(`鉄壁 -${u.armor}`);
          if (notes.length) tip += `<div class="tt-sub">${notes.join(' / ')}</div>`;
        }
      } else if (sel.reach && sel.reach.tiles.includes(i)) {
        this.view.showPath(pathTo(sel.reach, idx(me.x, me.y), i));
        const t = tileAt(s, hit.x, hit.y);
        const n = targetsFrom(s, me, hit.x, hit.y).length;
        tip = `移動 (コスト ${sel.reach.cost[i]}/${me.move})<div class="tt-sub">移動先から攻撃可能: ${n}体${t.height > 0 ? ` · 高さ${t.height}` : ''}</div>`;
      }
    } else if (sel.mode === 'card') {
      const c = CARDS[sel.cardId];
      const valid = sel.targets && sel.targets.some((t) => t.x === hit.x && t.y === hit.y);
      sel.preview = null;
      if (valid && c.target === 'row') sel.preview = Array.from({ length: 7 }, (_, x) => ({ x, y: hit.y }));
      if (valid && c.target === 'block') { sel.preview = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sel.preview.push({ x: hit.x + dx, y: hit.y + dy }); }
      if (valid && c.id === 'f_quake') { sel.preview = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (hit.x + dx >= 0 && hit.x + dx < 7 && hit.y + dy >= 0 && hit.y + dy < 7) sel.preview.push({ x: hit.x + dx, y: hit.y + dy }); }
      if (valid && c.id === 'f_thorns') sel.preview = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: hit.x + dx, y: hit.y + dy })).filter((p) => p.x >= 0 && p.x < 7 && p.y >= 0 && p.y < 7);
      this.updateHighlights();
      if (valid) tip = `${c.name} → ${coordName(hit.x, hit.y)}`;
      else if (!sel.targets) tip = `${c.name}: 盤面をクリックで発動`;
    } else if (sel.mode === 'hero') {
      if (sel.targets.some((t) => t.x === hit.x && t.y === hit.y)) tip = `英雄の力 → ${coordName(hit.x, hit.y)}`;
    }
    this.hud.tooltip(e ? e.clientX : 0, e ? e.clientY : 0, tip);
  }

  async onClick(hit, e) {
    if (this.aborted || this.picking) return;
    this.sound.resume();
    const sel = this.sel;
    // タッチ端末では、何も選んでいない時にタップしたユニット/マスの情報を固定表示
    if (isTouch() && sel.mode === 'idle') {
      if (hit) {
        const t = unitAt(this.state, hit.x, hit.y);
        if (t) this.hud.inspectUnit(this.state, t, this.names, { pinned: true });
        else this.hud.inspectTile(this.state, hit.x, hit.y, { pinned: true });
      } else this.hud.hideInspector(true);
    }
    if (!this.humanTurn) return;
    const s = this.state;
    if (sel.mode !== 'idle') hit = this.snap(hit, e);
    if (!hit) { if (sel.mode !== 'idle') { this.sfx('cancel'); this.clearSelection(); } return; }
    const u = unitAt(s, hit.x, hit.y);

    if (sel.mode === 'card') {
      if (!sel.targets || sel.targets.some((t) => t.x === hit.x && t.y === hit.y)) return this.useSelectedCardAt(hit);
      if (u && u.owner === this.human) return this.trySelectUnit(u);
      this.sfx('error');
      this.hud.toast('そこには使えません。光っているマスを選んでください');
      return;
    }
    if (sel.mode === 'hero') {
      if (!sel.targets.some((t) => t.x === hit.x && t.y === hit.y)) { this.sfx('cancel'); return this.clearSelection(); }
      return this.perform({ type: 'hero', x: hit.x, y: hit.y });
    }
    if (sel.mode === 'unit') {
      const me = unitById(s, sel.uid);
      if (me && u && u.owner !== me.owner) {
        if (sel.direct.includes(u)) return this.perform({ type: 'attack', uid: me.uid, target: u.uid });
        const via = sel.viaMove.get(u.uid);
        if (via) return this.perform({ type: 'moveAttack', uid: me.uid, x: via.x, y: via.y, target: u.uid });
      }
      if (me && sel.reach && !u && sel.reach.tiles.includes(idx(hit.x, hit.y))) {
        const ok = await this.perform({ type: 'move', uid: me.uid, x: hit.x, y: hit.y });
        const again = ok && unitById(s, me.uid);
        if (again && canAttack(s, again) && targetsFrom(s, again, again.x, again.y).length) this.selectUnit(again);
        return;
      }
      if (u && u.uid === sel.uid) { this.sfx('cancel'); return this.clearSelection(); }
    }
    if (u && u.owner === this.human) return this.trySelectUnit(u);
    if (sel.mode !== 'idle') { this.sfx('cancel'); this.clearSelection(); }
  }

  trySelectUnit(u) {
    const s = this.state;
    if (canMove(s, u) || (canAttack(s, u) && (targetsFrom(s, u, u.x, u.y).length || canMove(s, u)))) return this.selectUnit(u);
    this.hud.toast(u.sick ? 'このユニットは召喚されたばかりで、次のターンから行動できます' : u.frozen ? 'このユニットは凍結しています' : 'このユニットは行動済みです');
    this.sfx('error');
    this.clearSelection();
  }

  // 今の操作で選べるマス
  validTiles() {
    const s = this.state, sel = this.sel;
    if (sel.mode === 'card' || sel.mode === 'hero') return sel.targets || [];
    if (sel.mode === 'unit') {
      const out = [];
      if (sel.reach) for (const i of sel.reach.tiles) out.push({ x: i % W, y: (i / W) | 0 });
      for (const t of sel.direct) out.push({ x: t.x, y: t.y });
      for (const [tuid] of sel.viaMove) { const t = unitById(s, tuid); if (t) out.push({ x: t.x, y: t.y }); }
      return out;
    }
    return [];
  }

  // 少しずれたタップを、近くの選べるマスに吸着させる
  snap(hit, e) {
    const list = this.validTiles();
    if (hit && list.some((t) => t.x === hit.x && t.y === hit.y)) return hit;
    if (!e || e.clientX === undefined || !list.length) return hit;
    const radius = e.pointerType === 'mouse' ? 22 : 44;
    let best = null, bd = radius;
    for (const t of list) {
      const p = this.view.screenPos(this.view.tileWorldPos(t.x, t.y));
      const d = Math.hypot(p.x - e.clientX, p.y - e.clientY);
      if (d < bd) { bd = d; best = t; }
    }
    return best ? { x: best.x, y: best.y, uid: null } : hit;
  }

  async useSelectedCardAt(hit) {
    const s = this.state, sel = this.sel;
    const h = s.players[this.human].hand.find((x) => x.uid === sel.handUid);
    if (!h) return this.clearSelection();
    const c = CARDS[sel.cardId];
    if (!sel.targets) return this.playCard(h, {});
    let dir;
    if (c.dir) {
      this.picking = true;
      dir = await this.hud.pickDirection(c.target);
      this.picking = false;
      if (dir === null) return;
    }
    return this.playCard(h, { x: hit.x, y: hit.y, dir });
  }

  // 操作案内バー
  updateActionBar() {
    const sel = this.sel;
    if (this.aborted || !this.humanTurn || sel.mode === 'idle') { this.hud.setActionBar(null); return; }
    const s = this.state;
    const cancel = { label: 'キャンセル', onClick: () => { this.sfx('cancel'); this.clearSelection(); } };
    if (sel.mode === 'card') {
      const c = CARDS[sel.cardId];
      const buttons = [];
      if (!sel.targets) buttons.push({ label: '▶ 発動する', cls: 'primary', onClick: () => { const h = s.players[this.human].hand.find((x) => x.uid === sel.handUid); if (h) this.playCard(h, {}); } });
      buttons.push({ label: '詳細', onClick: () => showCardDetail(sel.cardId) }, cancel);
      const hint = !sel.targets ? `${c.text} — 「発動する」で使用`
        : c.type === 'unit' ? '光っているマスをタップ (カードをドラッグしてもOK)'
          : `${targetText(c)}をタップ${c.dir ? ' → 向きを選択' : ''}`;
      this.hud.setActionBar({ title: `${c.name} <small>${c.cost}マナ</small>`, hint, buttons });
    } else if (sel.mode === 'hero') {
      const h = FACTIONS[s.players[this.human].faction].hero;
      this.hud.setActionBar({ title: `英雄の力「${h.name}」 <small>${h.cost}マナ</small>`, hint: `${h.text} 光っている対象をタップ`, buttons: [cancel] });
    } else if (sel.mode === 'unit') {
      const u = unitById(s, sel.uid);
      if (!u) { this.hud.setActionBar(null); return; }
      const parts = [];
      if (sel.reach && sel.reach.tiles.length) parts.push('<span class="ab-move">青</span>のマスへ移動');
      if (sel.direct.length || sel.viaMove.size) parts.push('<span class="ab-atk">赤</span>の敵を攻撃 (移動も自動)');
      const name = u.leader ? 'あなたの将' : CARDS[u.cardId].name;
      this.hud.setActionBar({
        title: `${name} <small>⚔${u.atk} ❤${u.hp}</small>`,
        hint: parts.length ? parts.join(' / ') : 'このターンにできることはありません',
        buttons: [{ label: '詳細', onClick: () => showCardDetail(u.cardId, { unit: u, state: s, ownerName: this.names[u.owner] }) }, { label: '選択解除', onClick: cancel.onClick }],
      });
    }
  }

  // 手札ドラッグ
  dragBegin(uid) {
    if (!this.humanTurn) return false;
    const h = this.state.players[this.human].hand.find((x) => x.uid === uid);
    if (!h || !canPlay(this.state, this.human, h)) return false;
    if (!(this.sel.mode === 'card' && this.sel.handUid === uid)) this.selectCard(h);
    return true;
  }

  dragOver(e) {
    if (!e) { this.view.setHover(null, null); this.hud.tooltip(0, 0, null); return; }
    const hit = this.snap(this.view.pick(e.clientX, e.clientY), e);
    this.onHover(hit, { clientX: e.clientX, clientY: e.clientY, pointerType: 'drag' });
  }

  async dragDrop(e) {
    this.view.setHover(null, null);
    this.hud.tooltip(0, 0, null);
    if (!e || this.sel.mode !== 'card') return;
    const hit = this.snap(this.view.pick(e.clientX, e.clientY), e);
    if (!this.sel.targets) { if (hit) return this.useSelectedCardAt(hit); return; }
    if (hit && this.sel.targets.some((t) => t.x === hit.x && t.y === hit.y)) return this.useSelectedCardAt(hit);
    this.sfx('error');
    this.hud.toast('そこには使えません。光っているマスに置いてください');
  }

  onRightClick(hit) {
    if (this.sel.mode !== 'idle') { this.sfx('cancel'); this.clearSelection(); return; }
    this.showDetailAt(hit);
  }

  onLongPress(hit) {
    this.showDetailAt(hit);
  }

  // マス上のユニットのカード詳細を開く
  showDetailAt(hit) {
    if (!hit || this.aborted) return;
    const u = unitAt(this.state, hit.x, hit.y);
    if (u) showCardDetail(u.cardId, { unit: u, state: this.state, ownerName: this.names[u.owner] });
  }

  openDeck() {
    const s = this.state;
    const cnt = (arr, id) => arr.reduce((n, x) => n + ((x.cardId ?? x) === id ? 1 : 0), 0);
    const full = (p) => (id, total) => {
      const d = cnt(s.players[p].deck, id), h = cnt(s.players[p].hand, id);
      const used = total - d - h;
      return { text: `山札 ${d} · 手札 ${h}${used > 0 ? ` · 使用 ${used}` : ''}`, dim: d + h === 0 };
    };
    const pub = (p) => (id, total) => {
      const used = cnt(this.played[p], id);
      return { text: used ? `使用済み ${used} / 残り ${total - used}` : '未使用', dim: used >= total };
    };
    const tabs = this.opts.watch
      ? [0, 1].map((p) => ({ label: this.names[p], faction: s.players[p].faction, status: full(p), note: `山札 ${s.players[p].deck.length}枚 · 手札 ${s.players[p].hand.length}枚` }))
      : [
        { label: 'あなたのデッキ', faction: s.players[this.human].faction, status: full(this.human), note: `山札 ${s.players[this.human].deck.length}枚 · 手札 ${s.players[this.human].hand.length}枚 (山札の順番は分かりません)` },
        { label: '相手のデッキ', faction: s.players[1 - this.human].faction, status: pub(1 - this.human), note: '相手のデッキリストは公開情報です。使用済みのカード以外は、山札と手札のどちらにあるか分かりません。' },
      ];
    openDeckViewer(tabs, 0);
  }

  onHandHover(uid, on) {
    if (isTouch()) return;
    if (!on) { this.hud.hideInspector(); return; }
    const h = this.state.players[this.human ?? 0].hand.find((x) => x.uid === uid);
    if (h) this.hud.inspectCard(h.cardId);
    this.sfx('hover');
  }

  onHandClick(uid) {
    this.sound.resume();
    if (!this.humanTurn) return;
    const s = this.state;
    const h = s.players[this.human].hand.find((x) => x.uid === uid);
    if (!h) return;
    if (this.sel.mode === 'card' && this.sel.handUid === uid) {
      if (!this.sel.targets) return this.playCard(h, {});
      this.sfx('cancel');
      return this.clearSelection();
    }
    const c = CARDS[h.cardId];
    if (!canPlay(s, this.human, h)) {
      this.sfx('error');
      this.hud.toast(c.cost > s.players[this.human].mana ? `マナが足りません (必要 ${c.cost} / 現在 ${s.players[this.human].mana})` : '今は使える対象がありません');
      return;
    }
    this.selectCard(h);
  }

  selectCard(h) {
    this.clearSelection(false);
    this.hud.hideInspector(true);
    this.sel = { mode: 'card', handUid: h.uid, cardId: h.cardId, targets: cardTargets(this.state, this.human, h.cardId) };
    this.sfx('select');
    this.updateHighlights();
    this.refreshUI();
  }

  async playCard(h, { x, y, dir }) {
    await this.perform({ type: 'play', handUid: h.uid, x, y, dir });
  }

  armHero() {
    this.sound.resume();
    if (!this.humanTurn) return;
    const s = this.state;
    if (this.sel.mode === 'hero') { this.sfx('cancel'); return this.clearSelection(); }
    if (!canHero(s, this.human)) { this.sfx('error'); return; }
    const h = FACTIONS[s.players[this.human].faction].hero;
    this.clearSelection(false);
    this.sel = { mode: 'hero', targets: targetsFor(s, this.human, h.target) };
    this.sfx('select');
    this.updateHighlights();
    this.refreshUI();
  }

  async endTurn() {
    this.sound.resume();
    if (!this.humanTurn) return;
    this.hud.cancelDir && this.hud.cancelDir();
    await this.perform({ type: 'end' });
    this.drive();
  }

  onKey(e) {
    const k = e.key.toLowerCase();
    if (k === 'escape') { this.hud.cancelDir && this.hud.cancelDir(); this.hud.hideInspector(true); if (this.sel.mode !== 'idle') { this.sfx('cancel'); this.clearSelection(); } }
    else if (k === 'enter' || k === ' ') { e.preventDefault(); this.endTurn(); }
    else if (k === 'h') this.hint();
    else if (k === 'v') this.toggleThreat();
    else if (k === 'd') this.openDeck();
    else if (/^[1-9]$/.test(k) && this.human !== null) {
      const h = this.state.players[this.human].hand[+k - 1];
      if (h) this.onHandClick(h.uid);
    }
  }

  // ------------------------------------------------------------
  // 決着
  // ------------------------------------------------------------

  async gameOver() {
    const s = this.state;
    await sleep(900);
    if (this.aborted) return;
    const w = s.winner;
    const win = this.human !== null && w === this.human;
    const title = document.getElementById('go-title');
    if (this.opts.watch) {
      title.textContent = w === -1 ? 'DRAW' : 'FINISH';
      title.className = 'win';
      document.getElementById('go-sub').textContent = w === -1 ? '引き分け' : `${this.names[w]}の勝利`;
      this.sfx('victory');
    } else {
      title.textContent = w === -1 ? 'DRAW' : win ? 'VICTORY' : 'DEFEAT';
      title.className = win ? 'win' : 'lose';
      document.getElementById('go-sub').textContent = w === -1 ? '相討ち — 引き分け' : win ? '敵の将を討ち取った!' : 'あなたの将が倒れた…';
      this.sfx(win ? 'victory' : 'defeat');
    }
    const st = s.stats;
    const rows = [
      ['与えたダメージ', st[0].damage, st[1].damage],
      ['撃破数', st[0].kills, st[1].kills],
      ['使用カード', st[0].cards, st[1].cards],
      ['召喚', st[0].summons, st[1].summons],
      ['地形カード', st[0].fields, st[1].fields],
    ];
    document.getElementById('go-stats').innerHTML =
      `<span class="h"></span><span class="h" style="text-align:right">${this.names[0]}</span><span class="h" style="text-align:right">${this.names[1]}</span>` +
      rows.map((r) => `<span>${r[0]}</span><span class="v0">${r[1]}</span><span class="v1">${r[2]}</span>`).join('') +
      `<span>ターン数</span><span class="v0" style="grid-column: span 2; text-align:center">${s.turn} (ラウンド ${s.round})</span>`;
    document.getElementById('gameover').classList.remove('hidden');
    this.hud.addLog(w === -1 ? '引き分け' : `${this.names[w]}の勝利!`, 'sys');
  }
}
