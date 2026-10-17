// npm run tier で生成 (構築済みデッキ同士の AI 総当たり)。手で編集しない。
export const TIER = {
  "version": "2.0.3",
  "date": "2026-10-17",
  "games": 630,
  "perPair": 14,
  "avgRounds": 15.5,
  "factions": [
    {
      "id": "wing",
      "name": "双翼の竜",
      "wins": 205,
      "losses": 19,
      "draws": 0,
      "rate": 0.915,
      "tier": "S"
    },
    {
      "id": "lab",
      "name": "雷研究室",
      "wins": 117,
      "losses": 107,
      "draws": 0,
      "rate": 0.522,
      "tier": "A"
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
      "wins": 81,
      "losses": 143,
      "draws": 0,
      "rate": 0.362,
      "tier": "D"
    },
    {
      "id": "azure",
      "name": "蒼穹機関",
      "wins": 76,
      "losses": 148,
      "draws": 0,
      "rate": 0.339,
      "tier": "D"
    }
  ],
  "decks": [
    {
      "id": "wing_std",
      "faction": "wing",
      "name": "双翼の竜宴",
      "wins": 116,
      "losses": 10,
      "draws": 0,
      "rate": 0.921,
      "tier": "S"
    },
    {
      "id": "wing_enh",
      "faction": "wing",
      "name": "エンハンス竜騎",
      "wins": 103,
      "losses": 23,
      "draws": 0,
      "rate": 0.817,
      "tier": "S"
    },
    {
      "id": "lab_volt",
      "faction": "lab",
      "name": "雷鳴研究所",
      "wins": 67,
      "losses": 59,
      "draws": 0,
      "rate": 0.532,
      "tier": "A"
    },
    {
      "id": "lab_std",
      "faction": "lab",
      "name": "没入計画",
      "wins": 64,
      "losses": 62,
      "draws": 0,
      "rate": 0.508,
      "tier": "B"
    },
    {
      "id": "fire_scorch",
      "faction": "fire",
      "name": "焦土作戦",
      "wins": 53,
      "losses": 73,
      "draws": 0,
      "rate": 0.421,
      "tier": "D"
    },
    {
      "id": "forest_grove",
      "faction": "forest",
      "name": "大樹の園",
      "wins": 53,
      "losses": 73,
      "draws": 0,
      "rate": 0.421,
      "tier": "D"
    },
    {
      "id": "azure_std",
      "faction": "azure",
      "name": "蒼穹の機略",
      "wins": 46,
      "losses": 80,
      "draws": 0,
      "rate": 0.365,
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
      "id": "fire_std",
      "faction": "fire",
      "name": "紅蓮の進軍",
      "wins": 42,
      "losses": 84,
      "draws": 0,
      "rate": 0.333,
      "tier": "D"
    },
    {
      "id": "forest_std",
      "faction": "forest",
      "name": "翠緑の守り",
      "wins": 42,
      "losses": 84,
      "draws": 0,
      "rate": 0.333,
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
      "wing": 0.071
    },
    "azure": {
      "fire": 0.536,
      "forest": 0.464,
      "lab": 0.304,
      "wing": 0.054
    },
    "lab": {
      "fire": 0.732,
      "forest": 0.554,
      "azure": 0.696,
      "wing": 0.107
    },
    "wing": {
      "fire": 0.893,
      "forest": 0.929,
      "azure": 0.946,
      "lab": 0.893
    }
  }
};
