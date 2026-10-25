// Procedural audio engine: every sound effect is synthesised at runtime with
// WebAudio, so there are no audio files to ship.
import { clamp } from '../core/util';

export type Surface = 'grass' | 'stone' | 'wood' | 'water' | 'concrete' | 'metal' | 'flesh' | 'dirt';

export interface SfxOpts {
  vol?: number;
  pitch?: number;
  /** -1..1 stereo position */
  pan?: number;
  /** extra reverb send 0..1 */
  wet?: number;
  delay?: number;
}

export class AudioSys {
  ctx: AudioContext | null = null;
  master!: GainNode;
  musicBus!: GainNode;
  sfxBus!: GainNode;
  ambBus!: GainNode;
  reverb!: ConvolverNode;
  reverbSend!: GainNode;
  noise!: AudioBuffer;
  pink!: AudioBuffer;
  volumes = { master: 0.9, music: 0.55, sfx: 0.85, amb: 0.6 };
  private lastPlay = new Map<string, number>();
  private plucks = new Map<string, AudioBuffer>();
  muted = false;

  /** Must be called from a user gesture on mobile. */
  unlock() {
    if (!this.ctx) {
      const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const ctx = this.ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.connect(comp);
      this.musicBus = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.ambBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.ambBus.connect(this.master);
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(2.4, 2.6);
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = 0.9;
      this.reverbSend.connect(this.reverb);
      this.reverb.connect(this.master);
      this.noise = this.makeNoise(2, false);
      this.pink = this.makeNoise(2, true);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const m = this.muted ? 0 : this.volumes.master;
    this.master.gain.value = m;
    this.musicBus.gain.value = this.volumes.music;
    this.sfxBus.gain.value = this.volumes.sfx;
    this.ambBus.gain.value = this.volumes.amb;
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  private makeNoise(sec: number, pink: boolean) {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (!pink) { d[i] = w; continue; }
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
    return buf;
  }

  private impulse(sec: number, decay: number) {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return buf;
  }

  // ------------------------------------------------------------------
  // Building blocks
  // ------------------------------------------------------------------

  /** Output chain for one sound: gain -> pan -> sfx bus (+ reverb send). */
  out(o: SfxOpts = {}, bus?: AudioNode) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = o.vol ?? 1;
    let last: AudioNode = g;
    if (o.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(o.pan, -1, 1);
      g.connect(p);
      last = p;
    }
    last.connect(bus ?? this.sfxBus);
    if (o.wet) {
      const s = ctx.createGain();
      s.gain.value = o.wet;
      last.connect(s);
      s.connect(this.reverbSend);
    }
    return g;
  }

  osc(type: OscillatorType, f0: number, f1: number, t: number, dur: number, dest: AudioNode, vol = 0.5, attack = 0.005, curve: 'exp' | 'lin' = 'exp') {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    if (f1 !== f0) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      else o.frequency.linearRampToValueAtTime(f1, t + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  noiseBurst(t: number, dur: number, dest: AudioNode, opts: { type?: BiquadFilterType; f0?: number; f1?: number; q?: number; vol?: number; attack?: number; pink?: boolean; rate?: number } = {}) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = opts.pink ? this.pink : this.noise;
    src.playbackRate.value = opts.rate ?? 1;
    const off = Math.random() * 1.5;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.Q.value = opts.q ?? 1;
    f.frequency.setValueAtTime(opts.f0 ?? 1000, t);
    if (opts.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, opts.f1), t + dur);
    const g = ctx.createGain();
    const a = opts.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.5, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.loop = true;
    src.start(t, off);
    src.stop(t + dur + 0.1);
    return src;
  }

  /** FM bell / metallic tone. */
  fm(t: number, carrier: number, ratio: number, index: number, dur: number, dest: AudioNode, vol = 0.3) {
    const ctx = this.ctx!;
    const c = ctx.createOscillator(), m = ctx.createOscillator();
    const mg = ctx.createGain();
    c.frequency.value = carrier;
    m.frequency.value = carrier * ratio;
    mg.gain.setValueAtTime(carrier * index, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, carrier * index * 0.05), t + dur);
    m.connect(mg); mg.connect(c.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    c.connect(g); g.connect(dest);
    c.start(t); m.start(t); c.stop(t + dur + 0.05); m.stop(t + dur + 0.05);
  }

  /** Karplus-Strong plucked string, rendered once per pitch and cached. */
  pluckBuffer(freq: number, bright = 0.5, dur = 1.6) {
    const key = freq.toFixed(1) + ':' + bright;
    let b = this.plucks.get(key);
    if (b) return b;
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const n = Math.floor(sr * dur);
    b = ctx.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    const period = Math.max(2, Math.round(sr / freq));
    const ring = new Float32Array(period);
    for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0, prev = 0;
    const damp = 0.996 - (1 - bright) * 0.004;
    for (let i = 0; i < n; i++) {
      const cur = ring[idx];
      const nxt = ring[(idx + 1) % period];
      const v = (cur * (0.5 + bright * 0.2) + nxt * (0.5 - bright * 0.2)) * damp;
      ring[idx] = v;
      d[i] = cur * 0.6 + prev * 0.1;
      prev = cur;
      idx = (idx + 1) % period;
    }
    this.plucks.set(key, b);
    return b;
  }

  pluck(t: number, freq: number, dest: AudioNode, vol = 0.4, bright = 0.5, dur = 1.6) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.pluckBuffer(freq, bright, dur);
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g); g.connect(dest);
    src.start(t);
  }

  private throttle(name: string, ms: number) {
    const now = performance.now();
    const last = this.lastPlay.get(name) ?? 0;
    if (now - last < ms) return true;
    this.lastPlay.set(name, now);
    return false;
  }

  // ------------------------------------------------------------------
  // Sound effect library
  // ------------------------------------------------------------------

  play(name: string, o: SfxOpts = {}) {
    if (!this.ctx || this.muted) return;
    if (this.throttle(name + (o.pitch ?? ''), name === 'step' ? 60 : 28)) return;
    const t = this.now + (o.delay ?? 0);
    const p = o.pitch ?? 1;
    const fn = (SFX as any)[name] as ((a: AudioSys, t: number, p: number, o: SfxOpts) => void) | undefined;
    if (fn) fn(this, t, p, o);
  }

  step(surface: Surface, o: SfxOpts = {}) {
    if (!this.ctx || this.muted) return;
    if (this.throttle('step', 90)) return;
    const t = this.now;
    const out = this.out({ ...o, vol: (o.vol ?? 1) * 0.35 });
    const r = 0.85 + Math.random() * 0.3;
    switch (surface) {
      case 'grass': case 'dirt':
        this.noiseBurst(t, 0.09, out, { type: 'bandpass', f0: 1800 * r, q: 0.8, vol: 0.5, pink: true });
        this.noiseBurst(t, 0.05, out, { type: 'lowpass', f0: 400, vol: 0.3 });
        break;
      case 'stone': case 'concrete':
        this.noiseBurst(t, 0.05, out, { type: 'bandpass', f0: 2500 * r, q: 2, vol: 0.4 });
        this.osc('sine', 160 * r, 90, t, 0.06, out, 0.35);
        break;
      case 'wood':
        this.osc('triangle', 220 * r, 140, t, 0.08, out, 0.45);
        this.noiseBurst(t, 0.04, out, { type: 'bandpass', f0: 1200, q: 3, vol: 0.25 });
        break;
      case 'water':
        this.noiseBurst(t, 0.16, out, { type: 'bandpass', f0: 900 * r, f1: 2400, q: 2, vol: 0.5 });
        this.osc('sine', 600 * r, 1400, t, 0.08, out, 0.15);
        break;
      case 'metal':
        this.fm(t, 420 * r, 2.7, 3, 0.12, out, 0.18);
        break;
      case 'flesh':
        this.noiseBurst(t, 0.12, out, { type: 'lowpass', f0: 600 * r, vol: 0.6 });
        this.osc('sine', 90, 50, t, 0.1, out, 0.4);
        break;
    }
  }
}

type SfxFn = (a: AudioSys, t: number, p: number, o: SfxOpts) => void;

/** All named sound effects. Each one builds a short synth graph and lets it die. */
const SFX: Record<string, SfxFn> = {
  // ---- UI ----
  click: (a, t, p, o) => { const d = a.out({ ...o, vol: (o.vol ?? 1) * 0.3 }); a.osc('triangle', 1400 * p, 900 * p, t, 0.05, d, 0.5); },
  tab: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.25 }); a.osc('sine', 900 * p, 1300 * p, t, 0.06, d, 0.5); },
  open: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.3, wet: 0.2 }); a.osc('sine', 500 * p, 900 * p, t, 0.12, d, 0.4); a.osc('sine', 750 * p, 1350 * p, t + 0.04, 0.12, d, 0.3); },
  close: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.3 }); a.osc('sine', 900 * p, 450 * p, t, 0.12, d, 0.4); },
  error: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.25 }); a.osc('square', 180 * p, 160 * p, t, 0.12, d, 0.3); a.osc('square', 140 * p, 120 * p, t + 0.12, 0.16, d, 0.3); },
  equip: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.4 }); a.fm(t, 600 * p, 3.5, 2, 0.25, d, 0.25); a.noiseBurst(t, 0.08, d, { type: 'highpass', f0: 3000, vol: 0.2 }); },
  coin: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.3, wet: 0.15 }); a.osc('square', 988 * p, 988 * p, t, 0.07, d, 0.25); a.osc('square', 1319 * p, 1319 * p, t + 0.07, 0.22, d, 0.25); },
  buy: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.35, wet: 0.2 }); [1046, 1318, 1568].forEach((f, i) => a.osc('triangle', f * p, f * p, t + i * 0.06, 0.25, d, 0.3)); },
  pickup: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.35, wet: 0.2 }); a.osc('sine', 700 * p, 1400 * p, t, 0.12, d, 0.4); a.fm(t + 0.05, 1600 * p, 2, 1.5, 0.3, d, 0.12); },
  rare: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.4, wet: 0.5 }); [880, 1108, 1318, 1760].forEach((f, i) => a.fm(t + i * 0.07, f * p, 3, 1.2, 0.6, d, 0.18)); },
  dialog: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.12 }); a.osc('square', 520 * p, 520 * p, t, 0.035, d, 0.3); },
  levelup: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.45, wet: 0.5 });
    [523, 659, 784, 1046, 1318].forEach((f, i) => { a.osc('triangle', f * p, f * p, t + i * 0.08, 0.5, d, 0.3); a.osc('sine', f * 2 * p, f * 2 * p, t + i * 0.08, 0.3, d, 0.1); });
    a.noiseBurst(t + 0.3, 0.9, d, { type: 'highpass', f0: 6000, vol: 0.15, attack: 0.2 });
  },
  questAccept: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.4, wet: 0.4 }); [392, 523, 659].forEach((f, i) => a.pluck(t + i * 0.09, f * p, d, 0.7, 0.6)); },
  questDone: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.45, wet: 0.5 });
    [523, 659, 784, 1046].forEach((f, i) => a.pluck(t + i * 0.1, f * p, d, 0.8, 0.7));
    a.fm(t + 0.45, 1046 * p, 2, 1.5, 1.2, d, 0.2);
  },
  skillUp: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.35, wet: 0.4 }); a.osc('sawtooth', 300 * p, 1200 * p, t, 0.3, d, 0.15); a.fm(t + 0.25, 1200 * p, 1.5, 2, 0.5, d, 0.2); },
  save: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.3, wet: 0.3 }); a.fm(t, 880 * p, 2, 1, 0.5, d, 0.25); a.fm(t + 0.12, 1320 * p, 2, 1, 0.6, d, 0.2); },
  enhanceOk: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.45, wet: 0.5 }); a.fm(t, 300 * p, 3.1, 6, 0.3, d, 0.3); [784, 988, 1318, 1568].forEach((f, i) => a.osc('triangle', f, f, t + 0.25 + i * 0.07, 0.5, d, 0.25)); },
  enhanceFail: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.45, wet: 0.3 }); a.fm(t, 300 * p, 3.1, 6, 0.3, d, 0.3); a.osc('sawtooth', 300, 60, t + 0.25, 0.6, d, 0.25); a.noiseBurst(t + 0.25, 0.4, d, { type: 'lowpass', f0: 800, vol: 0.4 }); },
  potion: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.4, wet: 0.3 });
    for (let i = 0; i < 3; i++) a.osc('sine', 300 * p, 520 * p, t + i * 0.09, 0.08, d, 0.35);
    a.fm(t + 0.3, 1200 * p, 2.5, 1, 0.6, d, 0.15);
    a.noiseBurst(t + 0.3, 0.6, d, { type: 'highpass', f0: 7000, vol: 0.1, attack: 0.1 });
  },
  heal: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.35, wet: 0.6 }); [660, 880, 1100, 1320].forEach((f, i) => a.osc('sine', f * p, f * p * 1.01, t + i * 0.05, 0.7, d, 0.15, 0.1)); },
  buff: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.35, wet: 0.5 }); a.osc('sawtooth', 200 * p, 800 * p, t, 0.5, d, 0.12, 0.2); a.noiseBurst(t, 0.6, d, { type: 'bandpass', f0: 800, f1: 4000, q: 3, vol: 0.2, attack: 0.3 }); },
  portal: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.4, wet: 0.7 }); a.osc('sine', 200 * p, 900 * p, t, 0.8, d, 0.3, 0.3); a.noiseBurst(t, 0.9, d, { type: 'bandpass', f0: 400, f1: 3000, q: 4, vol: 0.3, attack: 0.4 }); },
  door: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.4 }); a.osc('triangle', 120 * p, 80, t, 0.25, d, 0.5); a.noiseBurst(t, 0.2, d, { type: 'lowpass', f0: 900, vol: 0.4 }); },

  // ---- movement / generic combat ----
  dash: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.5 }); a.noiseBurst(t, 0.22, d, { type: 'bandpass', f0: 600 * p, f1: 2600 * p, q: 1.2, vol: 0.6, attack: 0.02 }); },
  swing: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.45 }); a.noiseBurst(t, 0.16, d, { type: 'bandpass', f0: 500 * p, f1: 2200 * p, q: 1.5, vol: 0.55, attack: 0.03 }); },
  swingHeavy: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.55 }); a.noiseBurst(t, 0.3, d, { type: 'bandpass', f0: 250 * p, f1: 1400 * p, q: 1.2, vol: 0.7, attack: 0.06 }); },
  punch: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.7 });
    a.osc('sine', 140 * p, 45, t, 0.16, d, 0.9);
    a.noiseBurst(t, 0.08, d, { type: 'lowpass', f0: 2200 * p, vol: 0.6 });
    a.noiseBurst(t, 0.03, d, { type: 'highpass', f0: 3500, vol: 0.3 });
  },
  kick: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.7 }); a.osc('sine', 110 * p, 40, t, 0.2, d, 1); a.noiseBurst(t, 0.12, d, { type: 'lowpass', f0: 1500 * p, vol: 0.6 }); },
  slash: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.55 });
    a.noiseBurst(t, 0.18, d, { type: 'highpass', f0: 2500 * p, f1: 6000, vol: 0.5, attack: 0.01 });
    a.fm(t, 1800 * p, 1.41, 2, 0.15, d, 0.12);
  },
  hammer: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.65, wet: 0.15 });
    a.fm(t, 340 * p, 2.76, 5, 0.45, d, 0.35);
    a.osc('sine', 120 * p, 50, t, 0.15, d, 0.7);
    a.noiseBurst(t, 0.06, d, { type: 'highpass', f0: 4000, vol: 0.4 });
  },
  nail: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.4 }); a.osc('sine', 2400 * p, 900 * p, t, 0.14, d, 0.25); a.noiseBurst(t, 0.1, d, { type: 'highpass', f0: 5000, vol: 0.3 }); },
  tink: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.35 }); a.fm(t, 2200 * p, 3.3, 2, 0.12, d, 0.2); },
  hit: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.6 });
    a.noiseBurst(t, 0.1, d, { type: 'lowpass', f0: 1600 * p, f1: 400, vol: 0.7 });
    a.osc('sine', 180 * p, 60, t, 0.1, d, 0.6);
  },
  crit: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.7, wet: 0.25 });
    a.osc('sine', 200 * p, 40, t, 0.25, d, 1);
    a.noiseBurst(t, 0.18, d, { type: 'bandpass', f0: 3000 * p, f1: 600, q: 0.8, vol: 0.7 });
    a.fm(t, 900 * p, 1.5, 4, 0.25, d, 0.2);
  },
  blackflash: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.95, wet: 0.6 });
    // crackling discharge + sub drop + distorted impact
    a.osc('sine', 260, 28, t, 0.9, d, 1.1);
    a.osc('sawtooth', 90, 30, t, 0.6, d, 0.4);
    for (let i = 0; i < 9; i++) a.noiseBurst(t + i * 0.018 + Math.random() * 0.02, 0.05, d, { type: 'bandpass', f0: 2000 + Math.random() * 5000, q: 5, vol: 0.6 });
    a.noiseBurst(t, 0.5, d, { type: 'lowpass', f0: 3000, f1: 200, vol: 0.9 });
    a.fm(t + 0.02, 55, 7.1, 18, 0.7, d, 0.35);
  },
  block: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.5 }); a.fm(t, 500 * p, 1.4, 3, 0.2, d, 0.3); },
  hurt: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.55 });
    a.osc('sawtooth', 300 * p, 160 * p, t, 0.16, d, 0.18);
    a.noiseBurst(t, 0.12, d, { type: 'lowpass', f0: 1200, vol: 0.5 });
    a.osc('sine', 120, 50, t, 0.14, d, 0.5);
  },
  playerDie: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.6, wet: 0.8 }); a.osc('sawtooth', 300, 40, t, 1.6, d, 0.3); a.osc('sine', 220, 55, t, 1.8, d, 0.4); },
  land: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.6 }); a.osc('sine', 90 * p, 35, t, 0.22, d, 0.9); a.noiseBurst(t, 0.2, d, { type: 'lowpass', f0: 700, vol: 0.6 }); },

  // ---- skills ----
  divergent: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.75, wet: 0.35 });
    a.osc('sine', 150 * p, 45, t, 0.15, d, 0.9);
    a.noiseBurst(t, 0.06, d, { type: 'lowpass', f0: 2000, vol: 0.5 });
    // delayed cursed-energy second impact
    a.osc('sine', 120 * p, 30, t + 0.18, 0.35, d, 1.0);
    a.noiseBurst(t + 0.18, 0.25, d, { type: 'bandpass', f0: 900, f1: 200, q: 0.8, vol: 0.8 });
    a.fm(t + 0.18, 70, 3.3, 9, 0.35, d, 0.3);
  },
  shockwave: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.8, wet: 0.4 });
    a.osc('sine', 90 * p, 25, t, 0.6, d, 1);
    a.noiseBurst(t, 0.6, d, { type: 'lowpass', f0: 2500, f1: 120, vol: 0.9 });
    for (let i = 0; i < 5; i++) a.noiseBurst(t + 0.05 + i * 0.04, 0.12, d, { type: 'bandpass', f0: 300 + Math.random() * 600, q: 2, vol: 0.4 });
  },
  explosion: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.8, wet: 0.4 });
    a.osc('sine', 110 * p, 30, t, 0.7, d, 1);
    a.noiseBurst(t, 0.9, d, { type: 'lowpass', f0: 4000, f1: 150, vol: 0.9, pink: true });
    a.noiseBurst(t, 0.15, d, { type: 'highpass', f0: 2000, vol: 0.5 });
  },
  summon: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.55, wet: 0.7 });
    a.noiseBurst(t, 0.45, d, { type: 'bandpass', f0: 200, f1: 1800, q: 2, vol: 0.5, attack: 0.35 });
    a.osc('sine', 110 * p, 55 * p, t, 0.8, d, 0.5, 0.2);
    a.fm(t + 0.4, 330 * p, 1.5, 2, 0.8, d, 0.2);
    a.noiseBurst(t + 0.4, 0.3, d, { type: 'lowpass', f0: 900, f1: 200, vol: 0.5 });
  },
  shadow: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.5, wet: 0.6 });
    a.noiseBurst(t, 0.5, d, { type: 'lowpass', f0: 300 * p, f1: 1500 * p, vol: 0.6, attack: 0.15 });
    a.osc('sine', 70 * p, 40, t, 0.5, d, 0.5, 0.1);
  },
  growl: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.5 });
    const ctx = a.ctx!;
    const os = ctx.createOscillator(); os.type = 'sawtooth'; os.frequency.value = 90 * p;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 28; const lg = ctx.createGain(); lg.gain.value = 30;
    lfo.connect(lg); lg.connect(os.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    os.connect(f); f.connect(g); g.connect(d);
    os.start(t); lfo.start(t); os.stop(t + 0.55); lfo.stop(t + 0.55);
  },
  bark: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.5 }); a.osc('sawtooth', 500 * p, 220 * p, t, 0.12, d, 0.3); a.noiseBurst(t, 0.1, d, { type: 'bandpass', f0: 900 * p, q: 2, vol: 0.4 }); },
  screech: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.4, wet: 0.3 });
    a.osc('sawtooth', 1800 * p, 900 * p, t, 0.35, d, 0.18);
    a.osc('sawtooth', 1850 * p, 950 * p, t, 0.35, d, 0.12);
    a.noiseBurst(t, 0.3, d, { type: 'bandpass', f0: 3000 * p, q: 4, vol: 0.3 });
  },
  lightning: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.7, wet: 0.5 });
    for (let i = 0; i < 12; i++) a.noiseBurst(t + i * 0.012, 0.04, d, { type: 'highpass', f0: 2000 + Math.random() * 4000, vol: 0.5 });
    a.noiseBurst(t + 0.05, 0.8, d, { type: 'lowpass', f0: 1200, f1: 80, vol: 0.8, pink: true });
    a.osc('square', 60, 40, t, 0.3, d, 0.2);
  },
  croak: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.5 });
    for (let i = 0; i < 2; i++) { a.osc('square', 140 * p, 90 * p, t + i * 0.18, 0.14, d, 0.2); a.noiseBurst(t + i * 0.18, 0.14, d, { type: 'bandpass', f0: 500, q: 6, vol: 0.3 }); }
  },
  tongue: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.45 }); a.noiseBurst(t, 0.18, d, { type: 'bandpass', f0: 700 * p, f1: 1800, q: 3, vol: 0.4 }); a.osc('sine', 300, 700, t, 0.1, d, 0.2); },
  elephant: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.6, wet: 0.5 });
    a.osc('sawtooth', 300 * p, 520 * p, t, 0.7, d, 0.25, 0.08, 'lin');
    a.osc('sawtooth', 305 * p, 525 * p, t, 0.7, d, 0.2, 0.08, 'lin');
    a.noiseBurst(t, 0.7, d, { type: 'bandpass', f0: 800, q: 3, vol: 0.2, attack: 0.1 });
  },
  water: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.6, wet: 0.4 });
    a.noiseBurst(t, 1.0, d, { type: 'lowpass', f0: 3000 * p, f1: 400, vol: 0.7, pink: true, attack: 0.05 });
    for (let i = 0; i < 6; i++) a.osc('sine', 400 + Math.random() * 900, 1200 + Math.random() * 800, t + Math.random() * 0.6, 0.05, d, 0.12);
  },
  rabbits: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.35 }); for (let i = 0; i < 14; i++) a.noiseBurst(t + i * 0.035, 0.03, d, { type: 'bandpass', f0: 1500 + Math.random() * 1500, q: 3, vol: 0.4 }); },
  resonance: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.7, wet: 0.6 });
    a.fm(t, 220 * p, 3.01, 8, 1.4, d, 0.35);
    a.fm(t + 0.01, 330 * p, 2.01, 5, 1.2, d, 0.25);
    a.osc('sine', 100, 35, t + 0.1, 0.5, d, 0.9);
    a.noiseBurst(t + 0.1, 0.35, d, { type: 'lowpass', f0: 2500, f1: 200, vol: 0.7 });
  },
  hairpin: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.7, wet: 0.35 });
    for (let i = 0; i < 6; i++) {
      const tt = t + i * 0.05;
      a.osc('sine', 160, 40, tt, 0.18, d, 0.6);
      a.noiseBurst(tt, 0.12, d, { type: 'lowpass', f0: 3000, f1: 300, vol: 0.5 });
    }
  },
  doll: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.45, wet: 0.7 }); a.fm(t, 196 * p, 1.07, 3, 1.2, d, 0.25); a.osc('sine', 98 * p, 97 * p, t, 1.2, d, 0.2, 0.2); },
  fire: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.6, wet: 0.3 });
    a.noiseBurst(t, 0.8, d, { type: 'lowpass', f0: 800 * p, f1: 2500, vol: 0.7, pink: true, attack: 0.08 });
    for (let i = 0; i < 10; i++) a.noiseBurst(t + Math.random() * 0.7, 0.02, d, { type: 'highpass', f0: 3000, vol: 0.3 });
  },
  fireball: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.5 }); a.noiseBurst(t, 0.5, d, { type: 'bandpass', f0: 400 * p, f1: 1200, q: 0.8, vol: 0.6, pink: true, attack: 0.05 }); },
  meteor: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.85, wet: 0.5 });
    a.noiseBurst(t, 1.2, d, { type: 'bandpass', f0: 3000, f1: 300, q: 1, vol: 0.5, pink: true, attack: 0.6 });
    a.osc('sine', 80, 25, t + 1.0, 0.9, d, 1);
    a.noiseBurst(t + 1.0, 1.0, d, { type: 'lowpass', f0: 3000, f1: 100, vol: 0.9, pink: true });
  },
  wave: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.7, wet: 0.5 }); a.noiseBurst(t, 1.6, d, { type: 'lowpass', f0: 400, f1: 2400, vol: 0.8, pink: true, attack: 0.5 }); a.osc('sine', 60, 40, t, 1.4, d, 0.5, 0.4); },
  roots: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.6 });
    for (let i = 0; i < 6; i++) { a.osc('triangle', 200 + Math.random() * 200, 80, t + i * 0.04, 0.08, d, 0.4); a.noiseBurst(t + i * 0.04, 0.06, d, { type: 'bandpass', f0: 1500, q: 2, vol: 0.4 }); }
  },
  flower: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.35, wet: 0.7 }); [784, 988, 1175, 1568].forEach((f, i) => a.fm(t + i * 0.05, f * p, 1.5, 1, 0.8, d, 0.12)); },
  squish: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.5 }); a.noiseBurst(t, 0.2, d, { type: 'lowpass', f0: 900 * p, f1: 200, vol: 0.7 }); a.osc('sine', 300 * p, 80, t, 0.15, d, 0.4); },
  beam: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.7, wet: 0.4 });
    a.osc('sawtooth', 120 * p, 900 * p, t, 0.5, d, 0.2, 0.4, 'lin');
    a.osc('sawtooth', 122 * p, 905 * p, t, 0.5, d, 0.2, 0.4, 'lin');
    a.noiseBurst(t + 0.45, 0.7, d, { type: 'bandpass', f0: 1200, f1: 400, q: 0.7, vol: 0.9 });
    a.osc('sine', 80, 30, t + 0.45, 0.6, d, 0.8);
  },
  charge: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.45, wet: 0.4 }); a.osc('sawtooth', 80 * p, 400 * p, t, 0.8, d, 0.12, 0.6, 'lin'); a.noiseBurst(t, 0.8, d, { type: 'bandpass', f0: 300, f1: 3000, q: 6, vol: 0.25, attack: 0.6 }); },
  teleport: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.45, wet: 0.5 }); a.osc('sine', 1200 * p, 200 * p, t, 0.25, d, 0.3); a.noiseBurst(t, 0.25, d, { type: 'highpass', f0: 3000, f1: 8000, vol: 0.3 }); },
  clap: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.85, wet: 0.5 });
    a.noiseBurst(t, 0.12, d, { type: 'bandpass', f0: 1400 * p, q: 1.5, vol: 1 });
    a.noiseBurst(t + 0.008, 0.2, d, { type: 'bandpass', f0: 2200 * p, q: 1.2, vol: 0.6 });
  },
  roar: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.8, wet: 0.5 });
    const ctx = a.ctx!;
    for (const det of [0, 7, -5]) {
      const os = ctx.createOscillator(); os.type = 'sawtooth';
      os.frequency.setValueAtTime(110 * p + det, t); os.frequency.linearRampToValueAtTime(70 * p + det, t + 1.2);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 22 + det; const lg = ctx.createGain(); lg.gain.value = 25;
      lfo.connect(lg); lg.connect(os.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      os.connect(f); f.connect(g); g.connect(d);
      os.start(t); lfo.start(t); os.stop(t + 1.35); lfo.stop(t + 1.35);
    }
    a.noiseBurst(t, 1.2, d, { type: 'bandpass', f0: 600, q: 1, vol: 0.4, attack: 0.1 });
  },
  curseDie: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.5, wet: 0.5 });
    a.noiseBurst(t, 0.6, d, { type: 'bandpass', f0: 2000 * p, f1: 200, q: 1.5, vol: 0.6, attack: 0.02 });
    a.osc('sine', 400 * p, 60, t, 0.5, d, 0.3);
  },
  bossDie: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.9, wet: 0.8 });
    a.osc('sawtooth', 200, 30, t, 2.5, d, 0.3);
    a.osc('sine', 120, 25, t, 2.5, d, 0.6);
    for (let i = 0; i < 6; i++) a.noiseBurst(t + i * 0.25, 0.6, d, { type: 'lowpass', f0: 3000, f1: 200, vol: 0.6, pink: true });
  },
  domain: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.9, wet: 0.9 });
    // rising swell, then a huge low chord and shimmering choir
    a.noiseBurst(t, 1.2, d, { type: 'bandpass', f0: 200, f1: 6000, q: 2, vol: 0.5, attack: 1.0 });
    a.osc('sine', 40, 160, t, 1.2, d, 0.4, 0.9);
    const chord = [55, 82.4, 110, 130.8, 164.8, 220];
    chord.forEach((f, i) => {
      a.osc('sawtooth', f * p, f * p, t + 1.2, 3.0, d, 0.08, 0.05);
      a.osc('sine', f * 2 * p, f * 2.005 * p, t + 1.2 + i * 0.02, 3.2, d, 0.1, 0.3);
    });
    a.osc('sine', 60, 25, t + 1.2, 1.2, d, 1);
    a.noiseBurst(t + 1.2, 1.5, d, { type: 'lowpass', f0: 4000, f1: 200, vol: 0.8, pink: true });
  },
  dismantle: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.55, wet: 0.2 });
    a.noiseBurst(t, 0.12, d, { type: 'highpass', f0: 4000 * p, f1: 9000, vol: 0.6, attack: 0.005 });
    a.osc('sawtooth', 3000 * p, 800, t, 0.08, d, 0.1);
  },
  blue: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.6, wet: 0.6 }); a.osc('sine', 600, 80, t, 1.0, d, 0.4, 0.05); a.noiseBurst(t, 1.0, d, { type: 'bandpass', f0: 3000, f1: 200, q: 3, vol: 0.4, attack: 0.1 }); },
  red: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.8, wet: 0.5 }); a.osc('sine', 80, 600, t, 0.3, d, 0.5); a.noiseBurst(t + 0.25, 0.6, d, { type: 'lowpass', f0: 5000, f1: 150, vol: 0.9, pink: true }); },
  purple: (a, t, p, o) => {
    const d = a.out({ ...o, vol: 0.95, wet: 0.8 });
    a.osc('sine', 100, 1400, t, 1.0, d, 0.3, 0.8, 'lin');
    a.osc('sine', 1400, 30, t + 1.0, 1.5, d, 0.9);
    a.noiseBurst(t + 1.0, 1.8, d, { type: 'lowpass', f0: 8000, f1: 100, vol: 1, pink: true });
  },
  barrier: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.5, wet: 0.7 }); a.fm(t, 150 * p, 1.5, 4, 2, d, 0.25); a.noiseBurst(t, 2, d, { type: 'bandpass', f0: 500, q: 8, vol: 0.2, attack: 0.8 }); },
  bell: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.5, wet: 0.8 }); a.fm(t, 196 * p, 3.5, 3, 3, d, 0.3); a.fm(t, 392 * p, 2.7, 1.5, 2.5, d, 0.15); },
  shatter: (a, t, p, o) => { const d = a.out({ ...o, vol: 0.6, wet: 0.4 }); for (let i = 0; i < 10; i++) a.fm(t + Math.random() * 0.15, 2000 + Math.random() * 3000, 2.3, 2, 0.3, d, 0.08); a.noiseBurst(t, 0.4, d, { type: 'highpass', f0: 3000, vol: 0.5 }); },
};

export const audio = new AudioSys();
