// npm run tier で生成 (構築済みデッキ同士の AI 総当たり)。手で編集しない。
export const TIER = {
  "version": "2.0.4",
  "date": "2026-10-17",
  "games": 630,
  "perPair": 14,
  "avgRounds": 15.7,
  "factions": [
    {
      "id": "forest",
      "name": "翠緑の森",
      "wins": 126,
      "losses": 98,
      "draws": 0,
      "rate": 0.563,
      "tier": "S"
    },
    {
      "id": "azure",
      "name": "蒼穹機関",
      "wins": 126,
      "losses": 98,
      "draws": 0,
      "rate": 0.563,
      "tier": "S"
    },
    {
      "id": "wing",
      "name": "双翼の竜",
      "wins": 111,
      "losses": 113,
      "draws": 0,
      "rate": 0.496,
      "tier": "B"
    },
    {
      "id": "fire",
      "name": "紅蓮帝国",
      "wins": 107,
      "losses": 117,
      "draws": 0,
      "rate": 0.478,
      "tier": "C"
    },
    {
      "id": "lab",
      "name": "雷研究室",
      "wins": 90,
      "losses": 134,
      "draws": 0,
      "rate": 0.402,
      "tier": "D"
    }
  ],
  "decks": [
    {
      "id": "wing_std",
      "faction": "wing",
      "name": "双翼の竜宴",
      "wins": 87,
      "losses": 39,
      "draws": 0,
      "rate": 0.69,
      "tier": "S"
    },
    {
      "id": "forest_grove",
      "faction": "forest",
      "name": "大樹の園",
      "wins": 79,
      "losses": 47,
      "draws": 0,
      "rate": 0.627,
      "tier": "S"
    },
    {
      "id": "azure_std",
      "faction": "azure",
      "name": "蒼穹の機略",
      "wins": 71,
      "losses": 55,
      "draws": 0,
      "rate": 0.563,
      "tier": "S"
    },
    {
      "id": "azure_armor",
      "faction": "azure",
      "name": "鋼鉄要塞",
      "wins": 69,
      "losses": 57,
      "draws": 0,
      "rate": 0.548,
      "tier": "A"
    },
    {
      "id": "fire_scorch",
      "faction": "fire",
      "name": "焦土作戦",
      "wins": 62,
      "losses": 64,
      "draws": 0,
      "rate": 0.492,
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
      "id": "forest_std",
      "faction": "forest",
      "name": "翠緑の守り",
      "wins": 61,
      "losses": 65,
      "draws": 0,
      "rate": 0.484,
      "tier": "B"
    },
    {
      "id": "fire_std",
      "faction": "fire",
      "name": "紅蓮の進軍",
      "wins": 59,
      "losses": 67,
      "draws": 0,
      "rate": 0.468,
      "tier": "C"
    },
    {
      "id": "lab_volt",
      "faction": "lab",
      "name": "雷鳴研究所",
      "wins": 42,
      "losses": 84,
      "draws": 0,
      "rate": 0.333,
      "tier": "D"
    },
    {
      "id": "wing_enh",
      "faction": "wing",
      "name": "エンハンス竜騎",
      "wins": 38,
      "losses": 88,
      "draws": 0,
      "rate": 0.302,
      "tier": "D"
    }
  ],
  "matchups": {
    "fire": {
      "forest": 0.625,
      "azure": 0.5,
      "lab": 0.429,
      "wing": 0.357
    },
    "forest": {
      "fire": 0.375,
      "azure": 0.5,
      "lab": 0.732,
      "wing": 0.643
    },
    "azure": {
      "fire": 0.5,
      "forest": 0.5,
      "lab": 0.643,
      "wing": 0.607
    },
    "lab": {
      "fire": 0.571,
      "forest": 0.268,
      "azure": 0.357,
      "wing": 0.411
    },
    "wing": {
      "fire": 0.643,
      "forest": 0.357,
      "azure": 0.393,
      "lab": 0.589
    }
  }
};
