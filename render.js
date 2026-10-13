/* 魔女のポーション工房 — image loading and vessel (glass + liquid) rendering */
(function (root) {
  'use strict';

  const R = {
    base: 'assets/',
    imgs: {},
    pending: {},
    shapes: null,
    sheets: null,
    dpr: 1,
    tintCache: new Map(),
  };

  R.load = function (name, file) {
    if (R.imgs[name]) return Promise.resolve(R.imgs[name]);
    if (R.pending[name]) return R.pending[name];
    const p = new Promise((resolve) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => { R.imgs[name] = im; resolve(im); };
      im.onerror = () => { resolve(null); };
      im.src = R.base + (file || name + '.webp');
    });
    R.pending[name] = p;
    return p;
  };
  R.get = (name) => R.imgs[name] || null;

  // vessel = one bottle design (back image, front image, liquid mask, geometry)
  R.loadVessel = function (key) {
    const g = R.shapes && R.shapes[key];
    return Promise.all([
      R.load(key + '_back'),
      R.load(key + '_front'),
      R.load(key + '_mask', key + '_mask.png'),
      g && g.stopperBox ? R.load(key + '_stopper') : null,
    ]).then(() => R.vessel(key));
  };
  R.vessel = function (key) {
    const g = R.shapes && R.shapes[key];
    const back = R.get(key + '_back');
    const front = R.get(key + '_front');
    const mask = R.get(key + '_mask');
    if (!g || !back || !front || !mask) return null;
    if (!g._cum) prepareGeometry(g);
    return { key, geo: g, back, front, mask, aspect: g.w / g.h, stopper: g.stopperBox ? R.get(key + '_stopper') : null };
  };

  // cumulative liquid volume from the bottom up to the fill cap
  function prepareGeometry(g) {
    const n = g.rows.length;
    const capBand = Math.floor(g.cap * n);
    const cum = new Float64Array(n + 1); // cum[i] = volume from band n-1 up to band i (bottom-up)
    let v = 0;
    cum[n] = 0;
    for (let i = n - 1; i >= 0; i--) {
      if (i >= capBand) v += g.rows[i];
      cum[i] = v;
    }
    g._cum = cum;
    g._total = v;
    g._n = n;
  }

  // y (0..1 of image height) at which the liquid surface sits for a volume fraction f (0..1)
  R.yForFraction = function (g, f) {
    if (!g._cum) prepareGeometry(g);
    const target = Math.max(0, Math.min(1, f)) * g._total;
    const n = g._n;
    const cum = g._cum;
    if (target <= 0) {
      // bottom of cavity
      return g.bottom;
    }
    for (let i = n - 1; i >= 0; i--) {
      if (cum[i] >= target) {
        const below = cum[i + 1];
        const band = cum[i] - below || 1;
        const t = (target - below) / band;
        return (i + 1 - t) / n;
      }
    }
    return g.cap;
  };

  // ---- tinted glass for colour-variant series ----
  R.tinted = function (img, variant) {
    if (!variant) return img;
    const V = root.GameData.VARIANTS[variant];
    if (!V) return img;
    const k = img.src + '|' + variant;
    if (R.tintCache.has(k)) return R.tintCache.get(k);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'color';
    x.globalAlpha = V.strength;
    if (V.tint === 'rainbow') {
      const gr = x.createLinearGradient(0, 0, c.width, c.height);
      ['#ff5a7a', '#ffb347', '#fff36b', '#6be38a', '#5ac8ff', '#8a7bff', '#e07bff'].forEach((col, i, a) => gr.addColorStop(i / (a.length - 1), col));
      x.fillStyle = gr;
    } else x.fillStyle = V.tint;
    x.fillRect(0, 0, c.width, c.height);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(img, 0, 0);
    R.tintCache.set(k, c);
    return c;
  };

  // ---- colour helpers ----
  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, f) {
    const [r, g, b] = hexToRgb(hex);
    const m = (v) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
    return `rgb(${m(r)},${m(g)},${m(b)})`;
  }
  R.shade = shade;
  R.rgba = function (hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  };

  // ---- offscreen liquid canvas pool ----
  const pool = [];
  function scratch(w, h) {
    let c = pool.pop();
    if (!c) c = document.createElement('canvas');
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    x.clearRect(0, 0, w, h);
    return c;
  }
  function release(c) { if (pool.length < 8) pool.push(c); }

  let fogPattern = null;
  function fog(ctx) {
    const im = R.get('fog_unknown');
    if (!im) return '#1a1128';
    if (!fogPattern) {
      try { fogPattern = ctx.createPattern(im, 'repeat'); } catch (e) { return '#1a1128'; }
    }
    return fogPattern;
  }

  // ---------- colour-assist marks ----------
  // The marks sit in FRONT of the glass (so painted decoration on a skin never hides them), on a dark round
  // badge with a ring in the layer's colour, centred on the liquid itself at that height (not on the mouth,
  // which is off-centre on some skins). Giant bottles also get one big badge in the middle of the cavity,
  // shown even while the bottle is nearly empty. See the spec: 色覚補助マークの表示ルール.
  function cavitySpans(v) {
    const g = v.geo;
    if (g._spans) return g._spans;
    const n = 128;
    const w = 64, h = n;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.drawImage(v.mask, 0, 0, w, h);
    let d;
    try { d = x.getImageData(0, 0, w, h).data; } catch (e) { return null; }
    // each row keeps its separate runs of liquid (e.g. a fox's body and its tail are two runs)
    const spans = [];
    for (let y = 0; y < h; y++) {
      const runs = [];
      let l = -1;
      for (let i = 0; i <= w; i++) {
        const on = i < w && d[(y * w + i) * 4 + 3] > 127;
        if (on && l < 0) l = i;
        if (!on && l >= 0) { runs.push({ c: (l + i) / 2 / w, w: (i - l) / w }); l = -1; }
      }
      spans.push(runs.length ? runs : null);
    }
    g._spans = spans;
    return spans;
  }
  // the run of liquid at that height that lies under the bottle's neck (the main body, not a tail or a handle)
  function spanAt(v, yf) {
    const sp = cavitySpans(v);
    const nx = v.geo.neckX != null ? v.geo.neckX : v.geo.mouthX;
    if (!sp) return { c: nx, w: 0.5 };
    const i = Math.max(0, Math.min(sp.length - 1, Math.floor(yf * sp.length)));
    for (let k = 0; k < sp.length; k++) {
      const runs = sp[i - k] || sp[i + k];
      if (!runs) continue;
      let best = runs[0], bd = Infinity;
      for (const r of runs) {
        const d = Math.abs(r.c - nx) - r.w / 2; // inside the run: negative
        if (d < bd) { bd = d; best = r; }
      }
      return best;
    }
    return { c: nx, w: 0.5 };
  }
  // giant bottles: the roomiest spot inside the bottle (centre of the largest circle that fits in the liquid
  // area), leaning towards the column under the neck, so the big mark sits in the body, not in a tail or ring
  function bigMarkSpot(v) {
    const g = v.geo;
    if (g._bigSpot) return g._bigSpot;
    const w = 64, h = 96;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.drawImage(v.mask, 0, 0, w, h);
    let d;
    try { d = x.getImageData(0, 0, w, h).data; } catch (e) { return { x: g.mouthX, y: (g.top + g.bottom) / 2 }; }
    const INF = 1e9, dist = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) dist[i] = d[i * 4 + 3] > 127 ? INF : 0;
    const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : dist[yy * w + xx]);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const k = yy * w + xx; if (!dist[k]) continue;
      dist[k] = Math.min(dist[k], at(xx - 1, yy) + 1, at(xx, yy - 1) + 1, at(xx - 1, yy - 1) + 1.414, at(xx + 1, yy - 1) + 1.414);
    }
    for (let yy = h - 1; yy >= 0; yy--) for (let xx = w - 1; xx >= 0; xx--) {
      const k = yy * w + xx; if (!dist[k]) continue;
      dist[k] = Math.min(dist[k], at(xx + 1, yy) + 1, at(xx, yy + 1) + 1, at(xx + 1, yy + 1) + 1.414, at(xx - 1, yy + 1) + 1.414);
    }
    // bottles whose neck is not above the body (tilted hat, crescent moon, S-shaped aurora): use the body's own centre
    const OFFSET_NECK = { giant_hat: 1, giant_moon: 1, giant_aurora: 1 };
    let cxBody = 0, cnt = 0;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (dist[yy * w + xx]) { cxBody += xx + 0.5; cnt++; }
    const nx = OFFSET_NECK[v.key] && cnt ? cxBody / cnt : (g.neckX != null ? g.neckX : g.mouthX) * w;
    // stay on the bottle's centre line (under the neck): the roomiest point along it, allowing a small sideways
    // step only when the line itself runs through a hole (ring bottles); vertical ties go to the middle of the body
    let best = null, bs = -1;
    for (const band of [0.06, 0.15, 0.3, 0.5]) {
      const x0 = Math.max(0, Math.floor(nx - band * w)), x1 = Math.min(w - 1, Math.ceil(nx + band * w));
      for (let yy = 0; yy < h; yy++) for (let xx = x0; xx <= x1; xx++) {
        const dv = dist[yy * w + xx]; if (dv < 3) continue;
        const score = Math.min(dv, 9) - Math.abs(xx + 0.5 - nx) * 0.15 - Math.abs(yy + 0.5 - h * (g.top + g.bottom) / 2) * 0.05;
        if (score > bs) { bs = score; best = { x: (xx + 0.5) / w, y: (yy + 0.5) / h }; }
      }
      if (best) break;
    }
    g._bigSpot = best || { x: g.mouthX, y: (g.top + g.bottom) / 2 };
    return g._bigSpot;
  }
  function drawBadge(ctx, x, y, r, mark, hex, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(22,12,44,0.72)';
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, r * 0.13);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(r * 1.25)}px "Zen Maru Gothic", "Segoe UI Symbol", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(mark, x, y + r * 0.06);
    ctx.restore();
  }
  function drawMarks(ctx, v, rect, segs, opts) {
    const g = v.geo;
    const a = opts.alpha != null ? opts.alpha : 1;
    // the giant's own colour, big, in the middle of the bottle
    if (opts.bigMark) {
      const c = bigMarkSpot(v);
      const r = Math.max(13, Math.min(30, rect.w * 0.1));
      drawBadge(ctx, c.x * rect.w, c.y * rect.h, r, opts.bigMark.mark, opts.bigMark.color, a * 0.85);
      return;
    }
    const list = segs.filter((s) => s.mark && !s.ghost && !s.hidden).sort((p, q) => p.f0 - q.f0);
    if (!list.length) return;
    const items = list.map((s) => {
      const y0 = R.yForFraction(g, s.f0) * rect.h;
      const y1 = R.yForFraction(g, s.f1) * rect.h;
      return { s, band: Math.abs(y0 - y1), ym: (y0 + y1) / 2 };
    });
    // one size for every mark on the board (from the bottle width, not the layer), so the columns look even and calm
    const minBand = Math.min(...items.map((it) => it.band));
    // a bottle whose layers are thin gets slightly smaller marks rather than a zig-zag
    const r = Math.max(6, Math.min(9, rect.w * 0.15, minBand * 0.5 - 0.5));
    items.forEach((it, i) => {
      const sp = spanAt(v, it.ym / rect.h);
      let x = sp.c * rect.w;
      // only when even the smallest marks would touch: step left and right in turn
      if (2 * r > minBand + 1 && items.length > 1) x += (i % 2 ? 1 : -1) * Math.min(r * 0.9, sp.w * rect.w * 0.35);
      drawBadge(ctx, x, it.ym, r, it.s.mark, it.s.color, a);
    });
  }

  // giant bottles: the liquid's own colour deepens towards the bottom, a soft glow sits in its middle and
  // a bright line marks the surface (drawn only on the filled part, under the glass and the colour marks)
  function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  const hash = (i) => { const v = Math.sin(i * 127.1) * 43758.5453; return v - Math.floor(v); };
  function richLiquid(x, g, W, H, ordered, dpr, sparkle) {
    const solid = ordered.filter((s) => !s.ghost && !s.hidden && s.color);
    if (!solid.length) return;
    const top = Math.max(...solid.map((s) => s.f1));
    const sy = R.yForFraction(g, top) * H, by = g.bottom * H;
    if (by - sy < 4) return;
    const [r, gg, b] = hexRgb(solid[0].color);
    x.save();
    x.beginPath(); x.rect(0, sy, W, H - sy); x.clip();
    // depth: multiply by the colour itself, so the lower part gets deeper and more saturated, not grey
    x.globalCompositeOperation = 'multiply';
    const dg = x.createLinearGradient(0, sy, 0, by);
    // trophies: the whole liquid is a little deeper first, so the glow and sparkles read as light, not fade
    const tint = sparkle != null ? `rgba(${255 - Math.round((255 - r) * 0.35)},${255 - Math.round((255 - gg) * 0.35)},${255 - Math.round((255 - b) * 0.35)},1)` : 'rgba(255,255,255,1)';
    dg.addColorStop(0, tint);
    dg.addColorStop(sparkle != null ? 0.1 : 0.35, tint);
    dg.addColorStop(1, `rgba(${r},${gg},${b},1)`);
    x.fillStyle = dg; x.fillRect(0, sy, W, by - sy + 2 * dpr);
    // glow: a lighter tint of the same colour (not white), so the liquid stays vivid
    x.globalCompositeOperation = 'screen';
    const lt = (c) => Math.round(c + (255 - c) * 0.35);
    const cy = sy + (by - sy) * 0.42;
    const rg = x.createRadialGradient(W / 2, cy, 0, W / 2, cy, W * 0.42);
    // small trophies are mostly "middle", so their glow stays faint to keep the colour vivid
    // trophies glow in the colour itself (not a paler tint) so the small liquid stays vivid
    const gc = sparkle != null ? [r, gg, b] : [lt(r), lt(gg), lt(b)];
    rg.addColorStop(0, `rgba(${gc[0]},${gc[1]},${gc[2]},${sparkle != null ? 0.32 : 0.38})`);
    rg.addColorStop(1, `rgba(${gc[0]},${gc[1]},${gc[2]},0)`);
    x.fillStyle = rg; x.fillRect(0, sy, W, by - sy);
    // surface line
    const sh = (sparkle != null ? 5 : 12) * dpr;
    const sg = x.createLinearGradient(0, sy, 0, sy + sh);
    sg.addColorStop(0, 'rgba(255,248,225,0.85)');
    sg.addColorStop(0.3, `rgba(${lt(r)},${lt(gg)},${lt(b)},0.35)`);
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = sg; x.fillRect(0, sy, W, sh);
    // sparkle (trophies): a warmer glow in the middle and gold stars that drift up and twinkle.
    // sparkle = time in seconds (null = no sparkle); still stars when the time does not move
    if (sparkle != null) {
      const t = sparkle;
      const gl = x.createRadialGradient(W / 2, cy, 0, W / 2, cy, W * 0.42);
      gl.addColorStop(0, 'rgba(255,215,140,0.1)');
      gl.addColorStop(1, 'rgba(255,225,160,0)');
      x.fillStyle = gl; x.fillRect(0, sy, W, by - sy);
      const span = by - sy;
      const count = Math.round(Math.min(40, Math.max(8, W * span / (dpr * dpr * 900))));
      for (let i = 0; i < count; i++) {
        const px = W * (0.12 + hash(i) * 0.76);
        const py = sy + (((hash(i + 50) * span - t * 10 * dpr * (0.5 + hash(i + 9))) % span) + span) % span;
        const a = 0.25 + Math.max(0, Math.sin(t * 2.2 + i * 1.7)) * 0.75;
        const r = (1.2 + hash(i + 20) * 2.8) * dpr * Math.max(0.6, W / (dpr * 160));
        x.fillStyle = `rgba(255,212,110,${a.toFixed(3)})`;
        x.beginPath();
        x.moveTo(px, py - r * 2); x.lineTo(px + r * 0.45, py - r * 0.45); x.lineTo(px + r * 2, py); x.lineTo(px + r * 0.45, py + r * 0.45);
        x.lineTo(px, py + r * 2); x.lineTo(px - r * 0.45, py + r * 0.45); x.lineTo(px - r * 2, py); x.lineTo(px - r * 0.45, py - r * 0.45);
        x.fill();
      }
    }
    x.restore();
  }

  /*
   * Draw a vessel into ctx.
   * rect: {x, y, w, h} in CSS px (image box).
   * segs: [{f0, f1, color, alpha, hidden, ghost, mark}] volume fractions bottom->top.
   * opts: {angle (rad, bottle tilt), pivot {x,y} in local px, wave, time, glow, variant, liquidAlpha, marks, alpha}
   */
  R.drawVessel = function (ctx, v, rect, segs, opts) {
    opts = opts || {};
    const dpr = R.dpr;
    const W = Math.max(2, Math.round(rect.w * dpr));
    const H = Math.max(2, Math.round(rect.h * dpr));
    const g = v.geo;
    const angle = opts.angle || 0;

    // liquid layer
    let liquid = null;
    if (segs && segs.length) {
      liquid = scratch(W, H);
      const x = liquid.getContext('2d');
      const cx = W * g.mouthX;
      // each segment is the band between two parallel surfaces (kept level when the bottle tilts)
      const ordered = segs.slice().sort((a, b) => b.f1 - a.f1);
      const topF = ordered[0].f1;
      const cosA = Math.cos(angle);
      ordered.forEach((s) => {
        const y = R.yForFraction(g, s.f1) * H;
        const thick = s.f0 <= 0.0001 ? H * 3 : (R.yForFraction(g, s.f0) * H - y) * cosA;
        if (thick <= 0.2) return;
        x.save();
        x.translate(cx, y);
        x.rotate(-angle);
        x.beginPath();
        const isTop = s.f1 === topF && opts.wave;
        if (isTop) {
          const amp = (opts.wave || 0) * dpr;
          const t = opts.time || 0;
          x.moveTo(-W * 2, 0);
          for (let px = -W * 2; px <= W * 2; px += 6 * dpr) {
            x.lineTo(px, Math.sin(px / (18 * dpr) + t * 4) * amp);
          }
          x.lineTo(W * 2, thick);
          x.lineTo(-W * 2, thick);
        } else {
          x.rect(-W * 2, 0, W * 4, thick);
        }
        x.closePath();
        if (s.hidden) {
          x.fillStyle = '#1a1128';
          x.fill();
          x.globalAlpha = 0.95;
          x.fillStyle = fog(x);
          x.fill();
        } else {
          x.globalAlpha = s.ghost ? 0.26 : (s.alpha != null ? s.alpha : 1);
          x.fillStyle = s.color;
          x.fill();
        }
        x.restore();
      });
      // soft shading: dark edges, bright core (only where liquid is)
      x.globalCompositeOperation = 'source-atop';
      const gr = x.createLinearGradient(W * g.silLeft, 0, W * g.silRight, 0);
      gr.addColorStop(0, 'rgba(10,0,30,0.5)');
      gr.addColorStop(0.3, 'rgba(10,0,30,0.05)');
      gr.addColorStop(0.5, 'rgba(255,255,255,0.08)');
      gr.addColorStop(0.72, 'rgba(10,0,30,0.05)');
      gr.addColorStop(1, 'rgba(10,0,30,0.55)');
      x.fillStyle = gr;
      x.fillRect(0, 0, W, H);
      if (opts.rich && !angle) richLiquid(x, g, W, H, ordered, dpr, opts.sparkle);
      // layer separation lines and marks
      if (!opts.noLines) {
        x.globalCompositeOperation = 'source-atop';
        ordered.forEach((s) => {
          if (s.f0 <= 0.0001) return;
          const y = R.yForFraction(g, s.f0) * H;
          x.save(); x.translate(cx, y); x.rotate(-angle);
          x.fillStyle = 'rgba(255,255,255,0.10)';
          x.fillRect(-W * 2, -1 * dpr, W * 4, 1.5 * dpr);
          x.restore();
        });
      }
      x.globalCompositeOperation = 'source-over';
      if (!angle) {
        ordered.forEach((s) => {
          const y0 = R.yForFraction(g, s.f0) * H;
          const y1 = R.yForFraction(g, s.f1) * H;
          const my = (y0 + y1) / 2;
          const band = Math.abs(y0 - y1);
          if (band < 10 * dpr) return;
          const fs = Math.min(band * 0.55, W * 0.34, 34 * dpr);
          if (s.hidden) {
            x.font = `700 ${fs}px "Kaisei Decol", serif`;
            x.textAlign = 'center'; x.textBaseline = 'middle';
            x.fillStyle = 'rgba(210,180,255,0.75)';
            x.fillText('?', cx, my);
          }
        });
      }
      // clip to the cavity
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(v.mask, 0, 0, W, H);
    }

    const back = R.tinted(v.back, opts.variant);
    const front = R.tinted(v.front, opts.variant);
    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    ctx.translate(rect.x, rect.y);
    if (angle) {
      const p = opts.pivot || { x: rect.w / 2, y: rect.h / 2 };
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      ctx.translate(-p.x, -p.y);
    }
    if (opts.glow) {
      ctx.save();
      ctx.shadowColor = opts.glowColor || 'rgba(255,214,120,0.95)';
      ctx.shadowBlur = 18 * (opts.glow || 1);
      ctx.drawImage(back, 0, 0, rect.w, rect.h);
      ctx.restore();
    }
    ctx.globalAlpha = (opts.alpha != null ? opts.alpha : 1) * 0.85;
    ctx.drawImage(back, 0, 0, rect.w, rect.h);
    ctx.globalAlpha = opts.alpha != null ? opts.alpha : 1;
    if (liquid) {
      ctx.drawImage(liquid, 0, 0, rect.w, rect.h);
      if (opts.shine) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = opts.shine;
        ctx.drawImage(liquid, 0, 0, rect.w, rect.h);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
      release(liquid);
    }
    // things that sit inside the glass (a cork in the neck) go under the front highlights
    if (opts.inner) {
      ctx.save();
      ctx.translate(-rect.x, -rect.y);
      opts.inner(ctx);
      ctx.restore();
    }
    ctx.drawImage(front, 0, 0, rect.w, rect.h);
    if (!angle && segs && segs.length) drawMarks(ctx, v, rect, segs, opts);
    // the bottle's own stopper (giant bottles): opts.stopper = true, or { dy, alpha } while it drops on
    if (opts.stopper && v.stopper && v.geo.stopperBox) {
      const b = v.geo.stopperBox, st = opts.stopper === true ? {} : opts.stopper;
      ctx.globalAlpha = (opts.alpha != null ? opts.alpha : 1) * (st.alpha != null ? st.alpha : 1);
      ctx.drawImage(v.stopper, b[0] * rect.w, b[1] * rect.h - (st.dy || 0), (b[2] - b[0]) * rect.w, (b[3] - b[1]) * rect.h);
    }
    ctx.restore();
  };

  // world position of a local point after the vessel transform
  R.localToWorld = function (rect, lx, ly, angle, pivot) {
    if (!angle) return { x: rect.x + lx, y: rect.y + ly };
    const px = pivot.x, py = pivot.y;
    const dx = lx - px, dy = ly - py;
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: rect.x + px + dx * c - dy * s, y: rect.y + py + dx * s + dy * c };
  };

  // fallback vessel (drawn with paths) when images are missing
  R.fallbackVessel = function () {
    if (R._fallback) return R._fallback;
    const w = 128, h = 480;
    const mk = (draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); return c; };
    const path = (x) => {
      x.beginPath();
      x.moveTo(30, 20); x.lineTo(98, 20); x.lineTo(98, 420);
      x.arc(64, 420, 34, 0, Math.PI); x.lineTo(30, 20); x.closePath();
    };
    const back = mk((x) => { path(x); x.fillStyle = 'rgba(200,220,255,0.12)'; x.fill(); });
    const front = mk((x) => { path(x); x.strokeStyle = 'rgba(230,240,255,0.8)'; x.lineWidth = 5; x.stroke(); });
    const mask = mk((x) => { x.translate(0, 0); x.beginPath(); x.moveTo(36, 40); x.lineTo(92, 40); x.lineTo(92, 420); x.arc(64, 420, 28, 0, Math.PI); x.closePath(); x.fillStyle = '#fff'; x.fill(); });
    const rows = [];
    const mc = mask.getContext('2d').getImageData(0, 0, w, h).data;
    for (let i = 0; i < 128; i++) {
      let a = 0;
      const y0 = Math.floor(i * h / 128), y1 = Math.floor((i + 1) * h / 128);
      for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) if (mc[(y * w + x) * 4 + 3] > 127) a++;
      rows.push(a);
    }
    const geo = { rows, top: 40 / h, bottom: 448 / h, cap: 40 / h, neckX: 0.5, neckW: 0.55, neckY: 20 / h, silTop: 20 / h, silBottom: 454 / h, silLeft: 30 / w, silRight: 98 / w, mouthX: 0.5, w, h };
    prepareGeometry(geo);
    R._fallback = { key: 'fallback', geo, back, front, mask, aspect: w / h };
    return R._fallback;
  };

  root.Render = R;
})(typeof globalThis !== 'undefined' ? globalThis : this);
