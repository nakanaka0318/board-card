// npm run tier で生成 (構築済みデッキ同士の AI 総当たり)。手で編集しない。
export const TIER = {
  "version": "2.0.4",
  "date": "2026-10-17",
  "games": 630,
  "perPair": 14,
  "avgRounds": 16.1,
  "factions": [
    {
      "id": "wing",
      "name": "双翼の竜",
      "wins": 169,
      "losses": 55,
      "draws": 0,
      "rate": 0.754,
      "tier": "S"
    },
    {
      "id": "lab",
      "name": "雷研究室",
      "wins": 134,
      "losses": 90,
      "draws": 0,
      "rate": 0.598,
      "tier": "S"
    },
    {
      "id": "fire",
      "name": "紅蓮帝国",
      "wins": 91,
      "losses": 133,
      "draws": 0,
      "rate": 0.406,
      "tier": "D"
    },
    {
      "id": "forest",
      "name": "翠緑の森",
      "wins": 83,
      "losses": 141,
      "draws": 0,
      "rate": 0.371,
      "tier": "D"
    },
    {
      "id": "azure",
      "name": "蒼穹機関",
      "wins": 83,
      "losses": 141,
      "draws": 0,
      "rate": 0.371,
      "tier": "D"
    }
  ],
  "decks": [
    {
      "id": "wing_std",
      "faction": "wing",
      "name": "双翼の竜宴",
      "wins": 108,
      "losses": 18,
      "draws": 0,
      "rate": 0.857,
      "tier": "S"
    },
    {
      "id": "wing_enh",
      "faction": "wing",
      "name": "エンハンス竜騎",
      "wins": 75,
      "losses": 51,
      "draws": 0,
      "rate": 0.595,
      "tier": "S"
    },
    {
      "id": "lab_std",
      "faction": "lab",
      "name": "没入計画",
      "wins": 74,
      "losses": 52,
      "draws": 0,
      "rate": 0.587,
      "tier": "S"
    },
    {
      "id": "lab_volt",
      "faction": "lab",
      "name": "雷鳴研究所",
      "wins": 74,
      "losses": 52,
      "draws": 0,
      "rate": 0.587,
      "tier": "S"
    },
    {
      "id": "fire_scorch",
      "faction": "fire",
      "name": "焦土作戦",
      "wins": 61,
      "losses": 65,
      "draws": 0,
      "rate": 0.484,
      "tier": "B"
    },
    {
      "id": "forest_grove",
      "faction": "forest",
      "name": "大樹の園",
      "wins": 51,
      "losses": 75,
      "draws": 0,
      "rate": 0.405,
      "tier": "D"
    },
    {
      "id": "azure_std",
      "faction": "azure",
      "name": "蒼穹の機略",
      "wins": 50,
      "losses": 76,
      "draws": 0,
      "rate": 0.397,
      "tier": "D"
    },
    {
      "id": "azure_armor",
      "faction": "azure",
      "name": "鋼鉄要塞",
      "wins": 47,
      "losses": 79,
      "draws": 0,
      "rate": 0.373,
      "tier": "D"
    },
    {
      "id": "forest_std",
      "faction": "forest",
      "name": "翠緑の守り",
      "wins": 46,
      "losses": 80,
      "draws": 0,
      "rate": 0.365,
      "tier": "D"
    },
    {
      "id": "fire_std",
      "faction": "fire",
      "name": "紅蓮の進軍",
      "wins": 44,
      "losses": 82,
      "draws": 0,
      "rate": 0.349,
      "tier": "D"
    }
  ],
  "matchups": {
    "fire": {
      "forest": 0.607,
      "azure": 0.464,
      "lab": 0.268,
      "wing": 0.286
    },
    "forest": {
      "fire": 0.393,
      "azure": 0.536,
      "lab": 0.446,
      "wing": 0.107
    },
    "azure": {
      "fire": 0.536,
      "forest": 0.464,
      "lab": 0.304,
      "wing": 0.179
    },
    "lab": {
      "fire": 0.732,
      "forest": 0.554,
      "azure": 0.696,
      "wing": 0.411
    },
    "wing": {
      "fire": 0.714,
      "forest": 0.893,
      "azure": 0.821,
      "lab": 0.589
    }
  }
};
