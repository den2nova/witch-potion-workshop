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

  // giant bottles: the liquid's own colour deepens towards the bottom, a soft glow sits in its middle and
  // a bright line marks the surface (drawn only on the filled part, under the glass and the colour marks)
  function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function richLiquid(x, g, W, H, ordered, dpr) {
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
    dg.addColorStop(0, 'rgba(255,255,255,1)');
    dg.addColorStop(0.35, 'rgba(255,255,255,1)');
    dg.addColorStop(1, `rgba(${r},${gg},${b},1)`);
    x.fillStyle = dg; x.fillRect(0, sy, W, by - sy + 2 * dpr);
    // glow: a lighter tint of the same colour (not white), so the liquid stays vivid
    x.globalCompositeOperation = 'screen';
    const lt = (c) => Math.round(c + (255 - c) * 0.35);
    const cy = sy + (by - sy) * 0.42;
    const rg = x.createRadialGradient(W / 2, cy, 0, W / 2, cy, W * 0.42);
    rg.addColorStop(0, `rgba(${lt(r)},${lt(gg)},${lt(b)},0.38)`);
    rg.addColorStop(1, `rgba(${lt(r)},${lt(gg)},${lt(b)},0)`);
    x.fillStyle = rg; x.fillRect(0, sy, W, by - sy);
    // surface line
    const sg = x.createLinearGradient(0, sy, 0, sy + 12 * dpr);
    sg.addColorStop(0, 'rgba(255,248,225,0.85)');
    sg.addColorStop(0.3, `rgba(${lt(r)},${lt(gg)},${lt(b)},0.35)`);
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = sg; x.fillRect(0, sy, W, 12 * dpr);
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
      if (opts.rich && !angle) richLiquid(x, g, W, H, ordered, dpr);
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
          } else if (s.mark && !s.ghost) {
            x.font = `700 ${fs * 0.9}px "Zen Maru Gothic", sans-serif`;
            x.textAlign = 'center'; x.textBaseline = 'middle';
            x.fillStyle = 'rgba(255,255,255,0.85)';
            x.strokeStyle = 'rgba(0,0,0,0.45)';
            x.lineWidth = 2 * dpr;
            x.strokeText(s.mark, cx, my);
            x.fillText(s.mark, cx, my);
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
