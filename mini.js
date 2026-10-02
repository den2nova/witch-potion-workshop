/* 魔女のポーション工房 — mini games: 大釜キャッチ, ほうきの夜間飛行, お掃除 */
(function (root) {
  'use strict';
  const R = root.Render;
  const S = root.Store;
  const Snd = root.Sound;
  const GD = root.GameData;
  const $ = (s) => document.querySelector(s);

  const M = { cur: null, raf: 0, canvas: null, ctx: null, W: 0, H: 0, dpr: 1, input: { x: 0, y: 0, down: false, has: false, touch: false } };

  function sizeCanvas() {
    const el = M.canvas.parentElement.getBoundingClientRect();
    M.dpr = Math.min(root.devicePixelRatio || 1, 2);
    M.W = el.width; M.H = el.height;
    M.canvas.width = Math.round(M.W * M.dpr);
    M.canvas.height = Math.round(M.H * M.dpr);
  }

  function hud(text) { $('#mini-hud').textContent = text; }

  M.start = async function (kind) {
    M.canvas = $('#mini-cv');
    M.ctx = M.canvas.getContext('2d');
    root.App.show('mini');
    $('#mini-title').textContent = { cauldron: '大釜キャッチ', broom: 'ほうきの夜間飛行', clean: 'お掃除' }[kind];
    sizeCanvas();
    const need = {
      cauldron: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => 'mini_cauldron_sprites_' + i).concat(['bg_portrait', 'bg_landscape']),
      broom: ['mini_broom_bg', 'mini_broom_sprites_0', 'mini_broom_sprites_1', 'mini_broom_sprites_2', 'mini_broom_sprites_3'],
      clean: ['clean_table_oak', 'clean_table_slate', 'clean_table_marble', 'clean_cloth'].concat(R.sheets.clean_stains.map((f) => f.replace('.webp', ''))),
    }[kind];
    $('#mini-loading').hidden = false;
    await Promise.all(need.map((n) => R.load(n)));
    $('#mini-loading').hidden = true;
    M.stop();
    const nb = $('#mini-next');
    if (nb) nb.hidden = kind !== 'clean';
    const G = GAMES[kind]();
    M.cur = G;
    M.kind = kind;
    G.init();
    let last = performance.now();
    const loop = (t) => {
      if (M.cur !== G) return;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const ctx = M.ctx;
      ctx.setTransform(M.dpr, 0, 0, M.dpr, 0, 0);
      G.step(dt, ctx);
      M.raf = requestAnimationFrame(loop);
    };
    M.raf = requestAnimationFrame(loop);
  };

  M.stop = function () {
    cancelAnimationFrame(M.raf);
    if (M.cur && M.cur.cleanup) M.cur.cleanup();
    M.cur = null;
  };
  M.key = function (e) {
    if (!M.cur) return;
    if (e.key === 'Escape') { M.quit(); return; }
    M.cur.key && M.cur.key(e);
  };
  M.quit = function () {
    const G = M.cur;
    if (G && G.onQuit) G.onQuit();
    M.stop();
    root.App.show('minis');
  };

  function result(title, lines, coins, onAgain) {
    root.App.grantMini(coins, title);
    if (coins) Snd.play('coin');
    root.App.dialog({
      title, cls: 'mini-result', closable: false,
      body: (() => {
        const d = document.createElement('div');
        lines.forEach((l) => { const p = document.createElement('p'); p.className = 'panel-text'; p.textContent = l; d.append(p); });
        if (coins) { const p = document.createElement('p'); p.className = 'coins-line big'; const im = document.createElement('img'); im.src = R.base + 'coin.webp'; im.className = 'coin-ic'; p.append(im, ' +' + coins + '枚'); d.append(p); }
        return d;
      })(),
      buttons: [
        { label: 'ミニゲーム一覧', onClick: () => { M.stop(); root.App.show('minis'); } },
        { label: 'もう一度', primary: true, onClick: onAgain },
      ],
    });
  }

  function drawCover(ctx, im, W, H, ox) {
    const s = Math.max(W / im.naturalWidth, H / im.naturalHeight);
    const w = im.naturalWidth * s, h = im.naturalHeight * s;
    ctx.drawImage(im, (W - w) / 2 + (ox || 0), (H - h) / 2, w, h);
  }

  // pointer
  function pointerSetup(G) {
    const cv = M.canvas;
    const pos = (e) => { const r = cv.getBoundingClientRect(); M.input.x = e.clientX - r.left; M.input.y = e.clientY - r.top; M.input.has = true; M.input.touch = e.pointerType === 'touch'; };
    const down = (e) => { pos(e); M.input.down = true; cv.setPointerCapture && cv.setPointerCapture(e.pointerId); G.press && G.press(); };
    const move = (e) => { pos(e); G.move && G.move(); };
    const up = () => { M.input.down = false; G.release && G.release(); };
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { if (!M.input.touch) M.input.has = false; });
    return () => {
      cv.removeEventListener('pointerdown', down);
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up);
      cv.removeEventListener('pointercancel', up);
    };
  }

  const GAMES = {};

  // ================= 大釜キャッチ =================
  GAMES.cauldron = function () {
    const COLORS = [0, 5, 3, 4, 6, 2]; // sprite index -> potion colour (berry red, crystal blue, leaf green, feather yellow, flower purple, mushroom pink)
    const NAMES = ['赤', '青', '緑', '黄', '紫', '桃'];
    const G = { t: 45, score: 0, streak: 0, target: 0, nextSwitch: 10, items: [], spawn: 0, cx: 0, fill: [], over: false, off: null, flash: 0 };
    G.init = function () {
      G.t = 45; G.score = 0; G.streak = 0; G.target = Math.floor(Math.random() * 6); G.nextSwitch = 10; G.items = []; G.spawn = 0; G.fill = []; G.over = false;
      G.cx = M.W / 2; G.keys = 0;
      G.off = pointerSetup(G);
    };
    G.cleanup = () => G.off && G.off();
    G.key = (e) => {
      if (e.type === 'keydown') {
        if (e.key === 'ArrowLeft') G.cx -= 40;
        if (e.key === 'ArrowRight') G.cx += 40;
      }
    };
    G.move = () => { G.cx = M.input.x; };
    G.press = () => { G.cx = M.input.x; };
    G.step = function (dt, ctx) {
      const W = M.W, H = M.H;
      const bg = R.get(W > H ? 'bg_landscape' : 'bg_portrait');
      ctx.clearRect(0, 0, W, H);
      if (bg) drawCover(ctx, bg, W, H);
      ctx.fillStyle = 'rgba(10,4,24,0.45)';
      ctx.fillRect(0, 0, W, H);
      const size = Math.min(W, H) * 0.11;
      const cw = Math.min(W * 0.34, size * 2.6);
      G.cx = Math.max(cw / 2, Math.min(W - cw / 2, G.cx));
      const cy = H - cw * 0.55 - 12;
      if (!G.over) {
        G.t -= dt;
        G.nextSwitch -= dt;
        if (G.nextSwitch <= 0) { G.nextSwitch = 10; let n; do { n = Math.floor(Math.random() * 6); } while (n === G.target); G.target = n; Snd.play('chime'); }
        G.spawn -= dt;
        const rate = 0.55 - Math.min(0.25, (45 - G.t) * 0.006);
        if (G.spawn <= 0) {
          G.spawn = rate;
          const r = Math.random();
          let kind;
          if (r < 0.12) kind = 6; else if (r < 0.22) kind = 8;
          else if (r < 0.52) kind = G.target;
          else kind = Math.floor(Math.random() * 6);
          G.items.push({ kind, x: size / 2 + Math.random() * (W - size), y: -size, vy: (H * 0.28) + Math.random() * H * 0.12 + (45 - G.t) * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 2 });
        }
        for (const it of G.items) {
          it.y += it.vy * dt; it.rot += it.vr * dt;
          if (!it.done && it.y > cy - cw * 0.25 && it.y < cy + cw * 0.1 && Math.abs(it.x - G.cx) < cw * 0.42) {
            it.done = true;
            if (it.kind === 6 || it.kind === 8) { G.t -= 5; G.streak = 0; Snd.play('bump'); G.flash = 1; }
            else if (it.kind === G.target) {
              G.streak++;
              const mult = 1 + Math.floor(G.streak / 3);
              G.score += 10 * mult;
              G.fill.push(COLORS[it.kind]);
              if (G.fill.length > 12) G.fill.shift();
              Snd.play('catch');
            } else { G.streak = 0; Snd.play('error'); }
          }
        }
        G.items = G.items.filter((it) => !it.done && it.y < H + size);
        if (G.t <= 0) {
          G.t = 0; G.over = true;
          const best = S.setBest('cauldron', G.score);
          const coins = Math.min(120, 10 + Math.floor(G.score / 10));
          setTimeout(() => result('大釜キャッチ', ['得点 ' + G.score + (best ? '(自己ベスト更新!)' : ''), '最高 ' + S.best('cauldron')], coins, () => M.start('cauldron')), 400);
        }
      }
      // items
      for (const it of G.items) {
        const im = R.get('mini_cauldron_sprites_' + it.kind);
        if (!im) continue;
        const s = size * (it.kind === 7 ? 1.4 : 1);
        ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(Math.sin(it.rot) * 0.4);
        ctx.drawImage(im, -s / 2, -s / 2, s, s * im.naturalHeight / im.naturalWidth);
        ctx.restore();
      }
      // cauldron with collected potion
      const cim = R.get('mini_cauldron_sprites_7');
      if (cim) {
        const chh = cw * cim.naturalHeight / cim.naturalWidth;
        const top = cy - chh * 0.45;
        if (G.fill.length) {
          const grad = ctx.createLinearGradient(G.cx - cw * 0.4, 0, G.cx + cw * 0.4, 0);
          G.fill.slice(-6).forEach((c, i, a) => grad.addColorStop(i / Math.max(1, a.length - 1), GD.COLORS[c].hex));
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(G.cx, top + chh * 0.12, cw * 0.38, chh * 0.09, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.drawImage(cim, G.cx - cw / 2, top, cw, chh);
      }
      if (G.flash > 0) { ctx.fillStyle = `rgba(160,255,120,${G.flash * 0.25})`; ctx.fillRect(0, 0, W, H); G.flash -= dt * 2; }
      // target banner
      const tim = R.get('mini_cauldron_sprites_' + G.target);
      ctx.fillStyle = 'rgba(20,10,40,0.7)';
      const bw = 210, bh = 54;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(W / 2 - bw / 2, 10, bw, bh, 14) : ctx.rect(W / 2 - bw / 2, 10, bw, bh); ctx.fill();
      ctx.fillStyle = '#f5ecdc';
      ctx.font = '700 16px "Zen Maru Gothic", sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('集める色: ' + NAMES[G.target], W / 2 - bw / 2 + 58, 10 + bh / 2);
      if (tim) ctx.drawImage(tim, W / 2 - bw / 2 + 10, 14, 44, 44 * tim.naturalHeight / tim.naturalWidth);
      hud('得点 ' + G.score + '  ·  残り ' + Math.ceil(G.t) + '秒' + (G.streak >= 3 ? '  ·  ×' + (1 + Math.floor(G.streak / 3)) : ''));
    };
    return G;
  };

  // ================= ほうきの夜間飛行 =================
  GAMES.broom = function () {
    const G = {};
    G.init = function () {
      G.y = M.H * 0.4; G.vy = 0; G.dist = 0; G.score = 0; G.chimneys = 0; G.obs = []; G.stars = []; G.over = false; G.started = false; G.time = 0; G.next = 1.2;
      G.off = pointerSetup(G);
    };
    G.cleanup = () => G.off && G.off();
    const flap = () => {
      if (G.over) return;
      G.started = true;
      G.vy = -M.H * 0.62;
      Snd.play('flap');
    };
    G.press = flap;
    G.key = (e) => { if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); flap(); } };
    G.step = function (dt, ctx) {
      const W = M.W, H = M.H;
      const speed = W * 0.28 + Math.min(W * 0.2, G.time * 4);
      if (G.started && !G.over) {
        G.time += dt;
        G.vy += H * 1.7 * dt;
        if (M.input.down) G.vy -= H * 0.5 * dt;
        G.y += G.vy * dt;
        G.dist += speed * dt;
        G.next -= dt;
        if (G.next <= 0) {
          const easy = G.time < 10;
          const gap = H * (easy ? 0.46 : Math.max(0.3, 0.4 - G.time * 0.002));
          const gapY = H * 0.2 + Math.random() * (H * 0.75 - gap - H * 0.2) + gap / 2;
          G.obs.push({ x: W + 40, gapY, gap, passed: false, batPhase: Math.random() * 6 });
          if (Math.random() < 0.6) G.stars.push({ x: W + 40 + W * 0.22, y: H * 0.15 + Math.random() * H * 0.6, got: false });
          G.next = easy ? 2.0 : Math.max(1.25, 1.8 - G.time * 0.01);
        }
      }
      // background
      const bg = R.get('mini_broom_bg');
      if (bg) {
        const s = H / bg.naturalHeight;
        const bw = bg.naturalWidth * s;
        const off = -(G.dist * 0.5) % bw;
        for (let x = off; x < W; x += bw) ctx.drawImage(bg, x, 0, bw + 1, H);
        ctx.fillStyle = 'rgba(12,4,30,0.38)';
        ctx.fillRect(0, 0, W, H);
      }
      const chim = R.get('mini_broom_sprites_1'), bat = R.get('mini_broom_sprites_2'), star = R.get('mini_broom_sprites_3'), witch = R.get('mini_broom_sprites_0');
      const cwid = Math.min(W * 0.16, H * 0.14);
      const px = W * 0.25;
      const ww = Math.min(W * 0.2, H * 0.2);
      const wh = witch ? ww * witch.naturalHeight / witch.naturalWidth : ww * 0.6;
      const hit = { x: px - ww * 0.3, y: G.y - wh * 0.25, w: ww * 0.6, h: wh * 0.5 };
      for (const o of G.obs) {
        if (!G.over && G.started) o.x -= speed * dt;
        const topOfChim = o.gapY + o.gap / 2;
        const ch = chim ? cwid * chim.naturalHeight / chim.naturalWidth : H;
        // chimney from the ground (lit rim so it stands out from the town)
        ctx.save();
        ctx.shadowColor = 'rgba(255,190,110,0.85)';
        ctx.shadowBlur = 14;
        if (chim) {
          for (let y = topOfChim; y < H; y += ch * 0.98) ctx.drawImage(chim, o.x - cwid / 2, y, cwid, ch);
        }
        ctx.restore();
        // bat guarding the upper side of the gap, with a column of dark smoke above it
        const by = o.gapY - o.gap / 2 - cwid * 0.35 + Math.sin(G.time * 3 + o.batPhase) * 6;
        const bw2 = cwid * 1.4, bh2 = bat ? bw2 * bat.naturalHeight / bat.naturalWidth : bw2 * 0.6;
        const smoke = ctx.createLinearGradient(o.x - cwid * 0.55, 0, o.x + cwid * 0.55, 0);
        smoke.addColorStop(0, 'rgba(30,8,60,0)');
        smoke.addColorStop(0.5, 'rgba(30,8,60,0.82)');
        smoke.addColorStop(1, 'rgba(30,8,60,0)');
        ctx.fillStyle = smoke;
        ctx.fillRect(o.x - cwid * 0.55, 0, cwid * 1.1, by);
        ctx.save();
        ctx.shadowColor = 'rgba(200,150,255,0.8)';
        ctx.shadowBlur = 12;
        if (bat) ctx.drawImage(bat, o.x - bw2 / 2, by - bh2 / 2, bw2, bh2);
        ctx.restore();
        if (!G.over && G.started) {
          const inX = hit.x + hit.w > o.x - cwid * 0.4 && hit.x < o.x + cwid * 0.4;
          if (inX && (hit.y + hit.h > topOfChim + 6 || hit.y < by + bh2 * 0.3)) crash();
          if (!o.passed && o.x < px - cwid / 2) { o.passed = true; G.score += 1; G.chimneys += 1; Snd.play('tap'); }
        }
      }
      G.obs = G.obs.filter((o) => o.x > -cwid * 2);
      for (const s of G.stars) {
        if (!G.over && G.started) s.x -= speed * dt;
        if (s.got) continue;
        const sz = cwid * 0.7;
        if (star) ctx.drawImage(star, s.x - sz / 2, s.y - sz / 2, sz, sz);
        if (!G.over && Math.abs(s.x - px) < sz * 0.6 && Math.abs(s.y - G.y) < sz * 0.7) { s.got = true; G.score += 3; Snd.play('sparkle'); }
      }
      G.stars = G.stars.filter((s) => s.x > -60);
      if (G.started && !G.over && (G.y > H - wh * 0.2 || G.y < -wh)) crash();
      // witch
      if (witch) {
        ctx.save(); ctx.translate(px, G.y); ctx.rotate(Math.max(-0.4, Math.min(0.5, G.vy / (H * 1.6))));
        ctx.drawImage(witch, -ww / 2, -wh / 2, ww, wh);
        ctx.restore();
      }
      if (!G.started) {
        ctx.fillStyle = 'rgba(20,10,40,0.6)';
        ctx.fillRect(W / 2 - 150, H * 0.62, 300, 48);
        ctx.fillStyle = '#f5ecdc'; ctx.font = '700 16px "Zen Maru Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('タップ(スペース)で上昇', W / 2, H * 0.62 + 24);
        G.y = H * 0.4 + Math.sin(performance.now() / 300) * 8;
      }
      hud('得点 ' + G.score + '  ·  煙突 ' + G.chimneys);
    };
    function crash() {
      if (G.over) return;
      G.over = true;
      Snd.play('bump');
      if (G.chimneys) S.count('chimneys', G.chimneys);
      const best = S.setBest('broom', G.score);
      const coins = Math.min(120, 10 + G.score * 5);
      setTimeout(() => result('ほうきの夜間飛行', ['得点 ' + G.score + (best ? '(自己ベスト更新!)' : ''), '抜けた煙突 ' + G.chimneys + '本'], coins, () => M.start('broom')), 500);
    }
    G.onQuit = () => { if (!G.over && G.chimneys) S.count('chimneys', G.chimneys); };
    return G;
  };

  // ================= お掃除 =================
  GAMES.clean = function () {
    const G = { stains: null, sctx: null, table: null, cells: 0, clean: 0, done: false, slide: 0, earned: 0, tables: 0, last: null, lastSound: 0 };
    const TABLES = ['clean_table_oak', 'clean_table_slate', 'clean_table_marble'];
    const COLORS = GD.COLORS.map((c) => c.hex);
    function newTable() {
      G.table = TABLES[Math.floor(Math.random() * 3)];
      const c = G.stains || document.createElement('canvas');
      c.width = Math.round(M.W * M.dpr); c.height = Math.round(M.H * M.dpr);
      G.stains = c;
      const x = c.getContext('2d');
      G.sctx = x;
      x.setTransform(M.dpr, 0, 0, M.dpr, 0, 0);
      x.clearRect(0, 0, M.W, M.H);
      const sheet = R.sheets.clean_stains.map((f) => R.get(f.replace('.webp', ''))).filter(Boolean);
      const n = 5 + Math.floor(Math.random() * 8);
      const area = M.W * M.H;
      const scale = Math.sqrt(area) / 900;
      for (let i = 0; i < n; i++) {
        const im = sheet[Math.floor(Math.random() * sheet.length)];
        const tmp = document.createElement('canvas');
        const s = (0.6 + Math.random() * 0.9) * scale * (im.naturalWidth > 200 ? 1 : 1.6);
        tmp.width = Math.max(1, im.naturalWidth * s); tmp.height = Math.max(1, im.naturalHeight * s);
        const tx = tmp.getContext('2d');
        tx.drawImage(im, 0, 0, tmp.width, tmp.height);
        tx.globalCompositeOperation = 'source-atop';
        tx.fillStyle = COLORS[Math.floor(Math.random() * COLORS.length)];
        tx.fillRect(0, 0, tmp.width, tmp.height);
        const thick = Math.random() < 0.35;
        // keep stains out of the bottom 20% of the table, which fingers can hardly reach on phones
        const ext = Math.max(tmp.width, tmp.height);
        const px = Math.random() * (M.W - tmp.width * 0.6);
        const cyMax = Math.max(60, M.H * 0.8 - ext / 2);
        const cy = Math.min(cyMax, 40 + ext / 2 + Math.random() * Math.max(0, cyMax - 40 - ext / 2));
        const py = cy - tmp.height / 2;
        x.save();
        x.translate(px + tmp.width / 2, py + tmp.height / 2);
        x.rotate(Math.random() * Math.PI * 2);
        x.globalAlpha = thick ? 1 : 0.62;
        x.drawImage(tmp, -tmp.width / 2, -tmp.height / 2);
        if (thick) x.drawImage(tmp, -tmp.width / 2, -tmp.height / 2);
        x.restore();
      }
      G.cells = countDirty();
      G.clean = 0;
      G.done = false;
    }
    function countDirty() {
      const c = G.stains;
      const d = G.sctx.getImageData(0, 0, c.width, c.height).data;
      const nx = 36, ny = 54;
      let dirty = 0;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const x = Math.floor((i + 0.5) * c.width / nx), y = Math.floor((j + 0.5) * c.height / ny);
        let a = 0;
        for (let k = -1; k <= 1; k++) a = Math.max(a, d[((y + k * 2) * c.width + x) * 4 + 3] || 0);
        if (a > 30) dirty++;
      }
      return dirty;
    }
    G.init = function () {
      newTable();
      G.off = pointerSetup(G);
      G.tables = 0; G.earned = 0;
      G.lastMeasure = 0;
    };
    G.cleanup = () => G.off && G.off();
    function cloth() {
      const off = M.input.touch ? 64 : 0;
      return { x: M.input.x, y: M.input.y - off };
    }
    G.move = function () {
      if (G.done || G.slide > 0) return;
      if (M.input.touch && !M.input.down) return;
      const p = cloth();
      const r = Math.max(56, Math.min(M.W, M.H) * 0.15);
      const x = G.sctx;
      x.save();
      x.globalCompositeOperation = 'destination-out';
      x.globalAlpha = 0.4;
      x.lineCap = 'round';
      x.lineWidth = r * 2;
      x.beginPath();
      const l = G.last && performance.now() - G.last.t < 120 ? G.last : p;
      x.moveTo(l.x, l.y); x.lineTo(p.x, p.y); x.stroke();
      x.restore();
      const sp = Math.hypot(p.x - l.x, p.y - l.y);
      if (performance.now() - G.lastSound > 90 && sp > 4) { Snd.play('swish', Math.min(1, sp / 60)); G.lastSound = performance.now(); }
      G.last = { x: p.x, y: p.y, t: performance.now() };
    };
    G.step = function (dt, ctx) {
      const W = M.W, H = M.H;
      ctx.clearRect(0, 0, W, H);
      const slideX = G.slide > 0 ? (1 - G.slide) * 0 + G.slide * -W : 0;
      const tb = R.get(G.table);
      if (G.slide > 0) {
        G.slide -= dt / 0.8;
        const e = Math.max(0, G.slide);
        const prev = R.get(G.prevTable);
        if (prev) { ctx.save(); ctx.translate(-(1 - e) * W, 0); drawCover(ctx, prev, W, H); ctx.restore(); }
        if (tb) { ctx.save(); ctx.translate(e * W, 0); drawCover(ctx, tb, W, H); ctx.drawImage(G.stains, 0, 0, W, H); ctx.restore(); }
        if (G.slide <= 0) G.slide = 0;
      } else {
        if (tb) drawCover(ctx, tb, W, H);
        ctx.drawImage(G.stains, 0, 0, W, H);
      }
      void slideX;
      G.lastMeasure -= dt;
      if (!G.done && G.slide <= 0 && G.lastMeasure <= 0) {
        G.lastMeasure = 0.25;
        const dirty = countDirty();
        G.clean = G.cells ? Math.max(0, Math.min(1, 1 - dirty / G.cells)) : 1;
        if (G.clean >= 0.98) {
          G.done = true;
          G.tables++; G.earned += GD.CONFIG.COIN.cleanTable;
          S.grant({ coins: GD.CONFIG.COIN.cleanTable }, 'お掃除');
          S.count('tables', 1);
          root.App.checkAchievementToast();
          Snd.play('sparkle'); setTimeout(() => Snd.play('coin'), 150);
          G.shine = 1;
          setTimeout(() => { G.prevTable = G.table; G.sctx.clearRect(0, 0, W, H); newTable(); G.slide = 1; }, 700);
        }
      }
      if (G.shine > 0) {
        ctx.fillStyle = `rgba(255,250,220,${G.shine * 0.35})`; ctx.fillRect(0, 0, W, H);
        const coin = R.get('coin');
        if (coin) { const y = H * 0.45 - (1 - G.shine) * 120; ctx.globalAlpha = G.shine; ctx.drawImage(coin, W / 2 - 32, y, 64, 64); ctx.globalAlpha = 1; }
        G.shine -= dt * 1.4;
      }
      // cloth cursor
      if (M.input.has && !(M.input.touch && !M.input.down)) {
        const p = cloth();
        const cl = R.get('clean_cloth');
        const s = Math.max(140, Math.min(W, H) * 0.4);
        if (cl) ctx.drawImage(cl, p.x - s / 2, p.y - s / 2, s, s * cl.naturalHeight / cl.naturalWidth);
      }
      hud('キレイ度 ' + Math.floor(G.clean * 100) + '%  ·  拭いた机 ' + G.tables + '台  ·  +' + G.earned + '枚');
    };
    // 次のテーブルへ: give up on this table (no coins) and slide in a fresh one
    G.skip = function () {
      if (G.done || G.slide > 0) return;
      G.done = true;
      Snd.play('swish', 1);
      G.prevTable = G.table;
      G.sctx.clearRect(0, 0, M.W, M.H);
      newTable();
      G.slide = 1;
    };
    G.onQuit = function () {
      if (G.tables) root.App.toast('机' + G.tables + '台でコイン' + G.earned + '枚');
    };
    return G;
  };

  root.Minis = M;
  function wireMini() {
    const q = $('#mini-quit');
    if (q) q.addEventListener('click', () => M.quit());
    const nb = $('#mini-next');
    if (nb) nb.addEventListener('click', () => { if (M.cur && M.cur.skip) M.cur.skip(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireMini);
  else wireMini();
  window.addEventListener('resize', () => { if (M.cur) { sizeCanvas(); if (M.kind === 'clean') { /* keep current table */ } } });
})(typeof globalThis !== 'undefined' ? globalThis : this);
