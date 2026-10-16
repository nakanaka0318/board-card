// WebAudio による効果音とBGMの合成 (音声ファイル不要)。
export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicOn = true;
    this.volume = 0.5;
    // true: 他のアプリの音・動画と混ぜて再生する (iOS ではマナーモード中は鳴らない)
    // false: 再生モード (マナーモードでも鳴るが、他のアプリの再生は止まる)
    this.mix = true;
    this.last = {};
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.22;
    this.musicBus.connect(this.master);
    // 簡易リバーブ
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.2);
    const rg = this.ctx.createGain();
    rg.gain.value = 0.35;
    this.reverb.connect(rg);
    rg.connect(this.master);
    this.noiseBuf = this.makeNoise();
    return this.ctx;
  }

  impulse(sec) {
    const c = this.ctx, len = c.sampleRate * sec;
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    return b;
  }

  makeNoise() {
    const c = this.ctx, len = c.sampleRate;
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  resume() {
    const c = this.ensure();
    if (c && c.state !== 'running') c.resume().catch(() => {});
  }

  // ブラウザの自動再生制限を解除する。
  // iOS はタッチの pointerdown をユーザー操作とみなさず、さらにマナーモード中は
  // Web Audio が消音されるため、touchend/click で解除し、無音の <audio> を再生して
  // オーディオセッションを「再生」カテゴリに切り替える。
  installUnlock() {
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const unlock = () => {
      const c = this.ensure();
      if (!c) return;
      this.applySession();
      if (c.state !== 'running') c.resume().catch(() => {});
      try {
        const b = c.createBuffer(1, 1, 22050);
        const src = c.createBufferSource();
        src.buffer = b;
        src.connect(c.destination);
        src.start(0);
      } catch { /* noop */ }
      if (isIOS && this.enabled && !this.mix && !document.hidden) this.ensureTag().play().catch(() => {});
      if (c.state === 'running' && (!isIOS || this.mix || (this.tag && !this.tag.paused))) {
        for (const ev of EVENTS) window.removeEventListener(ev, unlock, true);
        this.unlocked = true;
      }
    };
    const EVENTS = ['touchend', 'click', 'keydown', 'pointerup'];
    for (const ev of EVENTS) window.addEventListener(ev, unlock, true);
    // バックグラウンド (別タブ・別アプリ・画面ロック) では一切音を出さない
    const sync = () => (document.hidden ? this.pauseAll() : this.resumeAll());
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', () => this.pauseAll());
    window.addEventListener('pageshow', sync);
    window.addEventListener('blur', () => { if (document.hidden) this.pauseAll(); });
    // 復帰後に自動再開できなかった場合 (iOS) は次のタップで再開する
    window.addEventListener('pointerup', () => { if (this.backgrounded === false && this.enabled) this.resumeAll(); }, true);
  }

  // オーディオセッションの種類を設定に合わせる (iOS Safari 16.4+)
  applySession() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = this.mix ? 'ambient' : 'playback';
    } catch { /* 未対応 */ }
  }

  ensureTag() {
    if (!this.tag) {
      this.tag = document.createElement('audio');
      this.tag.src = silentWav();
      this.tag.loop = true;
      this.tag.setAttribute('playsinline', '');
      this.tag.setAttribute('x-webkit-airplay', 'deny');
    }
    return this.tag;
  }

  setMix(mix) {
    this.mix = mix;
    this.applySession();
    if (mix) { if (this.tag) this.tag.pause(); return; }
    // iOS でマナーモード中も鳴らすには、無音の audio 要素で再生カテゴリにする
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS && this.enabled && this.unlocked && !document.hidden) this.ensureTag().play().catch(() => {});
  }

  pauseAll() {
    this.backgrounded = true;
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
    if (this.tag && !this.tag.paused) this.tag.pause();
  }

  resumeAll() {
    if (document.hidden) return;
    this.backgrounded = false;
    if (!this.enabled) return;
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    if (this.tag && this.tag.paused && this.unlocked && !this.mix) this.tag.play().catch(() => {});
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.tag) { if (on && !this.mix && !document.hidden) this.tag.play().catch(() => {}); else this.tag.pause(); }
    if (on && !document.hidden) this.resume();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  tone({ f = 440, f2 = null, type = 'sine', dur = 0.2, vol = 0.3, attack = 0.005, at = 0, rev = 0.3, detune = 0 }) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.detune.value = detune;
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.sfxBus);
    if (rev) { const rg = c.createGain(); rg.gain.value = rev; g.connect(rg); rg.connect(this.reverb); }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.2, vol = 0.3, freq = 1000, q = 1, type = 'bandpass', f2 = null, at = 0, rev = 0.2 }) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(freq, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    fl.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl);
    fl.connect(g);
    g.connect(this.sfxBus);
    if (rev) { const rg = c.createGain(); rg.gain.value = rev; g.connect(rg); rg.connect(this.reverb); }
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  play(name) {
    if (!this.enabled || document.hidden) return;
    const c = this.ensure();
    if (!c || c.state !== 'running') return;
    const now = performance.now();
    if (this.last[name] && now - this.last[name] < 40) return;
    this.last[name] = now;
    const T = (o) => this.tone(o), N = (o) => this.noise(o);
    switch (name) {
      case 'click': T({ f: 880, type: 'triangle', dur: 0.06, vol: 0.12, rev: 0 }); break;
      case 'hover': T({ f: 1320, type: 'sine', dur: 0.03, vol: 0.04, rev: 0 }); break;
      case 'select': T({ f: 660, f2: 990, type: 'triangle', dur: 0.1, vol: 0.15 }); break;
      case 'cancel': T({ f: 500, f2: 300, type: 'triangle', dur: 0.1, vol: 0.12 }); break;
      case 'card': N({ dur: 0.25, vol: 0.25, freq: 2500, f2: 600, q: 0.8 }); T({ f: 520, f2: 780, type: 'sine', dur: 0.18, vol: 0.1 }); break;
      case 'draw': N({ dur: 0.15, vol: 0.15, freq: 3500, f2: 1500, q: 1 }); break;
      case 'summon':
        T({ f: 392, type: 'triangle', dur: 0.5, vol: 0.18 });
        T({ f: 523, type: 'triangle', dur: 0.5, vol: 0.14, at: 0.06 });
        T({ f: 784, type: 'sine', dur: 0.7, vol: 0.12, at: 0.12, rev: 0.6 });
        N({ dur: 0.6, vol: 0.12, freq: 4000, f2: 800, q: 0.7 });
        break;
      case 'big': T({ f: 80, f2: 40, type: 'sawtooth', dur: 0.9, vol: 0.3 }); N({ dur: 1.0, vol: 0.3, freq: 300, f2: 60, type: 'lowpass' }); break;
      case 'step': N({ dur: 0.08, vol: 0.12, freq: 400, q: 2, rev: 0 }); break;
      case 'swing': N({ dur: 0.18, vol: 0.25, freq: 1800, f2: 400, q: 1.5, rev: 0 }); break;
      case 'hit': N({ dur: 0.15, vol: 0.4, freq: 900, f2: 200, q: 1 }); T({ f: 160, f2: 60, type: 'square', dur: 0.12, vol: 0.15 }); break;
      case 'block': T({ f: 1800, f2: 1200, type: 'square', dur: 0.12, vol: 0.08 }); T({ f: 2400, type: 'sine', dur: 0.3, vol: 0.08, rev: 0.6 }); break;
      case 'death': T({ f: 300, f2: 60, type: 'sawtooth', dur: 0.5, vol: 0.15 }); N({ dur: 0.5, vol: 0.2, freq: 600, f2: 100 }); break;
      case 'bow': N({ dur: 0.12, vol: 0.2, freq: 3000, q: 4 }); T({ f: 200, f2: 120, type: 'triangle', dur: 0.1, vol: 0.15 }); break;
      case 'magic': T({ f: 880, f2: 1760, type: 'sine', dur: 0.25, vol: 0.12, rev: 0.6 }); T({ f: 1320, f2: 2640, type: 'sine', dur: 0.25, vol: 0.08, at: 0.05, rev: 0.6 }); break;
      case 'fire': N({ dur: 0.5, vol: 0.3, freq: 800, f2: 2500, q: 0.5 }); break;
      case 'explode': N({ dur: 0.8, vol: 0.45, freq: 1200, f2: 80, type: 'lowpass', q: 0.8 }); T({ f: 90, f2: 30, type: 'sine', dur: 0.6, vol: 0.4 }); break;
      case 'thunder': N({ dur: 1.0, vol: 0.5, freq: 3000, f2: 100, type: 'lowpass' }); T({ f: 60, f2: 30, type: 'sawtooth', dur: 0.6, vol: 0.2 }); break;
      case 'heal': [523, 659, 784, 1046].forEach((f, i) => T({ f, type: 'sine', dur: 0.4, vol: 0.08, at: i * 0.06, rev: 0.7 })); break;
      case 'buff': [392, 494, 587, 784].forEach((f, i) => T({ f, type: 'triangle', dur: 0.25, vol: 0.09, at: i * 0.05 })); break;
      case 'freeze': [2093, 2637, 3136].forEach((f, i) => T({ f, type: 'sine', dur: 0.5, vol: 0.06, at: i * 0.05, rev: 0.8 })); N({ dur: 0.4, vol: 0.12, freq: 6000, q: 2 }); break;
      case 'wave': N({ dur: 0.7, vol: 0.25, freq: 500, f2: 1500, q: 0.6 }); break;
      case 'push': N({ dur: 0.25, vol: 0.2, freq: 300, q: 1 }); break;
      case 'burn': N({ dur: 0.4, vol: 0.25, freq: 1500, f2: 3000, q: 0.5 }); break;
      case 'terrain': N({ dur: 0.4, vol: 0.2, freq: 600, f2: 1200, q: 0.8 }); break;
      case 'rise': T({ f: 70, f2: 110, type: 'sawtooth', dur: 0.4, vol: 0.18 }); N({ dur: 0.4, vol: 0.2, freq: 200, type: 'lowpass' }); break;
      case 'sink': T({ f: 110, f2: 55, type: 'sawtooth', dur: 0.4, vol: 0.18 }); N({ dur: 0.4, vol: 0.2, freq: 200, type: 'lowpass' }); break;
      case 'quake': N({ dur: 1.2, vol: 0.4, freq: 120, type: 'lowpass', q: 1 }); T({ f: 45, f2: 35, type: 'sawtooth', dur: 1.2, vol: 0.2 }); break;
      case 'field': T({ f: 220, f2: 440, type: 'triangle', dur: 0.4, vol: 0.12, rev: 0.6 }); break;
      case 'mana': [784, 988, 1175].forEach((f, i) => T({ f, type: 'sine', dur: 0.3, vol: 0.07, at: i * 0.04, rev: 0.6 })); break;
      case 'turn': T({ f: 523, type: 'triangle', dur: 0.6, vol: 0.14, rev: 0.6 }); T({ f: 784, type: 'triangle', dur: 0.7, vol: 0.12, at: 0.12, rev: 0.6 }); break;
      case 'enemyturn': T({ f: 330, type: 'triangle', dur: 0.6, vol: 0.14, rev: 0.6 }); T({ f: 247, type: 'triangle', dur: 0.7, vol: 0.12, at: 0.12, rev: 0.6 }); break;
      case 'think': T({ f: 1046 + Math.random() * 400, type: 'sine', dur: 0.05, vol: 0.025, rev: 0.5 }); break;
      case 'firework': T({ f: 600, f2: 1600, type: 'sine', dur: 0.25, vol: 0.05, rev: 0 }); N({ dur: 0.5, vol: 0.22, freq: 2500, f2: 300, at: 0.25, q: 0.6 }); break;
      case 'cutin': N({ dur: 0.45, vol: 0.25, freq: 600, f2: 4000, q: 0.7 }); T({ f: 392, f2: 784, type: 'sawtooth', dur: 0.35, vol: 0.06, rev: 0.7 }); break;
      case 'crit': N({ dur: 0.25, vol: 0.45, freq: 2200, f2: 200, q: 0.7 }); T({ f: 120, f2: 40, type: 'square', dur: 0.25, vol: 0.2 }); break;
      case 'error': T({ f: 200, type: 'square', dur: 0.15, vol: 0.08 }); break;
      case 'victory': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => T({ f, type: 'triangle', dur: 0.5, vol: 0.14, at: i * 0.13, rev: 0.6 })); break;
      case 'defeat': [392, 349, 311, 262].forEach((f, i) => T({ f, type: 'triangle', dur: 0.7, vol: 0.14, at: i * 0.25, rev: 0.6 })); break;
    }
  }

  // ゆったりしたアンビエント BGM (和音の移ろい)
  startMusic() {
    const c = this.ensure();
    if (!c || this.musicTimer) return;
    const chords = [
      [220, 261.6, 329.6, 392], [174.6, 220, 261.6, 349.2], [196, 246.9, 293.7, 392], [164.8, 207.7, 246.9, 329.6],
    ];
    let i = 0;
    const play = () => {
      if (!this.musicOn || !this.enabled || document.hidden || c.state !== 'running') return;
      const ch = chords[i++ % chords.length];
      const t = c.currentTime;
      for (const [k, f] of ch.entries()) {
        const o = c.createOscillator();
        o.type = k === 0 ? 'sine' : 'triangle';
        o.frequency.value = k === 0 ? f / 2 : f;
        o.detune.value = (Math.random() - 0.5) * 8;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(k === 0 ? 0.22 : 0.07, t + 2);
        g.gain.linearRampToValueAtTime(0, t + 7.5);
        o.connect(g);
        g.connect(this.musicBus);
        const rg = c.createGain();
        rg.gain.value = 0.5;
        g.connect(rg);
        rg.connect(this.reverb);
        o.start(t);
        o.stop(t + 8);
      }
      // きらめくアルペジオ
      for (let n = 0; n < 4; n++) {
        if (Math.random() < 0.45) continue;
        const f = ch[1 + Math.floor(Math.random() * 3)] * 2;
        this.tone({ f, type: 'sine', dur: 1.2, vol: 0.025, at: 1 + n * 1.5, rev: 0.9 });
      }
    };
    play();
    this.musicTimer = setInterval(play, 6500);
  }
}

// 0.5 秒の無音 WAV (8kHz / 8bit / モノラル) の data URI
function silentWav() {
  const n = 4000;
  const buf = new Uint8Array(44 + n);
  const dv = new DataView(buf.buffer);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) buf[o + i] = t.charCodeAt(i); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
  str(36, 'data'); dv.setUint32(40, n, true);
  buf.fill(128, 44);
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return 'data:audio/wav;base64,' + btoa(bin);
}
