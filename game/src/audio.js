// SIRENA CITY — every sound is synthesised with WebAudio: no audio files.
// A lazy AudioContext (browsers demand a user gesture first), a two-oscillator
// engine whose pitch follows the player's speed, a siren whose volume follows
// the nearest police car, one-shot effects, and a slow minor-key bass loop.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let bassTimer = null;
  let bassStep = 0;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  function noise(dur, vol, freq) {
    if (!ctx || muted) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(master);
    src.start();
  }

  // A slow Am–F–C–G bassline, one note every 240 ms, very quiet under the game.
  const BASS = [55, 55, 65.4, 55, 43.7, 43.7, 49, 43.7, 65.4, 65.4, 73.4, 65.4, 49, 49, 55, 61.7];
  function bassLoop() {
    if (!ctx) return;
    const step = () => {
      if (!muted && ctx.state === 'running') {
        tone(BASS[bassStep % BASS.length], 0.22, 'triangle', 0.055);
      }
      bassStep += 1;
      bassTimer = setTimeout(step, 240);
    };
    step();
  }

  return {
    /** Call from a click or keypress: unlocks audio and starts engine, siren and music beds. */
    unlock() {
      if (!ensure()) return;
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineGain = ctx.createGain();
        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 50;
        engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        engineOsc.connect(filter).connect(engineGain).connect(master);
        engineOsc.start();
      }
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenGain = ctx.createGain();
        sirenOsc.type = 'triangle';
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain).connect(master);
        sirenOsc.start();
      }
      if (bassTimer === null) bassLoop();
    },
    /** speedRatio 0..1 for the car the player drives; null when on foot. */
    engine(speedRatio) {
      if (!ctx || !engineOsc) return;
      const target = speedRatio === null ? 0 : 0.028 + Math.abs(speedRatio) * 0.05;
      engineGain.gain.setTargetAtTime(muted ? 0 : target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(48 + Math.abs(speedRatio || 0) * 130, ctx.currentTime, 0.08);
    },
    /** closeness 0..1 of the nearest police car. */
    siren(closeness, time) {
      if (!ctx || !sirenOsc) return;
      const vol = muted ? 0 : closeness * 0.05;
      sirenGain.gain.setTargetAtTime(vol, ctx.currentTime, 0.1);
      sirenOsc.frequency.setTargetAtTime(closeness > 0.02 ? 660 + Math.sin(time * 5.2) * 190 : 0, ctx.currentTime, 0.05);
    },
    shot() { noise(0.13, 0.5, 2600); tone(140, 0.08, 'square', 0.16, 50); },
    dryFire() { tone(1200, 0.04, 'square', 0.08); },
    reload() { tone(500, 0.05, 'square', 0.1); setTimeout(() => tone(750, 0.05, 'square', 0.1), 130); },
    crash(intensity) { noise(0.22, Math.min(0.6, 0.15 + intensity * 0.5), 700); },
    thud() { noise(0.1, 0.25, 300); },
    pickup() { tone(880, 0.09, 'sine', 0.18); setTimeout(() => tone(1320, 0.12, 'sine', 0.16), 70); },
    cash() { tone(990, 0.07, 'square', 0.1); setTimeout(() => tone(1480, 0.1, 'square', 0.09), 60); },
    jingle() {
      if (!ctx || muted) return;
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.16), i * 110));
    },
    sting() {
      if (!ctx || muted) return;
      [392, 370, 349, 311].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.1), i * 150));
    },
    splash() { noise(0.35, 0.3, 900); },
    door() { tone(180, 0.07, 'square', 0.12, 90); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() { return muted; },
  };
}
