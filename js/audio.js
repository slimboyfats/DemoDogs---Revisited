// audio.js: every sound is synthesised with Web Audio, so there are no sound files.
(function (global) {
  'use strict';
  let ac = null, master = null, noiseBuf = null, engine = null, muted = false;
  try { muted = localStorage.getItem('dd-muted') === '1'; } catch (e) { /* storage blocked */ }

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = global.AudioContext || global.webkitAudioContext; if (!AC) return;
    ac = new AC(); master = ac.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function noise(dur, freq, q, vol, type, when) {
    if (!ac) return; const t = ac.currentTime + (when || 0);
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = 0.6 + Math.random() * 0.6;
    const f = ac.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.05);
  }
  function tone(freq, dur, vol, type, slide, when) {
    if (!ac) return; const t = ac.currentTime + (when || 0);
    const o = ac.createOscillator(); o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }

  const S = {
    init: init,
    get muted() { return muted; },
    toggle: function () {
      muted = !muted; try { localStorage.setItem('dd-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
      if (master) master.gain.value = muted ? 0 : 0.55; return muted;
    },
    // engine: two detuned saws through a low-pass, pitch follows speed
    engineStart: function () {
      if (!ac || engine) return;
      const o1 = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 600; g.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(master); o1.start(); o2.start();
      engine = { o1: o1, o2: o2, f: f, g: g };
    },
    engineSet: function (speed, throttle, boost) {
      if (!engine) return; const t = ac.currentTime, rpm = 38 + speed * 0.62 + throttle * 14 + (boost ? 18 : 0);
      engine.o1.frequency.setTargetAtTime(rpm, t, 0.05); engine.o2.frequency.setTargetAtTime(rpm * 0.502, t, 0.05);
      engine.f.frequency.setTargetAtTime(300 + speed * 6 + (boost ? 900 : 0), t, 0.08);
      engine.g.gain.setTargetAtTime(0.05 + throttle * 0.05, t, 0.1);
    },
    engineStop: function () { if (!engine) return; engine.g.gain.setTargetAtTime(0, ac.currentTime, 0.05); const e = engine; setTimeout(function () { e.o1.stop(); e.o2.stop(); }, 300); engine = null; },
    crash: function (power) { const v = Math.min(0.9, 0.12 + power * 0.008); noise(0.25 + power * 0.003, 900, 0.8, v); noise(0.12, 2600, 2, v * 0.6); tone(70, 0.18, v * 0.6, 'sine', 0.5); },
    scrape: function () { noise(0.08, 3200, 3, 0.05); },
    boom: function (v) { v = v === undefined ? 1 : v; noise(0.9, 180, 0.7, 0.9 * v, 'lowpass'); noise(0.4, 900, 0.7, 0.5 * v); tone(55, 0.6, 0.6 * v, 'sine', 0.4); },
    smash: function () { [880, 660, 440, 330].forEach(function (f, i) { tone(f, 0.08, 0.12, 'square', 0.7, i * 0.04); }); noise(0.2, 1800, 1.5, 0.25); },
    pickup: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.09, 0.12, 'square', 1, i * 0.06); }); },
    fire: function () { noise(0.35, 1200, 0.6, 0.3, 'highpass'); tone(300, 0.3, 0.12, 'sawtooth', 0.3); },
    drop: function () { tone(160, 0.12, 0.2, 'square', 0.6); },
    beep: function (hi) { tone(hi ? 880 : 440, hi ? 0.5 : 0.18, 0.2, 'square'); },
    repair: function () { [392, 523, 659].forEach(function (f, i) { tone(f, 0.14, 0.12, 'triangle', 1, i * 0.08); }); },
    nitro: function () { noise(0.5, 600, 0.5, 0.2, 'lowpass'); }
  };
  global.Sound = S;
})(window);
