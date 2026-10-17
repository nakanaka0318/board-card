// npm run tier で生成 (構築済みデッキ同士の AI 総当たり)。手で編集しない。
export const TIER = {
  "version": "2.0.0",
  "date": "2026-10-17",
  "games": 630,
  "perPair": 14,
  "avgRounds": 15.4,
  "factions": [
    {
      "id": "wing",
      "name": "双翼の竜",
      "wins": 210,
      "losses": 13,
      "draws": 1,
      "rate": 0.94,
      "tier": "S"
    },
    {
      "id": "lab",
      "name": "雷研究室",
      "wins": 113,
      "losses": 111,
      "draws": 0,
      "rate": 0.504,
      "tier": "B"
    },
    {
      "id": "fire",
      "name": "紅蓮帝国",
      "wins": 81,
      "losses": 143,
      "draws": 0,
      "rate": 0.362,
      "tier": "D"
    },
    {
      "id": "forest",
      "name": "翠緑の森",
      "wins": 80,
      "losses": 143,
      "draws": 1,
      "rate": 0.359,
      "tier": "D"
    },
    {
      "id": "azure",
      "name": "蒼穹機関",
      "wins": 75,
      "losses": 149,
      "draws": 0,
      "rate": 0.335,
      "tier": "D"
    }
  ],
  "decks": [
    {
      "id": "wing_std",
      "faction": "wing",
      "name": "双翼の竜宴",
      "wins": 120,
      "losses": 5,
      "draws": 1,
      "rate": 0.956,
      "tier": "S"
    },
    {
      "id": "wing_enh",
      "faction": "wing",
      "name": "エンハンス竜騎",
      "wins": 104,
      "losses": 22,
      "draws": 0,
      "rate": 0.825,
      "tier": "S"
    },
    {
      "id": "lab_volt",
      "faction": "lab",
      "name": "雷鳴研究所",
      "wins": 65,
      "losses": 61,
      "draws": 0,
      "rate": 0.516,
      "tier": "B"
    },
    {
      "id": "lab_std",
      "faction": "lab",
      "name": "没入計画",
      "wins": 62,
      "losses": 64,
      "draws": 0,
      "rate": 0.492,
      "tier": "B"
    },
    {
      "id": "fire_scorch",
      "faction": "fire",
      "name": "焦土作戦",
      "wins": 55,
      "losses": 71,
      "draws": 0,
      "rate": 0.437,
      "tier": "D"
    },
    {
      "id": "forest_grove",
      "faction": "forest",
      "name": "大樹の園",
      "wins": 53,
      "losses": 72,
      "draws": 1,
      "rate": 0.425,
      "tier": "D"
    },
    {
      "id": "azure_std",
      "faction": "azure",
      "name": "蒼穹の機略",
      "wins": 45,
      "losses": 81,
      "draws": 0,
      "rate": 0.357,
      "tier": "D"
    },
    {
      "id": "azure_armor",
      "faction": "azure",
      "name": "鋼鉄要塞",
      "wins": 44,
      "losses": 82,
      "draws": 0,
      "rate": 0.349,
      "tier": "D"
    },
    {
      "id": "forest_std",
      "faction": "forest",
      "name": "翠緑の守り",
      "wins": 41,
      "losses": 85,
      "draws": 0,
      "rate": 0.325,
      "tier": "D"
    },
    {
      "id": "fire_std",
      "faction": "fire",
      "name": "紅蓮の進軍",
      "wins": 40,
      "losses": 86,
      "draws": 0,
      "rate": 0.317,
      "tier": "D"
    }
  ],
  "matchups": {
    "fire": {
      "forest": 0.607,
      "azure": 0.464,
      "lab": 0.268,
      "wing": 0.107
    },
    "forest": {
      "fire": 0.393,
      "azure": 0.536,
      "lab": 0.446,
      "wing": 0.063
    },
    "azure": {
      "fire": 0.536,
      "forest": 0.464,
      "lab": 0.304,
      "wing": 0.036
    },
    "lab": {
      "fire": 0.732,
      "forest": 0.554,
      "azure": 0.696,
      "wing": 0.036
    },
    "wing": {
      "fire": 0.893,
      "forest": 0.938,
      "azure": 0.964,
      "lab": 0.964
    }
  }
};
