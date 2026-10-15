// HTML のカード要素を生成する
import { CARDS, FACTIONS, KEYWORDS, keywordList, typeName } from '../engine/cards.js';
import { cardArt } from '../render/cardart.js';

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function factionName(f) {
  return FACTIONS[f] ? FACTIONS[f].short : '中立';
}

export function renderCard(cardId, opts = {}) {
  const c = CARDS[cardId];
  const card = el('div', `card f-${c.faction} t-${c.type}`);
  card.dataset.cardId = cardId;
  const art = el('div', 'c-art');
  if (c.type === 'unit' || c.type === 'leader') {
    const url = cardArt(cardId);
    if (url) art.style.backgroundImage = `url(${url})`;
  } else {
    art.appendChild(el('span', 'c-icon', c.icon || '✦'));
  }
  card.appendChild(art);
  card.appendChild(el('div', 'c-cost', String(c.cost)));
  card.appendChild(el('div', 'c-name', c.name));
  const sub = `${typeName(c)} · ${factionName(c.faction)}`;
  card.appendChild(el('div', 'c-type', sub));
  const body = el('div', 'c-body');
  const kws = keywordList(c);
  if (kws.length) body.appendChild(el('div', 'c-kw', kws.map((k) => `<b>${k}</b>`).join(' ')));
  if (c.text) body.appendChild(el('div', 'c-text', c.text));
  if (c.type === 'unit' && !kws.length && !c.text) body.appendChild(el('div', 'c-text c-flavor', flavor(c)));
  card.appendChild(body);
  if (c.type === 'unit' || c.type === 'leader') {
    const st = el('div', 'c-stats');
    st.appendChild(el('span', 'c-atk', String(opts.atk ?? c.atk)));
    st.appendChild(el('span', 'c-mv', `<i>移</i>${c.move}`));
    st.appendChild(el('span', 'c-hp', String(opts.hp ?? c.hp)));
    card.appendChild(st);
  } else {
    card.appendChild(el('div', 'c-badge', c.type === 'field' ? '地形' : '呪文'));
  }
  return card;
}

const FLAVORS = {
  n_squire: '「いつか騎士に」と夢見る若者。',
  fi_blade: '刃に宿る炎は決して消えない。',
  n_giant: '丘ひとつ分の重さで殴りかかる。',
  fo_wolf: '森の影を風のように駆ける。',
  az_gunner: '歯車仕掛けの弩は狙いを外さない。',
};
function flavor(c) {
  return FLAVORS[c.id] || '';
}

// カードの詳細説明 (インスペクタ用)
export function keywordHelp(cardId) {
  const c = CARDS[cardId];
  const out = [];
  for (const k of c.keywords || []) if (KEYWORDS[k]) out.push(`<b>${KEYWORDS[k].name}</b>: ${KEYWORDS[k].desc}`);
  if (c.range > 1) out.push(`<b>遠隔${c.range}</b>: ${c.range}マス先まで攻撃できる。近接ユニットからの反撃を受けにくい。`);
  if (c.armor) out.push(`<b>鉄壁${c.armor}</b>: 攻撃によるダメージを${c.armor}軽減する。`);
  if (c.regen) out.push(`<b>再生${c.regen}</b>: 自分のターン開始時にHPを${c.regen}回復。`);
  return out;
}

export function cardBack(faction) {
  const b = el('div', `card-back f-${faction}`);
  b.appendChild(el('div', 'cb-emblem', FACTIONS[faction] ? FACTIONS[faction].emblem : '✦'));
  return b;
}
