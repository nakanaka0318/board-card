// 勢力の表示をまとめた部品。勢力は src/engine/cards.js の FACTIONS に足すだけで、
// タイトル・デッキ編成・カード・ティア表などすべての表示に自動で反映される。
import { FACTIONS } from '../engine/cards.js';
import { cardArt } from '../render/cardart.js';

export const FACTION_IDS = () => Object.keys(FACTIONS);
export const NEUTRAL_COLOR = '#b8b0a0';

export function factionColor(f) {
  return FACTIONS[f] ? FACTIONS[f].color : NEUTRAL_COLOR;
}

// 要素に勢力の色 (--fc) を付ける
export function paintFaction(elm, f) {
  elm.style.setProperty('--fc', factionColor(f));
  return elm;
}

// 勢力を選ぶ小さなチップの列。random: 「ランダム」を先頭に付ける
export function renderFactionChips(container, { random = false, compact = false } = {}) {
  container.classList.add('f-chips');
  container.classList.toggle('compact', compact);
  let html = random ? '<button class="f-chip random" data-v="random"><span class="fe">🎲</span><b>ランダム</b></button>' : '';
  for (const [id, F] of Object.entries(FACTIONS)) {
    html += `<button class="f-chip" data-v="${id}" style="--fc:${F.color}" title="${F.name}"><span class="fe">${F.emblem}</span><b>${compact ? F.short : F.name}</b></button>`;
  }
  container.innerHTML = html;
}

// 選んだ勢力の紹介 (肖像・説明・英雄の力)
export function factionDetailHtml(f) {
  const F = FACTIONS[f];
  if (!F) return '';
  const art = cardArt('leader_' + f);
  return `<div class="f-detail" style="--fc:${F.color}">
    <div class="fd-art"${art ? ` style="background-image:url(${art})"` : ''}></div>
    <div class="fd-text">
      <div class="fd-name">${F.emblem} ${F.name}</div>
      <div class="fd-desc">${F.desc}</div>
      <div class="fd-hero">英雄の力「${F.hero.name}」(${F.hero.cost}マナ): ${F.hero.text}</div>
    </div>
  </div>`;
}
