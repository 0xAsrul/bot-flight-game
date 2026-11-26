// Sound, all synthesized with WebAudio — no audio files. The engine is a low
// sawtooth through a filter whose pitch follows the throttle; wind is filtered
// noise whose loudness follows airspeed. Created on the first user gesture.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    started = true;

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 52;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.value = 104;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineGain2 = ctx.createGain();
    engineGain2.gain.value = 0.4;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineGain2);
    engineGain2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
    engineOsc2.start();

    const noiseLen = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    noise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    noise.start();
    return true;
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  return {
    /** Call from a user gesture (key/click) to unlock sound. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') void ctx.resume();
    },
    /** Per-frame: throttle 0..1, speed in knots, true while airborne. */
    update(throttle, speedKts, flying) {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      const target = flying ? 0.05 + throttle * 0.075 : 0.0;
      engineGain.gain.setTargetAtTime(target, t, 0.1);
      const f = 46 + throttle * 66 + speedKts * 0.12;
      engineOsc.frequency.setTargetAtTime(f, t, 0.08);
      engineOsc2.frequency.setTargetAtTime(f * 2.01, t, 0.08);
      engineFilter.frequency.setTargetAtTime(320 + throttle * 900, t, 0.1);
      windGain.gain.setTargetAtTime(flying ? Math.min(0.14, speedKts * 0.0006) : 0, t, 0.15);
      windFilter.frequency.setTargetAtTime(500 + speedKts * 3.2, t, 0.15);
    },
    ring(centre) {
      tone(660, 0.16, 'sine', 0.22);
      tone(990, 0.22, 'sine', 0.2, 0.07);
      if (centre) tone(1320, 0.3, 'sine', 0.2, 0.14);
    },
    crate() {
      tone(520, 0.12, 'triangle', 0.2);
      tone(780, 0.18, 'triangle', 0.2, 0.08);
    },
    alarm() {
      tone(880, 0.14, 'square', 0.1);
      tone(880, 0.14, 'square', 0.1, 0.2);
    },
    touchdown() {
      tone(220, 0.18, 'sine', 0.25, 0, 110);
    },
    crash() {
      tone(160, 0.7, 'sawtooth', 0.3, 0, 40);
      tone(90, 0.9, 'square', 0.22, 0.05, 30);
    },
    fanfare() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, 'triangle', 0.22, i * 0.12));
    },
    click() {
      tone(1200, 0.05, 'square', 0.08);
    },
    toggleMute() {
      muted = !muted;
      if (ctx) {
        if (muted) {
          engineGain.gain.value = 0;
          windGain.gain.value = 0;
        }
      }
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
