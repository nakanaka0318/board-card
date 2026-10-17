# アルカナ・フィールド — 開発メモ

## 方針 (ユーザー指示)
- **バランス調整 (アッパー・ナーフ) はユーザーが指示したときだけ行う。** 新しい勢力やカードを追加しても、既存カードの数値や構築済みデッキを勝手に調整しない。
- 勢力やカードを追加・変更したら `npm run tier` でティア表 (`src/data/tier.js`) を作り直し、ゲーム内の「ティア表」でその時点の最強勢力を見せる。
- 変更を入れたら `src/data/changelog.js` に履歴を追加し、`npm run changelog` で CHANGELOG.md を更新する。package.json の version も合わせる。

## 勢力の追加手順
勢力の表示 (タイトルの勢力選択・相手の勢力・デッキ編成・カードの色・ティア表・デモ盤面) は
`src/ui/factions.js` と `FACTIONS` にまとまっているので、次を足すだけで全画面に反映される。
1. `src/engine/cards.js` の `FACTIONS` に勢力 (name / short / color / emblem / desc / palette / hero)
2. 同じファイルにカード (`def(...)`) と `PRESETS.<id>` (構築済みデッキ2つ)、`DECKS` への登録
3. 新しいモデルを使うなら `src/render/models.js` の BUILDERS と MODEL_HEIGHT
4. 環境を使うなら `ENVIRONMENTS` と `src/render/atmosphere.js` の PALETTES / KINDS
5. テスト・`npm run tier`・更新履歴

## 構成
- `src/engine/` 描画に依存しないルール (rules.js)・カード (cards.js)・AI (ai.js)
- `src/render/` Three.js の描画・演出・模型
- `src/ui/` HUD・カード詳細・デッキ編成・ティア表など
- テスト: `npm test`
