/* 魔女のポーション工房 — synthesized sound effects and music-box BGM (Web Audio, no audio files) */
(function (root) {
  'use strict';
  const A = { ctx: null, se: null, bgm: null, seVol: 0.8, bgmVol: 0.6, track: null, timer: null, hidden: false };

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    try {
      A.ctx = new AC();
      A.se = A.ctx.createGain(); A.se.gain.value = A.seVol; A.se.connect(A.ctx.destination);
      A.bgm = A.ctx.createGain(); A.bgm.gain.value = A.bgmVol * 0.35; A.bgm.connect(A.ctx.destination);
      A.noiseBuf = A.ctx.createBuffer(1, A.ctx.sampleRate, A.ctx.sampleRate);
      const d = A.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { A.ctx = null; }
  };
  A.setVolumes = function (se, bgm) {
    A.seVol = se / 100; A.bgmVol = bgm / 100;
    if (A.se) A.se.gain.value = A.seVol;
    if (A.bgm) A.bgm.gain.setTargetAtTime(A.bgmVol * 0.35, A.ctx.currentTime, 0.1);
  };

  function tone(freq, t0, dur, type, vol, dest, attack) {
    const c = A.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || A.se);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }
  function noise(t0, dur, freq, q, vol, sweepTo) {
    const c = A.ctx;
    const s = c.createBufferSource(); s.buffer = A.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.04);
    g.gain.setValueAtTime(vol, t0 + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(A.se);
    s.start(t0); s.stop(t0 + dur + 0.05);
  }

  const SFX = {
    select() { const t = A.ctx.currentTime; tone(2100, t, 0.09, 'sine', 0.25); tone(3150, t, 0.06, 'sine', 0.08); },
    pour(n) {
      const t = A.ctx.currentTime; const d = 0.25 + 0.12 * (n || 1);
      noise(t, d, 900, 1.2, 0.18, 500);
      for (let i = 0; i < 3 + n * 2; i++) tone(500 + Math.random() * 700, t + Math.random() * d, 0.06, 'sine', 0.08);
    },
    pourDeep(n) {
      const t = A.ctx.currentTime; const d = 0.4 + 0.12 * (n || 1);
      noise(t, d, 420, 1.0, 0.2, 260);
      for (let i = 0; i < 4 + n * 2; i++) tone(260 + Math.random() * 380, t + Math.random() * d, 0.09, 'sine', 0.1);
    },
    error() { const t = A.ctx.currentTime; tone(220, t, 0.14, 'square', 0.08); tone(180, t + 0.07, 0.14, 'square', 0.07); },
    cork() {
      const t = A.ctx.currentTime;
      const o = tone(700, t, 0.12, 'sine', 0.35); o.frequency.exponentialRampToValueAtTime(160, t + 0.1);
      noise(t + 0.12, 0.12, 300, 0.8, 0.12);
    },
    chime() { const t = A.ctx.currentTime; [1318, 1760, 2637].forEach((f, i) => tone(f, t + i * 0.06, 0.6, 'sine', 0.14)); },
    reveal() { const t = A.ctx.currentTime; tone(2637, t, 0.5, 'sine', 0.12); tone(3520, t + 0.08, 0.5, 'sine', 0.08); },
    curtain() { const t = A.ctx.currentTime; noise(t, 0.6, 2500, 0.6, 0.1, 900); },
    coin() { const t = A.ctx.currentTime; tone(1568, t, 0.1, 'square', 0.06); tone(2093, t + 0.07, 0.25, 'square', 0.06); },
    fanfare() {
      const t = A.ctx.currentTime;
      [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.11, 0.5, 'triangle', 0.16));
      [262, 330, 392].forEach((f) => tone(f, t + 0.66, 1.0, 'sine', 0.1));
    },
    magic() {
      const t = A.ctx.currentTime;
      for (let i = 0; i < 12; i++) tone(880 * Math.pow(2, i / 7), t + i * 0.07, 0.6, 'sine', 0.08);
      noise(t, 1.2, 4000, 0.7, 0.05, 8000);
    },
    swish(speed) { const t = A.ctx.currentTime; noise(t, 0.12, 1400 + speed * 1200, 0.9, Math.min(0.08, 0.02 + speed * 0.04)); },
    sparkle() { const t = A.ctx.currentTime; tone(3136, t, 0.25, 'sine', 0.1); tone(4186, t + 0.05, 0.3, 'sine', 0.07); },
    bump() { const t = A.ctx.currentTime; const o = tone(160, t, 0.3, 'sine', 0.35); o.frequency.exponentialRampToValueAtTime(50, t + 0.3); },
    flap() { const t = A.ctx.currentTime; noise(t, 0.08, 700, 1.5, 0.08); },
    tap() { const t = A.ctx.currentTime; tone(1200, t, 0.05, 'sine', 0.12); },
  };
  A.play = function (name, arg) {
    if (!A.ctx || A.seVol <= 0) return;
    try { SFX[name] && SFX[name](arg); } catch (e) { /* ignore */ }
  };

  // ---- music box BGM: three moods, looped phrases on a pentatonic scale ----
  const TRACKS = {
    home: { bpm: 72, root: 60, scale: [0, 2, 4, 7, 9, 12, 14, 16], chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], wave: 'sine' },
    mini: { bpm: 118, root: 62, scale: [0, 2, 4, 7, 9, 12, 14, 16], chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], wave: 'triangle' },
    mystic: { bpm: 64, root: 57, scale: [0, 2, 3, 7, 8, 12, 14, 15], chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]], wave: 'sine' },
  };
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function musicBox(freq, t, dur, vol, wave) {
    const c = A.ctx;
    const o = c.createOscillator(); const o2 = c.createOscillator();
    const g = c.createGain();
    o.type = wave; o2.type = 'sine';
    o.frequency.value = freq; o2.frequency.value = freq * 3.01;
    const g2 = c.createGain(); g2.gain.value = 0.12;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(A.bgm);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  let seq = null;
  function schedule() {
    if (!A.ctx || !seq) return;
    const T = TRACKS[seq.name];
    const beat = 60 / T.bpm / 2;
    while (seq.next < A.ctx.currentTime + 0.6) {
      const step = seq.step;
      const bar = Math.floor(step / 8) % T.chords.length;
      const chord = T.chords[bar];
      const t = seq.next;
      if (step % 8 === 0) chord.forEach((n) => musicBox(midi(T.root - 12 + n), t, beat * 7, 0.05, 'sine'));
      // melody: deterministic pseudo-random walk per phrase
      const r = Math.sin(step * 12.9898 + seq.seed) * 43758.5453;
      const rnd = r - Math.floor(r);
      if (rnd < (seq.name === 'mini' ? 0.8 : 0.62)) {
        const idx = Math.floor(rnd * 997) % T.scale.length;
        const note = T.root + T.scale[idx] + (step % 16 < 8 ? 0 : (chord[0] > 3 ? 0 : 0));
        musicBox(midi(note), t, beat * 3, 0.07, T.wave);
      }
      seq.step = (step + 1) % (8 * T.chords.length * 4);
      seq.next += beat;
    }
  }
  A.music = function (name) {
    if (!A.ctx) return;
    if (seq && seq.name === name) return;
    A.bgm.gain.setTargetAtTime(0.0001, A.ctx.currentTime, 0.15);
    setTimeout(() => {
      seq = name ? { name, step: 0, next: A.ctx.currentTime + 0.05, seed: name.length * 7.1 } : null;
      if (name) A.bgm.gain.setTargetAtTime(A.bgmVol * 0.35, A.ctx.currentTime, 0.2);
    }, 500);
    if (!A.timer) A.timer = setInterval(() => { if (!A.hidden) schedule(); }, 150);
  };
  document.addEventListener('visibilitychange', () => {
    A.hidden = document.hidden;
    if (!A.ctx) return;
    if (document.hidden) A.bgm.gain.setTargetAtTime(0.0001, A.ctx.currentTime, 0.05);
    else {
      if (seq) seq.next = A.ctx.currentTime + 0.1;
      A.bgm.gain.setTargetAtTime(A.bgmVol * 0.35, A.ctx.currentTime, 0.2);
    }
  });

  A.vibrate = function (ms) {
    try { if (root.navigator && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ }
  };

  root.Sound = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
