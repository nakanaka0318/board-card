// 「ティア表」画面: 構築済みデッキ同士の AI 総当たり (npm run tier) の結果を表示し、
// その時点の最強勢力を大きく見せる。
import { TIER } from '../data/tier.js';
import { FACTIONS, PRESETS } from '../engine/cards.js';
import { cardArt } from '../render/cardart.js';

const TIERS = ['S', 'A', 'B', 'C', 'D'];
const pct = (r) => `${(r * 100).toFixed(1)}%`;
const $ = (id) => document.getElementById(id);

export function topFaction() {
  return TIER.factions[0] && FACTIONS[TIER.factions[0].id] ? TIER.factions[0] : null;
}

function factionChip(f) {
  const F = FACTIONS[f.id];
  return `<div class="tl-chip" style="--fc:${F.color}">
    <span class="tl-emb">${F.emblem}</span><b>${F.name}</b>
    <span class="tl-bar"><i style="width:${Math.round(f.rate * 100)}%"></i></span>
    <span class="tl-rate">${pct(f.rate)}</span>
  </div>`;
}

function deckChip(d) {
  const F = FACTIONS[d.faction];
  return `<div class="tl-chip deck" style="--fc:${F ? F.color : '#888'}">
    <span class="tl-emb">${F ? F.emblem : ''}</span><b>${d.name}</b><small>${F ? F.short : ''}</small>
    <span class="tl-rate">${pct(d.rate)}</span>
  </div>`;
}

function tierRows(list, chip) {
  return TIERS.map((t) => {
    const items = list.filter((x) => x.tier === t);
    return `<div class="tl-row t-${t}"><div class="tl-label">${t}</div><div class="tl-items">${items.length ? items.map(chip).join('') : '<span class="tl-empty">—</span>'}</div></div>`;
  }).join('');
}

export function openTier() {
  const box = $('tier-body');
  const top = topFaction();
  // 新しい勢力でまだ集計に入っていないものがあれば知らせる
  const missing = Object.keys(FACTIONS).filter((f) => !TIER.factions.some((x) => x.id === f));
  let html = '';
  if (top) {
    const F = FACTIONS[top.id];
    const art = cardArt('leader_' + top.id);
    const best = TIER.decks.find((d) => d.faction === top.id);
    const lead = TIER.factions[1] ? ((top.rate - TIER.factions[1].rate) * 100).toFixed(1) : null;
    html += `<section class="tl-champ" style="--fc:${F.color}">
      <div class="tl-rays"></div>
      <div class="tl-crown">👑</div>
      <div class="tl-portrait"${art ? ` style="background-image:url(${art})"` : ''}><span>${F.emblem}</span></div>
      <div class="tl-champ-text">
        <div class="tl-kicker">現環境 最強勢力</div>
        <div class="tl-name">${F.name}</div>
        <div class="tl-big">${pct(top.rate)}<small>勝率</small></div>
        <div class="tl-sub">${top.wins}勝 ${top.losses}敗${lead ? ` ・ 2位と ${lead} pt 差` : ''}${best ? `<br>最強デッキ「${best.name}」${pct(best.rate)}` : ''}</div>
        <div class="tl-desc">${F.desc}</div>
      </div>
    </section>`;
  }
  html += `<h3 class="tl-h">勢力ティア</h3><div class="tl-table">${tierRows(TIER.factions.filter((f) => FACTIONS[f.id]), factionChip)}</div>`;
  html += `<h3 class="tl-h">デッキティア <small>(構築済みデッキ)</small></h3><div class="tl-table">${tierRows(TIER.decks.filter((d) => FACTIONS[d.faction]), deckChip)}</div>`;
  // 相性表
  const ids = TIER.factions.map((f) => f.id).filter((id) => FACTIONS[id]);
  html += `<h3 class="tl-h">相性 <small>(行の勢力から見た勝率)</small></h3><div class="tl-mu-wrap"><table class="tl-mu"><tr><th></th>${ids.map((id) => `<th>${FACTIONS[id].emblem}<br>${FACTIONS[id].short}</th>`).join('')}</tr>`;
  for (const a of ids) {
    html += `<tr><th>${FACTIONS[a].emblem} ${FACTIONS[a].short}</th>`;
    for (const b of ids) {
      const v = a === b ? null : TIER.matchups[a] && TIER.matchups[a][b];
      if (v == null) { html += '<td class="self">—</td>'; continue; }
      const hue = v >= 0.5 ? `rgba(80, 220, 140, ${Math.min(0.55, (v - 0.5) * 2.2)})` : `rgba(255, 80, 110, ${Math.min(0.55, (0.5 - v) * 2.2)})`;
      html += `<td style="background:${hue}">${Math.round(v * 100)}</td>`;
    }
    html += '</tr>';
  }
  html += '</table></div>';
  if (missing.length) html += `<p class="tl-note">※ ${missing.map((f) => FACTIONS[f].name).join('・')} はまだ集計に入っていません。</p>`;
  html += `<p class="tl-note">AI (熟練) 同士で構築済みデッキ ${Object.values(PRESETS).flat().length} 個を総当たりした結果です (各組み合わせ ${TIER.perPair} 戦・計 ${TIER.games} 戦・平均 ${TIER.avgRounds} ラウンド)。同じ勢力どうしの対戦は勢力の勝率に含めません。人どうしの環境とは異なる目安です。</p>`;
  box.innerHTML = html;
  $('tier-meta').textContent = `v${TIER.version} 時点 ・ ${TIER.date.replace(/-/g, '/')}`;
  $('modal-tier').classList.remove('hidden');
}

// タイトル画面の「現環境最強」バナー
export function renderTierBanner() {
  const el = $('title-tier');
  if (!el) return;
  const top = topFaction();
  if (!top) { el.classList.add('hidden'); return; }
  const F = FACTIONS[top.id];
  el.style.setProperty('--fc', F.color);
  el.innerHTML = `<span class="tt-crown">👑</span><span class="tt-k">現環境 最強</span><b>${F.emblem} ${F.name}</b><span class="tt-r">${pct(top.rate)}</span><span class="tt-more">ティア表 ›</span>`;
  el.classList.remove('hidden');
}
