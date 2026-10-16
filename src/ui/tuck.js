// 画面のパネルを横へスワイプして画面外にしまう。端に残る「つまみ」をタップすると戻る。
// しまった状態は端末に保存し、次の対局でも引き継ぐ。
const ITEMS = {
  'panel-1': '相手',
  'center-info': '戦況',
  side: 'AI',
  'cam-buttons': '視点',
  'panel-0': '自分',
  'end-turn': '終了',
};
const KEY = 'arcana-tucked';
const TAB_H = 64;

let saved = {};
let onFirstTuck = null;

function load() {
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* 保存できなくても動作は続ける */ }
}

const $ = (id) => document.getElementById(id);

export function initTuck({ onFirst } = {}) {
  onFirstTuck = onFirst;
  load();
  const ui = $('ui');
  for (const [id, label] of Object.entries(ITEMS)) {
    const el = $(id);
    if (!el) continue;
    el.classList.add('tuckable');
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tuck-tab hidden';
    tab.dataset.for = id;
    tab.innerHTML = `<i></i><span>${label}</span>`;
    tab.title = `${label}を表示`;
    tab.addEventListener('click', (e) => { e.stopPropagation(); untuck(id); });
    ui.appendChild(tab);
    bindSwipe(el, id);
  }
  window.addEventListener('resize', () => refreshTuck());
  // 行動バーの表示などでレイアウトが変わったら位置を計算し直す
  new MutationObserver(() => requestAnimationFrame(() => refreshTuck())).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

function bindSwipe(el, id) {
  let start = null;
  let swiped = false;
  const move = (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      swiped = true;
      end();
      tuck(id, dx < 0 ? 'left' : 'right');
    }
  };
  const end = () => {
    start = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
  };
  el.addEventListener('pointerdown', (e) => {
    if (el.classList.contains('tucked') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    swiped = false;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  });
  // スワイプのあとに来るクリックは中のボタンに届けない
  el.addEventListener('click', (e) => {
    if (!swiped) return;
    swiped = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);
}

function tuck(id, dir) {
  const first = !Object.keys(saved).length && !localStorage.getItem(KEY + '-hinted');
  saved[id] = dir;
  save();
  place(id, true);
  if (first && onFirstTuck) {
    try { localStorage.setItem(KEY + '-hinted', '1'); } catch { /* 無視 */ }
    onFirstTuck();
  }
}

export function untuck(id) {
  delete saved[id];
  save();
  const el = $(id);
  el.style.transition = 'translate 0.3s ease';
  el.classList.remove('tucked');
  el.style.translate = '';
  setTimeout(() => { el.style.transition = ''; }, 350);
  layoutTabs();
}

// しまった要素を画面外へ。位置は今のレイアウトから計算する
function place(id, animate) {
  const el = $(id);
  const dir = saved[id];
  if (!el || !dir) return;
  el.style.transition = animate ? 'translate 0.3s ease' : 'none';
  el.style.translate = '';
  const r = el.getBoundingClientRect();
  if (r.width === 0) return;
  const dx = dir === 'left' ? -(r.right + 12) : window.innerWidth - r.left + 12;
  el.dataset.tuckY = r.top + r.height / 2;
  el.classList.add('tucked');
  el.style.translate = `${dx}px 0`;
  if (!animate) { void el.offsetWidth; el.style.transition = ''; }
  else setTimeout(() => { el.style.transition = ''; }, 350);
  layoutTabs();
}

// つまみを左右の端に並べる (重ならないようにずらす)
function layoutTabs() {
  const used = { left: [], right: [] };
  const tabs = [...document.querySelectorAll('.tuck-tab')];
  const order = tabs.map((t) => ({ t, el: $(t.dataset.for) })).filter((x) => x.el)
    .sort((a, b) => (+a.el.dataset.tuckY || 0) - (+b.el.dataset.tuckY || 0));
  for (const { t, el } of order) {
    const dir = saved[t.dataset.for];
    const on = !!dir && el.classList.contains('tucked');
    t.classList.toggle('hidden', !on);
    if (!on) continue;
    let y = Math.max(8, Math.min(window.innerHeight - TAB_H - 8, (+el.dataset.tuckY || 100) - TAB_H / 2));
    for (const u of used[dir]) if (Math.abs(u - y) < TAB_H + 6) y = u + TAB_H + 6;
    used[dir].push(y);
    t.style.top = y + 'px';
    t.classList.toggle('left', dir === 'left');
    t.classList.toggle('right', dir === 'right');
  }
}

// 対局開始時や画面サイズが変わったときに位置を計算し直す
export function refreshTuck() {
  for (const id of Object.keys(ITEMS)) {
    const el = $(id);
    if (!el) continue;
    if (saved[id]) place(id, false);
    else { el.classList.remove('tucked'); el.style.translate = ''; }
  }
  layoutTabs();
}

export function resetTuck() {
  saved = {};
  save();
  refreshTuck();
}
