// カード詳細モーダル・デッキ一覧・キーワード辞典
import { CARDS, FACTIONS, KEYWORDS, TERRAIN, DECKS, keywordList, typeName } from '../engine/cards.js';
import { renderCard, el, keywordHelp, factionName } from './cardview.js';

const $ = (id) => document.getElementById(id);

const TARGET_TEXT = {
  summon: '自陣 (手前2列) か、自分の将の周囲8マスの空きマスに召喚',
  enemyUnit: '敵ユニット1体 (将は不可)',
  enemyAny: '敵1体 (将も可)',
  friendlyUnit: '味方ユニット1体 (将は不可)',
  friendlyAny: '味方1体 (将も可)',
  tile: '盤上の任意のマス',
  row: '任意の行を選び、ずらす方向を指定',
  block: '3x3 区画の中心マス (盤の端以外) を選び、回転の向きを指定',
  heroEnemy4: '自分の将から4マス以内の敵1体',
  heroPush3: '自分の将から3マス以内の敵ユニット1体',
};

export function targetText(card) {
  if (card.type === 'unit') return TARGET_TEXT.summon;
  if (!card.target) return '対象なし (そのまま発動)';
  return TARGET_TEXT[card.target] || '';
}

/**
 * カードの詳細を大きく表示する。unit を渡すと盤上の現在の状態も表示する。
 */
export function showCardDetail(cardId, { unit = null, state = null, ownerName = '' } = {}) {
  const c = CARDS[cardId];
  if (!c) return;
  const box = $('modal-card');
  const cardBox = box.querySelector('.cd-card');
  const info = box.querySelector('.cd-info');
  cardBox.innerHTML = '';
  cardBox.appendChild(renderCard(cardId, unit ? { atk: unit.atk, hp: unit.hp } : {}));

  const isUnit = c.type === 'unit' || c.type === 'leader';
  const name = c.type === 'leader' ? `${FACTIONS[c.faction].name}の将` : c.name;
  let html = `<h3 class="cd-name">${name}</h3>`;
  html += `<div class="cd-sub">${typeName(c)} · ${factionName(c.faction)}${c.type === 'leader' ? '' : ` · コスト ${c.cost}`}${ownerName ? ` · ${ownerName}` : ''}</div>`;
  if (isUnit) {
    const row = (label, base, cur) => {
      const changed = cur !== undefined && cur !== base;
      return `<div><span>${label}</span><b class="${changed ? (cur > base ? 'up' : 'down') : ''}">${cur ?? base}</b>${changed ? `<small>基本 ${base}</small>` : ''}</div>`;
    };
    html += '<div class="cd-stats">';
    html += row('攻撃', c.atk, unit ? unit.atk : undefined);
    html += row('HP', c.hp, unit ? unit.hp : undefined);
    html += row('移動', c.move, unit ? unit.move : undefined);
    html += row('射程', c.range || 1, unit ? unit.range : undefined);
    html += '</div>';
  }
  if (c.text) html += `<p class="cd-text">${c.text}</p>`;
  if (c.type !== 'leader') html += `<div class="cd-row"><span class="cd-label">使い方</span>${targetText(c)}</div>`;
  if (c.type === 'leader') {
    const h = FACTIONS[c.faction].hero;
    html += `<div class="cd-row"><span class="cd-label">英雄の力</span><b>「${h.name}」</b> (${h.cost}マナ・1ターン1回)<br>${h.text}</div>`;
  }
  const kws = keywordHelp(cardId);
  if (kws.length) html += `<div class="cd-kws">${kws.map((k) => `<div>${k}</div>`).join('')}</div>`;
  if (isUnit && c.type === 'unit' && !(c.keywords || []).includes('haste')) {
    html += '<div class="cd-note">召喚したターンは行動できない (召喚酔い)。</div>';
  }
  if (unit && state) {
    const chips = [];
    if (unit.frozen) chips.push('<span class="chip ice">凍結中: 次の自分のターンは行動不可・反撃不可</span>');
    if (unit.sick && !unit.leader) chips.push('<span class="chip warn">召喚酔い: 次のターンから行動</span>');
    if (unit.owner === state.current && !unit.sick && !unit.frozen) {
      chips.push(unit.moved ? '<span class="chip">移動済み</span>' : '<span class="chip ok">移動できる</span>');
      chips.push(unit.attacked ? '<span class="chip">攻撃済み</span>' : '<span class="chip ok">攻撃できる</span>');
    }
    const t = state.tiles[unit.y * 7 + unit.x];
    const tr = TERRAIN[t.terrain];
    html += `<div class="cd-row"><span class="cd-label">いまの状態</span>${chips.join(' ') || '特になし'}</div>`;
    html += `<div class="cd-row"><span class="cd-label">足場</span><b>${tr.name}</b> (高さ${t.height}) — ${tr.desc}</div>`;
  }
  info.innerHTML = html;
  box.classList.remove('hidden');
}

// ------------------------------------------------------------
// デッキ一覧
// ------------------------------------------------------------

const TYPE_ORDER = { unit: 0, spell: 1, field: 2 };

function uniqueSorted(deck) {
  const counts = new Map();
  for (const id of deck) counts.set(id, (counts.get(id) || 0) + 1);
  return [...counts.entries()].sort((a, b) => {
    const A = CARDS[a[0]], B = CARDS[b[0]];
    return A.cost - B.cost || TYPE_ORDER[A.type] - TYPE_ORDER[B.type] || A.name.localeCompare(B.name, 'ja');
  });
}

/**
 * tabs: [{ label, faction, status?: (cardId, total) => { text, dim }, note? }]
 */
export function openDeckViewer(tabs, active = 0) {
  const box = $('modal-deck');
  const tabRow = $('deck-tabs');
  tabRow.innerHTML = '';
  tabs.forEach((t, i) => {
    const b = el('button', i === active ? 'sel' : '', t.label);
    b.style.setProperty('--fc', FACTIONS[t.faction].color);
    b.onclick = () => openDeckViewer(tabs, i);
    tabRow.appendChild(b);
  });
  const tab = tabs[active];
  const deck = DECKS[tab.faction];
  const list = uniqueSorted(deck);
  // 概要: 種類の内訳とコスト分布
  const byType = { unit: 0, spell: 0, field: 0 };
  const curve = new Array(8).fill(0);
  for (const id of deck) { byType[CARDS[id].type]++; curve[Math.min(7, CARDS[id].cost)]++; }
  const maxC = Math.max(...curve);
  const bars = curve.map((n, i) => `<div class="cv-col"><div class="cv-bar" style="height:calc((100% - 16px) * ${maxC ? (n / maxC).toFixed(3) : 0})"><span>${n || ''}</span></div><div class="cv-x">${i === 7 ? '7+' : i}</div></div>`).join('');
  $('deck-summary').innerHTML = `
    <div class="ds-left">
      <div class="ds-title">${FACTIONS[tab.faction].emblem} ${FACTIONS[tab.faction].name} <small>${deck.length}枚</small></div>
      <div class="ds-types"><span>ユニット <b>${byType.unit}</b></span><span>呪文 <b>${byType.spell}</b></span><span>地形 <b>${byType.field}</b></span></div>
      ${tab.note ? `<div class="ds-note">${tab.note}</div>` : ''}
    </div>
    <div class="ds-curve" aria-label="コスト分布">${bars}</div>`;
  const grid = $('deck-grid');
  grid.innerHTML = '';
  for (const [id, total] of list) {
    const tile = el('button', 'deck-tile');
    tile.type = 'button';
    tile.title = `${CARDS[id].name} の詳細`;
    const wrap = el('div', 'dt-card');
    wrap.appendChild(renderCard(id));
    tile.appendChild(wrap);
    tile.appendChild(el('div', 'dt-count', `×${total}`));
    if (tab.status) {
      const st = tab.status(id, total);
      if (st) {
        tile.appendChild(el('div', 'dt-status', st.text));
        if (st.dim) tile.classList.add('dim');
      }
    }
    tile.onclick = () => showCardDetail(id);
    grid.appendChild(tile);
  }
  box.classList.remove('hidden');
}

// ルール画面のキーワード辞典
export function fillGlossary() {
  const dl = $('kw-glossary');
  if (!dl) return;
  const items = Object.values(KEYWORDS).map((k) => [k.name, k.desc]);
  items.push(['遠隔N', 'Nマス先まで攻撃できる。近接ユニットは射程外なので反撃できない。']);
  items.push(['鉄壁N', '攻撃によるダメージをN軽減する (呪文ダメージは軽減しない)。']);
  items.push(['再生N', '自分のターン開始時にHPをN回復する。']);
  items.push(['凍結', '次の自分のターンは行動できず、凍結中は反撃もできない。']);
  items.push(['召喚酔い', '召喚したターンは移動も攻撃もできない (突撃を除く)。']);
  dl.innerHTML = items.map(([n, d]) => `<dt>${n}</dt><dd>${d}</dd>`).join('');
}

// 長押し (タッチ・マウス共通)。発火したら直後のクリックを打ち消す
export function onLongPress(target, fn, ms = 450) {
  let timer = null, sx = 0, sy = 0, fired = false;
  target.addEventListener('pointerdown', (e) => {
    fired = false;
    sx = e.clientX; sy = e.clientY;
    clearTimeout(timer);
    timer = setTimeout(() => { fired = true; fn(e); }, ms);
  });
  const cancel = (e) => {
    if (e && e.type === 'pointermove' && Math.hypot(e.clientX - sx, e.clientY - sy) < 10) return;
    clearTimeout(timer);
  };
  target.addEventListener('pointermove', cancel);
  target.addEventListener('pointerup', cancel);
  target.addEventListener('pointercancel', cancel);
  target.addEventListener('contextmenu', (e) => e.preventDefault());
  target.addEventListener('click', (e) => {
    if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; }
  }, true);
}
