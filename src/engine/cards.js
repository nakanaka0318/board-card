// カードデータベース。
// 効果は G (rules.js が提供する操作 API) と ctx を受け取る関数で表現する。
//
// target の種類:
//   summon        ... 召喚可能なマス (ユニットカード)
//   enemyUnit     ... 敵ユニット (リーダー以外)
//   enemyAny      ... 敵ユニットまたは敵リーダー
//   friendlyUnit  ... 味方ユニット (リーダー以外)
//   friendlyAny   ... 味方ユニットまたは味方リーダー
//   tile          ... 任意のマス
//   row           ... 任意のマス (そのマスの行) + 方向
//   block         ... 端以外のマス (3x3 の中心) + 方向
//   null          ... 対象なし

export const KEYWORDS = {
  haste: { name: '突撃', desc: '召喚したターンから行動できる。' },
  flying: { name: '飛行', desc: '地形・高低差・ユニットを無視して移動する。溶岩と水の影響を受けない。' },
  guard: { name: '守護', desc: '隣接するマスに入った敵ユニットはそこで移動を終える (飛行は無視)。' },
  lavaWalk: { name: '耐火', desc: '溶岩のダメージを受けない。' },
  pierce: { name: '貫通', desc: '近接攻撃時、対象の後ろにいる敵にも同じダメージを与える。' },
  splash: { name: '爆炎', desc: '攻撃時、対象に隣接する敵すべてに1ダメージを与える。' },
  forestKin: { name: '森の民', desc: '森にいる間、攻撃力+1。' },
};

export const TERRAIN = {
  plain: { name: '平原', cost: 1, desc: '特別な効果はない。' },
  forest: { name: '森', cost: 2, desc: '移動コスト2。ここにいるユニットは遠隔攻撃 (距離2以上) から受けるダメージ-1。' },
  water: { name: '水辺', cost: 2, desc: '移動コスト2。ここにいる地上ユニットは攻撃力-1。' },
  lava: { name: '溶岩', cost: 1, desc: '自分のターン終了時、ここにいる地上ユニットは2ダメージを受ける。' },
  crystal: { name: 'マナ結晶', cost: 1, desc: 'ターン開始時、ここに自分のユニットがいればマナ+1。' },
  shrine: { name: '聖域', cost: 1, desc: 'ターン開始時、ここにいる自分のユニットのHPを2回復。' },
};

// 環境: 「環境」を持つユニットが場にいる間、盤の外の空模様が変わり、全体のルールが変わる。
// 複数いる場合は最後に召喚されたものが有効。
export const ENVIRONMENTS = {
  scorch: { name: '焦天', icon: '☀️', text: '全ユニット (将を含む) の攻撃力+1。' },
  rain: { name: '恵みの霧雨', icon: '🌧', text: 'ターン開始時、手番のプレイヤーのユニット (将を除く) すべてのHPを1回復。' },
  zerog: { name: '無重力の星海', icon: '🌌', text: '全ユニットの移動力+1 (移動力0を除く)。段差2以上の崖も登れる。' },
  lab: { name: '研究室', icon: '🧪', text: '「没入の実験体」すべて+2/+2。' },
};

export const FACTIONS = {
  fire: {
    name: '紅蓮帝国',
    short: '紅蓮',
    color: '#ff6a3d',
    desc: '溶岩と炎で押し切る速攻の軍勢。突撃ユニットと火力呪文で一気に攻め立てる。',
    emblem: '🔥',
    palette: { main: '#a8322a', accent: '#ffb347', dark: '#4a2420', skin: '#e8b48a' },
    hero: {
      name: '火花',
      cost: 2,
      target: 'heroEnemy3',
      text: '自リーダーから3マス以内の敵1体に1ダメージ。',
      fx: 'spark',
      effect(G, c) { G.damage(c.target, 1, 'spell'); },
    },
  },
  forest: {
    name: '翠緑の森',
    short: '翠緑',
    color: '#5fd068',
    desc: '大地を隆起させ森を広げる守りの民。回復と強化で盤面を支配する。',
    emblem: '🌿',
    palette: { main: '#3f7d3a', accent: '#e3d27a', dark: '#2b3a1e', skin: '#d9b48a' },
    hero: {
      name: '芽吹き',
      cost: 2,
      target: 'friendlyUnit',
      text: '味方ユニット1体 (将を除く) のHPを2回復。',
      fx: 'heal',
      effect(G, c) { G.heal(c.target, 2); },
    },
  },
  azure: {
    name: '蒼穹機関',
    short: '蒼穹',
    color: '#4fb6ff',
    desc: '大地そのものを動かす機械仕掛けの術士団。行と陣を回転させ戦場を組み替える。',
    emblem: '⚙️',
    palette: { main: '#3a6db3', accent: '#9ff0ff', dark: '#1d2a44', skin: '#c9d3e0' },
    hero: {
      name: '衝撃波',
      cost: 2,
      target: 'heroPush3',
      text: '自リーダーから3マス以内の敵ユニット1体を1マス押し出す。押し出せなければ1ダメージ。',
      fx: 'wave',
      effect(G, c) {
        const L = G.leaderOf(c.player);
        G.push(c.target, L.x, L.y);
      },
    },
  },
  lab: {
    name: '雷研究室',
    short: '雷研',
    color: '#a98bff',
    desc: '雷と人体実験の研究所。「没入の実験体」を次々と送り出し、数で押し潰す。',
    emblem: '⚡',
    palette: { main: '#3a2f6a', accent: '#ffe14a', dark: '#1e1a33', skin: '#d8c0a8' },
    hero: {
      name: '被験体投入',
      cost: 2,
      target: 'summon',
      text: '「没入の実験体」を1体出す (自陣か将の周囲の空きマス)。',
      fx: 'mana',
      effect(G, c) { G.spawn(c.player, 'lb_subject', c.x, c.y); },
    },
  },
};

const C = {};
function def(id, o) {
  C[id] = { id, keywords: [], range: 1, move: 2, armor: 0, regen: 0, ...o };
}

// ---------------- リーダー ----------------
for (const f of Object.keys(FACTIONS)) {
  def('leader_' + f, {
    name: FACTIONS[f].name + 'の将',
    faction: f, type: 'leader', cost: 0,
    atk: 2, hp: 16, move: 1, model: 'leader',
    text: 'リーダー。HPが0になると敗北する。',
  });
}

// ---------------- 中立 ----------------
def('n_squire', { name: '見習い剣士', faction: 'neutral', type: 'unit', cost: 1, atk: 2, hp: 2, move: 2, model: 'soldier', text: '' });
def('n_archer', { name: '弓兵', faction: 'neutral', type: 'unit', cost: 2, atk: 2, hp: 1, move: 2, range: 3, model: 'archer', text: '' });
def('n_spear', { name: '槍兵', faction: 'neutral', type: 'unit', cost: 2, atk: 2, hp: 3, move: 2, keywords: ['guard'], model: 'spear', text: '' });
def('n_cavalry', { name: '騎兵', faction: 'neutral', type: 'unit', cost: 3, atk: 3, hp: 3, move: 4, keywords: ['haste'], model: 'cavalry', text: '' });
def('n_shield', { name: '盾の騎士', faction: 'neutral', type: 'unit', cost: 3, atk: 1, hp: 6, move: 1, armor: 1, keywords: ['guard'], model: 'knight', text: '' });
def('n_mage', {
  name: '宮廷魔導士', faction: 'neutral', type: 'unit', cost: 4, atk: 3, hp: 3, move: 2, range: 2, model: 'mage',
  text: '召喚時: ランダムな敵ユニット1体に2ダメージ。',
  onSummon(G, c) {
    const t = G.pickRandom(G.enemyUnits(c.player));
    if (t) { G.fx('bolt', c.self, t); G.damage(t, 2, 'spell'); }
  },
});
def('n_giant', { name: '丘の巨人', faction: 'neutral', type: 'unit', cost: 5, atk: 6, hp: 7, move: 2, model: 'giant', text: '' });
def('s_lightning', {
  name: '稲妻', faction: 'neutral', type: 'spell', cost: 2, target: 'enemyUnit', icon: '⚡', fx: 'lightning',
  text: '敵ユニット1体に3ダメージ。',
  effect(G, c) { G.damage(c.target, 3, 'spell'); },
});
def('s_heal', {
  name: '癒しの光', faction: 'neutral', type: 'spell', cost: 1, target: 'friendlyAny', icon: '✨', fx: 'heal',
  text: '味方1体のHPを4回復。',
  effect(G, c) { G.heal(c.target, 4); },
});
def('s_supply', {
  name: '補給', faction: 'neutral', type: 'spell', cost: 2, target: null, icon: '📜', fx: 'draw',
  text: 'カードを2枚引く。',
  effect(G, c) { G.draw(c.player, 2); },
});
def('f_uplift', {
  name: '隆起', faction: 'neutral', type: 'field', cost: 1, target: 'tile', icon: '⛰️', fx: 'raise',
  text: 'マス1つの高さ+1 (最大3)。高所からの攻撃はダメージ+1。',
  effect(G, c) { G.changeHeight(c.x, c.y, 1); },
});
def('f_sink', {
  name: '陥没', faction: 'neutral', type: 'field', cost: 1, target: 'tile', icon: '🕳️', fx: 'lower',
  text: 'マス1つの高さ-1 (最小0)。',
  effect(G, c) { G.changeHeight(c.x, c.y, -1); },
});
def('coin', {
  name: 'マナの欠片', faction: 'neutral', type: 'spell', cost: 0, target: null, icon: '💠', fx: 'mana', token: true,
  text: 'このターン、マナ+1。',
  effect(G, c) { G.addMana(c.player, 1); },
});

// ---------------- 紅蓮帝国 ----------------
def('fi_imp', { name: '火の精', faction: 'fire', type: 'unit', cost: 1, atk: 2, hp: 1, move: 3, keywords: ['haste', 'lavaWalk'], model: 'imp', text: '' });
def('fi_blade', { name: '炎の剣士', faction: 'fire', type: 'unit', cost: 2, atk: 3, hp: 3, move: 2, model: 'soldier', text: '' });
def('fi_pyro', { name: '火炎術師', faction: 'fire', type: 'unit', cost: 3, atk: 3, hp: 3, move: 2, range: 2, keywords: ['splash'], model: 'mage', text: '' });
def('fi_berserker', { name: '狂戦士', faction: 'fire', type: 'unit', cost: 3, atk: 4, hp: 3, move: 3, keywords: ['haste'], model: 'berserker', text: '' });
def('fi_golem', {
  name: '溶岩ゴーレム', faction: 'fire', type: 'unit', cost: 4, atk: 3, hp: 6, move: 1, keywords: ['lavaWalk'], model: 'golem',
  text: '召喚時: 自身のいるマスを溶岩にする。',
  onSummon(G, c) { G.setTerrain(c.self.x, c.self.y, 'lava'); },
});
def('fi_salamander', { name: 'サラマンダー', faction: 'fire', type: 'unit', cost: 5, atk: 5, hp: 4, move: 3, keywords: ['lavaWalk', 'pierce'], model: 'lizard', text: '' });
def('fi_dragon', {
  name: '紅竜', faction: 'fire', type: 'unit', cost: 6, atk: 6, hp: 5, move: 4, keywords: ['flying'], model: 'dragon',
  text: '召喚時: 2マス以内の敵すべてに2ダメージ。',
  onSummon(G, c) {
    G.fx('nova', c.self, null, { radius: 2, color: '#ff6a3d' });
    for (const u of G.enemiesWithin(c.player, c.self.x, c.self.y, 2)) G.damage(u, 2, 'spell');
  },
});
def('s_fireball', {
  name: '火球', faction: 'fire', type: 'spell', cost: 3, target: 'enemyAny', icon: '☄️', fx: 'fireball',
  text: '敵1体 (リーダー含む) に3ダメージ。隣接する敵に1ダメージ。',
  effect(G, c) {
    const { x, y } = c.target;
    G.damage(c.target, 3, 'spell');
    for (const u of G.enemiesWithin(c.player, x, y, 1)) if (u !== c.target) G.damage(u, 1, 'spell');
  },
});
def('f_eruption', {
  name: '噴火', faction: 'fire', type: 'field', cost: 2, target: 'tile', icon: '🌋', fx: 'eruption',
  text: 'マス1つを溶岩に変え、高さ+1。そこにいる敵に2ダメージ。',
  effect(G, c) {
    G.setTerrain(c.x, c.y, 'lava');
    G.changeHeight(c.x, c.y, 1);
    const u = G.unitAt(c.x, c.y);
    if (u && u.owner !== c.player) G.damage(u, 2, 'spell');
  },
});
def('s_warcry', {
  name: '戦の雄叫び', faction: 'fire', type: 'spell', cost: 2, target: null, icon: '📯', fx: 'warcry',
  text: '味方ユニットすべての攻撃力+1。',
  effect(G, c) { for (const u of G.friendlyUnits(c.player)) G.buff(u, 1, 0); },
});

// ---------------- 翠緑の森 ----------------
def('fo_sprout', {
  name: '森の小人', faction: 'forest', type: 'unit', cost: 1, atk: 1, hp: 3, move: 2, model: 'gnome',
  text: '召喚時: 自身のいるマスを森にする。',
  onSummon(G, c) { G.setTerrain(c.self.x, c.self.y, 'forest'); },
});
def('fo_wolf', { name: '森狼', faction: 'forest', type: 'unit', cost: 2, atk: 3, hp: 3, move: 4, model: 'wolf', text: '' });
def('fo_druid', {
  name: 'ドルイド', faction: 'forest', type: 'unit', cost: 3, atk: 2, hp: 4, move: 2, range: 2, model: 'druid',
  text: '自分のターン開始時: 隣接する味方のHPを1回復。',
  onTurnStart(G, c) {
    for (const u of G.friendsWithin(c.self.owner, c.self.x, c.self.y, 1)) if (u !== c.self) G.heal(u, 1);
  },
});
def('fo_archer', { name: 'エルフの射手', faction: 'forest', type: 'unit', cost: 3, atk: 2, hp: 3, move: 2, range: 3, keywords: ['forestKin'], model: 'elf', text: '' });
def('fo_priestess', {
  name: '大地の巫女', faction: 'forest', type: 'unit', cost: 4, atk: 3, hp: 4, move: 2, model: 'priestess',
  text: '召喚時: 自身のマスの高さ+1。自リーダーのHPを3回復。',
  onSummon(G, c) {
    G.changeHeight(c.self.x, c.self.y, 1);
    G.heal(G.leaderOf(c.player), 3);
  },
});
def('fo_treant', { name: 'トレント', faction: 'forest', type: 'unit', cost: 5, atk: 4, hp: 6, move: 1, regen: 2, keywords: ['guard'], model: 'treant', text: '' });
def('fo_beast', {
  name: '世界樹の守護獣', faction: 'forest', type: 'unit', cost: 7, atk: 6, hp: 7, move: 2, model: 'stag',
  text: '召喚時: 他の味方ユニットすべてに+1/+1。',
  onSummon(G, c) {
    G.fx('nova', c.self, null, { radius: 3, color: '#7dff8a' });
    for (const u of G.friendlyUnits(c.player)) if (u !== c.self) G.buff(u, 1, 1);
  },
});
def('s_growth', {
  name: '成長', faction: 'forest', type: 'spell', cost: 2, target: 'friendlyUnit', icon: '🌱', fx: 'buff',
  text: '味方ユニット1体に+2/+2。',
  effect(G, c) { G.buff(c.target, 2, 2); },
});
def('f_thorns', {
  name: '茨の森', faction: 'forest', type: 'field', cost: 2, target: 'tile', icon: '🌲', fx: 'thorns',
  text: '対象マスと上下左右を森に変える。そこにいる敵に1ダメージ。',
  effect(G, c) {
    for (const [x, y] of G.cross(c.x, c.y)) {
      G.setTerrain(x, y, 'forest');
      const u = G.unitAt(x, y);
      if (u && u.owner !== c.player) G.damage(u, 1, 'spell');
    }
  },
});
def('f_quake', {
  name: '地殻隆起', faction: 'forest', type: 'field', cost: 3, target: 'tile', icon: '🏔️', fx: 'quake',
  text: '対象マスを中心とする3x3の高さ+1。',
  effect(G, c) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) G.changeHeight(c.x + dx, c.y + dy, 1);
  },
});

// ---------------- 蒼穹機関 ----------------
def('az_cog', { name: '歯車兵', faction: 'azure', type: 'unit', cost: 1, atk: 1, hp: 3, move: 2, armor: 1, model: 'cog', text: '' });
def('az_gunner', { name: '機械弓兵', faction: 'azure', type: 'unit', cost: 2, atk: 2, hp: 2, move: 1, range: 3, armor: 1, model: 'gunner', text: '' });
def('az_tide', {
  name: '潮の術士', faction: 'azure', type: 'unit', cost: 3, atk: 2, hp: 4, move: 2, range: 2, model: 'tidemage',
  text: '召喚時: 隣接する敵ユニットをすべて1マス押し出す。',
  onSummon(G, c) {
    G.fx('wave', c.self, null, {});
    for (const u of G.enemiesWithin(c.player, c.self.x, c.self.y, 1)) if (!u.leader) G.push(u, c.self.x, c.self.y);
  },
});
def('az_guardian', { name: '鋼鉄の守護者', faction: 'azure', type: 'unit', cost: 4, atk: 3, hp: 6, move: 1, armor: 2, keywords: ['guard'], model: 'mech', text: '' });
def('az_turret', { name: '浮遊砲台', faction: 'azure', type: 'unit', cost: 5, atk: 4, hp: 4, move: 2, range: 3, keywords: ['flying'], model: 'turret', text: '' });
def('az_leviathan', {
  name: '嵐の巨鯨', faction: 'azure', type: 'unit', cost: 6, atk: 5, hp: 7, move: 3, keywords: ['flying'], model: 'whale',
  text: '召喚時: 2マス以内の敵ユニットすべてに1ダメージを与え、凍結させる。',
  onSummon(G, c) {
    G.fx('storm', c.self, null, { radius: 2 });
    for (const u of G.enemiesWithin(c.player, c.self.x, c.self.y, 2)) {
      if (u.leader) continue;
      G.damage(u, 1, 'spell');
      if (u.hp > 0) G.freeze(u);
    }
  },
});
def('s_freeze', {
  name: '凍結の光線', faction: 'azure', type: 'spell', cost: 2, target: 'enemyUnit', icon: '❄️', fx: 'freeze',
  text: '敵ユニット1体に2ダメージを与え、凍結させる (次のターン行動不可・反撃不可)。',
  effect(G, c) { G.damage(c.target, 2, 'spell'); if (c.target.hp > 0) G.freeze(c.target); },
});
def('f_slide', {
  name: '地脈滑動', faction: 'azure', type: 'field', cost: 2, target: 'row', dir: true, icon: '↔️', fx: 'slide',
  text: '行1つを左右どちらかに1マスずらす。端のマスは反対側へ回り込む。上のユニットも一緒に動く。',
  effect(G, c) { G.shiftRow(c.y, c.dir); },
});
def('f_rotate', {
  name: '旋回陣', faction: 'azure', type: 'field', cost: 2, target: 'block', dir: true, icon: '🌀', fx: 'rotate',
  text: '3x3の区画を90度回転させる。上のユニットも一緒に回る。',
  effect(G, c) { G.rotateBlock(c.x, c.y, c.dir); },
});
def('f_flood', {
  name: '潮流', faction: 'azure', type: 'field', cost: 1, target: 'tile', icon: '🌊', fx: 'flood',
  text: 'マス1つを水辺に変え、高さ-1。',
  effect(G, c) { G.setTerrain(c.x, c.y, 'water'); G.changeHeight(c.x, c.y, -1); },
});


// ================================================================
// 拡張カード
// ================================================================

// ---------------- 中立 ----------------
def('n_scout', {
  name: '斥候', faction: 'neutral', type: 'unit', cost: 2, atk: 1, hp: 2, move: 3, model: 'archer',
  text: '召喚時: カードを1枚引く。',
  onSummon(G, c) { G.draw(c.player, 1); },
});
def('n_healer', {
  name: '従軍神官', faction: 'neutral', type: 'unit', cost: 2, atk: 1, hp: 3, move: 2, range: 2, model: 'priestess',
  text: '自分のターン開始時: 自分の将のHPを1回復。',
  onTurnStart(G, c) { G.heal(G.leaderOf(c.self.owner), 1); },
});
def('n_wall', { name: '石の防壁', faction: 'neutral', type: 'unit', cost: 2, atk: 0, hp: 6, move: 0, armor: 1, keywords: ['guard'], model: 'wall', text: '攻撃も移動もできない壁。' });
def('n_assassin', { name: '影の暗殺者', faction: 'neutral', type: 'unit', cost: 2, atk: 3, hp: 1, move: 3, keywords: ['haste'], model: 'rogue', text: '' });
def('n_ogre', { name: 'オーガ', faction: 'neutral', type: 'unit', cost: 4, atk: 6, hp: 4, move: 2, model: 'giant', text: '' });
def('s_rally', {
  name: '鼓舞', faction: 'neutral', type: 'spell', cost: 1, target: 'friendlyUnit', icon: '🎺', fx: 'buff',
  text: '味方ユニット1体に+1/+1。',
  effect(G, c) { G.buff(c.target, 1, 1); },
});
def('s_recall', {
  name: '撤退命令', faction: 'neutral', type: 'spell', cost: 1, target: 'friendlyUnit', icon: '🏳️', fx: 'mana',
  text: '味方ユニット1体を手札に戻す (もう一度召喚できる)。',
  effect(G, c) { G.returnToHand(c.target); },
});
def('s_smite', {
  name: '天罰', faction: 'neutral', type: 'spell', cost: 4, target: 'enemyUnit', icon: '🔆', fx: 'lightning',
  text: '敵ユニット1体に5ダメージ。',
  effect(G, c) { G.damage(c.target, 5, 'spell'); },
});
def('f_level', {
  name: '整地', faction: 'neutral', type: 'field', cost: 1, target: 'tile', icon: '🧱', fx: 'lower',
  text: 'マス1つを平原・高さ0に戻す。',
  effect(G, c) { G.setTerrain(c.x, c.y, 'plain'); G.changeHeight(c.x, c.y, -3); },
});

// ---------------- 紅蓮帝国 ----------------
def('fi_bomber', {
  name: '爆弾魔', faction: 'fire', type: 'unit', cost: 2, atk: 1, hp: 1, move: 2, model: 'bomber',
  text: '遺言: 隣接する敵すべてに2ダメージ。',
  onDeath(G, c) {
    G.fx('nova', c.self, null, { radius: 1, color: '#ff6a1a' });
    for (const u of G.enemiesWithin(c.player, c.self.x, c.self.y, 1)) G.damage(u, 2, 'spell');
  },
});
def('fi_cannon', { name: '火砲兵', faction: 'fire', type: 'unit', cost: 4, atk: 3, hp: 3, move: 1, range: 3, keywords: ['splash'], model: 'gunner', text: '' });
def('fi_guard', {
  name: '親衛隊長', faction: 'fire', type: 'unit', cost: 5, atk: 3, hp: 4, move: 2, model: 'knight',
  text: '召喚時: 他の味方ユニットすべての攻撃力+1。',
  onSummon(G, c) { for (const u of G.friendlyUnits(c.player)) if (u !== c.self) G.buff(u, 1, 0); },
});
def('fi_phoenix', {
  name: '不死鳥', faction: 'fire', type: 'unit', cost: 6, atk: 4, hp: 3, move: 4, keywords: ['flying', 'lavaWalk'], model: 'phoenix', legend: true,
  text: '遺言: このカードを手札に戻す。',
  onDeath(G, c) { G.addCard(c.player, 'fi_phoenix'); },
});
def('s_ignite', {
  name: '点火', faction: 'fire', type: 'spell', cost: 1, target: 'enemyUnit', icon: '🔥', fx: 'spark',
  text: '敵ユニット1体に1ダメージ。溶岩の上にいれば3ダメージ。',
  effect(G, c) { const lava = G.s.tiles[c.y * 7 + c.x].terrain === 'lava'; G.damage(c.target, lava ? 3 : 1, 'spell'); },
});
def('s_frenzy', {
  name: '狂乱', faction: 'fire', type: 'spell', cost: 3, target: 'friendlyUnit', icon: '😡', fx: 'warcry',
  text: '味方ユニット1体の攻撃力+1。行動済みなら、もう一度行動できる。',
  effect(G, c) { G.buff(c.target, 1, 0); G.refresh(c.target); },
});
def('f_firewall', {
  name: '炎の壁', faction: 'fire', type: 'field', cost: 4, target: 'tile', icon: '🧯', fx: 'eruption',
  text: '対象マスと左右のマスを溶岩にする。そこにいる敵に1ダメージ。',
  effect(G, c) {
    for (const dx of [-1, 0, 1]) {
      const x = c.x + dx;
      if (x < 0 || x > 6) continue;
      G.setTerrain(x, c.y, 'lava');
      const u = G.unitAt(x, c.y);
      if (u && u.owner !== c.player) G.damage(u, 1, 'spell');
    }
  },
});
def('s_meteor', {
  name: '隕石落とし', faction: 'fire', type: 'spell', cost: 6, target: 'tile', icon: '☄️', fx: 'eruption', legend: true,
  text: '対象を中心とする3x3の敵すべてに3ダメージ。中心のマスを溶岩にする。',
  effect(G, c) {
    G.fx('nova', { x: c.x, y: c.y }, null, { radius: 1.5, color: '#ff4a1a' });
    for (const u of G.enemiesWithin(c.player, c.x, c.y, 2)) if (Math.abs(u.x - c.x) <= 1 && Math.abs(u.y - c.y) <= 1) G.damage(u, 3, 'spell');
    G.setTerrain(c.x, c.y, 'lava');
  },
});

// ---------------- 翠緑の森 ----------------
def('fo_seedling', {
  name: '若木', faction: 'forest', type: 'unit', cost: 1, atk: 0, hp: 2, move: 0, model: 'sapling',
  text: '動けない。自分のターン開始時: +1/+1 (成長する)。',
  onTurnStart(G, c) { G.buff(c.self, 1, 1); },
});
def('fo_dryad', {
  name: 'ドライアド', faction: 'forest', type: 'unit', cost: 2, atk: 2, hp: 3, move: 2, keywords: ['forestKin'], model: 'elf',
  text: '召喚時: 森の上なら+1/+1。',
  onSummon(G, c) { if (G.s.tiles[c.self.y * 7 + c.self.x].terrain === 'forest') G.buff(c.self, 1, 1); },
});
def('fo_wisp', { name: '森の精霊', faction: 'forest', type: 'unit', cost: 2, atk: 2, hp: 3, move: 3, regen: 1, keywords: ['flying'], model: 'wisp', text: '' });
def('fo_bear', { name: '大熊', faction: 'forest', type: 'unit', cost: 4, atk: 5, hp: 6, move: 2, model: 'bear', text: '' });
def('fo_elder', {
  name: '長老樹', faction: 'forest', type: 'unit', cost: 6, atk: 4, hp: 8, move: 1, regen: 2, keywords: ['guard'], model: 'elder', legend: true,
  text: '召喚時: 周囲のマスを森にする。',
  onSummon(G, c) { for (const [x, y] of G.cross(c.self.x, c.self.y)) G.setTerrain(x, y, 'forest'); },
});
def('s_entangle', {
  name: '絡みつく蔓', faction: 'forest', type: 'spell', cost: 1, target: 'enemyUnit', icon: '🌿', fx: 'thorns',
  text: '敵ユニット1体を凍結させ、そのマスを森にする。',
  effect(G, c) { G.freeze(c.target); G.setTerrain(c.x, c.y, 'forest'); },
});
def('s_bloom', {
  name: '開花', faction: 'forest', type: 'spell', cost: 2, target: null, icon: '🌸', fx: 'heal',
  text: '味方すべて (将を含む) のHPを3回復。',
  effect(G, c) { for (const u of G.friendlyAll(c.player)) G.heal(u, 3); },
});
def('f_pillar', {
  name: '大地の柱', faction: 'forest', type: 'field', cost: 2, target: 'tile', icon: '🗿', fx: 'raise',
  text: 'マス1つの高さ+2 (最大3)。',
  effect(G, c) { G.changeHeight(c.x, c.y, 2); },
});

// ---------------- 蒼穹機関 ----------------
def('az_drone', { name: '偵察ドローン', faction: 'azure', type: 'unit', cost: 1, atk: 1, hp: 1, move: 4, keywords: ['flying'], model: 'drone', text: '' });
def('az_engineer', {
  name: '技師', faction: 'azure', type: 'unit', cost: 2, atk: 1, hp: 3, move: 2, model: 'cog',
  text: '召喚時: 自身のマスの高さ+1。',
  onSummon(G, c) { G.changeHeight(c.self.x, c.self.y, 1); },
});
def('az_magnet', {
  name: '磁力術士', faction: 'azure', type: 'unit', cost: 3, atk: 2, hp: 3, move: 2, range: 2, model: 'tidemage',
  text: '召喚時: 3マス以内で最も近い敵ユニットを1マス引き寄せる。',
  onSummon(G, c) {
    const es = G.enemyUnits(c.player).filter((u) => Math.abs(u.x - c.self.x) + Math.abs(u.y - c.self.y) <= 3)
      .sort((a, b) => (Math.abs(a.x - c.self.x) + Math.abs(a.y - c.self.y)) - (Math.abs(b.x - c.self.x) + Math.abs(b.y - c.self.y)));
    if (es[0]) { G.fx('wave', c.self, null, {}); G.pull(es[0], c.self.x, c.self.y); }
  },
});
def('az_sniper', { name: '狙撃機兵', faction: 'azure', type: 'unit', cost: 4, atk: 3, hp: 3, move: 1, range: 4, model: 'gunner', text: '' });
def('az_titan', { name: '機甲巨神', faction: 'azure', type: 'unit', cost: 6, atk: 5, hp: 7, move: 1, armor: 2, keywords: ['guard'], model: 'titan', legend: true, text: '' });
def('s_overclock', {
  name: '過負荷駆動', faction: 'azure', type: 'spell', cost: 2, target: 'friendlyUnit', icon: '⚡', fx: 'buff',
  text: '味方ユニット1体の攻撃力+1、移動力+1。',
  effect(G, c) { G.buff(c.target, 1, 0); G.addMove(c.target, 1); },
});
def('f_maelstrom', {
  name: '大渦', faction: 'azure', type: 'field', cost: 4, target: 'block', icon: '🌀', fx: 'rotate', legend: true,
  text: '3x3の区画を180度回転させる。区画内の敵ユニットに1ダメージ。',
  effect(G, c) {
    G.rotateBlock(c.x, c.y, 1);
    G.rotateBlock(c.x, c.y, 1);
    for (const u of G.enemyUnits(c.player)) if (Math.abs(u.x - c.x) <= 1 && Math.abs(u.y - c.y) <= 1) G.damage(u, 1, 'spell');
  },
});
def('f_tsunami', {
  name: '大津波', faction: 'azure', type: 'field', cost: 3, target: 'row', icon: '🌊', fx: 'flood',
  text: '行1つのマスをすべて水辺に変える。その行の敵に1ダメージ。',
  effect(G, c) {
    for (let x = 0; x < 7; x++) {
      G.setTerrain(x, c.y, 'water');
      const u = G.unitAt(x, c.y);
      if (u && u.owner !== c.player) G.damage(u, 1, 'spell');
    }
  },
});

// 強力なカード (デッキに1枚まで)
for (const id of ['fi_dragon', 'fo_beast', 'az_leviathan']) C[id].legend = true;

// ---------------- 伝説: 奥義 (盤面全体を変える) と 環境 (空とルールを変える) ----------------
// 奥義: 1体につき1回だけ。攻撃の代わりに使う (指揮力1)。召喚したターンは使えない。
def('fi_inferno', {
  name: '煉獄竜王ヴァルガ', faction: 'fire', type: 'unit', cost: 7, atk: 5, hp: 6, move: 2, keywords: ['flying'], model: 'inferno', legend: true,
  text: '奥義「煉獄変」: 盤面のすべての森と水辺を溶岩に変え、敵ユニットすべてに1ダメージ。',
  skill: {
    name: '煉獄変', fx: 'inferno',
    effect(G, c) {
      G.fieldWide('inferno', c.self, () => {
        G.s.tiles.forEach((t, i) => { if (t.terrain === 'forest' || t.terrain === 'water') G.setTerrain(i % 7, (i / 7) | 0, 'lava'); });
      });
      for (const u of G.enemyUnits(c.player)) G.damage(u, 1, 'spell');
    },
  },
});
def('fi_sunpriest', {
  name: '灼天の巫女', faction: 'fire', type: 'unit', cost: 5, atk: 3, hp: 4, move: 2, range: 2, model: 'sunpriest', legend: true, env: 'scorch',
  text: '環境「焦天」: 場にいる間、全ユニット (将を含む) の攻撃力+1。',
});
def('fo_worldtree', {
  name: '世界樹の化身', faction: 'forest', type: 'unit', cost: 7, atk: 4, hp: 9, move: 1, keywords: ['guard'], model: 'worldtree', legend: true,
  text: '奥義「大樹海」: 盤面のすべての平原と溶岩を森に変え、味方すべて (将を含む) のHPを3回復。',
  skill: {
    name: '大樹海', fx: 'forest',
    effect(G, c) {
      G.fieldWide('forest', c.self, () => {
        G.s.tiles.forEach((t, i) => { if (t.terrain === 'plain' || t.terrain === 'lava') G.setTerrain(i % 7, (i / 7) | 0, 'forest'); });
      });
      for (const u of G.friendlyAll(c.player)) G.heal(u, 3);
    },
  },
});
def('fo_rainlord', {
  name: '霧雨の精霊王', faction: 'forest', type: 'unit', cost: 5, atk: 2, hp: 6, move: 2, keywords: ['flying'], model: 'rainlord', legend: true, env: 'rain',
  text: '環境「恵みの霧雨」: 場にいる間、ターン開始時に手番のプレイヤーのユニット (将を除く) すべてのHPを1回復。',
});
def('az_astra', {
  name: '天穹機神アストラ', faction: 'azure', type: 'unit', cost: 7, atk: 5, hp: 7, move: 2, armor: 1, model: 'astra', legend: true,
  text: '奥義「天地反転」: 盤面のすべてのマスの高さを反転し (0↔3、1↔2)、敵ユニット (将を除く) をすべて凍結させる。',
  skill: {
    name: '天地反転', fx: 'invert',
    effect(G, c) {
      G.fieldWide('invert', c.self, () => {
        G.s.tiles.forEach((t, i) => G.changeHeight(i % 7, (i / 7) | 0, 3 - 2 * t.height));
      });
      for (const u of G.enemyUnits(c.player)) G.freeze(u);
    },
  },
});
def('az_stargazer', {
  name: '星海の観測者', faction: 'azure', type: 'unit', cost: 5, atk: 2, hp: 5, move: 2, range: 3, model: 'stargazer', legend: true, env: 'zerog',
  text: '環境「無重力の星海」: 場にいる間、全ユニットの移動力+1 (移動力0を除く)。段差2以上の崖も登れる。',
});

// ---------------- 雷研究室 ----------------
// 「没入の実験体」: subject: true を持つカードはすべて「没入の実験体」として数える
def('lb_subject', {
  name: '没入の実験体', faction: 'lab', type: 'unit', cost: 1, atk: 2, hp: 1, move: 3, keywords: ['haste'], model: 'subject', subject: true,
  text: '',
});
def('lb_subject_a', {
  name: '没入の実験体', faction: 'lab', type: 'unit', cost: 0, atk: 2, hp: 2, move: 3, keywords: ['haste'], model: 'subject', subject: true, token: true,
  text: '「人らしい愛」で生まれた個体。',
});
def('lb_subject_b', {
  name: '没入の実験体', faction: 'lab', type: 'unit', cost: 3, atk: 3, hp: 3, move: 3, keywords: ['haste'], model: 'subject', subject: true, token: true,
  text: '「人らしい愛」で生まれた個体。',
});
def('s_lb_love', {
  name: '人らしい愛', faction: 'lab', type: 'spell', cost: 2, target: null, icon: '💗', fx: 'draw',
  text: '「0/2/2/3/1」になった「没入の実験体」と「3/3/3/3/1」になった「没入の実験体」を1枚ずつ手札に加える。',
  effect(G, c) { G.addCard(c.player, 'lb_subject_a'); G.addCard(c.player, 'lb_subject_b'); },
});
def('lb_devotee', {
  name: '心酔の研究者', faction: 'lab', type: 'unit', cost: 4, atk: 2, hp: 2, move: 2, range: 3, model: 'researcher',
  text: '召喚時: ランダムなマスに「没入の実験体」を1体出す。',
  onSummon(G, c) { G.spawn(c.player, 'lb_subject'); },
});
def('lb_germ', {
  name: '細菌の才援', faction: 'lab', type: 'unit', cost: 5, atk: 4, hp: 4, move: 4, keywords: ['guard', 'pierce'], model: 'germ',
  text: '召喚時: カードを2枚引く。ランダムなマスに「没入の実験体」を1体出す。',
  onSummon(G, c) { G.draw(c.player, 2); G.spawn(c.player, 'lb_subject'); },
});
def('s_lb_crow', {
  name: '烏ノ涅', faction: 'lab', type: 'spell', cost: 5, target: null, icon: '🪶', fx: 'crow',
  text: '相手のユニットからランダムに2体を選び、3ダメージ。ランダムなマスに「没入の実験体」を1体出す。',
  effect(G, c) {
    const pool = G.enemyUnits(c.player);
    for (let i = 0; i < 2 && pool.length; i++) {
      const u = pool.splice(Math.floor(G.rand() * pool.length), 1)[0];
      G.fx('bolt', G.leaderOf(c.player), u, {});
      G.damage(u, 3, 'spell');
    }
    G.spawn(c.player, 'lb_subject');
  },
});
def('lb_feelin', {
  name: '破式の変貌・フィーリン', faction: 'lab', type: 'unit', cost: 5, atk: 2, hp: 3, move: 3, range: 3, model: 'feelin', legend: true, env: 'lab',
  text: '環境「研究室」: 場にいる間、「没入の実験体」すべて+2/+2。',
});
def('lb_sephy', {
  name: '万術の黒研究・セフィー', faction: 'lab', type: 'unit', cost: 7, atk: 7, hp: 5, move: 2, keywords: ['haste'], model: 'sephy', legend: true,
  text: '自分のターン終了時: 場にいる「没入の実験体」の数だけ、相手のランダムなユニット (将を含む) に1ダメージを与える。',
  onTurnEnd(G, c) {
    const n = G.subjects().length;
    for (let i = 0; i < n; i++) {
      const foes = G.enemyAll(c.player);
      if (!foes.length) break;
      const t = G.pickRandom(foes);
      G.fx('bolt', c.self, t, {});
      G.damage(t, 1, 'spell');
    }
  },
});
// 追加カード
def('s_lb_chain', {
  name: '連鎖放電', faction: 'lab', type: 'spell', cost: 2, target: 'enemyUnit', icon: '⚡', fx: 'spark',
  text: '敵ユニット1体に2ダメージ。そのユニットに隣接する敵ユニットにも1ダメージ。',
  effect(G, c) {
    const near = G.enemyUnits(c.player).filter((u) => u !== c.target && Math.abs(u.x - c.x) + Math.abs(u.y - c.y) === 1);
    G.damage(c.target, 2, 'spell');
    for (const u of near) { G.fx('bolt', c.target, u, {}); G.damage(u, 1, 'spell'); }
  },
});
def('s_lb_recruit', {
  name: '被験者募集', faction: 'lab', type: 'spell', cost: 3, target: null, icon: '📋', fx: 'mana',
  text: 'ランダムなマスに「没入の実験体」を2体出す。',
  effect(G, c) { G.spawn(c.player, 'lb_subject'); G.spawn(c.player, 'lb_subject'); },
});
def('lb_assistant', {
  name: '助手ロボ', faction: 'lab', type: 'unit', cost: 1, atk: 1, hp: 2, move: 2, model: 'cog',
  text: '召喚時: 手札に「没入の実験体」を1枚加える。',
  onSummon(G, c) { G.addCard(c.player, 'lb_subject'); },
});
def('lb_tesla', {
  name: 'テスラ塔', faction: 'lab', type: 'unit', cost: 3, atk: 2, hp: 4, move: 0, range: 2, model: 'tesla',
  text: '動けない。自分のターン終了時: 2マス以内の敵ユニットすべてに1ダメージ。',
  onTurnEnd(G, c) {
    for (const u of G.enemiesWithin(c.player, c.self.x, c.self.y, 2)) {
      if (u.leader) continue;
      G.fx('bolt', c.self, u, {});
      G.damage(u, 1, 'spell');
    }
  },
});
def('lb_beast', { name: '雷獣', faction: 'lab', type: 'unit', cost: 3, atk: 4, hp: 2, move: 4, keywords: ['haste'], model: 'thunderbeast', text: '' });
def('lb_warden', {
  name: '実験体の監視員', faction: 'lab', type: 'unit', cost: 2, atk: 2, hp: 3, move: 2, model: 'warden',
  text: '召喚時: 味方の「没入の実験体」すべてを+1/+1。',
  onSummon(G, c) { for (const u of G.friendlyUnits(c.player)) if (C[u.cardId].subject) G.buff(u, 1, 1); },
});
def('lb_armor', { name: '電磁装甲兵', faction: 'lab', type: 'unit', cost: 4, atk: 3, hp: 5, move: 2, armor: 1, model: 'mech', text: '' });
def('lb_orb', {
  name: '雷雲の観測球', faction: 'lab', type: 'unit', cost: 2, atk: 1, hp: 2, move: 3, range: 2, keywords: ['flying'], model: 'drone',
  text: '召喚時: カードを1枚引く。',
  onSummon(G, c) { G.draw(c.player, 1); },
});
def('f_lb_rod', {
  name: '避雷針', faction: 'lab', type: 'field', cost: 2, target: 'tile', icon: '🗼', fx: 'raise',
  text: 'マス1つの高さ+1。そこに敵ユニットがいれば2ダメージ。',
  effect(G, c) {
    G.changeHeight(c.x, c.y, 1);
    const u = G.unitAt(c.x, c.y);
    if (u && u.owner !== c.player) { G.fx('bolt', { x: c.x, y: c.y }, u, {}); G.damage(u, 2, 'spell'); }
  },
});
def('f_lb_levitate', {
  name: '電磁浮上', faction: 'lab', type: 'field', cost: 3, target: 'block', icon: '🧲', fx: 'quake',
  text: '3x3の区画のマスすべての高さ+1 (最大3)。',
  effect(G, c) { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) G.changeHeight(c.x + dx, c.y + dy, 1); },
});
def('lb_proto', {
  name: '試作体ゼロ', faction: 'lab', type: 'unit', cost: 6, atk: 5, hp: 5, move: 3, model: 'proto', legend: true,
  text: '遺言: ランダムなマスに「没入の実験体」を2体出す。',
  onDeath(G, c) { G.spawn(c.player, 'lb_subject'); G.spawn(c.player, 'lb_subject'); },
});
def('lb_volt', {
  name: '雷鳴の博士ヴォルト', faction: 'lab', type: 'unit', cost: 7, atk: 4, hp: 7, move: 2, range: 2, model: 'volt', legend: true,
  text: '奥義「臨界放電」: 盤面のすべてのマスを平原・高さ1に変え、敵ユニットすべてに2ダメージ。',
  skill: {
    name: '臨界放電', fx: 'discharge',
    effect(G, c) {
      G.fieldWide('discharge', c.self, () => {
        G.s.tiles.forEach((t, i) => {
          const x = i % 7, y = (i / 7) | 0;
          G.setTerrain(x, y, 'plain');
          G.changeHeight(x, y, 1 - t.height);
        });
      });
      for (const u of G.enemyUnits(c.player)) G.damage(u, 2, 'spell');
    },
  },
});
def('s_lb_thunder', {
  name: '落雷の儀', faction: 'lab', type: 'spell', cost: 5, target: null, icon: '🌩', fx: 'crow', legend: true,
  text: '相手のランダムなユニット (将を含む) に1ダメージを、3 + 自分の場の「没入の実験体」の数だけ行う。',
  effect(G, c) {
    const n = 3 + G.friendlyUnits(c.player).filter((u) => C[u.cardId].subject).length;
    for (let i = 0; i < n; i++) {
      const foes = G.enemyAll(c.player);
      if (!foes.length) break;
      const t = G.pickRandom(foes);
      G.fx('bolt', G.leaderOf(c.player), t, {});
      G.damage(t, 1, 'spell');
    }
  },
});

export const CARDS = C;

// ---------------- デッキ構築ルール ----------------
export const DECK_SIZE = 30;
export const maxCopies = (id) => (C[id].legend ? 1 : 2);

/** その勢力で使えるカード (勢力カード + 中立) */
export function cardPool(faction) {
  return Object.values(C).filter((c) => (c.faction === faction || c.faction === 'neutral') && c.type !== 'leader' && !c.token).map((c) => c.id);
}

/** デッキの問題点を返す (空配列なら有効) */
export function validateDeck(faction, list) {
  const errs = [];
  if (list.length !== DECK_SIZE) errs.push(`カードは${DECK_SIZE}枚ちょうどにしてください (現在 ${list.length}枚)`);
  const pool = new Set(cardPool(faction));
  const counts = {};
  for (const id of list) {
    if (!C[id]) { errs.push(`不明なカード: ${id}`); continue; }
    if (!pool.has(id)) errs.push(`${C[id].name} はこの勢力では使えません`);
    counts[id] = (counts[id] || 0) + 1;
  }
  for (const [id, n] of Object.entries(counts)) if (C[id] && n > maxCopies(id)) errs.push(`${C[id].name} は${maxCopies(id)}枚までです`);
  return errs;
}

function build(entries) {
  const out = [];
  for (const e of entries) {
    const [id, n] = Array.isArray(e) ? e : [e, 2];
    for (let i = 0; i < n; i++) out.push(id);
  }
  return out;
}

// 構築済みデッキ (AI もこの中から選ぶ)
export const PRESETS = {
  fire: [
    { id: 'fire_std', name: '紅蓮の進軍', desc: '突撃ユニットと火力で押し切る標準型。', cards: build([
      'fi_imp', 'fi_blade', 'fi_pyro', 'fi_berserker', 'fi_golem', 'fi_salamander', ['fi_dragon', 1],
      's_fireball', 'f_eruption', 's_warcry', 'n_assassin', 'n_archer', 'n_cavalry', ['s_lightning', 1], 'f_uplift', ['fi_guard', 1], ['fi_inferno', 1],
    ]) },
    { id: 'fire_scorch', name: '焦土作戦', desc: '溶岩を広げて爆弾魔と不死鳥で焼き尽くす。', cards: build([
      'fi_imp', 'fi_bomber', 's_ignite', 'fi_golem', 'f_firewall', 'f_eruption', 'fi_salamander', 'fi_cannon', 's_frenzy',
      ['fi_phoenix', 1], ['s_meteor', 1], 'fi_guard', 'n_spear', 's_fireball', ['n_squire', 1], 'n_archer', ['fi_sunpriest', 1],
    ]) },
  ],
  forest: [
    { id: 'forest_std', name: '翠緑の守り', desc: '森を広げ、回復と強化で盤面を支配する標準型。', cards: build([
      'fo_sprout', 'fo_wolf', 'fo_druid', 'fo_archer', 'fo_priestess', 'fo_treant', ['fo_beast', 1],
      's_growth', 'f_thorns', 'f_quake', 'n_spear', 'n_archer', 'n_giant', 's_heal', ['s_supply', 1], ['fo_bear', 1], ['fo_worldtree', 1],
    ]) },
    { id: 'forest_grove', name: '大樹の園', desc: '若木を育て、長老樹と大熊で押し込む成長型。', cards: build([
      'fo_druid', 'fo_sprout', 'fo_dryad', 'fo_wolf', 'fo_wisp', 'fo_archer', ['n_ogre', 1], ['fo_rainlord', 1], 'n_giant', 'fo_bear',
      ['fo_elder', 1], ['fo_beast', 1], 's_bloom', 's_growth', 'fo_priestess', 'fo_treant', 'f_thorns',
    ]) },
  ],
  azure: [
    { id: 'azure_std', name: '蒼穹の機略', desc: '行のずらしと回転で戦場を組み替える標準型。', cards: build([
      'az_cog', 'az_gunner', 'az_tide', 'az_guardian', 'az_turret', ['az_leviathan', 1],
      's_freeze', 'f_slide', 'f_rotate', 'az_sniper', ['n_squire', 1], ['az_astra', 1], 'n_shield', 'n_mage', 's_supply', 'f_uplift', ['az_magnet', 1],
    ]) },
    { id: 'azure_armor', name: '鋼鉄要塞', desc: '鉄壁の機兵で守り、狙撃と巨神で崩す。', cards: build([
      'az_turret', 'az_cog', 'az_engineer', 'az_gunner', 'az_magnet', 'az_guardian', 'az_sniper', ['az_titan', 1],
      's_overclock', ['f_maelstrom', 1], 'f_tsunami', 's_freeze', 'n_wall', ['n_scout', 1], ['az_stargazer', 1], 's_smite', 'az_tide',
    ]) },
  ],
};

PRESETS.lab = [
  { id: 'lab_std', name: '没入計画', desc: '「没入の実験体」を次々と送り出し、フィーリンとセフィーで仕上げる。', cards: build([
    'lb_subject', 'lb_assistant', 's_lb_love', 'lb_warden', 'lb_devotee', 'lb_germ', 's_lb_recruit', ['s_lb_crow', 1],
    ['lb_feelin', 1], ['lb_sephy', 1], 'lb_beast', 's_lb_chain', 'n_archer', 'f_lb_rod', 'lb_orb', ['s_lb_thunder', 1], 'n_shield',
  ]) },
  { id: 'lab_volt', name: '雷鳴研究所', desc: 'テスラ塔と装甲兵で守り、ヴォルトの臨界放電で盤面ごと焼き払う。', cards: build([
    'lb_tesla', 'lb_armor', 'lb_orb', 'lb_beast', 's_lb_chain', 'f_lb_rod', 'f_lb_levitate', ['lb_volt', 1], ['lb_proto', 1],
    'lb_subject', 'lb_devotee', 'lb_germ', 'n_giant', 'n_mage', 's_lb_crow', 'n_spear',
  ]) },
];

export const DECKS = {
  fire: PRESETS.fire[0].cards,
  forest: PRESETS.forest[0].cards,
  azure: PRESETS.azure[0].cards,
  lab: PRESETS.lab[0].cards,
};

export function keywordList(card) {
  const out = [];
  for (const k of card.keywords || []) if (KEYWORDS[k]) out.push(KEYWORDS[k].name);
  if (card.range > 1) out.push('遠隔' + card.range);
  if (card.armor) out.push('鉄壁' + card.armor);
  if (card.regen) out.push('再生' + card.regen);
  if (card.type === 'unit' && card.move === 0) out.push('不動');
  return out;
}

export function typeName(card) {
  return { unit: 'ユニット', spell: '呪文', field: '地形', leader: 'リーダー' }[card.type];
}
