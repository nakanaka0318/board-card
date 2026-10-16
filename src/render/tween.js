// 描画ループに同期した軽量トゥイーン。すべて Promise を返すので
// await で演出を順番につなげられる。

export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

export class Animator {
  constructor() {
    this.items = [];
    this.speed = 1;
  }

  // 打撃の瞬間に時間を一瞬ほぼ止める (ヒットストップ)
  hitStop(ms) {
    this.stopUntil = Math.max(this.stopUntil || 0, performance.now() + ms);
  }

  update(dt) {
    let d = dt * this.speed;
    if (this.stopUntil && performance.now() < this.stopUntil) d *= 0.04;
    const list = this.items;
    this.items = [];
    for (const it of list) {
      it.t += d;
      const p = it.dur <= 0 ? 1 : Math.min(1, it.t / it.dur);
      try { it.fn(it.ease(p), p); } catch (e) { console.error(e); }
      if (p >= 1) it.resolve();
      else this.items.push(it);
    }
  }

  tween(dur, fn, easing = ease.inOut) {
    return new Promise((resolve) => {
      this.items.push({ t: 0, dur, fn, ease: easing, resolve });
    });
  }

  wait(dur) {
    return this.tween(dur, () => {});
  }
}
