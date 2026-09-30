/* 魔女のポーション工房 — the puzzle board: layout, drawing, animation and input */
(function (root) {
  'use strict';
  const E = root.Engine;
  const R = root.Render;
  const GD = root.GameData;
  const Snd = root.Sound;

  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const now = () => performance.now();

  const Board = {
    canvas: null, ctx: null, W: 0, H: 0,
    s: null, lv: null, vessel: null, giant: null,
    rects: [], giantRect: null,
    selected: null, lift: [],
    anims: [], queue: [], busy: false,
    particles: [], corks: {}, curtainAnims: {}, shakes: {}, reveals: {},
    startT: 0, running: false, cache: [],
    guide: null, // tutorial: {from, to} bottle indices allowed
    hooks: {},
    reduce: false, marks: false,
    tiltSpeed: 1,
  };

  Board.init = function (canvas, hooks) {
    Board.canvas = canvas;
    Board.ctx = canvas.getContext('2d');
    Board.hooks = hooks || {};
    const ro = new ResizeObserver(() => Board.resize());
    ro.observe(canvas.parentElement);
    canvas.addEventListener('pointerdown', onPointer);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  Board.resize = function () {
    const el = Board.canvas.parentElement;
    const r = el.getBoundingClientRect();
    const dpr = Math.min(root.devicePixelRatio || 1, 2.5);
    R.dpr = dpr;
    Board.W = r.width; Board.H = r.height;
    Board.canvas.width = Math.max(1, Math.round(r.width * dpr));
    Board.canvas.height = Math.max(1, Math.round(r.height * dpr));
    Board.canvas.style.width = r.width + 'px';
    Board.canvas.style.height = r.height + 'px';
    Board.cache = [];
    if (Board.s) Board.layout();
  };

  // ---------- start / state ----------
  Board.load = function (lv, state, vessel, giantVessel) {
    Board.lv = lv;
    Board.s = state;
    Board.vessel = vessel;
    Board.giant = giantVessel;
    Board.selected = null;
    Board.anims = []; Board.queue = []; Board.busy = false;
    Board.particles = []; Board.corks = {}; Board.curtainAnims = {}; Board.shakes = {}; Board.reveals = {};
    Board.cache = [];
    Board.lift = state.bottles.map(() => 0);
    Board.startT = now();
    Board.solvedShown = false;
    Board.resize();
    Board.run();
  };

  Board.setVessel = function (v) { Board.vessel = v; Board.cache = []; Board.layout(); };

  Board.run = function () {
    if (Board.running) return;
    Board.running = true;
    const tick = () => {
      if (!Board.running) return;
      const pr = Board.canvas.parentElement;
      if (pr.clientWidth && (Math.abs(pr.clientWidth - Board.W) > 1 || Math.abs(pr.clientHeight - Board.H) > 1)) Board.resize();
      Board.draw();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  Board.stop = function () { Board.running = false; };

  // ---------- layout ----------
  function gridFit(n, aspect, x, y, w, h, maxH) {
    let best = null;
    for (let rows = 1; rows <= Math.min(4, n); rows++) {
      const per = Math.ceil(n / rows);
      const bwByW = w / (per * 1.34);
      const bhByH = (h / rows) / 1.2 - 14;
      const bh = Math.min(bwByW / aspect, bhByH, maxH || 1e9);
      if (!best || bh > best.bh + 0.5) best = { rows, per, bh };
    }
    const bh = Math.max(40, best.bh);
    const bw = bh * aspect;
    const out = [];
    const rowH = h / best.rows;
    let i = 0;
    for (let r = 0; r < best.rows; r++) {
      const count = Math.min(best.per, n - i);
      const gap = Math.min(bw * 0.34, (w - count * bw) / Math.max(1, count));
      const total = count * bw + (count - 1) * gap;
      let cx = x + (w - total) / 2;
      const cy = y + r * rowH + (rowH - bh) / 2 + 6;
      for (let k = 0; k < count; k++, i++) {
        out.push({ x: cx, y: cy, w: bw, h: bh });
        cx += bw + gap;
      }
    }
    return out;
  }

  Board.layout = function () {
    const s = Board.s;
    if (!s) return;
    const W = Board.W, H = Board.H;
    const n = s.bottles.length;
    const v = Board.vessel;
    const aspect = v.aspect;
    const pad = 10;
    Board.giantRect = null;
    if (s.giant && Board.giant) {
      const ga = Board.giant.aspect;
      if (H > W * 1.05) {
        const gh = H * 0.5;
        const gw = Math.min(gh * ga, W * 0.8);
        const gh2 = gw / ga;
        Board.giantRect = { x: (W - gw) / 2, y: pad + (gh - gh2) / 2, w: gw, h: gh2 };
        Board.rects = gridFit(n, aspect, pad, gh + pad, W - pad * 2, H - gh - pad * 2, gh2 / 2.3);
      } else {
        const gh = H - pad * 2;
        const gw = Math.min(gh * ga, W * 0.36);
        const gh2 = gw / ga;
        Board.giantRect = { x: (W - gw) / 2, y: (H - gh2) / 2, w: gw, h: gh2 };
        const side = (W - gw) / 2 - pad * 2;
        const left = Math.ceil(n / 2);
        const maxH = gh2 / 2.3;
        const L = gridFit(left, aspect, pad, pad, side, H - pad * 2, maxH);
        const Rr = gridFit(n - left, aspect, W - side - pad, pad, side, H - pad * 2, maxH);
        // match sizes on both sides
        const bh = Math.min(L[0] ? L[0].h : 1e9, Rr[0] ? Rr[0].h : 1e9);
        const fix = (arr, x0) => {
          const again = gridFit(arr.length, aspect, x0, pad, side, H - pad * 2, bh);
          return again;
        };
        Board.rects = fix(L, pad).concat(fix(Rr, W - side - pad));
      }
    } else {
      Board.rects = gridFit(n, aspect, pad, pad, W - pad * 2, H - pad * 2, Math.min(H * 0.62, 420));
    }
    Board.cache = [];
  };

  // ---------- segments (what liquid is drawn) ----------
  function segsFrom(layers, cap, opts) {
    opts = opts || {};
    const list = layers.map((l) => ({ c: l.c, h: l.h, a: 1 }));
    if (opts.remove) {
      let r = opts.remove;
      while (r > 0 && list.length) {
        const t = list[list.length - 1];
        const take = Math.min(t.a, r);
        t.a -= take; r -= take;
        if (t.a <= 1e-4) list.pop();
      }
    }
    if (opts.add) list.push({ c: opts.add.c, h: false, a: opts.add.amt });
    const out = [];
    let f = 0;
    for (const l of list) {
      const f1 = f + l.a / cap;
      const prev = out[out.length - 1];
      if (prev && prev.c === l.c && prev.hidden === l.h && !l.h) prev.f1 = f1;
      else out.push({ f0: f, f1, c: l.c, hidden: l.h, color: GD.COLORS[l.c].hex, mark: Board.marks ? GD.COLORS[l.c].mark : null });
      f = f1;
    }
    return out;
  }

  function giantSegs(extraAmt) {
    const s = Board.s;
    const g = s.giant;
    const total = g.zones.length * s.cap;
    const filled = g.filled + (extraAmt || 0);
    const out = [];
    g.zones.forEach((c, z) => {
      const z0 = z * s.cap, z1 = (z + 1) * s.cap;
      const hex = GD.COLORS[c].hex;
      const fillTop = clamp(filled, z0, z1);
      if (fillTop > z0) out.push({ f0: z0 / total, f1: fillTop / total, color: hex, mark: Board.marks ? GD.COLORS[c].mark : null });
      if (fillTop < z1) out.push({ f0: fillTop / total, f1: z1 / total, color: hex, ghost: true, mark: GD.COLORS[c].mark });
    });
    return out;
  }

  // ---------- geometry helpers ----------
  function mouthOf(rect, v) {
    return { x: rect.x + v.geo.neckX * rect.w, y: rect.y + v.geo.silTop * rect.h };
  }
  function surfaceY(rect, v, frac) {
    return rect.y + R.yForFraction(v.geo, frac) * rect.h;
  }
  function bottleRect(i) {
    const r = Board.rects[i];
    if (!r) return null;
    const lift = Board.lift[i] || 0;
    let dx = 0;
    const sh = Board.shakes[i];
    if (sh) {
      const p = (now() - sh) / 250;
      if (p >= 1) delete Board.shakes[i];
      else dx = Math.sin(p * Math.PI * 6) * 7 * (1 - p);
    }
    let dy = 0;
    const intro = (now() - Board.startT) / (Board.reduce ? 150 : 500);
    const delay = i * 0.06;
    if (intro < 1 + delay * 2) {
      const p = clamp((intro - delay) / 1, 0, 1);
      dy = (1 - easeOut(p)) * (Board.H * 0.5);
    }
    if (Board.bounce) {
      const p = (now() - Board.bounce - i * 70) / 420;
      if (p > 0 && p < 1) dy -= Math.sin(p * Math.PI) * 26;
    }
    return { x: r.x + dx, y: r.y - lift + dy, w: r.w, h: r.h };
  }

  // ---------- drawing ----------
  Board.draw = function () {
    const ctx = Board.ctx;
    const dpr = R.dpr;
    const s = Board.s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, Board.canvas.width, Board.canvas.height);
    if (!s) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t = now();

    // selection lift easing
    s.bottles.forEach((_, i) => {
      const target = Board.selected === i ? 14 : 0;
      Board.lift[i] = (Board.lift[i] || 0) + (target - (Board.lift[i] || 0)) * 0.35;
    });

    const anim = Board.anims[0];
    const moving = anim && anim.type === 'pour' ? anim.from : -1;

    // giant
    if (s.giant && Board.giant && Board.giantRect) {
      let extra = 0;
      if (anim && anim.type === 'pour' && anim.to === 'g') extra = anim.n * anim.fillP;
      const g = Board.giant;
      const pulse = 0.5 + 0.5 * Math.sin(t / 380);
      R.drawVessel(ctx, g, Board.giantRect, giantSegs(extra), {
        variant: s.giant.variant, wave: 1.6, time: t / 1000,
        glow: Board.selected !== null && E.canPour(s, Board.selected, 'g') ? 1.2 + pulse * 0.6 : 0,
        shine: Board.giantShine ? Board.giantShine() : 0,
      });
      drawTrim(ctx, g, Board.giantRect, s.giant.variant);
      if (s.giant.filled >= s.giant.zones.length * s.cap) drawCork(ctx, 'g', Board.giantRect, g);
    }

    // bottles
    s.bottles.forEach((b, i) => {
      if (i === moving) return;
      const rect = bottleRect(i);
      if (!rect) return;
      let opts = null;
      if (anim && anim.type === 'pour' && anim.to === i) opts = { add: { c: anim.color, amt: anim.n * anim.fillP } };
      drawBottle(ctx, i, rect, b, opts, t);
    });

    // pour stream + moving bottle on top
    if (anim && anim.type === 'pour') drawPour(ctx, anim, t);

    drawParticles(ctx, t);
    stepAnims(t);
  };

  function drawBottle(ctx, i, rect, b, extra, t) {
    const s = Board.s;
    const v = Board.vessel;
    const selected = Board.selected === i;
    const complete = E.isComplete(b, s.cap);
    const locked = E.isLocked(b);
    const ca = Board.curtainAnims[i];
    const guideHi = Board.guide && (Board.guide.from === i || Board.guide.to === i) && (Board.guide.from === i ? Board.selected === null : Board.selected !== null);
    if (!locked || ca) {
      const segs = segsFrom(b.layers, s.cap, extra);
      R.drawVessel(ctx, v, rect, segs, {
        wave: selected || extra ? 1.3 : 0,
        time: t / 1000,
        glow: selected ? 1 : guideHi ? 0.6 + 0.4 * Math.sin(t / 200) : 0,
        glowColor: guideHi ? 'rgba(140,255,230,0.95)' : undefined,
        shine: Board.revealShine(i, t),
      });
      if (complete) drawCork(ctx, i, rect, v);
    }
    if (locked || ca) drawCurtain(ctx, i, rect, b, t);
  }

  Board.revealShine = function (i, t) {
    const r = Board.reveals[i];
    if (!r) return 0;
    const p = (t - r) / 400;
    if (p >= 1) { delete Board.reveals[i]; return 0; }
    return Math.sin(p * Math.PI) * 0.6;
  };

  function drawCork(ctx, key, rect, v) {
    const cap = R.get('bottle_cap');
    if (!cap) return;
    const w = rect.w * Math.min(0.9, v.geo.neckW * 0.9) * (key === 'g' ? 0.9 : 1);
    const h = w * cap.naturalHeight / cap.naturalWidth;
    const m = mouthOf(rect, v);
    let y = m.y - h * 0.55;
    const t0 = Board.corks[key];
    let alpha = 1;
    if (t0) {
      const p = clamp((now() - t0) / 400, 0, 1);
      if (p >= 1) delete Board.corks[key];
      y -= (1 - easeOut(p)) * 60;
      alpha = clamp(p * 3, 0, 1);
    }
    if (key === 'g') return; // the giant bottle already has its own cork in the artwork
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(cap, m.x - w / 2, y, w, h);
    ctx.restore();
  }

  function drawTrim(ctx, v, rect, variant) {
    if (!variant) return;
    const im = R.get('giant_trim_' + variant);
    if (!im) return;
    const w = rect.w * Math.max(0.34, v.geo.neckW * 1.9);
    const h = w * im.naturalHeight / im.naturalWidth;
    const m = mouthOf(rect, v);
    ctx.drawImage(im, m.x - w / 2, m.y + rect.h * 0.07 - h / 2, w, h);
  }

  function drawCurtain(ctx, i, rect, b, t) {
    const im = R.get('curtain');
    const tag = R.get('curtain_tag');
    const ca = Board.curtainAnims[i];
    let p = 0;
    if (ca) {
      p = clamp((t - ca) / (Board.reduce ? 250 : 700), 0, 1);
      if (p >= 1) { delete Board.curtainAnims[i]; return; }
    }
    const cw = rect.w * 1.5, ch = rect.h * 1.06;
    const cx = rect.x + rect.w / 2, cy = rect.y - rect.h * 0.04;
    ctx.save();
    if (im) {
      const e = easeOut(p);
      const half = im.naturalWidth / 2;
      const hh = ch * (1 - e * 0.8);
      ctx.globalAlpha = 1 - e * 0.9;
      // left and right halves part and roll up
      ctx.drawImage(im, 0, 0, half, im.naturalHeight, cx - cw / 2 - e * cw * 0.3, cy, cw / 2, hh);
      ctx.drawImage(im, half, 0, half, im.naturalHeight, cx + e * cw * 0.3, cy, cw / 2, hh);
    } else {
      ctx.fillStyle = '#4a1d6b';
      ctx.fillRect(cx - cw / 2, cy, cw, ch);
    }
    ctx.restore();
    if (p > 0) return;
    // tag with the condition
    const tw = Math.max(46, rect.w * 1.1), th = tw * 0.9;
    const ty = rect.y + rect.h * 0.7;
    const wob = Board.shakes['c' + i] ? Math.sin((t - Board.shakes['c' + i]) / 40) * 0.08 * Math.max(0, 1 - (t - Board.shakes['c' + i]) / 500) : 0;
    ctx.save();
    ctx.translate(cx, ty);
    ctx.rotate(wob);
    if (tag) ctx.drawImage(tag, -tw / 2, -th * 0.25, tw, th);
    const c = b.curtain;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (c.type === 'count') {
      const left = Math.max(0, c.n - E.completedCount(Board.s));
      ctx.fillStyle = '#4a2a1a';
      ctx.font = `700 ${Math.round(tw * 0.2)}px "Zen Maru Gothic", sans-serif`;
      ctx.fillText('残り', 0, th * 0.3);
      ctx.font = `700 ${Math.round(tw * 0.3)}px "Kaisei Decol", serif`;
      ctx.fillText(left + '本', 0, th * 0.55);
    } else {
      const k = c.colors.length;
      const r = Math.min(tw * 0.17, tw * 0.7 / (k * 2.2));
      c.colors.forEach((col, j) => {
        const x = (j - (k - 1) / 2) * r * 2.4;
        const y = th * 0.45;
        ctx.beginPath();
        ctx.moveTo(x, y - r * 1.5);
        ctx.bezierCurveTo(x + r * 1.1, y - r * 0.2, x + r, y + r, x, y + r);
        ctx.bezierCurveTo(x - r, y + r, x - r * 1.1, y - r * 0.2, x, y - r * 1.5);
        ctx.fillStyle = GD.COLORS[col].hex;
        ctx.fill();
        ctx.strokeStyle = 'rgba(60,30,20,0.6)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        if (Board.marks) {
          ctx.fillStyle = '#fff';
          ctx.font = `700 ${Math.round(r * 1.1)}px "Zen Maru Gothic", sans-serif`;
          ctx.fillText(GD.COLORS[col].mark, x, y + r * 0.15);
        }
      });
    }
    ctx.restore();
  }

  function drawPour(ctx, a, t) {
    const s = Board.s;
    const v = Board.vessel;
    const src = s.bottles[a.from];
    const home = Board.rects[a.from];
    const toGiant = a.to === 'g';
    const dstRect = toGiant ? Board.giantRect : bottleRect(a.to);
    const dv = toGiant ? Board.giant : v;
    const dm = mouthOf(dstRect, dv);
    const mx = v.geo.neckX * home.w, my = v.geo.silTop * home.h;
    const target = { x: dm.x - a.dir * home.w * 0.18 - mx, y: dm.y - home.h * (toGiant ? 0.16 : 0.1) - my };
    const pos = { x: home.x + (target.x - home.x) * a.moveP, y: home.y - 14 + (target.y - home.y + 14) * a.moveP };
    const angle = a.dir * a.tiltP * (Math.PI * 0.42);
    const rect = { x: pos.x, y: pos.y, w: home.w, h: home.h };
    const pivot = { x: mx, y: my };
    // stream
    if (a.streamP > 0) {
      const mouth = R.localToWorld(rect, mx, my, angle, pivot);
      const dstFrac = toGiant
        ? (s.giant.filled + a.n * a.fillP) / (s.giant.zones.length * s.cap)
        : (s.bottles[a.to].layers.length + a.n * a.fillP) / s.cap;
      const bottom = surfaceY(dstRect, dv, dstFrac);
      const topY = mouth.y + 2;
      const len = (bottom - topY);
      const w = Math.max(3, home.w * 0.12 * (toGiant ? 1.2 : 1));
      const hex = GD.COLORS[a.color].hex;
      const sy = a.streamP < 1 ? topY : topY + len * clamp(a.streamOut, 0, 1);
      const ey = topY + len * clamp(a.streamP, 0, 1);
      if (ey > sy) {
        const gr = ctx.createLinearGradient(dm.x - w, 0, dm.x + w, 0);
        gr.addColorStop(0, R.shade(hex, -0.25));
        gr.addColorStop(0.5, R.shade(hex, 0.25));
        gr.addColorStop(1, R.shade(hex, -0.25));
        ctx.fillStyle = gr;
        ctx.beginPath();
        const x0 = mouth.x;
        ctx.moveTo(x0 - w / 2, sy);
        ctx.quadraticCurveTo(dm.x - w / 2, (sy + ey) / 2, dm.x - w / 2, ey);
        ctx.lineTo(dm.x + w / 2, ey);
        ctx.quadraticCurveTo(dm.x + w / 2, (sy + ey) / 2, x0 + w / 2, sy);
        ctx.closePath();
        ctx.fill();
        if (toGiant && a.streamP >= 1) {
          // swirl sparkles in the giant bottle
          if (Math.random() < 0.5) spawn(dm.x + (Math.random() - 0.5) * dstRect.w * 0.3, bottom - 6, hex, 0.6);
        }
      }
    }
    const segs = segsFrom(src.layers, s.cap, { remove: a.n * a.fillP });
    R.drawVessel(ctx, v, rect, segs, { angle, pivot, wave: 0 });
  }

  // ---------- particles ----------
  function spawn(x, y, color, scale) {
    Board.particles.push({ x, y, vx: (Math.random() - 0.5) * 1.6, vy: -Math.random() * 2 - 0.5, life: 1, size: (8 + Math.random() * 14) * (scale || 1), color, rot: Math.random() * 6 });
  }
  Board.burst = function (x, y, n, color, scale) {
    if (Board.reduce) n = Math.ceil(n / 3);
    for (let k = 0; k < n; k++) spawn(x, y, color, scale);
  };
  function drawParticles(ctx) {
    const sp = R.get('particle_sparkle');
    Board.particles = Board.particles.filter((p) => p.life > 0);
    for (const p of Board.particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.life -= 0.018; p.rot += 0.05;
      ctx.save();
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (sp) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(sp, -p.size / 2, -p.size / 2, p.size, p.size);
      } else {
        ctx.fillStyle = p.color || '#ffe9a8';
        ctx.fillRect(-2, -2, 4, 4);
      }
      ctx.restore();
    }
  }

  // ---------- animations ----------
  function stepAnims(t) {
    const a = Board.anims[0];
    if (!a) return;
    const p = clamp((t - a.t0) / a.dur, 0, 1);
    if (a.type === 'pour') {
      // phases: move+tilt (0-0.3), pour (0.3-0.78), return (0.78-1)
      const m = clamp(p / 0.3, 0, 1);
      const back = clamp((p - 0.78) / 0.22, 0, 1);
      a.moveP = ease(m) * (1 - ease(back));
      a.tiltP = ease(m) * (1 - ease(back));
      const pp = clamp((p - 0.3) / 0.48, 0, 1);
      a.fillP = ease(pp);
      a.streamP = clamp((p - 0.26) / 0.1, 0, 1);
      a.streamOut = clamp((p - 0.72) / 0.08, 0, 1);
      if (p >= 0.78 && !a.applied) {
        a.applied = true;
        a.fillP = 1;
        finishPour(a);
      }
      if (a.applied) { a.fillP = 0; a.streamP = a.streamOut >= 1 ? 0 : a.streamP; }
    }
    if (p >= 1) {
      Board.anims.shift();
      if (a.done) a.done();
      if (!Board.anims.length) {
        Board.busy = false;
        drainQueue();
      } else Board.anims[0].t0 = now();
    }
  }

  function finishPour(a) {
    const s = Board.s;
    const ev = E.pour(s, a.from, a.to);
    Board.hooks.onMove && Board.hooks.onMove(ev);
    const t = now();
    if (ev.completed) {
      Board.corks[a.to] = t;
      Snd.play('cork');
      Board.hooks.vibrate && Board.hooks.vibrate(30);
      const r = Board.rects[a.to];
      Board.burst(r.x + r.w / 2, r.y + r.h * 0.2, 14, GD.COLORS[a.color].hex);
    }
    if (ev.zoneDone && !ev.giantDone) {
      Snd.play('chime');
      const r = Board.giantRect;
      Board.burst(r.x + r.w / 2, surfaceY(r, Board.giant, s.giant.filled / (s.giant.zones.length * s.cap)), 24, '#fff', 0.8);
    }
    ev.revealed.forEach((i) => {
      Board.reveals[i] = t;
      Snd.play('reveal');
      const r = Board.rects[i];
      Board.burst(r.x + r.w / 2, r.y + r.h * 0.5, 10, '#d9c2ff', 0.7);
    });
    ev.curtains.forEach((i) => {
      Board.curtainAnims[i] = t;
      Snd.play('curtain');
      if (s.bottles[i].layers.length) Board.reveals[i] = t;
    });
    if (E.isSolved(s)) {
      Board.selected = null;
      Board.queue = [];
      Board.anims.push({ type: 'wait', t0: 0, dur: ev.giantDone ? 300 : 200, done: () => Board.celebrate(ev.giantDone) });
    } else {
      Board.hooks.afterMove && Board.hooks.afterMove(ev);
    }
  }

  Board.celebrate = function (giant) {
    const s = Board.s;
    Board.bounce = now();
    Snd.play(giant ? 'magic' : 'fanfare');
    if (giant) {
      const r = Board.giantRect;
      Board.corks.g = now();
      Board.giantShine = () => {
        const p = (now() - Board.bounce) / 2000;
        return p < 1 ? Math.sin(p * Math.PI) * 0.7 : 0;
      };
      for (let k = 0; k < 5; k++) setTimeout(() => Board.burst(r.x + r.w / 2, r.y + r.h * 0.45, 22, '#fff'), k * 200);
    }
    Board.rects.forEach((r, i) => setTimeout(() => Board.burst(r.x + r.w / 2, r.y + r.h * 0.3, 6, '#ffe9a8'), i * 70));
    Board.anims.push({ type: 'wait', t0: 0, dur: giant ? 2000 : 1500, done: () => { Board.giantShine = null; Board.hooks.onSolved && Board.hooks.onSolved(); } });
  };

  // ---------- input ----------
  function hit(px, py) {
    const s = Board.s;
    for (let i = s.bottles.length - 1; i >= 0; i--) {
      const r = Board.rects[i];
      if (!r) continue;
      const padX = Math.max(0, (44 - r.w) / 2) + r.w * 0.15;
      if (px >= r.x - padX && px <= r.x + r.w + padX && py >= r.y - 20 && py <= r.y + r.h + 8) return i;
    }
    const g = Board.giantRect;
    if (g && px >= g.x && px <= g.x + g.w && py >= g.y && py <= g.y + g.h) return 'g';
    return null;
  }

  function onPointer(e) {
    if (!Board.s) return;
    const r = Board.canvas.getBoundingClientRect();
    const i = hit(e.clientX - r.left, e.clientY - r.top);
    Board.tap(i);
  }

  Board.tap = function (i) {
    if (Board.busy || Board.anims.length) {
      if (Board.queue.length < 6) Board.queue.push(i);
      return;
    }
    handle(i);
  };

  function drainQueue() {
    while (Board.queue.length && !Board.anims.length) handle(Board.queue.shift());
  }

  function handle(i) {
    const s = Board.s;
    if (!s || E.isSolved(s)) return;
    if (Board.hooks.canInteract && !Board.hooks.canInteract()) return;
    if (i === null) { Board.selected = null; return; }
    // tutorial gate
    if (Board.guide) {
      const need = Board.selected === null ? Board.guide.from : Board.guide.to;
      if (i !== need) return;
    }
    if (Board.selected === null) {
      if (i === 'g') return;
      const b = s.bottles[i];
      if (E.isLocked(b)) {
        Board.shakes['c' + i] = now();
        Board.hooks.onCurtainTap && Board.hooks.onCurtainTap(b.curtain);
        return;
      }
      if (!b.layers.length || E.isComplete(b, s.cap)) return;
      Board.selected = i;
      Snd.play('select');
      return;
    }
    if (i === Board.selected) { Board.selected = null; return; }
    const from = Board.selected;
    if (E.canPour(s, from, i)) {
      Board.startPour(from, i);
    } else {
      if (i !== 'g') Board.shakes[i] = now();
      Snd.play('error');
      Board.selected = null;
    }
  }

  Board.startPour = function (from, to) {
    const s = Board.s;
    const n = E.pourAmount(s, from, to);
    const color = E.top(s.bottles[from]).c;
    const fromR = Board.rects[from];
    const toR = to === 'g' ? Board.giantRect : Board.rects[to];
    const dir = toR.x + toR.w / 2 >= fromR.x + fromR.w / 2 ? 1 : -1;
    Board.selected = null;
    Board.busy = true;
    Snd.play(to === 'g' ? 'pourDeep' : 'pour', n);
    Board.anims.push({ type: 'pour', from, to, n, color, dir, t0: now(), dur: Board.reduce ? 320 : (to === 'g' ? 900 : 700), moveP: 0, tiltP: 0, fillP: 0, streamP: 0, streamOut: 0 });
    if (Board.guide) Board.hooks.onGuideStep && Board.hooks.onGuideStep();
  };

  Board.select = (i) => Board.tap(i);
  Board.deselect = () => { Board.selected = null; };

  Board.flashRect = function (i) {
    if (i === 'g') return Board.giantRect;
    return Board.rects[i] || null;
  };

  root.Board = Board;
})(typeof globalThis !== 'undefined' ? globalThis : this);
