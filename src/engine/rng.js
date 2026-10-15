// 決定論的な疑似乱数 (mulberry32)。状態に乱数の内部値を持たせることで
// 盤面の複製 (AI のシミュレーション) でも同じ結果が再現できる。

export function rand(s) {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(s, n) {
  return Math.floor(rand(s) * n);
}

export function pick(s, arr) {
  return arr.length ? arr[randInt(s, arr.length)] : undefined;
}

export function shuffle(s, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(s, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function randomSeed() {
  return (Math.random() * 0xffffffff) | 0;
}
