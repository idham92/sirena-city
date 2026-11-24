// audio.js — every sound in Sirena City is synthesized with WebAudio.
// No audio files: an engine hum that follows the throttle, a two-tone
// police siren, gunshots and crashes shaped from filtered noise, pickup
// blips, a mission jingle, and a slow minor-key bass loop under it all.
// The context wakes on the first user gesture, as browsers require; in
// Node (the smoke test) every method is a quiet no-op.

const BASS_LINE = [55, 55, 65.41, 55, 49, 49, 73.42, 82.41]; // A1 A1 C2 A1 G1 G1 D2 E2

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineNodes = null;
    this.sirenNodes = null;
    this.musicOn = false;
    this.musicTimer = 0;
    this.bassStep = 0;
  }

  get live() {
    return typeof window !== 'undefined' && this.ctx !== null;
  }

  wake() {
    if (typeof window === 'undefined') return;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, delay = 0 } = {}) {
    if (!this.live) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, { vol = 0.3, freq = 1200, q = 0.8, delay = 0 } = {}) {
    if (!this.live) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
  }

  gunshot() {
    this.noise(0.16, { vol: 0.5, freq: 2600 });
    this.tone(150, 0.1, { type: 'square', vol: 0.18, slide: -90 });
  }

  honk() {
    this.tone(233, 0.13, { type: 'square', vol: 0.06 });
    this.tone(233, 0.18, { type: 'square', vol: 0.06, delay: 0.17 });
  }

  crash(strength = 1) {
    this.noise(0.28, { vol: 0.35 * strength, freq: 700 });
    this.tone(70, 0.22, { type: 'triangle', vol: 0.25 * strength, slide: -30 });
  }

  pickup() {
    this.tone(660, 0.09, { type: 'sine', vol: 0.22 });
    this.tone(990, 0.14, { type: 'sine', vol: 0.22, delay: 0.07 });
  }

  jingle() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', vol: 0.2, delay: i * 0.09 }));
  }

  sting() {
    this.tone(196, 0.5, { type: 'sawtooth', vol: 0.16, slide: -60 });
    this.tone(185, 0.6, { type: 'sawtooth', vol: 0.16, delay: 0.12, slide: -50 });
  }

  startEngine() {
    if (!this.live || this.engineNodes) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const sub = this.ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 27.5;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.05;
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain).connect(this.master);
    osc.start();
    sub.start();
    this.engineNodes = { osc, sub, filter, gain };
  }

  setEngine(rpm, load) {
    if (!this.live || !this.engineNodes) return;
    const t = this.ctx.currentTime;
    const f = 50 + rpm * 130;
    this.engineNodes.osc.frequency.setTargetAtTime(f, t, 0.06);
    this.engineNodes.sub.frequency.setTargetAtTime(f / 2, t, 0.06);
    this.engineNodes.filter.frequency.setTargetAtTime(280 + load * 700, t, 0.08);
    this.engineNodes.gain.gain.setTargetAtTime(0.04 + load * 0.05, t, 0.1);
  }

  stopEngine() {
    if (!this.live || !this.engineNodes) return;
    try {
      this.engineNodes.osc.stop();
      this.engineNodes.sub.stop();
    } catch { /* already stopped */ }
    this.engineNodes = null;
  }

  setSiren(on) {
    if (!this.live) return;
    if (on && !this.sirenNodes) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 700;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 0.9;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 160;
      lfo.connect(lfoGain).connect(osc.frequency);
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0;
      gain.gain.setTargetAtTime(0.035, this.ctx.currentTime, 0.4);
      osc.connect(gain).connect(this.master);
      osc.start();
      lfo.start();
      this.sirenNodes = { osc, lfo, gain };
    } else if (!on && this.sirenNodes) {
      const nodes = this.sirenNodes;
      this.sirenNodes = null;
      nodes.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
      window.setTimeout(() => {
        try { nodes.osc.stop(); nodes.lfo.stop(); } catch { /* already stopped */ }
      }, 500);
    }
  }

  // The bass loop is stepped from the game's update so it needs no timers.
  updateMusic(dt, intensity) {
    if (!this.live) return;
    if (!this.musicOn) return;
    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      this.musicTimer = 0.42;
      const f = BASS_LINE[this.bassStep % BASS_LINE.length];
      this.bassStep++;
      this.tone(f, 0.4, { type: 'triangle', vol: 0.10 + intensity * 0.05 });
      if (this.bassStep % 2 === 0) {
        this.tone(f * 2, 0.2, { type: 'sine', vol: 0.04 + intensity * 0.03 });
      }
    }
  }

  setMusic(on) {
    this.musicOn = on;
    this.musicTimer = 0;
  }
}
