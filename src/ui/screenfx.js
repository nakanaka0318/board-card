// 画面全体の演出 (閃光・被弾時の赤い縁取り・伝説カードのカットイン)
import { CARDS } from '../engine/cards.js';
import { cardArt } from '../render/cardart.js';

const TEAM = ['#38d0ff', '#ff4d6d'];

function layer() {
  let el = document.getElementById('screen-fx');
  if (!el) {
    el = document.createElement('div');
    el.id = 'screen-fx';
    (document.getElementById('ui') || document.body).appendChild(el);
  }
  return el;
}

function spawn(cls, ms, setup) {
  const d = document.createElement('div');
  d.className = cls;
  if (setup) setup(d);
  d.style.animationDuration = ms + 'ms';
  layer().appendChild(d);
  setTimeout(() => d.remove(), ms + 60);
  return d;
}

// 一瞬の全画面フラッシュ
export function screenFlash(color = '#ffffff', ms = 260, alpha = 0.55) {
  spawn('sfx-flash', ms, (d) => { d.style.background = color; d.style.setProperty('--a', alpha); });
}

// 自分の将が攻撃を受けたときなどの赤い縁取り
export function vignette(color = '#ff2040', ms = 700) {
  spawn('sfx-vignette', ms, (d) => d.style.setProperty('--c', color));
}

// 伝説カードのカットイン。帯が走り、絵と名前が横切る
export function cutIn(cardId, owner, speed = 1, opts = {}) {
  const c = CARDS[cardId];
  if (!c) return Promise.resolve();
  const ms = 1500 / speed;
  const art = cardArt(cardId);
  spawn('sfx-cutin', ms, (d) => {
    d.style.setProperty('--team', TEAM[owner] || '#ffd24a');
    d.innerHTML = `
      <div class="ci-band"></div>
      <div class="ci-band ci-band2"></div>
      <div class="ci-lines"></div>
      <div class="ci-art"${art ? ` style="background-image:url(${art})"` : ''}>${art ? '' : `<span>${c.icon || '✦'}</span>`}</div>
      <div class="ci-text"><div class="ci-tag">${opts.tag || 'LEGEND'}</div><div class="ci-name">${opts.name || c.name}</div>${opts.sub ? `<div class="ci-sub">${opts.sub}</div>` : ''}</div>`;
    for (const x of d.querySelectorAll('*')) x.style.animationDuration = ms + 'ms';
  });
  return new Promise((r) => setTimeout(r, ms * 0.72));
}
