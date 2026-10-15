// デッキ編成画面
import { CARDS, FACTIONS, PRESETS, cardPool, validateDeck, maxCopies, DECK_SIZE, typeName } from '../engine/cards.js';
import { renderCard, el } from './cardview.js';
import { showCardDetail, onLongPress } from './cardinfo.js';
import { loadCustom, saveCustom, deckOptions } from './decks.js';

const $ = (id) => document.getElementById(id);
const TYPE_ORDER = { unit: 0, spell: 1, field: 2 };
const byCard = (a, b) => {
  const A = CARDS[a], B = CARDS[b];
  return A.cost - B.cost || TYPE_ORDER[A.type] - TYPE_ORDER[B.type] || (A.faction === 'neutral') - (B.faction === 'neutral') || A.name.localeCompare(B.name, 'ja');
};

export class DeckBuilder {
  constructor({ sound, toast, onUse, onClose, view }) {
    this.view = view;
    this.sound = sound;
    this.toast = toast;
    this.onUse = onUse;
    this.onClose = onClose;
    this.root = $('deck-builder');
    this.filters = { type: 'all', cost: 'all', side: 'all' };
    this.root.querySelector('.db-back').onclick = () => this.close();
    this.root.querySelector('.db-drawer-toggle').onclick = () => this.root.querySelector('.db-deck').classList.toggle('open');
    this.nameInput = this.root.querySelector('.db-name');
    this.nameInput.addEventListener('input', () => {
      const d = this.current();
      if (!d || d.preset) return;
      d.slot.name = this.nameInput.value.slice(0, 16) || d.slot.name;
      saveCustom();
      this.renderSlots();
    });
  }

  open(faction, deckId) {
    this.faction = faction;
    this.deckId = deckId || PRESETS[faction][0].id;
    this.root.classList.remove('hidden');
    if (this.view) this.view.paused = true;
    this.render();
  }

  close() {
    this.root.classList.add('hidden');
    if (this.view) this.view.paused = false;
    if (this.onClose) this.onClose();
  }

  // 表示中のデッキ。マイデッキなら保存データ (slot) への参照を持つ
  current() {
    const p = PRESETS[this.faction].find((x) => x.id === this.deckId);
    if (p) return { preset: true, name: p.name, desc: p.desc, cards: p.cards };
    const slot = loadCustom()[this.faction].find((x) => x.id === this.deckId);
    if (!slot) return null;
    return { preset: false, name: slot.name, cards: slot.cards, slot };
  }

  render() {
    this.renderFactions();
    this.renderSlots();
    this.renderFilters();
    this.renderPool();
    this.renderDeck();
  }

  renderFactions() {
    const box = this.root.querySelector('.db-factions');
    box.innerHTML = '';
    for (const [id, F] of Object.entries(FACTIONS)) {
      const b = el('button', id === this.faction ? 'sel' : '', `${F.emblem} ${F.short}`);
      b.style.setProperty('--fc', F.color);
      b.onclick = () => { this.sound.play('click'); this.open(id, PRESETS[id][0].id); };
      box.appendChild(b);
    }
  }

  renderSlots() {
    const box = this.root.querySelector('.db-slots');
    box.innerHTML = '';
    for (const d of deckOptions(this.faction)) {
      const b = el('button', 'db-slot' + (d.id === this.deckId ? ' sel' : '') + (d.preset ? ' preset' : ''));
      const status = d.preset ? '構築済み' : d.cards.length === 0 ? '空' : d.valid ? `${DECK_SIZE}枚 ✓` : `${d.cards.length}/${DECK_SIZE}`;
      b.innerHTML = `<span class="dbs-name">${escapeHtml(d.name)}</span><span class="dbs-status ${d.valid ? 'ok' : ''}">${status}</span>`;
      b.onclick = () => { this.sound.play('click'); this.deckId = d.id; this.render(); };
      box.appendChild(b);
    }
  }

  renderFilters() {
    const box = this.root.querySelector('.db-filters');
    box.innerHTML = '';
    const group = (key, items) => {
      const g = el('div', 'db-fgroup');
      for (const [v, label] of items) {
        const b = el('button', this.filters[key] === v ? 'sel' : '', label);
        b.onclick = () => { this.filters[key] = v; this.renderFilters(); this.renderPool(); };
        g.appendChild(b);
      }
      box.appendChild(g);
    };
    group('side', [['all', 'すべて'], ['faction', FACTIONS[this.faction].short], ['neutral', '中立']]);
    group('type', [['all', '全種類'], ['unit', 'ユニット'], ['spell', '呪文'], ['field', '地形']]);
    group('cost', [['all', '全コスト'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6+']]);
  }

  poolIds() {
    const f = this.filters;
    return cardPool(this.faction).filter((id) => {
      const c = CARDS[id];
      if (f.side === 'faction' && c.faction === 'neutral') return false;
      if (f.side === 'neutral' && c.faction !== 'neutral') return false;
      if (f.type !== 'all' && c.type !== f.type) return false;
      if (f.cost !== 'all') {
        const n = +f.cost;
        if (n === 6 ? c.cost < 6 : c.cost !== n) return false;
      }
      return true;
    }).sort(byCard);
  }

  renderPool() {
    const grid = this.root.querySelector('.db-grid');
    grid.innerHTML = '';
    const d = this.current();
    const count = (id) => d.cards.filter((x) => x === id).length;
    for (const id of this.poolIds()) {
      const n = count(id), max = maxCopies(id);
      const tile = el('div', 'db-tile' + (n >= max ? ' maxed' : '') + (n > 0 ? ' in' : ''));
      tile.tabIndex = 0;
      tile.setAttribute('role', 'button');
      tile.setAttribute('aria-label', `${CARDS[id].name} をデッキに追加`);
      const wrap = el('div', 'db-card');
      wrap.appendChild(renderCard(id));
      tile.appendChild(wrap);
      tile.appendChild(el('div', 'db-badge', `${n}/${max}`));
      if (CARDS[id].legend) tile.appendChild(el('div', 'db-legend', '★ 1枚まで'));
      const info = el('button', 'db-info', 'ⓘ');
      info.title = '詳細';
      info.onclick = (e) => { e.stopPropagation(); showCardDetail(id); };
      tile.appendChild(info);
      tile.onclick = () => this.add(id);
      tile.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.add(id); } };
      tile.oncontextmenu = (e) => { e.preventDefault(); showCardDetail(id); };
      onLongPress(tile, () => showCardDetail(id));
      grid.appendChild(tile);
    }
  }

  renderDeck() {
    const d = this.current();
    const panel = this.root.querySelector('.db-deck');
    panel.classList.toggle('readonly', d.preset);
    this.nameInput.value = d.name;
    this.nameInput.disabled = d.preset;
    const n = d.cards.length;
    panel.querySelector('.db-count b').textContent = `${n} / ${DECK_SIZE}`;
    panel.querySelector('.db-count i').style.width = Math.min(100, (n / DECK_SIZE) * 100) + '%';
    panel.querySelector('.db-count').classList.toggle('full', n === DECK_SIZE);
    this.root.querySelector('.db-drawer-toggle').innerHTML = `<span>${escapeHtml(d.name)}</span><b>${n} / ${DECK_SIZE}</b><i>▲</i>`;
    // 問題点
    const errs = validateDeck(this.faction, d.cards).filter((e) => !e.includes('ちょうど'));
    const msg = panel.querySelector('.db-msg');
    if (d.preset) msg.innerHTML = `<div class="db-note">${d.desc}<br>構築済みデッキは編集できません。「マイデッキにコピー」してから自由に入れ替えられます。</div>`;
    else if (n < DECK_SIZE) msg.innerHTML = `<div class="db-note">あと <b>${DECK_SIZE - n}</b> 枚。左のカードを押して追加します (同じカードは2枚、★は1枚まで)。</div>`;
    else if (n > DECK_SIZE) msg.innerHTML = `<div class="db-warn">${n - DECK_SIZE} 枚多すぎます</div>`;
    else msg.innerHTML = errs.length ? '' : '<div class="db-ok">✓ 対戦に使えます</div>';
    if (errs.length) msg.innerHTML += errs.map((e) => `<div class="db-warn">${e}</div>`).join('');
    // 種類とコスト分布
    const byType = { unit: 0, spell: 0, field: 0 };
    const curve = new Array(8).fill(0);
    for (const id of d.cards) { byType[CARDS[id].type]++; curve[Math.min(7, CARDS[id].cost)]++; }
    const maxC = Math.max(1, ...curve);
    panel.querySelector('.db-stats').innerHTML = `
      <div class="ds-types"><span>ユニット <b>${byType.unit}</b></span><span>呪文 <b>${byType.spell}</b></span><span>地形 <b>${byType.field}</b></span></div>
      <div class="ds-curve">${curve.map((c, i) => `<div class="cv-col"><div class="cv-bar" style="height:calc((100% - 16px) * ${(c / maxC).toFixed(3)})"><span>${c || ''}</span></div><div class="cv-x">${i === 7 ? '7+' : i}</div></div>`).join('')}</div>`;
    // リスト
    const list = panel.querySelector('.db-list');
    list.innerHTML = '';
    const counts = new Map();
    for (const id of d.cards) counts.set(id, (counts.get(id) || 0) + 1);
    const ids = [...counts.keys()].sort(byCard);
    if (!ids.length) list.appendChild(el('div', 'db-empty', 'まだカードがありません'));
    for (const id of ids) {
      const c = CARDS[id];
      const row = el('div', `db-row f-${c.faction}`);
      row.appendChild(el('span', 'db-cost', String(c.cost)));
      const name = el('button', 'db-rname', `${c.legend ? '★' : ''}${c.name}<small>${typeName(c)}</small>`);
      name.onclick = () => showCardDetail(id);
      row.appendChild(name);
      row.appendChild(el('span', 'db-n', `×${counts.get(id)}`));
      if (!d.preset) {
        const minus = el('button', 'db-pm', '−');
        minus.setAttribute('aria-label', `${c.name} を1枚減らす`);
        minus.onclick = () => this.remove(id);
        const plus = el('button', 'db-pm', '+');
        plus.setAttribute('aria-label', `${c.name} を1枚増やす`);
        plus.disabled = counts.get(id) >= maxCopies(id);
        plus.onclick = () => this.add(id);
        row.appendChild(minus);
        row.appendChild(plus);
      }
      list.appendChild(row);
    }
    this.renderActions(d);
  }

  renderActions(d) {
    const box = this.root.querySelector('.db-actions');
    box.innerHTML = '';
    const btn = (label, cls, fn, disabled) => {
      const b = el('button', 'db-btn ' + (cls || ''), label);
      b.disabled = !!disabled;
      b.onclick = fn;
      box.appendChild(b);
      return b;
    };
    const valid = validateDeck(this.faction, d.cards).length === 0;
    if (d.preset) {
      btn('マイデッキにコピー', '', () => this.copyPreset(d));
    } else {
      btn('おまかせで埋める', '', () => this.autoFill(), d.cards.length >= DECK_SIZE);
      const load = el('select', 'db-select');
      load.innerHTML = '<option value="">構築済みを読み込む…</option>' + PRESETS[this.faction].map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
      load.onchange = () => {
        const p = PRESETS[this.faction].find((x) => x.id === load.value);
        if (!p) return;
        d.slot.cards.splice(0, d.slot.cards.length, ...p.cards);
        saveCustom();
        this.toast(`「${p.name}」を読み込みました`);
        this.render();
      };
      box.appendChild(load);
      const clear = btn('空にする', 'danger', () => {
        if (!clear.dataset.armed) {
          clear.dataset.armed = '1';
          clear.textContent = 'もう一度押すと空に';
          setTimeout(() => { if (clear.isConnected) { clear.dataset.armed = ''; clear.textContent = '空にする'; } }, 3000);
          return;
        }
        d.slot.cards.length = 0;
        saveCustom();
        this.render();
      }, d.cards.length === 0);
    }
    btn('このデッキで戦う', 'primary', () => { this.onUse(this.faction, this.deckId); this.close(); }, !valid);
  }

  add(id) {
    const d = this.current();
    if (d.preset) { this.sound.play('error'); this.toast('構築済みデッキは編集できません。マイデッキを選ぶか「マイデッキにコピー」してください'); return; }
    if (d.cards.length >= DECK_SIZE) { this.sound.play('error'); this.toast(`デッキは${DECK_SIZE}枚までです。先に何か抜いてください`); return; }
    const n = d.cards.filter((x) => x === id).length;
    if (n >= maxCopies(id)) { this.sound.play('error'); this.toast(`${CARDS[id].name} は${maxCopies(id)}枚までです`); return; }
    d.slot.cards.push(id);
    saveCustom();
    this.sound.play('card');
    this.renderSlots();
    this.renderPool();
    this.renderDeck();
  }

  remove(id) {
    const d = this.current();
    if (d.preset) return;
    const i = d.slot.cards.lastIndexOf(id);
    if (i < 0) return;
    d.slot.cards.splice(i, 1);
    saveCustom();
    this.sound.play('cancel');
    this.renderSlots();
    this.renderPool();
    this.renderDeck();
  }

  // 構築済みデッキでよく使われるカードを優先して残りを埋める
  autoFill() {
    const d = this.current();
    if (d.preset) return;
    const order = [];
    for (const p of PRESETS[this.faction]) for (const id of p.cards) if (!order.includes(id)) order.push(id);
    for (const id of cardPool(this.faction).sort(byCard)) if (!order.includes(id)) order.push(id);
    const count = (id) => d.slot.cards.filter((x) => x === id).length;
    for (let pass = 0; pass < 3 && d.slot.cards.length < DECK_SIZE; pass++) {
      for (const id of order) {
        if (d.slot.cards.length >= DECK_SIZE) break;
        if (count(id) < Math.min(maxCopies(id), pass + 1)) d.slot.cards.push(id);
      }
    }
    saveCustom();
    this.sound.play('summon');
    this.toast('残りのカードを自動で選びました');
    this.render();
  }

  copyPreset(d) {
    const slots = loadCustom()[this.faction];
    const target = slots.find((s) => s.cards.length === 0);
    if (!target) {
      this.toast('空いているマイデッキがありません。マイデッキを選んで「構築済みを読み込む」から上書きしてください', 4000);
      return;
    }
    target.cards.splice(0, target.cards.length, ...d.cards);
    target.name = `${d.name}改`.slice(0, 16);
    saveCustom();
    this.deckId = target.id;
    this.sound.play('summon');
    this.toast(`「${target.name}」としてコピーしました。自由に編集できます`);
    this.render();
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
