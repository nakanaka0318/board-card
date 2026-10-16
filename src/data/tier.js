// npm run tier で生成 (構築済みデッキ同士の AI 総当たり)。手で編集しない。
export const TIER = {
  "version": "1.9.2",
  "date": "2026-10-16",
  "games": 560,
  "perPair": 20,
  "avgRounds": 17.2,
  "factions": [
    {
      "id": "lab",
      "name": "雷研究室",
      "wins": 159,
      "losses": 81,
      "draws": 0,
      "rate": 0.662,
      "tier": "S"
    },
    {
      "id": "forest",
      "name": "翠緑の森",
      "wins": 113,
      "losses": 127,
      "draws": 0,
      "rate": 0.471,
      "tier": "C"
    },
    {
      "id": "azure",
      "name": "蒼穹機関",
      "wins": 108,
      "losses": 132,
      "draws": 0,
      "rate": 0.45,
      "tier": "C"
    },
    {
      "id": "fire",
      "name": "紅蓮帝国",
      "wins": 100,
      "losses": 140,
      "draws": 0,
      "rate": 0.417,
      "tier": "D"
    }
  ],
  "decks": [
    {
      "id": "lab_volt",
      "faction": "lab",
      "name": "雷鳴研究所",
      "wins": 92,
      "losses": 48,
      "draws": 0,
      "rate": 0.657,
      "tier": "S"
    },
    {
      "id": "lab_std",
      "faction": "lab",
      "name": "没入計画",
      "wins": 87,
      "losses": 53,
      "draws": 0,
      "rate": 0.621,
      "tier": "S"
    },
    {
      "id": "forest_grove",
      "faction": "forest",
      "name": "大樹の園",
      "wins": 71,
      "losses": 69,
      "draws": 0,
      "rate": 0.507,
      "tier": "B"
    },
    {
      "id": "fire_scorch",
      "faction": "fire",
      "name": "焦土作戦",
      "wins": 69,
      "losses": 71,
      "draws": 0,
      "rate": 0.493,
      "tier": "B"
    },
    {
      "id": "azure_std",
      "faction": "azure",
      "name": "蒼穹の機略",
      "wins": 66,
      "losses": 74,
      "draws": 0,
      "rate": 0.471,
      "tier": "C"
    },
    {
      "id": "forest_std",
      "faction": "forest",
      "name": "翠緑の守り",
      "wins": 62,
      "losses": 78,
      "draws": 0,
      "rate": 0.443,
      "tier": "C"
    },
    {
      "id": "azure_armor",
      "faction": "azure",
      "name": "鋼鉄要塞",
      "wins": 62,
      "losses": 78,
      "draws": 0,
      "rate": 0.443,
      "tier": "C"
    },
    {
      "id": "fire_std",
      "faction": "fire",
      "name": "紅蓮の進軍",
      "wins": 51,
      "losses": 89,
      "draws": 0,
      "rate": 0.364,
      "tier": "D"
    }
  ],
  "matchups": {
    "fire": {
      "forest": 0.575,
      "azure": 0.438,
      "lab": 0.237
    },
    "forest": {
      "fire": 0.425,
      "azure": 0.537,
      "lab": 0.45
    },
    "azure": {
      "fire": 0.563,
      "forest": 0.463,
      "lab": 0.325
    },
    "lab": {
      "fire": 0.762,
      "forest": 0.55,
      "azure": 0.675
    }
  }
};
