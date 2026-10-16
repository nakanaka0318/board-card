// HTML オーバーレイ (パネル・手札・ログ・AI 思考パネルなど)
import { CARDS, FACTIONS, TERRAIN, ENVIRONMENTS, typeName } from '../engine/cards.js';
import { canPlay, canHero, TECTONIC_PERIOD, coordName, has, COMMAND_POINTS } from '../engine/rules.js';
import { renderCard, el, keywordHelp, cardBack, factionName } from './cardview.js';
import { showCardDetail, onLongPress, targetText } from './cardinfo.js';
import { cardArt } from '../render/cardart.js';
import { TEAM_COLORS } from '../render/view.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.root = $('ui');
    this.hand = $('hand');
    this.log = $('log');
    this.handCards = new Map();
    this.hoverCb = null;
    this.names = ['あなた', 'AI'];
    this.prevHp = [null, null];
    window.addEventListener('resize', () => { if (this.handArgs) this.renderHand(...this.handArgs); });
    // 戦況ログのカード名を押すと詳細
    this.log.addEventListener('click', (e) => {
      const a = e.target.closest('.card-link');
      if (a) showCardDetail(a.dataset.card);
    });
    $('log-toggle').onclick = () => {
      this.log.classList.toggle('collapsed');
      $('log-toggle').textContent = this.log.classList.contains('collapsed') ? '▸' : '▾';
    };
  }

  show(on) { this.root.classList.toggle('hidden', !on); }

  // ------------------------------------------------------------
  // プレイヤーパネル
  // ------------------------------------------------------------

  setupPanels(state, names, handlers) {
    this.names = names;
    this.handlers = handlers;
    // 新しい対局: 前の対局の手札の要素を捨てる
    for (const c of this.handCards.values()) c.remove();
    this.handCards.clear();
    this.hand.innerHTML = '';
    for (let p = 0; p < 2; p++) {
      const f = state.players[p].faction;
      const F = FACTIONS[f];
      const panel = $('panel-' + p);
      panel.style.setProperty('--team', TEAM_COLORS[p]);
      panel.innerHTML = '';
      const portrait = el('div', 'pp-portrait');
      const art = cardArt('leader_' + f);
      if (art) portrait.style.backgroundImage = `url(${art})`;
      portrait.appendChild(el('span', 'pp-emblem', F.emblem));
      panel.appendChild(portrait);
      const name = el('div', 'pp-name', `${names[p]} <small>${F.name}</small>`);
      panel.appendChild(name);
      const hp = el('div', 'pp-hp');
      hp.innerHTML = '<div class="pp-hp-ghost"></div><div class="pp-hp-fill"></div><div class="pp-hp-text"></div>';
      panel.appendChild(hp);
      panel.appendChild(el('div', 'pp-mana'));
      const cp = el('div', 'pp-cp');
      cp.title = '指揮力: 移動・攻撃で1、移動して攻撃で2消費。毎ターン3に戻る';
      panel.appendChild(cp);
      const meta = el('div', 'pp-meta');
      meta.innerHTML = `<span>手札 <b class="m-hand">0</b></span><span>山札 <b class="m-deck">0</b></span>`;
      const isHuman = handlers.isHuman(p);
      if (isHuman) {
        const hb = el('button', 'hero-btn', `<span class="hb-cost">${F.hero.cost}</span>${F.hero.name}`);
        hb.title = `英雄の力: ${F.hero.text}`;
        hb.onclick = () => handlers.onHero();
        meta.appendChild(hb);
      } else {
        meta.appendChild(el('span', 'hero-label', `英雄の力: ${F.hero.name}`)).title = F.hero.text;
      }
      panel.appendChild(meta);
      panel.onmouseenter = () => this.showLeaderInfo(state, p);
      panel.onmouseleave = () => this.hideInspector();
    }
    this.prevHp = [null, null];
  }

  showLeaderInfo(state, p) {
    const f = state.players[p].faction;
    const F = FACTIONS[f];
    this.inspectorHtml(`<div class="ins-name">${F.name}</div><div class="ins-sub">${this.names[p]}の陣営</div>
      <div class="ins-line">${F.desc}</div>
      <div class="ins-line"><b>英雄の力「${F.hero.name}」</b> (${F.hero.cost}マナ)<br>${F.hero.text}</div>`);
  }

  setHp(p, hp, max) {
    const panel = $('panel-' + p);
    const fill = panel.querySelector('.pp-hp-fill');
    const ghost = panel.querySelector('.pp-hp-ghost');
    const pct = Math.max(0, hp / max) * 100;
    fill.style.width = pct + '%';
    ghost.style.width = pct + '%';
    fill.classList.toggle('low', hp <= max * 0.3);
    panel.querySelector('.pp-hp-text').textContent = `${Math.max(0, hp)} / ${max}`;
  }

  setMana(p, mana, max) {
    const box = $('panel-' + p).querySelector('.pp-mana');
    box.innerHTML = '';
    const slots = Math.max(max, mana);
    for (let i = 0; i < Math.min(12, slots); i++) {
      const g = el('div', 'gem');
      if (i < mana) g.classList.add(i >= max ? 'bonus' : 'full');
      box.appendChild(g);
    }
    box.appendChild(el('span', 'pp-mana-text', `${mana}/${max}`));
  }

  setCp(p, cp) {
    const box = $('panel-' + p).querySelector('.pp-cp');
    if (!box) return;
    const prev = box.dataset.cp === undefined ? null : +box.dataset.cp;
    box.dataset.cp = cp;
    let h = '<span class="cp-label">指揮</span>';
    for (let i = 0; i < COMMAND_POINTS; i++) h += `<i class="${i < cp ? 'on' : ''}${prev !== null && i >= cp && i < prev ? ' spent' : ''}"></i>`;
    box.innerHTML = h;
    box.classList.toggle('empty', cp <= 0);
  }

  refresh(state, ctx) {
    const { humanTurn, selectedHand, heroArmed, aiThinking } = ctx;
    for (let p = 0; p < 2; p++) {
      const pl = state.players[p];
      const L = state.units.find((u) => u.uid === pl.leader);
      this.setHp(p, L ? L.hp : 0, L ? L.maxHp : 20);
      this.setMana(p, pl.mana, pl.maxMana);
      this.setCp(p, pl.cp ?? COMMAND_POINTS);
      const panel = $('panel-' + p);
      panel.querySelector('.m-hand').textContent = pl.hand.length;
      panel.querySelector('.m-deck').textContent = pl.deck.length;
      panel.classList.toggle('active', state.current === p && state.winner === null);
      const hb = panel.querySelector('.hero-btn');
      if (hb) {
        hb.disabled = !(humanTurn && state.current === p && canHero(state, p));
        hb.classList.toggle('armed', !!heroArmed);
      }
    }
    const tl = $('turn-label');
    const cur = state.current;
    if (state.winner !== null) { tl.textContent = '決着'; tl.className = ''; }
    else {
      tl.textContent = ctx.watch ? `${this.names[cur]} のターン` : cur === ctx.human ? 'あなたのターン' : (aiThinking ? 'AI 思考中…' : 'AI のターン');
      tl.className = cur === 0 ? 'me' : 'ai';
    }
    $('round-label').textContent = `ラウンド ${state.round} ・ ターン ${state.turn}`;
    const tec = $('tectonic');
    const nextKind = state.tectonicCount % 2 === 0 ? '中央回転' : '隆起と沈降';
    const left = state.round <= 1 ? TECTONIC_PERIOD : state.tectonicIn;
    tec.textContent = `⛰ 地殻変動 (${nextKind}) まで ${left} ラウンド`;
    tec.classList.toggle('soon', left <= 1);
    const envEl = $('env-label');
    const env = state.envKind && ENVIRONMENTS[state.envKind];
    if (envEl) {
      envEl.classList.toggle('hidden', !env);
      if (env) { envEl.textContent = `${env.icon} 環境「${env.name}」: ${env.text}`; envEl.className = 'env-' + state.envKind; }
    }
    // 相手の手札
    const eh = $('enemy-hand');
    const opp = ctx.watch ? 1 : 1 - ctx.human;
    const oppHand = state.players[opp].hand.length;
    if (eh.childElementCount !== oppHand) {
      const before = eh.childElementCount;
      eh.innerHTML = '';
      for (let i = 0; i < oppHand; i++) {
        const b = cardBack(state.players[opp].faction);
        if (i >= before) b.classList.add('new');
        eh.appendChild(b);
      }
    }
    // 手札
    const viewer = ctx.watch ? null : ctx.human;
    if (viewer !== null) this.renderHand(state, viewer, { humanTurn, selectedHand });
    else { this.hand.innerHTML = ''; this.handCards.clear(); this.handArgs = null; }
    // ターン終了ボタン
    const et = $('end-turn');
    // 演出中も押せるようにする (押した場合は演出の終了後にターン終了)
    const myTurn = !ctx.watch && state.winner === null && state.current === ctx.human && !aiThinking;
    et.disabled = !myTurn;
    et.classList.toggle('ready', !!(humanTurn && ctx.noMoves));
    const sub = et.querySelector('.et-sub');
    if (sub) {
      sub.textContent = ctx.readyCount ? `行動可能 ${ctx.readyCount}体` : 'Enter';
      sub.classList.toggle('cnt', !!ctx.readyCount);
    }
  }

  renderHand(state, p, { humanTurn, selectedHand }) {
    this.handArgs = [state, p, { humanTurn, selectedHand }];
    const pl = state.players[p];
    const keep = new Set(pl.hand.map((h) => h.uid));
    for (const [uid, elx] of this.handCards) if (!keep.has(uid)) { elx.remove(); this.handCards.delete(uid); }
    const n = pl.hand.length;
    const width = this.hand.clientWidth || 600;
    const cw = 128 * handScale();
    const spacing = Math.min(cw - 10, (width - cw - 60) / Math.max(1, n - 1));
    pl.hand.forEach((h, i) => {
      let c = this.handCards.get(h.uid);
      // 手札の uid は対局ごとに 1 から振り直されるので、別のカードの要素を使い回さないよう確かめる
      if (c && c.dataset.cardId !== h.cardId) { c.remove(); this.handCards.delete(h.uid); c = null; }
      if (!c) {
        c = renderCard(h.cardId);
        c.classList.add('drawn');
        c.dataset.uid = h.uid;
        // ホバーはマウスのときだけ (タッチでは拡大が残り続けてしまう)
        c.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse' || this.dragging) return; c.dataset.hover = '1'; this.layoutHand(); if (this.hoverCb) this.hoverCb(h.uid, true); });
        c.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse') return; c.dataset.hover = ''; this.layoutHand(); if (this.hoverCb) this.hoverCb(h.uid, false); });
        c.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.suppressClick) { this.suppressClick = false; return; }
          if (this.clickCb) this.clickCb(h.uid);
        });
        this.bindDrag(c, h.uid, h.cardId);
        // 長押し・右クリックで詳細
        onLongPress(c, () => { if (this.dragging) return; c.dataset.hover = ''; this.layoutHand(); showCardDetail(h.cardId); });
        c.addEventListener('contextmenu', (e) => { e.preventDefault(); showCardDetail(h.cardId); });
        const key = el('div', 'c-key', String(i + 1));
        c.appendChild(key);
        this.handCards.set(h.uid, c);
        setTimeout(() => c.classList.remove('drawn'), 700);
      }
      this.hand.appendChild(c); // 手札の順番どおりに並べ直す
      c.querySelector('.c-key').textContent = i < 9 ? String(i + 1) : '';
      c.dataset.index = i;
      c.dataset.n = n;
      c.dataset.spacing = spacing;
      const playable = humanTurn && canPlay(state, p, h);
      c.classList.toggle('playable', playable);
      c.classList.toggle('unplayable', !playable);
      c.classList.toggle('selected', selectedHand === h.uid);
    });
    this.hand.classList.toggle('disabled', !humanTurn);
    this.hand.classList.toggle('tray', trayMode());
    this.layoutHand();
    const sel = selectedHand != null && this.handCards.get(selectedHand);
    if (sel && trayMode()) sel.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }

  // 手札のカードを上へドラッグして盤面に出す
  bindDrag(c, uid, cardId) {
    let start = null, ghost = null;
    const move = (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!ghost) {
        // 上方向に動かしたらドラッグ開始 (横方向はスクロールに任せる)
        if (dy > -16 || Math.abs(dy) < Math.abs(dx)) {
          if (Math.hypot(dx, dy) > 16) start = null;
          return;
        }
        if (!this.dragCb || !this.dragCb.begin(uid)) { start = null; return; }
        this.dragging = true;
        try { c.setPointerCapture(e.pointerId); } catch { /* noop */ }
        ghost = el('div', 'drag-ghost');
        ghost.appendChild(renderCard(cardId));
        document.body.appendChild(ghost);
        c.classList.add('dragging');
        c.dataset.hover = '';
        this.layoutHand();
      }
      ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      const overHand = e.clientY > this.hand.getBoundingClientRect().top + 10;
      ghost.classList.toggle('over-hand', overHand);
      this.dragCb.over(overHand ? null : e);
    };
    const up = (e) => {
      if (!start || e.pointerId !== start.id) return;
      start = null;
      if (!ghost) return;
      ghost.remove();
      ghost = null;
      c.classList.remove('dragging');
      this.dragging = false;
      this.suppressClick = true;
      setTimeout(() => { this.suppressClick = false; }, 50);
      const overHand = e.type === 'pointercancel' || e.clientY > this.hand.getBoundingClientRect().top + 10;
      this.dragCb.drop(overHand ? null : e);
    };
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      // マウスはホバー拡大でカードが動くので、押した瞬間から追跡する
      if (e.pointerType === 'mouse') { try { c.setPointerCapture(e.pointerId); } catch { /* noop */ } }
    });
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
  }

  // 現在の操作の案内と、発動・詳細・キャンセルのボタン
  setActionBar(spec) {
    const bar = $('action-bar');
    document.body.classList.toggle('has-action', !!spec);
    if (!spec) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
    bar.innerHTML = '';
    const text = el('div', 'ab-text');
    text.appendChild(el('div', 'ab-title', spec.title));
    if (spec.hint) text.appendChild(el('div', 'ab-hint', spec.hint));
    bar.appendChild(text);
    const btns = el('div', 'ab-btns');
    for (const b of spec.buttons || []) {
      const x = el('button', 'ab-btn ' + (b.cls || ''), b.label);
      x.type = 'button';
      x.onclick = (e) => { e.stopPropagation(); b.onClick(); };
      btns.appendChild(x);
    }
    bar.appendChild(btns);
    bar.classList.remove('hidden');
  }

  layoutHand() {
    const cards = [...this.handCards.values()];
    if (trayMode()) {
      for (const c of cards) { c.style.transform = ''; c.style.zIndex = ''; }
      return;
    }
    const anyHover = cards.some((c) => c.dataset.hover === '1');
    const base = handScale();
    for (const c of cards) {
      const i = +c.dataset.index, n = +c.dataset.n, sp = +c.dataset.spacing;
      const off = i - (n - 1) / 2;
      const dragging = c.classList.contains('dragging');
      const hover = c.dataset.hover === '1' && !dragging;
      const sel = c.classList.contains('selected') && !dragging;
      let x = off * sp - 64;
      let rot = off * 3.2;
      // 縮小時は変形の基準点 (カード下端より下) に引っ張られて沈む分を戻す
      let y = Math.abs(off) * Math.abs(off) * 2.2 * base - 36 * (1 - base);
      let scale = base;
      if (hover) { rot = 0; y = base < 1 ? -70 * base : -110; scale = 1.42 * base; }
      else if (sel) { rot = 0; y = -34 * base; scale = 1.06 * base; } // 選択中は案内バーがあるので控えめに持ち上げる
      else if (anyHover) {
        const hi = cards.find((k) => k.dataset.hover === '1');
        const d = i - +hi.dataset.index;
        x += Math.sign(d) * 40 / Math.max(1, Math.abs(d));
      }
      c.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${scale})`;
      c.style.zIndex = hover ? 100 : sel ? 90 : 10 + i;
    }
  }

  // ------------------------------------------------------------
  // ログ
  // ------------------------------------------------------------

  addLog(html, cls = '') {
    const d = el('div', 'l ' + cls, html);
    this.log.appendChild(d);
    while (this.log.childElementCount > 160) this.log.firstChild.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  clearLog() { this.log.innerHTML = ''; }

  // ------------------------------------------------------------
  // AI パネル
  // ------------------------------------------------------------

  aiReset(title, diffName) {
    $('ai-title').textContent = title;
    $('ai-diff').textContent = diffName || '';
    $('ai-panel').className = '';
    $('ai-status').textContent = '待機中';
    $('ai-evals').textContent = '0';
    $('ai-depth').textContent = '0';
    $('ai-time').textContent = '0.0s';
    $('ai-intent').innerHTML = '';
    $('ai-plan').innerHTML = '';
  }

  aiThinking(on, label = '盤面を読んでいます…', mode = 'thinking') {
    $('ai-panel').className = on ? mode : '';
    $('ai-status').textContent = label;
  }

  aiProgress({ evaluated, depth, time, plan }) {
    $('ai-evals').textContent = evaluated.toLocaleString();
    $('ai-depth').textContent = depth < 0 ? '応手' : String(depth);
    $('ai-time').textContent = (time / 1000).toFixed(1) + 's';
    if (plan) this.aiPlan(plan, -1);
  }

  aiPlan(lines, current) {
    const ol = $('ai-plan');
    ol.innerHTML = '';
    lines.forEach((t, i) => {
      const li = el('li', i < current ? 'done' : i === current ? 'now' : '', t);
      ol.appendChild(li);
    });
    const now = ol.querySelector('.now');
    if (now) now.scrollIntoView({ block: 'nearest' });
  }

  aiIntent(tag, text) {
    $('ai-intent').innerHTML = tag ? `<span class="tag t-${tag}">${tag}</span>${text}` : '';
  }

  setBalance(prob, names) {
    document.querySelector('.bal-fill').style.width = (prob * 100).toFixed(1) + '%';
    if (names) {
      document.querySelector('.bal-l').textContent = names[0];
      document.querySelector('.bal-r').textContent = names[1];
    }
  }

  // ------------------------------------------------------------
  // インスペクタ・ツールチップ
  // ------------------------------------------------------------

  // opts.pinned: タップで固定表示 (タッチ端末)。固定中はホバーで上書きしない
  // opts.detail: 「詳細」ボタンで開くカード詳細の関数
  inspectorHtml(html, team, opts = {}) {
    if (this.pinned && !opts.pinned) return;
    const ins = $('inspector');
    ins.innerHTML = html;
    if (opts.detail) {
      const bar = el('div', 'ins-actions');
      const d = el('button', 'ins-detail', 'ⓘ 詳細');
      d.onclick = (e) => { e.stopPropagation(); opts.detail(); };
      bar.appendChild(d);
      ins.appendChild(bar);
    }
    if (opts.pinned) {
      const x = el('button', 'ins-close', '✕');
      x.setAttribute('aria-label', '閉じる');
      x.onclick = (e) => { e.stopPropagation(); this.hideInspector(true); };
      ins.appendChild(x);
    }
    if (team) ins.style.setProperty('--team', team);
    else ins.style.removeProperty('--team');
    this.pinned = !!opts.pinned;
    ins.classList.toggle('pinned', this.pinned);
    ins.classList.remove('hidden');
  }

  hideInspector(force = false) {
    if (this.pinned && !force) return;
    this.pinned = false;
    $('inspector').classList.remove('pinned');
    $('inspector').classList.add('hidden');
  }

  inspectUnit(state, u, names, opts = {}) {
    const c = CARDS[u.cardId];
    const t = state.tiles[u.y * 7 + u.x];
    const art = cardArt(u.cardId);
    const chips = [];
    if (u.frozen) chips.push('<span class="chip ice">凍結中</span>');
    if (u.sick && !u.leader) chips.push('<span class="chip warn">召喚酔い (次ターンから行動)</span>');
    if (u.owner === state.current && !u.sick && !u.frozen) {
      if (!u.moved) chips.push('<span class="chip ok">移動可</span>');
      if (!u.attacked) chips.push('<span class="chip ok">攻撃可</span>');
      if (u.moved && u.attacked) chips.push('<span class="chip">行動済み</span>');
    }
    const lines = keywordHelp(u.cardId).map((s) => `<div class="ins-line">${s}</div>`).join('');
    const text = c.text && c.type !== 'leader' ? `<div class="ins-line">${c.text}</div>` : '';
    const atkNote = u.atk !== c.atk ? ` <small>(基本${c.atk})</small>` : '';
    const name = u.leader ? `${FACTIONS[c.faction].name}の将` : c.name;
    const tr = TERRAIN[t.terrain];
    let tileNote = '';
    if (t.terrain === 'water' && !has(u, 'flying')) tileNote = ' <span class="chip warn">攻撃-1</span>';
    if (t.terrain === 'lava' && !has(u, 'flying') && !has(u, 'lavaWalk')) tileNote = ' <span class="chip warn">ターン終了時2ダメージ</span>';
    if (t.terrain === 'forest' && has(u, 'forestKin')) tileNote = ' <span class="chip ok">攻撃+1</span>';
    this.inspectorHtml(`
      <div class="ins-head"><div class="ins-art" style="background-image:url(${art || ''})"></div>
      <div><div class="ins-name">${name}</div><div class="ins-sub">${names[u.owner]} · ${coordName(u.x, u.y)}</div></div></div>
      <div class="ins-stats"><span>⚔ ${u.atk}${atkNote}</span><span>❤ ${u.hp}/${u.maxHp}</span><span>👣 ${u.move}</span><span>🎯 ${u.range}</span></div>
      <div class="ins-status">${chips.join('')}</div>
      ${text}${lines}
      <div class="ins-tile">足場: <b>${tr.name}</b> (高さ${t.height})${tileNote}<br>${tr.desc}</div>`, TEAM_COLORS[u.owner],
    { pinned: opts.pinned, detail: () => showCardDetail(u.cardId, { unit: u, state, ownerName: names[u.owner] }) });
  }

  inspectTile(state, x, y, opts = {}) {
    const t = state.tiles[y * 7 + x];
    const tr = TERRAIN[t.terrain];
    this.inspectorHtml(`<div class="ins-name">${tr.name}</div><div class="ins-sub">${coordName(x, y)} · 高さ ${t.height}</div>
      <div class="ins-line">${tr.desc}</div>
      <div class="ins-line" style="color:var(--muted)">高所から低所への攻撃はダメージ+1。高低差2以上は地上ユニットが登れない。</div>`, null, { pinned: opts.pinned });
  }

  inspectCard(cardId, opts = {}) {
    const c = CARDS[cardId];
    const lines = keywordHelp(cardId).map((s) => `<div class="ins-line">${s}</div>`).join('');
    const art = c.type === 'unit' ? cardArt(cardId) : null;
    const stats = c.type === 'unit' ? `<div class="ins-stats"><span>⚔ ${c.atk}</span><span>❤ ${c.hp}</span><span>👣 ${c.move}</span><span>🎯 ${c.range}</span></div>` : '';
    this.inspectorHtml(`
      <div class="ins-head">${art ? `<div class="ins-art" style="background-image:url(${art})"></div>` : `<div class="ins-art ins-icon">${c.icon || '✦'}</div>`}
      <div><div class="ins-name">${c.name}</div><div class="ins-sub">${typeName(c)} · ${factionName(c.faction)} · コスト ${c.cost}</div></div></div>
      ${stats}
      ${c.text ? `<div class="ins-line">${c.text}</div>` : ''}${lines}
      <div class="ins-tile">${targetText(c)}</div>`, null, { pinned: opts.pinned, detail: () => showCardDetail(cardId) });
  }

  tooltip(x, y, html) {
    const t = $('tooltip');
    if (!html) { t.classList.add('hidden'); return; }
    t.innerHTML = html;
    t.classList.remove('hidden');
    const w = t.offsetWidth;
    t.style.left = Math.min(x, window.innerWidth - w - 30) + 'px';
    t.style.top = Math.min(y, window.innerHeight - 80) + 'px';
  }

  toast(msg, ms = 2200) {
    const t = $('toast');
    t.innerHTML = msg;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  banner(main, sub, cls, ms = 1600) {
    const b = $('banner');
    b.className = '';
    void b.offsetWidth;
    b.innerHTML = `<div class="b-main">${main}</div>${sub ? `<div class="b-sub">${sub}</div>` : ''}`;
    b.className = 'show ' + (cls || '');
    return new Promise((r) => setTimeout(r, ms * 0.7));
  }

  showPlayedCard(cardId, p, who, speed = 1) {
    const box = $('played-card');
    box.innerHTML = '';
    const c = renderCard(cardId);
    c.classList.add('p' + p);
    const label = el('div', 'pc-who', who);
    label.style.color = TEAM_COLORS[p];
    box.appendChild(label);
    box.appendChild(c);
    const dur = (p === 0 ? 800 : 1250) / speed;
    c.style.animationDuration = dur + 'ms';
    label.style.animationDuration = dur + 'ms';
    setTimeout(() => { if (box.contains(c)) box.innerHTML = ''; }, dur + 50);
    return new Promise((r) => setTimeout(r, dur * 0.55));
  }

  pickDirection(kind) {
    const dp = $('dir-picker');
    dp.classList.remove('hidden');
    const opts = kind === 'row'
      ? [['◀ 左へずらす', -1], ['右へずらす ▶', 1]]
      : [['⟲ 反時計回り', -1], ['時計回り ⟳', 1]];
    dp.innerHTML = `<h4>${kind === 'row' ? 'ずらす方向' : '回転の向き'}を選択</h4>`;
    const row = el('div', 'dp-row');
    dp.appendChild(row);
    return new Promise((resolve) => {
      const done = (v) => { dp.classList.add('hidden'); resolve(v); };
      for (const [label, v] of opts) {
        const b = el('button', '', label);
        b.onclick = () => done(v);
        row.appendChild(b);
      }
      const c = el('button', 'dp-cancel', 'キャンセル');
      c.onclick = () => done(null);
      dp.appendChild(c);
      this.cancelDir = () => done(null);
    });
  }
}

// タッチ端末や狭い画面では手札を重ねず横スクロールで並べる
export function trayMode() {
  const w = window.innerWidth, h = window.innerHeight;
  return window.matchMedia('(hover: none)').matches || w <= 600 || (h <= 520 && w > h);
}

// 画面サイズに応じた手札の縮尺
function handScale() {
  const w = window.innerWidth, h = window.innerHeight;
  if (h <= 520 && w > h) return 0.56;
  if (w <= 600) return 0.72;
  return 1;
}

export function cardLink(cardId) {
  const c = CARDS[cardId];
  return `<a class="card-link" data-card="${cardId}">「${c.name}」</a>`;
}
