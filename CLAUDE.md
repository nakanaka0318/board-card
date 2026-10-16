# アルカナ・フィールド — 開発メモ

## 方針 (ユーザー指示)
- **バランス調整 (アッパー・ナーフ) はユーザーが指示したときだけ行う。** 新しい勢力やカードを追加しても、既存カードの数値や構築済みデッキを勝手に調整しない。
- 勢力やカードを追加・変更したら `npm run tier` でティア表 (`src/data/tier.js`) を作り直し、ゲーム内の「ティア表」でその時点の最強勢力を見せる。
- 変更を入れたら `src/data/changelog.js` に履歴を追加し、`npm run changelog` で CHANGELOG.md を更新する。package.json の version も合わせる。

## 構成
- `src/engine/` 描画に依存しないルール (rules.js)・カード (cards.js)・AI (ai.js)
- `src/render/` Three.js の描画・演出・模型
- `src/ui/` HUD・カード詳細・デッキ編成・ティア表など
- テスト: `npm test`
