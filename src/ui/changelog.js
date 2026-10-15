// 「更新履歴」画面
import { CHANGELOG, CURRENT_VERSION } from '../data/changelog.js';

const KEY = 'arcana-seen-version';
const TAG_CLASS = { 新機能: 'new', 改善: 'imp', 調整: 'bal', 修正: 'fix' };

function seenVersion() {
  try { return localStorage.getItem(KEY); } catch { return CURRENT_VERSION; }
}

export function hasUnseen() {
  return seenVersion() !== CURRENT_VERSION;
}

export function openChangelog() {
  const last = seenVersion();
  const box = document.getElementById('changelog-list');
  box.innerHTML = '';
  let reachedSeen = false;
  for (const v of CHANGELOG) {
    if (v.version === last) reachedSeen = true;
    const sec = document.createElement('section');
    sec.className = 'cl-entry' + (!reachedSeen && last ? ' unseen' : '');
    const items = v.items.map((it) => `<li><span class="cl-tag t-${TAG_CLASS[it.tag] || 'imp'}">${it.tag}</span><span>${it.text}</span></li>`).join('');
    sec.innerHTML = `
      <header class="cl-head">
        <span class="cl-ver">v${v.version}</span>
        <h3>${v.title}</h3>
        <time datetime="${v.date}">${v.date.replace(/-/g, '/')}</time>
      </header>
      <ul class="cl-items">${items}</ul>`;
    box.appendChild(sec);
  }
  document.getElementById('changelog-current').textContent = `現在のバージョン v${CURRENT_VERSION}`;
  document.getElementById('modal-changelog').classList.remove('hidden');
  try { localStorage.setItem(KEY, CURRENT_VERSION); } catch { /* 保存できなくても表示はする */ }
  updateBadges();
}

// NEW 印の表示を更新
export function updateBadges() {
  const unseen = hasUnseen();
  for (const el of document.querySelectorAll('.cl-badge-host')) el.classList.toggle('has-new', unseen);
  const v = document.getElementById('title-version');
  if (v) v.textContent = `v${CURRENT_VERSION}`;
}
