// WebAudio 合成音效 —— 零音频文件依赖。
// 浏览器 autoplay 策略：AudioContext 只在首次按键时创建/恢复；
// 所有播放调用都有守卫，音频在任何环境下都不可能抛错打断游戏。
window.AudioMan = {
  ctx: null,
  master: null,
  noiseBuf: null,
  _laser: null, // 持续型激光音的节点引用

  // 首次用户输入时调用（main.js 负责）
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
        // 1 秒白噪声，所有打击/风声共用
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const bgm = document.getElementById('bgm');
      if (bgm && bgm.paused) bgm.play().catch(() => {});
    } catch (e) { /* 音频永不致命 */ }
  },

  get ready() { return this.ctx && this.ctx.state === 'running'; },

  suspend() { try { if (this.ctx) this.ctx.suspend(); const b = document.getElementById('bgm'); if (b) b.pause(); } catch (e) {} },
  resume()  { this.unlock(); },

  // ---- 基础合成原语 ----
  _osc(type, f0, f1, dur, vol, delay = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  _noise(filterType, f0, f1, q, dur, vol, delay = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const flt = this.ctx.createBiquadFilter();
    flt.type = filterType;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) flt.frequency.exponentialRampToValueAtTime(Math.max(f1, 10), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  },

  // ---- 具体音效 ----
  hit()        { this._noise('bandpass', 2000, 2000, 1, 0.08, 0.5); this._osc('square', 220, 90, 0.07, 0.25); },
  heavyHit()   { this._noise('bandpass', 800, 500, 1, 0.15, 0.6); this._osc('square', 120, 50, 0.15, 0.3); this._osc('sine', 60, 45, 0.18, 0.5); },
  playerHurt() { this._osc('sawtooth', 300, 150, 0.12, 0.3); this._noise('bandpass', 1200, 600, 1, 0.1, 0.35); },
  dodge()      { this._noise('bandpass', 400, 3000, 2, 0.2, 0.3); },
  roar() {
    this._noise('lowpass', 300, 150, 1, 1.0, 0.7);
    this._osc('sawtooth', 75, 55, 0.9, 0.45);
    this._osc('sine', 70, 50, 1.0, 0.5);
  },
  charm() {
    [659, 880, 1109].forEach((f, i) => this._osc('sine', f, f, 0.35, 0.22, i * 0.09));
    this._noise('highpass', 6000, 8000, 1, 0.5, 0.08);
  },
  cloneSpawn() { this._noise('lowpass', 1500, 300, 1, 0.3, 0.4); this._osc('triangle', 700, 250, 0.25, 0.2); },
  telegraph(dur) { this._osc('triangle', 300, 900, Math.max(dur, 0.2), 0.12); },
  dogBark()    { this._osc('sawtooth', 400, 200, 0.09, 0.3); this._osc('sawtooth', 380, 180, 0.09, 0.3, 0.12); },
  ui()         { this._osc('sine', 880, 880, 0.06, 0.15); },
  ultReady()   { this._osc('sine', 523, 1046, 0.3, 0.2); },
  victory()    { [523, 659, 784, 1046].forEach((f, i) => this._osc('sine', f, f, 0.5, 0.25, i * 0.13)); },
  defeat()     { this._osc('sine', 220, 80, 1.4, 0.35); this._noise('lowpass', 400, 100, 1, 1.2, 0.3); },

  // 持续型激光音（开/关）
  laserStart() {
    if (!this.ready || this._laser) return;
    try {
      const t = this.ctx.currentTime;
      const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 110;
      const o2 = this.ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 113;
      const flt = this.ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 800;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 6;
      const lfoG = this.ctx.createGain(); lfoG.gain.value = 300;
      lfo.connect(lfoG); lfoG.connect(flt.frequency);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.15);
      o1.connect(flt); o2.connect(flt); flt.connect(g); g.connect(this.master);
      o1.start(); o2.start(); lfo.start();
      this._laser = { o1, o2, lfo, g };
    } catch (e) { this._laser = null; }
  },
  laserStop() {
    if (!this._laser) return;
    try {
      const t = this.ctx.currentTime;
      const L = this._laser;
      L.g.gain.cancelScheduledValues(t);
      L.g.gain.setValueAtTime(Math.max(L.g.gain.value, 0.001), t);
      L.g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      L.o1.stop(t + 0.25); L.o2.stop(t + 0.25); L.lfo.stop(t + 0.25);
    } catch (e) {}
    this._laser = null;
  },
};
