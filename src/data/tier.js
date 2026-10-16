// npm run tier で生成 (構築済みデッキ同士の AI 総当たり)。手で編集しない。
export const TIER = {
  "version": "1.9.0",
  "date": "2026-10-16",
  "games": 560,
  "perPair": 20,
  "avgRounds": 17.1,
  "factions": [
    {
      "id": "lab",
      "name": "雷研究室",
      "wins": 171,
      "losses": 69,
      "draws": 0,
      "rate": 0.713,
      "tier": "S"
    },
    {
      "id": "forest",
      "name": "翠緑の森",
      "wins": 115,
      "losses": 125,
      "draws": 0,
      "rate": 0.479,
      "tier": "C"
    },
    {
      "id": "azure",
      "name": "蒼穹機関",
      "wins": 112,
      "losses": 128,
      "draws": 0,
      "rate": 0.467,
      "tier": "C"
    },
    {
      "id": "fire",
      "name": "紅蓮帝国",
      "wins": 82,
      "losses": 158,
      "draws": 0,
      "rate": 0.342,
      "tier": "D"
    }
  ],
  "decks": [
    {
      "id": "lab_volt",
      "faction": "lab",
      "name": "雷鳴研究所",
      "wins": 96,
      "losses": 44,
      "draws": 0,
      "rate": 0.686,
      "tier": "S"
    },
    {
      "id": "lab_std",
      "faction": "lab",
      "name": "没入計画",
      "wins": 95,
      "losses": 45,
      "draws": 0,
      "rate": 0.679,
      "tier": "S"
    },
    {
      "id": "forest_grove",
      "faction": "forest",
      "name": "大樹の園",
      "wins": 75,
      "losses": 65,
      "draws": 0,
      "rate": 0.536,
      "tier": "A"
    },
    {
      "id": "azure_std",
      "faction": "azure",
      "name": "蒼穹の機略",
      "wins": 69,
      "losses": 71,
      "draws": 0,
      "rate": 0.493,
      "tier": "B"
    },
    {
      "id": "azure_armor",
      "faction": "azure",
      "name": "鋼鉄要塞",
      "wins": 63,
      "losses": 77,
      "draws": 0,
      "rate": 0.45,
      "tier": "C"
    },
    {
      "id": "forest_std",
      "faction": "forest",
      "name": "翠緑の守り",
      "wins": 60,
      "losses": 80,
      "draws": 0,
      "rate": 0.429,
      "tier": "D"
    },
    {
      "id": "fire_std",
      "faction": "fire",
      "name": "紅蓮の進軍",
      "wins": 54,
      "losses": 86,
      "draws": 0,
      "rate": 0.386,
      "tier": "D"
    },
    {
      "id": "fire_scorch",
      "faction": "fire",
      "name": "焦土作戦",
      "wins": 48,
      "losses": 92,
      "draws": 0,
      "rate": 0.343,
      "tier": "D"
    }
  ],
  "matchups": {
    "fire": {
      "forest": 0.525,
      "azure": 0.338,
      "lab": 0.163
    },
    "forest": {
      "fire": 0.475,
      "azure": 0.537,
      "lab": 0.425
    },
    "azure": {
      "fire": 0.662,
      "forest": 0.463,
      "lab": 0.275
    },
    "lab": {
      "fire": 0.838,
      "forest": 0.575,
      "azure": 0.725
    }
  }
};
