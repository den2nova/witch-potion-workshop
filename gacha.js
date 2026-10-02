/* 魔女のポーション工房 — 星の福引き (gacha): collectibles bought with coins, shown in the collection */
(function (root) {
  'use strict';
  const GD = root.GameData;
  const GA = GD.GACHA;
  const S = root.Store;
  const Snd = root.Sound;
  const $ = (s) => document.querySelector(s);

  const RARITY = {};
  GA.rarities.forEach((r, i) => { RARITY[r.id] = Object.assign({ order: i }, r); });
  const byRarity = (rid) => GA.items.filter((it) => it.rarity === rid);
  const GENRE_MARK = { tools: '✦', familiars: '☾', gems: '◆', sweets: '❀', charms: '★' };

  const Gacha = { busy: false };

  // ---------- state ----------
  function st() {
    if (!S.p.gacha) S.p.gacha = { owned: {}, pulls: 0, points: 0 };
    return S.p.gacha;
  }
  Gacha.ownedCount = () => GA.items.filter((it) => st().owned[it.id]).length;
  Gacha.ssrCount = () => GA.items.filter((it) => it.rarity === 'SSR' && st().owned[it.id]).length;
  Gacha.pulls = () => st().pulls || 0;

  // ---------- drawing ----------
  function rollRarity(atLeastR) {
    let x = Math.random();
    const list = atLeastR ? GA.rarities.filter((r) => r.id !== 'N') : GA.rarities;
    const total = list.reduce((a, r) => a + r.rate, 0);
    x *= total;
    for (const r of list) { if (x < r.rate) return r.id; x -= r.rate; }
    return list[list.length - 1].id;
  }
  // resolve one item: new → owned, duplicate → coins back
  function award(item) {
    const g = st();
    const isNew = !g.owned[item.id];
    g.owned[item.id] = (g.owned[item.id] || 0) + 1;
    let coins = 0;
    if (!isNew) {
      coins = RARITY[item.rarity].refund;
      S.grant({ coins }, 'ガチャの被り');
    }
    return { item, isNew, coins };
  }
  function pullOne(atLeastR) {
    const rid = rollRarity(atLeastR);
    const pool = byRarity(rid);
    const item = pool[Math.floor(Math.random() * pool.length)];
    const g = st();
    g.pulls = (g.pulls || 0) + 1;
    g.points = (g.points || 0) + 1;
    return award(item);
  }
  // 10 draws one after another; if the first 9 were all N, the 10th is R or better
  function pullTen() {
    const out = [];
    for (let k = 0; k < 10; k++) {
      const force = k === 9 && out.every((r) => r.item.rarity === 'N');
      out.push(pullOne(force));
    }
    return out;
  }
  function exchange(rid) {
    const g = st();
    if ((g.points || 0) < GA.exchangePoints) return null;
    g.points -= GA.exchangePoints;
    const pool = byRarity(rid);
    const missing = pool.filter((it) => !g.owned[it.id]);
    const from = missing.length ? missing : pool;
    return award(from[Math.floor(Math.random() * from.length)]);
  }

  // ---------- art (image when available, drawn placeholder otherwise) ----------
  function art(item, cls) {
    const wrap = document.createElement('span');
    wrap.className = 'ga-art ' + (cls || '') + ' r-' + item.rarity;
    wrap.style.setProperty('--rc', RARITY[item.rarity].color);
    const ph = document.createElement('span');
    ph.className = 'ga-ph';
    ph.textContent = GENRE_MARK[item.genre] || '✦';
    wrap.append(ph);
    const im = new Image();
    im.alt = '';
    im.className = 'ga-img';
    im.onload = () => { ph.remove(); wrap.append(im); };
    im.src = 'assets/gacha_' + item.id + '.webp';
    return wrap;
  }
  Gacha.art = art;

  // ---------- screen ----------
  Gacha.open = function () {
    root.App.show('gacha');
    render();
  };
  function render() {
    const g = st();
    $('#ga-own').textContent = Gacha.ownedCount();
    $('#ga-pts').textContent = Math.min(g.points || 0, 9999);
    $('#ga-ptbar').style.width = Math.min(100, ((g.points || 0) / GA.exchangePoints) * 100) + '%';
    $('#ga-exchange').disabled = (g.points || 0) < GA.exchangePoints;
    $('#ga-1').disabled = S.coins() < GA.cost1;
    $('#ga-10').disabled = S.coins() < GA.cost10;
    root.App.updateChrome();
  }
  Gacha.render = render;

  function buy(n) {
    if (Gacha.busy) return;
    const cost = n === 10 ? GA.cost10 : GA.cost1;
    if (!S.spend('coins', cost, n === 10 ? 'ガチャ10連' : 'ガチャ')) { root.App.toast('コインが足りません'); return; }
    const results = n === 10 ? pullTen() : [pullOne(false)];
    S.changed({ soon: true });
    show(results);
  }

  function showRates() {
    const p = $('#ga-rate-panel');
    p.hidden = !p.hidden;
  }

  function openExchange() {
    const g = st();
    if ((g.points || 0) < GA.exchangePoints) return;
    const body = document.createElement('div');
    body.className = 'ga-ex';
    const p = document.createElement('p');
    p.className = 'panel-text';
    p.textContent = GA.exchangePoints + 'ポイントで、選んだレアリティの中から持っていないアイテムを1つもらえます。';
    body.append(p);
    let dlg = null;
    GA.rarities.slice().reverse().forEach((r) => {
      const pool = byRarity(r.id);
      const have = pool.filter((it) => g.owned[it.id]).length;
      const done = have === pool.length;
      const b = document.createElement('button');
      b.className = 'btn ga-ex-btn';
      b.style.setProperty('--rc', r.color);
      b.innerHTML = '<span class="ga-rbadge">' + r.label + '</span><span>' + have + ' / ' + pool.length + (done ? '(コンプリート済み)' : '') + '</span>';
      b.onclick = () => {
        const go = () => {
          dlg.close();
          const res = exchange(r.id);
          if (!res) return;
          S.changed({ soon: true });
          show([res], { exchange: true });
        };
        if (done) {
          root.App.dialog({
            title: r.label + 'はコンプリート済みです',
            body: 'この中からランダムに1つ出ますが、必ず持っている物になり、' + r.refund + 'コインに変わります。交換しますか?',
            buttons: [{ label: 'やめる' }, { label: '交換する', primary: true, onClick: go }],
          });
        } else go();
      };
      body.append(b);
    });
    dlg = root.App.dialog({ title: 'ポイント交換', body, cls: 'ga-ex-panel' });
  }

  // ---------- reveal show ----------
  const show_ = { list: [], idx: 0, t0: 0, raf: 0, phase: 'idle', opts: {} };
  function show(list, opts) {
    Gacha.busy = true;
    show_.list = list; show_.idx = 0; show_.opts = opts || {};
    $('#ga-show').hidden = false;
    $('#ga-grid').hidden = true;
    $('#ga-card').hidden = true;
    $('#ga-skip').hidden = list.length < 2;
    $('#ga-tap').hidden = true;
    startOne();
    cancelAnimationFrame(show_.raf);
    const loop = () => { draw(); show_.raf = requestAnimationFrame(loop); };
    show_.raf = requestAnimationFrame(loop);
  }
  function startOne() {
    show_.phase = 'charge';
    show_.t0 = performance.now();
    $('#ga-card').hidden = true;
    $('#ga-tap').hidden = true;
    Snd.play('select');
  }
  function chargeTime(r) { return root.App.reduceMotion() ? 250 : ({ N: 900, R: 1100, SR: 1500, SSR: 2200 }[r]); }
  function reveal() {
    const res = show_.list[show_.idx];
    show_.phase = 'card';
    show_.t0 = performance.now();
    const card = $('#ga-card');
    card.textContent = '';
    card.className = 'ga-card r-' + res.item.rarity;
    card.style.setProperty('--rc', RARITY[res.item.rarity].color);
    const badge = document.createElement('div');
    badge.className = 'ga-rbadge big';
    badge.textContent = res.item.rarity;
    const nm = document.createElement('div');
    nm.className = 'ga-name';
    nm.textContent = res.item.name;
    const tag = document.createElement('div');
    tag.className = res.isNew ? 'ga-new' : 'ga-dup';
    tag.textContent = res.isNew ? 'NEW!' : '持っているので +' + res.coins + 'コイン';
    const ds = document.createElement('div');
    ds.className = 'ga-desc';
    ds.textContent = res.item.desc;
    card.append(badge, art(res.item, 'big'), nm, tag, ds);
    if (show_.list.length > 1) {
      const c = document.createElement('div');
      c.className = 'ga-count';
      c.textContent = (show_.idx + 1) + ' / ' + show_.list.length;
      card.append(c);
    }
    card.hidden = false;
    $('#ga-tap').hidden = false;
    $('#ga-tap').textContent = show_.idx < show_.list.length - 1 ? 'タップで次へ' : 'タップで閉じる';
    Snd.play({ N: 'reveal', R: 'sparkle', SR: 'chime', SSR: 'magic' }[res.item.rarity]);
    if (!res.isNew) setTimeout(() => Snd.play('coin'), 300);
    burst(res.item.rarity);
  }
  function next() {
    if (show_.phase === 'charge') { reveal(); return; }
    if (show_.phase === 'grid') { close(); return; }
    if (show_.phase === 'card') {
      if (show_.idx < show_.list.length - 1) { show_.idx++; startOne(); }
      else if (show_.list.length > 1) showGrid();
      else close();
    }
  }
  function showGrid() {
    show_.phase = 'grid';
    $('#ga-card').hidden = true;
    $('#ga-skip').hidden = true;
    const grid = $('#ga-grid');
    grid.textContent = '';
    show_.list.forEach((res) => {
      const cell = document.createElement('div');
      cell.className = 'ga-cell r-' + res.item.rarity;
      cell.style.setProperty('--rc', RARITY[res.item.rarity].color);
      const b = document.createElement('span');
      b.className = 'ga-rbadge';
      b.textContent = res.item.rarity;
      const n = document.createElement('span');
      n.className = 'ga-cname';
      n.textContent = res.item.name;
      const t = document.createElement('span');
      t.className = res.isNew ? 'ga-new' : 'ga-dup';
      t.textContent = res.isNew ? 'NEW' : '+' + res.coins;
      cell.append(b, art(res.item), n, t);
      grid.append(cell);
    });
    grid.hidden = false;
    $('#ga-tap').hidden = false;
    $('#ga-tap').textContent = 'タップで閉じる';
    const best = show_.list.reduce((a, r) => Math.max(a, RARITY[r.item.rarity].order), 0);
    burst(GA.rarities[best].id);
  }
  function skip() {
    if (show_.list.length > 1) showGrid(); else next();
  }
  function close() {
    cancelAnimationFrame(show_.raf);
    $('#ga-show').hidden = true;
    show_.phase = 'idle';
    Gacha.busy = false;
    render();
    root.App.checkAchievementToast();
  }

  // ---------- canvas effects: the crystal orb charging up in the rarity colour ----------
  const parts = [];
  function burst(rid) {
    const cv = $('#ga-cv');
    const W = cv.clientWidth, H = cv.clientHeight;
    const n = { N: 18, R: 30, SR: 50, SSR: 90 }[rid];
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * (rid === 'SSR' ? 9 : 6);
      parts.push({ x: W / 2, y: H * 0.42, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, c: RARITY[rid].color, s: 4 + Math.random() * 8, rainbow: rid === 'SSR' });
    }
  }
  function draw() {
    const cv = $('#ga-cv');
    const dpr = Math.min(root.devicePixelRatio || 1, 2);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const t = performance.now();
    const res = show_.list[show_.idx];
    if (show_.phase === 'charge' && res) {
      const rid = res.item.rarity;
      const dur = chargeTime(rid);
      const p = Math.min(1, (t - show_.t0) / dur);
      const cx = W / 2, cy = H * 0.42, r = Math.min(W, H) * 0.16;
      // the orb starts silver and only shows its true colour as it charges
      const col = p < 0.55 ? '#c9d4ff' : RARITY[rid].color;
      const glow = 20 + p * 60 * (1 + RARITY[rid].order);
      // light rays for SR / SSR
      if (RARITY[rid].order >= 2 && p > 0.55) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t / 900);
        for (let k = 0; k < 12; k++) {
          ctx.rotate(Math.PI / 6);
          const g = ctx.createLinearGradient(0, 0, 0, -Math.max(W, H));
          g.addColorStop(0, rid === 'SSR' ? 'hsla(' + ((k * 30 + t / 10) % 360) + ',90%,70%,0.55)' : 'rgba(255,220,120,0.45)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(-12, 0, 24, -Math.max(W, H));
        }
        ctx.restore();
      }
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = glow;
      const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, col);
      g.addColorStop(1, 'rgba(40,20,80,0.9)');
      ctx.fillStyle = g;
      const wob = Math.sin(t / 60) * p * 4;
      ctx.beginPath(); ctx.arc(cx + wob, cy, r * (1 + p * 0.12), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // swirling motes being pulled in
      for (let k = 0; k < 14; k++) {
        const a = k / 14 * Math.PI * 2 + t / 400;
        const d = r * (2.4 - p * 1.3) + Math.sin(t / 200 + k) * 6;
        ctx.fillStyle = col; ctx.globalAlpha = 0.5 + 0.5 * p;
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2 + p * 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (p >= 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(0, 0, W, H);
        reveal();
      }
    }
    for (let k = parts.length - 1; k >= 0; k--) {
      const q = parts[k];
      q.x += q.vx; q.y += q.vy; q.vy += 0.08; q.life -= 0.015;
      if (q.life <= 0) { parts.splice(k, 1); continue; }
      ctx.globalAlpha = q.life;
      ctx.fillStyle = q.rainbow ? 'hsl(' + ((q.x + q.y + t / 5) % 360) + ',90%,70%)' : q.c;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.s * q.life, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- collection page ----------
  Gacha.renderCollection = function (box) {
    const g = st();
    box.textContent = '';
    const own = Gacha.ownedCount();
    const head = document.createElement('div');
    head.className = 'ga-coll-head';
    head.innerHTML = '<span>所持率 <b>' + Math.round(own / GA.items.length * 100) + '%</b>(' + own + ' / ' + GA.items.length + ')</span>';
    box.append(head);
    GA.genres.forEach((gen) => {
      const items = GA.items.filter((it) => it.genre === gen.id).sort((a, b) => RARITY[a.rarity].order - RARITY[b.rarity].order);
      const have = items.filter((it) => g.owned[it.id]).length;
      const sec = document.createElement('section');
      sec.className = 'shelf ga-shelf' + (have === items.length ? ' done' : '');
      const hd = document.createElement('header');
      hd.className = 'shelf-head';
      const h3 = document.createElement('h3');
      h3.textContent = gen.name;
      const cnt = document.createElement('span');
      cnt.className = 'shelf-count';
      cnt.textContent = have + ' / ' + items.length;
      const gauge = document.createElement('span');
      gauge.className = 'gauge';
      const gi = document.createElement('i');
      gi.style.width = (have / items.length * 100) + '%';
      gauge.append(gi);
      hd.append(h3, cnt, gauge);
      sec.append(hd);
      const slots = document.createElement('div');
      slots.className = 'slots';
      items.forEach((it) => {
        const owned = !!g.owned[it.id];
        const b = document.createElement('button');
        b.className = 'slot ga-slot r-' + it.rarity + (owned ? ' got' : '');
        b.style.setProperty('--rc', RARITY[it.rarity].color);
        b.setAttribute('aria-label', owned ? it.name : it.rarity + ' 未所持');
        const badge = document.createElement('span');
        badge.className = 'ga-rbadge small';
        badge.textContent = it.rarity;
        if (owned) b.append(art(it)); else { const q = document.createElement('span'); q.className = 'slot-hidden'; q.textContent = '?'; b.append(q); }
        b.append(badge);
        b.onclick = () => {
          if (!owned) { root.App.toast(it.rarity + 'のアイテムです。ガチャで手に入ります'); return; }
          const body = document.createElement('div');
          body.className = 'ga-detail';
          const nm = document.createElement('p'); nm.className = 'ga-name'; nm.textContent = it.name;
          const ds = document.createElement('p'); ds.className = 'panel-text'; ds.textContent = it.desc;
          const meta = document.createElement('p'); meta.className = 'note'; meta.textContent = gen.name + ' · ' + it.rarity + ' · 当たった回数 ' + g.owned[it.id];
          body.append(art(it, 'big'), nm, ds, meta);
          root.App.dialog({ title: it.rarity, body, cls: 'ga-detail-panel', buttons: [{ label: '閉じる', primary: true }] });
        };
        slots.append(b);
      });
      sec.append(slots);
      box.append(sec);
    });
  };

  // ---------- wiring ----------
  function wire() {
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    on('#ga-1', () => buy(1));
    on('#ga-10', () => buy(10));
    on('#ga-rates', showRates);
    on('#ga-rate-close', showRates);
    on('#ga-exchange', openExchange);
    on('#ga-skip', (e) => { e.stopPropagation(); skip(); });
    const ov = $('#ga-show');
    if (ov) ov.addEventListener('click', (e) => { if (e.target.id !== 'ga-skip') next(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();

  root.Gacha = Gacha;
})(typeof globalThis !== 'undefined' ? globalThis : this);
