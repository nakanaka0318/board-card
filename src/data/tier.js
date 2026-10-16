// npm run tier で生成 (構築済みデッキ同士の AI 総当たり)。手で編集しない。
export const TIER = {
  "version": "1.9.1",
  "date": "2026-10-16",
  "games": 560,
  "perPair": 20,
  "avgRounds": 17.2,
  "factions": [
    {
      "id": "lab",
      "name": "雷研究室",
      "wins": 166,
      "losses": 74,
      "draws": 0,
      "rate": 0.692,
      "tier": "S"
    },
    {
      "id": "forest",
      "name": "翠緑の森",
      "wins": 118,
      "losses": 122,
      "draws": 0,
      "rate": 0.492,
      "tier": "B"
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
      "wins": 84,
      "losses": 156,
      "draws": 0,
      "rate": 0.35,
      "tier": "D"
    }
  ],
  "decks": [
    {
      "id": "lab_std",
      "faction": "lab",
      "name": "没入計画",
      "wins": 96,
      "losses": 44,
      "draws": 0,
      "rate": 0.686,
      "tier": "S"
    },
    {
      "id": "lab_volt",
      "faction": "lab",
      "name": "雷鳴研究所",
      "wins": 90,
      "losses": 50,
      "draws": 0,
      "rate": 0.643,
      "tier": "S"
    },
    {
      "id": "forest_grove",
      "faction": "forest",
      "name": "大樹の園",
      "wins": 74,
      "losses": 66,
      "draws": 0,
      "rate": 0.529,
      "tier": "A"
    },
    {
      "id": "azure_std",
      "faction": "azure",
      "name": "蒼穹の機略",
      "wins": 68,
      "losses": 72,
      "draws": 0,
      "rate": 0.486,
      "tier": "B"
    },
    {
      "id": "forest_std",
      "faction": "forest",
      "name": "翠緑の守り",
      "wins": 64,
      "losses": 76,
      "draws": 0,
      "rate": 0.457,
      "tier": "C"
    },
    {
      "id": "azure_armor",
      "faction": "azure",
      "name": "鋼鉄要塞",
      "wins": 64,
      "losses": 76,
      "draws": 0,
      "rate": 0.457,
      "tier": "C"
    },
    {
      "id": "fire_std",
      "faction": "fire",
      "name": "紅蓮の進軍",
      "wins": 53,
      "losses": 87,
      "draws": 0,
      "rate": 0.379,
      "tier": "D"
    },
    {
      "id": "fire_scorch",
      "faction": "fire",
      "name": "焦土作戦",
      "wins": 51,
      "losses": 89,
      "draws": 0,
      "rate": 0.364,
      "tier": "D"
    }
  ],
  "matchups": {
    "fire": {
      "forest": 0.525,
      "azure": 0.338,
      "lab": 0.188
    },
    "forest": {
      "fire": 0.475,
      "azure": 0.537,
      "lab": 0.463
    },
    "azure": {
      "fire": 0.662,
      "forest": 0.463,
      "lab": 0.275
    },
    "lab": {
      "fire": 0.813,
      "forest": 0.537,
      "azure": 0.725
    }
  }
};
