/* 魔女のポーション工房 — sound: recorded effects (効果音ラボ) and BGM (こんとどぅふぇ) played through Web Audio.
   Synthesized sounds remain as a fallback while files load or if a file is missing. */
(function (root) {
  'use strict';
  const A = { ctx: null, se: null, bgm: null, seVol: 0.8, bgmVol: 0.6, hidden: false, buffers: {}, tracks: {}, current: null };

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    try {
      A.ctx = new AC();
      A.se = A.ctx.createGain(); A.se.gain.value = A.seVol; A.se.connect(A.ctx.destination);
      A.bgm = A.ctx.createGain(); A.bgm.gain.value = A.bgmVol * 0.7; A.bgm.connect(A.ctx.destination);
      A.noiseBuf = A.ctx.createBuffer(1, A.ctx.sampleRate, A.ctx.sampleRate);
      const d = A.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { A.ctx = null; return; }
    loadEffects();
  };

  const BASE = 'assets/';
  const EFFECTS = ['select', 'pour', 'pourDeep', 'error', 'cork', 'chime', 'reveal', 'curtain', 'coin', 'magic',
    'swish', 'sparkle', 'bump', 'flap', 'tap', 'letter', 'receive', 'catch'];
  function decode(buf) {
    return new Promise((resolve, reject) => {
      try {
        const p = A.ctx.decodeAudioData(buf, resolve, reject);
        if (p && p.then) p.then(resolve, reject);
      } catch (e) { reject(e); }
    });
  }
  function loadEffects() {
    EFFECTS.forEach((n) => {
      fetch(BASE + 'se/' + n + '.mp3').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
        .then(decode).then((b) => { A.buffers[n] = b; }).catch(() => {});
    });
  }
  // BGM files are stored scrambled (see tools/scramble.py) and restored here in memory
  const KEY = new TextEncoder().encode('witch-potion-workshop:bgm');
  function unscramble(ab) {
    const src = new Uint8Array(ab, 4);
    const out = new Uint8Array(src.length);
    const k = KEY.length;
    for (let i = 0; i < src.length; i++) out[i] = src[i] ^ KEY[i % k] ^ ((i * 31) & 0xff);
    return out.buffer;
  }
  function loadMusic(name) {
    if (!A.tracks[name]) {
      A.tracks[name] = fetch(BASE + 'bgm/' + name + '.bin').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
        .then((ab) => decode(unscramble(ab))).catch(() => null);
    }
    return A.tracks[name];
  }
  function playBuffer(buf, vol, opts) {
    const c = A.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    if (opts && opts.rate) src.playbackRate.value = opts.rate;
    const g = c.createGain();
    g.gain.value = vol == null ? 1 : vol;
    src.connect(g); g.connect(A.se);
    const t = c.currentTime;
    if (opts && opts.dur) {
      g.gain.setValueAtTime(g.gain.value, t + Math.max(0, opts.dur - 0.15));
      g.gain.linearRampToValueAtTime(0.0001, t + opts.dur);
      src.start(t, 0, opts.dur + 0.05);
    } else src.start(t);
    return src;
  }
  A.setVolumes = function (se, bgm) {
    A.seVol = se / 100; A.bgmVol = bgm / 100;
    if (A.se) A.se.gain.value = A.seVol;
    if (A.bgm) A.bgm.gain.setTargetAtTime(A.bgmVol * BGM_LEVEL, A.ctx.currentTime, 0.1);
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
  const SAMPLE_OPTS = {
    pour: (n) => ({ dur: 0.45 + 0.25 * (n || 1) }),
    pourDeep: (n) => ({ dur: 0.7 + 0.25 * (n || 1) }),
    swish: (speed) => ({ vol: 0.35 + 0.5 * Math.min(1, speed || 0), rate: 0.9 + 0.3 * Math.min(1, speed || 0) }),
    catch: () => ({ vol: 0.9 }),
  };
  let lastSwish = 0;
  A.play = function (name, arg) {
    if (!A.ctx || A.seVol <= 0) return;
    try {
      if (name === 'fanfare') { A.jingle('clear'); return; }
      const buf = A.buffers[name];
      if (buf) {
        if (name === 'swish') { const t = A.ctx.currentTime; if (t - lastSwish < 0.18) return; lastSwish = t; }
        const o = SAMPLE_OPTS[name] ? SAMPLE_OPTS[name](arg) : {};
        playBuffer(buf, o.vol, o);
        return;
      }
      const alias = { letter: 'tap', receive: 'coin', catch: 'select' }[name] || name;
      SFX[alias] && SFX[alias](arg);
    } catch (e) { /* ignore */ }
  };
  // short music cue over the current BGM (the BGM dips while it plays)
  A.jingle = function (name) {
    if (!A.ctx) return;
    loadMusic(name).then((buf) => {
      if (!buf) { SFX.fanfare(); return; }
      const t = A.ctx.currentTime;
      if (A.current) {
        A.bgm.gain.setTargetAtTime(A.bgmVol * 0.15, t, 0.05);
        A.bgm.gain.setTargetAtTime(A.bgmVol * BGM_LEVEL, t + buf.duration, 0.4);
      }
      playBuffer(buf, 0.9);
    });
  };

  // ---- BGM: looping tracks with a short crossfade ----
  const BGM_LEVEL = 0.7;
  A.music = function (name) {
    if (!A.ctx) return;
    if (A.current && A.current.name === name) return;
    const token = {};
    A.want = token;
    const old = A.current;
    if (old) {
      old.gain.gain.setTargetAtTime(0.0001, A.ctx.currentTime, 0.15);
      setTimeout(() => { try { old.src.stop(); } catch (e) { /* ignore */ } }, 800);
      A.current = null;
    }
    if (!name) return;
    loadMusic(name).then((buf) => {
      if (!buf || A.want !== token) return;
      const c = A.ctx;
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.setTargetAtTime(1, c.currentTime, 0.2);
      src.connect(g); g.connect(A.bgm);
      src.start();
      A.current = { name, src, gain: g };
    });
  };
  A.preloadMusic = function () { ['home', 'mini', 'mystic', 'clear'].forEach((n) => { if (A.ctx) loadMusic(n); }); };
  document.addEventListener('visibilitychange', () => {
    A.hidden = document.hidden;
    if (!A.ctx) return;
    if (document.hidden) A.bgm.gain.setTargetAtTime(0.0001, A.ctx.currentTime, 0.05);
    else {
      if (A.ctx.state === 'suspended') A.ctx.resume();
      A.bgm.gain.setTargetAtTime(A.bgmVol * BGM_LEVEL, A.ctx.currentTime, 0.2);
    }
  });

  A.vibrate = function (ms) {
    try { if (root.navigator && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ }
  };

  root.Sound = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
