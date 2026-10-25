// Procedural soundtrack: a step sequencer with per-area themes (koto, shakuhachi,
// taiko, synth layers) plus looping ambience beds. All synthesised live.
import { audio, AudioSys } from './Audio';
import { Rng } from '../core/util';

const SCALES = {
  insen: [0, 1, 5, 7, 10],
  hirajoshi: [0, 2, 3, 7, 8],
  yo: [0, 2, 5, 7, 9],
  minor: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
};

interface Theme {
  bpm: number;
  root: number;
  scale: number[];
  prog: number[];
  seed: number;
  pad?: number;           // volume
  padType?: OscillatorType;
  padCutoff?: number;
  bass?: { pat: string; vol: number; type?: OscillatorType };
  koto?: { vol: number; density: number; oct: number; tremolo?: boolean };
  flute?: { vol: number; density: number; oct: number };
  arp?: { vol: number; pat: string; oct: number; type?: OscillatorType };
  bell?: { vol: number; pat: string };
  choir?: number;
  drums?: { kick?: string; snare?: string; hat?: string; taiko?: string; taikoHi?: string; vol: number };
}

const T: Record<string, Theme> = {
  title: { bpm: 68, root: 50, scale: SCALES.insen, prog: [0, 0, 3, 2], seed: 3, pad: 0.12, padCutoff: 900, bass: { pat: 'x...............', vol: 0.25 }, koto: { vol: 0.35, density: 0.35, oct: 1 }, bell: { vol: 0.12, pat: '........x.......' } },
  hub: { bpm: 88, root: 53, scale: SCALES.yo, prog: [0, 3, 4, 0, 0, 3, 1, 4], seed: 11, pad: 0.07, padCutoff: 1400, bass: { pat: 'x.......x.......', vol: 0.22 }, koto: { vol: 0.32, density: 0.55, oct: 1 }, flute: { vol: 0.13, density: 0.3, oct: 2 }, drums: { hat: '..x...x...x...x.', taiko: 'x...............', vol: 0.5 } },
  sugisawa: { bpm: 96, root: 45, scale: SCALES.minor, prog: [0, 0, 5, 4, 0, 0, 3, 4], seed: 21, pad: 0.08, padType: 'sawtooth', padCutoff: 700, bass: { pat: 'x..x..x.x..x..x.', vol: 0.22 }, arp: { vol: 0.07, pat: 'x.x.x.x.x.x.x.x.', oct: 1, type: 'square' }, koto: { vol: 0.2, density: 0.25, oct: 1 }, drums: { kick: 'x.......x.......', hat: '..x...x...x...x.', vol: 0.45 } },
  eishu: { bpm: 64, root: 38, scale: SCALES.insen, prog: [0, 1, 0, 3], seed: 31, pad: 0.12, padType: 'sawtooth', padCutoff: 500, bass: { pat: 'x...............', vol: 0.3 }, bell: { vol: 0.08, pat: '....x.......x...' }, koto: { vol: 0.18, density: 0.15, oct: 0 }, drums: { taiko: 'x..x............', vol: 0.6 } },
  kawasaki: { bpm: 104, root: 40, scale: SCALES.phrygian, prog: [0, 1, 0, 6], seed: 41, pad: 0.07, padType: 'sawtooth', padCutoff: 800, bass: { pat: 'xx.xx.xx.xx.x.x.', vol: 0.2, type: 'sawtooth' }, arp: { vol: 0.06, pat: 'x..x..x..x..x.x.', oct: 2, type: 'triangle' }, flute: { vol: 0.1, density: 0.2, oct: 2 }, drums: { kick: 'x...x...x...x...', hat: '..x...x...x...xx', vol: 0.4 } },
  sewer: { bpm: 72, root: 36, scale: SCALES.phrygian, prog: [0, 1, 0, 1], seed: 51, pad: 0.12, padType: 'sawtooth', padCutoff: 400, bass: { pat: 'x.......x.......', vol: 0.3 }, bell: { vol: 0.06, pat: '..x.........x...' }, drums: { taiko: 'x.....x.........', vol: 0.5 } },
  kyoto: { bpm: 100, root: 43, scale: SCALES.insen, prog: [0, 0, 3, 4, 0, 0, 2, 4], seed: 61, pad: 0.06, padCutoff: 1200, bass: { pat: 'x.....x.x.......', vol: 0.22 }, koto: { vol: 0.3, density: 0.6, oct: 1 }, flute: { vol: 0.16, density: 0.35, oct: 2 }, drums: { taiko: 'x.....x.x...x...', taikoHi: '....x.......x.x.', vol: 0.55 } },
  shibuya: { bpm: 132, root: 37, scale: SCALES.minor, prog: [0, 5, 3, 4], seed: 71, pad: 0.07, padType: 'sawtooth', padCutoff: 1100, bass: { pat: 'x.xxx.xxx.xxx.xx', vol: 0.18, type: 'sawtooth' }, arp: { vol: 0.07, pat: 'xxxxxxxxxxxxxxxx', oct: 2, type: 'square' }, koto: { vol: 0.16, density: 0.3, oct: 2 }, drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', vol: 0.5 } },
  boss: { bpm: 148, root: 38, scale: SCALES.phrygian, prog: [0, 1, 0, 6, 0, 1, 3, 1], seed: 81, pad: 0.07, padType: 'sawtooth', padCutoff: 1400, bass: { pat: 'x.xx.xx.x.xx.xxx', vol: 0.22, type: 'sawtooth' }, koto: { vol: 0.22, density: 0.7, oct: 1, tremolo: true }, arp: { vol: 0.05, pat: 'x.x.x.x.x.x.x.x.', oct: 2, type: 'sawtooth' }, drums: { kick: 'x..x..x.x..x..x.', snare: '....x.......x...', taiko: 'x.....x.x.....x.', taikoHi: '..x.......x.....', hat: 'x.x.x.x.x.x.x.x.', vol: 0.55 } },
  finalBoss: { bpm: 156, root: 36, scale: SCALES.insen, prog: [0, 1, 0, 3, 0, 1, 4, 3], seed: 91, pad: 0.06, padType: 'sawtooth', padCutoff: 1600, choir: 0.1, bass: { pat: 'x.xx.xx.x.xx.xxx', vol: 0.24, type: 'sawtooth' }, koto: { vol: 0.22, density: 0.75, oct: 1, tremolo: true }, drums: { kick: 'x..x..x.x..x..x.', snare: '....x.......x..x', taiko: 'x.x...x.x.x...x.', hat: 'xxxxxxxxxxxxxxxx', vol: 0.55 } },
  domain: { bpm: 60, root: 40, scale: SCALES.insen, prog: [0, 1], seed: 101, pad: 0.1, padCutoff: 600, choir: 0.14, bell: { vol: 0.12, pat: 'x.......x.......' } },
  victory: { bpm: 96, root: 53, scale: SCALES.yo, prog: [0, 3, 4, 0], seed: 111, pad: 0.08, koto: { vol: 0.35, density: 0.7, oct: 1 }, flute: { vol: 0.14, density: 0.4, oct: 2 }, drums: { taiko: 'x.......x.......', vol: 0.5 } },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Sequencer {
  theme: Theme;
  name: string;
  out: GainNode;
  step = 0;
  bar = 0;
  next = 0;
  private melody: (number | null)[] = [];
  private melody2: (number | null)[] = [];
  private rng: Rng;
  private a: AudioSys;
  stopped = false;

  constructor(a: AudioSys, name: string, theme: Theme, fadeIn: number) {
    this.a = a;
    this.name = name;
    this.theme = theme;
    this.rng = new Rng(theme.seed);
    this.out = a.ctx!.createGain();
    this.out.gain.setValueAtTime(0.0001, a.now);
    this.out.gain.exponentialRampToValueAtTime(1, a.now + Math.max(0.05, fadeIn));
    this.out.connect(a.musicBus);
    const rev = a.ctx!.createGain();
    rev.gain.value = 0.35;
    this.out.connect(rev);
    rev.connect(a.reverbSend);
    this.next = a.now + 0.1;
    this.melody = this.compose(theme.koto?.density ?? 0.4);
    this.melody2 = this.compose(theme.flute?.density ?? 0.3, 8);
  }

  /** Compose a 4-bar (64 step) phrase on scale degrees, reused with variation. */
  private compose(density: number, stepLen = 2) {
    const n = 64;
    const out: (number | null)[] = new Array(n).fill(null);
    let deg = this.rng.int(0, 4);
    for (let i = 0; i < n; i += stepLen) {
      const strong = i % 8 === 0;
      if (this.rng.next() < density || strong && this.rng.next() < 0.8) {
        deg += this.rng.pick([-2, -1, -1, 0, 1, 1, 2, 3]);
        deg = Math.max(-2, Math.min(9, deg));
        out[i] = deg;
      }
    }
    // cadence: land on root at the end of the phrase
    out[56] = 0;
    return out;
  }

  stop(fade: number) {
    this.stopped = true;
    const t = this.a.now;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), t);
    this.out.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => this.out.disconnect(), (fade + 0.5) * 1000);
  }

  noteFreq(deg: number, octave: number) {
    const sc = this.theme.scale;
    const n = sc.length;
    const o = Math.floor(deg / n);
    const d = ((deg % n) + n) % n;
    return mtof(this.theme.root + 12 * (octave + o) + sc[d]);
  }

  tick() {
    if (this.stopped) return;
    const a = this.a;
    const spb = 60 / this.theme.bpm / 4; // seconds per 16th
    while (this.next < a.now + 0.15) {
      this.schedule(this.next, spb);
      this.next += spb;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  private schedule(t: number, spb: number) {
    const th = this.theme;
    const a = this.a;
    const s = this.step;
    const chordDeg = th.prog[this.bar % th.prog.length];
    const phraseStep = (this.bar % 4) * 16 + s;
    const variation = Math.floor(this.bar / 4) % 4; // A A' B A
    // pad at bar start
    if (s === 0 && th.pad) {
      const freqs = [0, 2, 4].map(k => this.noteFreq(chordDeg + k, 0));
      this.pad(t, freqs, spb * 16, th.pad, th.padType ?? 'triangle', th.padCutoff ?? 1000);
    }
    if (s === 0 && th.choir) this.choir(t, [0, 2, 4].map(k => this.noteFreq(chordDeg + k, 1)), spb * 16, th.choir);
    if (th.bass && th.bass.pat[s] === 'x') this.bass(t, this.noteFreq(chordDeg, -1), spb * 2, th.bass.vol, th.bass.type ?? 'triangle');
    if (th.arp && th.arp.pat[s] === 'x') {
      const k = [0, 2, 4, 2, 5, 4, 2, 0][s % 8];
      this.arp(t, this.noteFreq(chordDeg + k, th.arp.oct), spb * 0.9, th.arp.vol, th.arp.type ?? 'square');
    }
    if (th.bell && th.bell.pat[s] === 'x') a.fm(t, this.noteFreq(chordDeg + 4, 2), 3.5, 2, 2.5, this.out, th.bell.vol);
    if (th.koto) {
      let deg = this.melody[phraseStep];
      if (variation === 2 && deg !== null) deg += 2;
      if (variation === 1 && deg !== null && s % 4 === 0) deg -= 1;
      if (deg !== null && deg !== undefined) {
        const f = this.noteFreq(deg + chordDeg * 0, th.koto.oct);
        a.pluck(t, f, this.out, th.koto.vol, 0.62, 1.4);
        if (th.koto.tremolo) a.pluck(t + spb, f, this.out, th.koto.vol * 0.6, 0.62, 0.8);
      }
    }
    if (th.flute && variation !== 0) {
      const deg = this.melody2[phraseStep];
      if (deg !== null && deg !== undefined) this.flute(t, this.noteFreq(deg, th.flute.oct), spb * 6, th.flute.vol);
    }
    const dr = th.drums;
    if (dr) {
      if (dr.kick?.[s] === 'x') this.kick(t, dr.vol);
      if (dr.snare?.[s] === 'x') this.snare(t, dr.vol);
      if (dr.hat?.[s] === 'x') this.hat(t, dr.vol * (s % 4 === 2 ? 1 : 0.6));
      if (dr.taiko?.[s] === 'x') this.taiko(t, dr.vol, 1);
      if (dr.taikoHi?.[s] === 'x') this.taiko(t, dr.vol * 0.7, 1.8);
    }
  }

  // ---- instruments ----
  private pad(t: number, freqs: number[], dur: number, vol: number, type: OscillatorType, cutoff: number) {
    const ctx = this.a.ctx!;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.setValueAtTime(vol, t + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.1);
    f.connect(g); g.connect(this.out);
    for (const fr of freqs) for (const det of [-6, 6]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = fr; o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur * 1.15);
    }
  }
  private choir(t: number, freqs: number[], dur: number, vol: number) {
    const ctx = this.a.ctx!;
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 800; f1.Q.value = 3;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.05);
    f1.connect(g); f2.connect(g); g.connect(this.out);
    for (const fr of freqs) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5 + Math.random(); const lg = ctx.createGain(); lg.gain.value = fr * 0.008;
      lfo.connect(lg); lg.connect(o.frequency);
      o.connect(f1); o.connect(f2);
      o.start(t); lfo.start(t); o.stop(t + dur * 1.1); lfo.stop(t + dur * 1.1);
    }
  }
  private bass(t: number, f: number, dur: number, vol: number, type: OscillatorType) {
    const ctx = this.a.ctx!;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = f / 2;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(type === 'sawtooth' ? 900 : 600, t); fl.frequency.exponentialRampToValueAtTime(200, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); sub.connect(fl); fl.connect(g); g.connect(this.out);
    o.start(t); sub.start(t); o.stop(t + dur + 0.05); sub.stop(t + dur + 0.05);
  }
  private arp(t: number, f: number, dur: number, vol: number, type: OscillatorType) {
    const ctx = this.a.ctx!;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(3500, t); fl.frequency.exponentialRampToValueAtTime(500, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + dur + 0.05);
  }
  private flute(t: number, f: number, dur: number, vol: number) {
    const ctx = this.a.ctx!;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 0.97, t); o.frequency.linearRampToValueAtTime(f, t + 0.08);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2; const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.012, t + dur * 0.5);
    lfo.connect(lg); lg.connect(o.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.09); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    this.a.noiseBurst(t, Math.min(0.4, dur), this.out, { type: 'bandpass', f0: f * 2, q: 6, vol: vol * 0.5, attack: 0.05 });
  }
  private kick(t: number, vol: number) { this.a.osc('sine', 150, 40, t, 0.25, this.out, 0.9 * vol); }
  private snare(t: number, vol: number) {
    this.a.noiseBurst(t, 0.15, this.out, { type: 'highpass', f0: 1500, vol: 0.45 * vol });
    this.a.osc('triangle', 220, 160, t, 0.1, this.out, 0.3 * vol);
  }
  private hat(t: number, vol: number) { this.a.noiseBurst(t, 0.04, this.out, { type: 'highpass', f0: 7000, vol: 0.18 * vol }); }
  private taiko(t: number, vol: number, pitch: number) {
    this.a.osc('sine', 110 * pitch, 50 * pitch, t, 0.45, this.out, 0.85 * vol);
    this.a.noiseBurst(t, 0.08, this.out, { type: 'lowpass', f0: 900 * pitch, vol: 0.4 * vol });
  }
}

// ---------------------------------------------------------------------------
// Ambience
// ---------------------------------------------------------------------------

export type AmbLayer = 'rain' | 'wind' | 'crickets' | 'city' | 'drips' | 'birds' | 'crowd' | 'fire' | 'hum' | 'leaves';

class Ambience {
  nodes: AudioNode[] = [];
  sources: AudioScheduledSourceNode[] = [];
  out: GainNode;
  timer: number | null = null;
  layers: AmbLayer[];
  constructor(private a: AudioSys, layers: AmbLayer[]) {
    this.layers = layers;
    const ctx = a.ctx!;
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0.0001, a.now);
    this.out.gain.exponentialRampToValueAtTime(1, a.now + 2);
    this.out.connect(a.ambBus);
    for (const l of layers) this.bed(l);
    this.timer = window.setInterval(() => this.events(), 250);
  }
  private loopNoise(type: BiquadFilterType, freq: number, q: number, vol: number, pink = true, lfoRate = 0, lfoDepth = 0) {
    const ctx = this.a.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = pink ? this.a.pink : this.a.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.out);
    if (lfoRate) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = lfoRate;
      const lg = ctx.createGain(); lg.gain.value = lfoDepth;
      lfo.connect(lg); lg.connect(f.frequency);
      lfo.start(); this.sources.push(lfo);
    }
    src.start(0, Math.random());
    this.sources.push(src);
    this.nodes.push(f, g);
  }
  private bed(l: AmbLayer) {
    switch (l) {
      case 'rain': this.loopNoise('lowpass', 3500, 0.5, 0.35, false); this.loopNoise('bandpass', 900, 0.7, 0.25, true); break;
      case 'wind': this.loopNoise('bandpass', 500, 2.5, 0.35, true, 0.08, 300); break;
      case 'city': this.loopNoise('lowpass', 220, 0.8, 0.5, true); this.loopNoise('bandpass', 1200, 1, 0.05, true, 0.05, 400); break;
      case 'crowd': this.loopNoise('bandpass', 700, 1.4, 0.35, true, 0.7, 250); this.loopNoise('bandpass', 1500, 2, 0.12, true, 1.1, 400); break;
      case 'fire': this.loopNoise('lowpass', 600, 0.6, 0.35, true, 0.3, 150); break;
      case 'hum': {
        const ctx = this.a.ctx!;
        for (const f of [50, 100.5]) {
          const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0.04;
          o.connect(g); g.connect(this.out); o.start(); this.sources.push(o); this.nodes.push(g);
        }
        break;
      }
      case 'leaves': this.loopNoise('highpass', 3000, 0.5, 0.06, true, 0.12, 1500); break;
      default: break;
    }
  }
  private events() {
    const a = this.a;
    const t = a.now;
    for (const l of this.layers) {
      if (l === 'crickets' && Math.random() < 0.5) {
        const f = 4200 + Math.random() * 800;
        for (let i = 0; i < 3; i++) a.osc('sine', f, f, t + i * 0.05 + Math.random() * 0.1, 0.03, this.out, 0.02);
      }
      if (l === 'birds' && Math.random() < 0.08) {
        const f = 2000 + Math.random() * 2000;
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) a.osc('sine', f * (1 + Math.random() * 0.3), f * 1.4, t + i * 0.09, 0.07, this.out, 0.05);
      }
      if (l === 'drips' && Math.random() < 0.15) {
        const f = 800 + Math.random() * 1200;
        a.osc('sine', f, f * 2.2, t + Math.random() * 0.2, 0.06, this.out, 0.12);
      }
      if (l === 'rain' && Math.random() < 0.6) a.noiseBurst(t + Math.random() * 0.25, 0.02, this.out, { type: 'bandpass', f0: 2500 + Math.random() * 3000, q: 4, vol: 0.08 });
      if (l === 'city' && Math.random() < 0.01) { const f = 380 + Math.random() * 60; a.osc('square', f, f, t, 0.35, this.out, 0.02); a.osc('square', f * 1.26, f * 1.26, t, 0.35, this.out, 0.015); }
      if (l === 'fire' && Math.random() < 0.6) a.noiseBurst(t + Math.random() * 0.25, 0.015, this.out, { type: 'highpass', f0: 2500, vol: 0.12 });
      if (l === 'wind' && Math.random() < 0.01) a.noiseBurst(t, 2.5, this.out, { type: 'bandpass', f0: 300, f1: 900, q: 3, vol: 0.12, attack: 1.2, pink: true });
    }
  }
  stop() {
    const t = this.a.now;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), t);
    this.out.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    if (this.timer) clearInterval(this.timer);
    setTimeout(() => { for (const s of this.sources) try { s.stop(); } catch { /* already stopped */ } this.out.disconnect(); }, 1800);
  }
}

class MusicPlayer {
  private seq: Sequencer | null = null;
  private amb: Ambience | null = null;
  private timer: number | null = null;
  current = '';
  private ambKey = '';
  /** stack so a domain/boss track can return to the area theme */
  private stack: string[] = [];

  play(name: string, fade = 1.5) {
    if (!audio.ctx) { this.current = name; return; }
    if (name === this.current && this.seq && !this.seq.stopped) return;
    const th = T[name];
    if (!th) return;
    this.seq?.stop(fade);
    this.seq = new Sequencer(audio, name, th, fade);
    this.current = name;
    if (!this.timer) this.timer = window.setInterval(() => this.seq?.tick(), 25);
  }

  push(name: string) { this.stack.push(this.current); this.play(name, 0.6); }
  pop() { const n = this.stack.pop(); if (n) this.play(n, 1.2); }
  clearStack() { this.stack = []; }

  ambience(layers: AmbLayer[]) {
    const key = layers.join(',');
    if (!audio.ctx) { this.ambKey = ''; this.pendingAmb = layers; return; }
    if (key === this.ambKey) return;
    this.amb?.stop();
    this.amb = layers.length ? new Ambience(audio, layers) : null;
    this.ambKey = key;
  }
  pendingAmb: AmbLayer[] | null = null;

  /** Called after the audio context unlocks to start anything requested before. */
  resume() {
    if (this.current && (!this.seq || this.seq.stopped)) { const c = this.current; this.current = ''; this.play(c); }
    if (this.pendingAmb) { const p = this.pendingAmb; this.pendingAmb = null; this.ambience(p); }
  }

  stop() { this.seq?.stop(1); this.seq = null; this.current = ''; }
}

export const music = new MusicPlayer();
