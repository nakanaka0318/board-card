// エントリポイント: タイトル画面・設定・対局の起動
import { BoardView } from './render/view.js';
import { HUD } from './ui/hud.js';
import { Sound } from './audio.js';
import { Game } from './game.js';
import { CARDS, FACTIONS } from './engine/cards.js';
import { createGame } from './engine/rules.js';
import { MAP_LIST } from './engine/maps.js';
import { DIFFICULTY } from './engine/ai.js';
import { cardArt } from './render/cardart.js';
import { el } from './ui/cardview.js';

const $ = (id) => document.getElementById(id);

// ---------------- 設定 ----------------
const DEFAULTS = { sound: true, music: true, volume: 0.5, speed: 1, quality: 'high', follow: true, gaze: true };
function loadSettings() {
  try {
    const raw = localStorage.getItem('arcana-settings');
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch { return { ...DEFAULTS }; }
}
function saveSettings() {
  try { localStorage.setItem('arcana-settings', JSON.stringify(settings)); } catch { /* 保存不可でも続行 */ }
}
const settings = loadSettings();
const choice = { mode: 'vsai', faction: 'fire', aiFaction: 'random', diff: 'normal', map: 'classic', first: 'random' };
try { Object.assign(choice, JSON.parse(localStorage.getItem('arcana-choice') || '{}')); } catch { /* noop */ }

const sound = new Sound();
const view = new BoardView($('scene'));
const hud = new HUD();
let game = null;
let titleSpin = true;

// ---------------- タイトル画面 ----------------
function buildTitle() {
  // 勢力
  const fr = $('opt-faction');
  fr.innerHTML = '';
  for (const [id, F] of Object.entries(FACTIONS)) {
    const b = el('button', `faction-card f-${id}`);
    b.dataset.v = id;
    const art = cardArt('leader_' + id);
    b.innerHTML = `<div class="fc-art" style="background-image:url(${art || ''})"></div>
      <div><div class="fc-name">${F.emblem} ${F.name}</div><div class="fc-desc">${F.desc}</div>
      <div class="fc-hero">英雄の力「${F.hero.name}」: ${F.hero.text}</div></div>`;
    fr.appendChild(b);
  }
  const af = $('opt-ai-faction');
  af.innerHTML = '<button data-v="random">ランダム</button>' + Object.entries(FACTIONS).map(([id, F]) => `<button data-v="${id}">${F.short}</button>`).join('');
  const df = $('opt-diff');
  const ddesc = { easy: 'のんびり考える', normal: '数手先を読む', hard: '応手まで深読み' };
  df.innerHTML = Object.entries(DIFFICULTY).map(([id, d]) => `<button data-v="${id}">${d.name}<small>${ddesc[id]}</small></button>`).join('');
  const mp = $('opt-map');
  mp.innerHTML = MAP_LIST.map((m) => `<button data-v="${m.id}" title="${m.desc}">${m.name}</button>`).join('');

  const bind = (rowId, key) => {
    const row = $(rowId);
    const sync = () => row.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.v === String(choice[key])));
    row.querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        sound.resume();
        sound.play('click');
        choice[key] = b.dataset.v;
        sync();
        updateTitleLabels();
        if (key === 'map' || key === 'faction' || key === 'aiFaction') demoBoard();
      };
    });
    sync();
  };
  bind('opt-mode', 'mode');
  bind('opt-faction', 'faction');
  bind('opt-ai-faction', 'aiFaction');
  bind('opt-diff', 'diff');
  bind('opt-map', 'map');
  bind('opt-first', 'first');
  updateTitleLabels();
}

function updateTitleLabels() {
  const watch = choice.mode === 'watch';
  $('lbl-my-faction').textContent = watch ? '青軍の勢力' : 'あなたの勢力';
  $('lbl-ai-faction').textContent = watch ? '赤軍の勢力' : '相手の勢力';
}

function pickAIFaction() {
  if (choice.aiFaction !== 'random') return choice.aiFaction;
  const ids = Object.keys(FACTIONS);
  return ids[Math.floor(Math.random() * ids.length)];
}

// タイトル背景のデモ盤面
function demoBoard() {
  if (game) return;
  const f1 = choice.aiFaction === 'random' ? 'azure' : choice.aiFaction;
  const s = createGame({ factions: [choice.faction, f1], seed: 7, first: 0, map: choice.map === 'random' ? 'classic' : choice.map });
  // 見栄えのため何体か並べる
  const demo = {
    fire: ['fi_dragon', 'fi_golem', 'fi_imp'], forest: ['fo_beast', 'fo_treant', 'fo_wolf'], azure: ['az_leviathan', 'az_guardian', 'az_turret'],
  };
  const put = (p, ids, row) => ids.forEach((id, i) => {
    const x = [1, 3, 5][i];
    const y = row;
    if (s.units.some((u) => u.x === x && u.y === y)) return;
    const c = CARDS[id];
    s.units.push({ uid: 1000 + p * 10 + i, owner: p, cardId: id, atk: c.atk, hp: c.hp, maxHp: c.hp, move: c.move, range: c.range, armor: c.armor, regen: 0, kw: c.keywords, x, y, moved: false, attacked: false, sick: false, frozen: false, leader: false });
  });
  put(0, demo[choice.faction], 2);
  put(1, demo[f1], 4);
  view.setBadges(false);
  view.buildBoard(s);
  view.sync(s);
}

function showTitle() {
  if (game) { game.abort(); game = null; }
  hud.show(false);
  $('gameover').classList.add('hidden');
  $('title-screen').classList.remove('hidden');
  document.body.classList.remove('watch');
  titleSpin = true;
  demoBoard();
}

function startGame() {
  sound.resume();
  sound.play('summon');
  try { localStorage.setItem('arcana-choice', JSON.stringify(choice)); } catch { /* noop */ }
  $('title-screen').classList.add('hidden');
  $('gameover').classList.add('hidden');
  titleSpin = false;
  if (game) game.abort();
  const watch = choice.mode === 'watch';
  game = new Game({
    view, hud, sound, settings,
    opts: {
      factions: [choice.faction, pickAIFaction()],
      diff: choice.diff,
      map: choice.map,
      first: choice.first,
      watch,
    },
    onExit: showTitle,
  });
  hud.show(true);
  view.setBadges(true);
  game.start();
  if (settings.music) sound.startMusic();
}

// ---------------- 入力の配線 ----------------
view.on('hover', (hit, e) => { if (game) game.onHover(hit, e); });
view.on('click', (hit, e) => { sound.resume(); if (game) game.onClick(hit, e); });
view.on('rightclick', () => { if (game) game.onRightClick(); });
view.on('frame', (dt) => {
  if (titleSpin) {
    const c = view.controls;
    const off = view.camera.position.clone().sub(c.target);
    const a = Math.atan2(off.x, off.z) + dt * 0.08;
    const r = Math.hypot(off.x, off.z);
    view.camera.position.x = c.target.x + Math.sin(a) * r;
    view.camera.position.z = c.target.z + Math.cos(a) * r;
  }
});

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const k = e.key.toLowerCase();
  const openModal = [...document.querySelectorAll('.modal')].find((m) => !m.classList.contains('hidden') && m.id !== 'gameover');
  if (openModal) { if (k === 'escape') openModal.classList.add('hidden'); return; }
  if (k === 'q') view.rotateView(-1);
  else if (k === 'e') view.rotateView(1);
  else if (k === 'r') view.resetView();
  else if (k === 't') view.resetView(true);
  else if (game && !$('ui').classList.contains('hidden')) game.onKey(e);
});

$('end-turn').onclick = () => game && game.endTurn();
$('btn-hint').onclick = () => game && game.hint();
$('btn-threat').onclick = () => game && game.toggleThreat();
$('cam-left').onclick = () => view.rotateView(-1);
$('cam-right').onclick = () => view.rotateView(1);
$('cam-reset').onclick = () => view.resetView();
$('cam-top').onclick = () => view.resetView(true);
$('btn-start').onclick = startGame;
$('btn-rules').onclick = () => $('modal-rules').classList.remove('hidden');
$('btn-title-rules').onclick = () => $('modal-rules').classList.remove('hidden');
$('btn-settings').onclick = () => $('modal-settings').classList.remove('hidden');
$('btn-menu').onclick = () => { if (confirm('対局を終了してタイトルへ戻りますか?')) showTitle(); };
$('go-again').onclick = startGame;
$('go-title-btn').onclick = showTitle;
$('go-view').onclick = () => $('gameover').classList.add('hidden');
document.querySelectorAll('.modal').forEach((m) => {
  m.addEventListener('click', (e) => { if (e.target === m && m.id !== 'gameover') m.classList.add('hidden'); });
  const c = m.querySelector('.modal-close');
  if (c) c.onclick = () => m.classList.add('hidden');
});

// 設定 UI
function bindSettings() {
  const s = settings;
  const sync = () => {
    sound.enabled = s.sound;
    sound.musicOn = s.music;
    sound.setVolume(s.volume);
    view.anim.speed = s.speed;
    if (view.quality !== s.quality) view.setQuality(s.quality);
  };
  $('set-sound').checked = s.sound;
  $('set-music').checked = s.music;
  $('set-volume').value = s.volume;
  $('set-speed').value = String(s.speed);
  $('set-quality').value = s.quality;
  $('set-follow').checked = s.follow;
  $('set-gaze').checked = s.gaze;
  $('set-sound').onchange = (e) => { s.sound = e.target.checked; sync(); saveSettings(); };
  $('set-music').onchange = (e) => { s.music = e.target.checked; sync(); saveSettings(); if (s.music) sound.startMusic(); };
  $('set-volume').oninput = (e) => { s.volume = +e.target.value; sync(); saveSettings(); };
  $('set-speed').onchange = (e) => { s.speed = +e.target.value; sync(); saveSettings(); };
  $('set-quality').onchange = (e) => { s.quality = e.target.value; sync(); saveSettings(); };
  $('set-follow').onchange = (e) => { s.follow = e.target.checked; saveSettings(); };
  $('set-gaze').onchange = (e) => { s.gaze = e.target.checked; saveSettings(); };
  sync();
}

// ---------------- 起動 ----------------
async function boot() {
  // カードのイラストを先に用意 (3D 模型を撮影)
  const ids = Object.keys(CARDS).filter((id) => CARDS[id].type === 'unit' || CARDS[id].type === 'leader');
  for (let i = 0; i < ids.length; i++) {
    cardArt(ids[i]);
    if (i % 6 === 5) {
      $('loading').querySelector('.ld-text').textContent = `大地を生成中… ${Math.round((i / ids.length) * 100)}%`;
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  bindSettings();
  buildTitle();
  showTitle();
  $('loading').classList.add('done');
  setTimeout(() => $('loading').remove(), 800);
  // 初回操作で音声を有効化
  window.addEventListener('pointerdown', () => sound.resume(), { once: true });
}

boot().catch((e) => {
  console.error(e);
  $('loading').querySelector('.ld-text').textContent = '起動に失敗しました: ' + e.message;
});

// デバッグ用
window.__arcana = { get game() { return game; }, view, hud, sound };
