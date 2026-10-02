/* 魔女のポーション工房 — screens, progression, rewards */
(function (root) {
  'use strict';
  const E = root.Engine;
  const R = root.Render;
  const GD = root.GameData;
  const S = root.Store;
  const Snd = root.Sound;
  const B = root.Board;
  const C = GD.CONFIG;

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => [...(el || document).querySelectorAll(sel)];
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  }
  const img = (name, cls, alt) => h('img', { src: R.base + name + (name.includes('.') ? '' : '.webp'), class: cls || '', alt: alt || '', draggable: 'false' });

  const App = { levels: null, giants: null, screen: null, game: null, dialogOpen: 0 };
  root.App = App;

  // ---------------- helpers ----------------
  const maxUnlocked = () => {
    let m = 1;
    for (const k in S.p.lv) m = Math.max(m, +k + 1);
    return Math.min(m, C.MAX_LEVEL);
  };
  const levelData = (n) => App.levels[n - 1];
  const giantIndex = (n) => n / 5 - 1;
  const giantInfo = (idx) => App.giants[idx];
  function bottleName(idx) {
    const g = giantInfo(idx);
    const base = GD.BOTTLES[g.s];
    if (!g.v) return { name: base[0], potion: base[1], desc: base[2] };
    const V = GD.VARIANTS[g.v];
    return { name: V.name + 'の' + base[0], potion: V.name + 'の' + base[1], desc: V.flavor + '特別な瓶。' + base[2] };
  }
  function kindsLabel(k) {
    const map = { giant: '巨大ボトル', blind: 'ブラインド', curtain: 'カーテン' };
    return k.map((x) => map[x]);
  }
  function starsFor(state, lv) {
    const blind = lv.k.includes('blind');
    const r = state.moves / lv.par;
    let st = r <= (blind ? 1.4 : 1.2) ? 3 : r <= (blind ? 2.0 : 1.6) ? 2 : 1;
    return st;
  }
  function vibrate(ms) { if (S.p.settings.vibration) Snd.vibrate(ms); }
  function fmtDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // ---------------- toast & dialogs ----------------
  function toast(text, icon) {
    const t = h('div', { class: 'toast', role: 'status' }, icon ? img(icon, 'toast-ic') : null, h('span', { text }));
    $('#toasts').append(t);
    setTimeout(() => t.classList.add('out'), 2400);
    setTimeout(() => t.remove(), 2900);
  }
  App.toast = toast;

  function dialog(opts) {
    // opts: {title, body (node|string), buttons:[{label, primary, danger, onClick, keep}], cls, onClose, closable}
    const layer = $('#dialogs');
    const close = () => {
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), 180);
      App.dialogOpen = Math.max(0, App.dialogOpen - 1);
      opts.onClose && opts.onClose();
    };
    const btns = (opts.buttons || []).map((b) => h('button', {
      class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '') + (b.small ? ' small' : ''),
      onclick: () => { Snd.play('tap'); if (!b.keep) close(); b.onClick && b.onClick(close); },
      disabled: b.disabled,
    }, b.label));
    const panel = h('div', { class: 'panel ' + (opts.cls || ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || '' },
      opts.title ? h('h2', { class: 'panel-title', text: opts.title }) : null,
      typeof opts.body === 'string' ? h('p', { class: 'panel-text', text: opts.body }) : opts.body,
      btns.length ? h('div', { class: 'panel-actions' }, btns) : null,
      opts.closable !== false ? h('button', { class: 'panel-x', 'aria-label': '閉じる', onclick: close }, '×') : null);
    const wrap = h('div', { class: 'dlg-wrap', onclick: (e) => { if (e.target === wrap && opts.closable !== false) close(); } }, panel);
    layer.append(wrap);
    App.dialogOpen++;
    setTimeout(() => { const f = panel.querySelector('button.primary') || panel.querySelector('button'); f && f.focus({ preventScroll: true }); }, 50);
    return { close, panel };
  }
  App.dialog = dialog;
  function confirmDlg(title, body, yes, onYes, danger) {
    return dialog({ title, body, buttons: [{ label: 'やめる' }, { label: yes, primary: !danger, danger, onClick: onYes }] });
  }
  function ruleCard(key, then) {
    const c = GD.RULE_CARDS[key];
    if (!c || S.p.seen.includes('card:' + key)) { then && then(); return; }
    S.p.seen.push('card:' + key);
    S.changed();
    dialog({ title: c.title, body: c.body, cls: 'card', buttons: [{ label: 'わかった', primary: true }], onClose: then });
  }

  // ---------------- screens ----------------
  function show(id) {
    $$('.screen').forEach((s) => { s.hidden = s.id !== id; });
    App.screen = id;
    if (id !== 'game') B.stop();
    if (id !== 'mini' && root.Minis) root.Minis.stop();
    Snd.music(musicFor(id));
    updateChrome();
    window.scrollTo(0, 0);
  }
  App.show = show;
  function musicFor(id) {
    const g = App.game;
    if (id === 'game') return g && g.lv && (g.lv.k.includes('giant') || g.daily) ? 'mystic' : 'home';
    return { title: 'home', levels: 'home', shop: 'home', collection: 'mystic', achievements: 'home', daily: 'mystic', minis: 'mini', mini: 'mini' }[id] || 'home';
  }

  function updateChrome() {
    $$('[data-coins]').forEach((el) => { el.textContent = S.coins().toLocaleString('ja-JP'); });
    const bg = GD.CONFIG.COSMETICS.find((c) => c.id === S.p.cosmetics.bg) || GD.CONFIG.COSMETICS.find((c) => c.id === 'workshop');
    const root2 = document.documentElement;
    let bgName = bg.img;
    if (App.screen === 'shop') bgName = 'shop_bg';
    if (App.screen === 'collection') bgName = 'collection_shelf';
    root2.style.setProperty('--bg-p', `url("${R.base}${bgName === 'shop_bg' || bgName === 'collection_shelf' ? bgName : bgName + '_portrait'}.webp")`);
    root2.style.setProperty('--bg-l', `url("${R.base}${bgName === 'shop_bg' || bgName === 'collection_shelf' ? bgName : bgName + '_landscape'}.webp")`);
    const ach = achState();
    $$('[data-ach-dot]').forEach((el) => { el.hidden = !ach.some((a) => a.claimable > 0); });
    if (App.screen === 'game') updateToolbar();
  }
  App.updateChrome = updateChrome;

  // ---------------- boot ----------------
  const CORE = ['bg_portrait', 'bg_landscape', 'title_logo', 'ui_buttons_0', 'ui_buttons_1', 'ui_buttons_2', 'ui_buttons_3', 'ui_buttons_4',
    'bottle_back', 'bottle_front', 'bottle_cap', 'coin', 'star_icons_0', 'star_icons_1', 'particle_sparkle', 'panel_frame',
    'item_icons_0', 'item_icons_1', 'item_icons_2', 'fog_unknown', 'curtain', 'curtain_tag', 'letter'];

  App.boot = async function () {
    S.load();
    applySettings();
    buildRunes();
    const setProg = (p) => {
      const lit = Math.round(p * 16);
      $$('#runes text').forEach((t, i) => t.classList.toggle('lit', i < lit));
    };
    let done = 0;
    const total = CORE.length + 3;
    const tick = () => setProg(++done / total);
    try {
      const [lvRes, shRes] = await Promise.all([
        fetch('levels.json').then((r) => r.json()).then((x) => { tick(); return x; }),
        fetch('shapes.json').then((r) => r.json()).then((x) => { tick(); return x; }),
      ]);
      App.levels = lvRes.levels; App.giants = lvRes.giants; App.meta = lvRes;
      R.shapes = shRes.shapes; R.sheets = shRes.sheets;
    } catch (e) {
      $('#loading-msg').textContent = 'データを読み込めませんでした。ページを開き直してください。';
      return;
    }
    await Promise.all(CORE.map((n) => R.load(n).then(tick)));
    await Promise.all([R.load('bottle_mask', 'bottle_mask.png'), document.fonts ? document.fonts.ready.catch(() => {}) : null]);
    tick();
    B.init($('#board'), boardHooks);
    S.on(updateChrome);
    setupKeys();
    $('#loading').classList.add('burst');
    setTimeout(() => { $('#loading').hidden = true; }, 700);
    renderTitle();
    show('title');
    setTimeout(loginBonus, 900);
    demoLoop();
    window.addEventListener('pagehide', () => { saveCurrent(true); S.flush(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { saveCurrent(true); S.flush(); } });
  };

  function buildRunes() {
    const g = $('#runes');
    if (!g || g.childElementCount) return;
    const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊ';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', 100 + Math.cos(a) * 78);
      t.setAttribute('y', 100 + Math.sin(a) * 78 + 5);
      t.setAttribute('text-anchor', 'middle');
      t.textContent = runes[i];
      g.append(t);
    }
  }

  function applySettings() {
    const st = S.p.settings;
    Snd.setVolumes(st.se, st.bgm);
    const reduce = st.reduceMotion || (root.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    B.reduce = reduce;
    B.marks = st.colorMarks;
    document.documentElement.classList.toggle('reduce', !!reduce);
  }

  // ---------------- title ----------------
  function renderTitle() {
    const t = $('#title-badge');
    const tt = currentTitle();
    t.textContent = tt || '';
    t.hidden = !tt;
    const dailyBtn = $('#m-daily');
    dailyBtn.classList.toggle('locked', !dailyUnlocked());
    $('#m-play-sub').textContent = 'レベル ' + nextPlayLevel();
  }
  function nextPlayLevel() {
    const cur = S.p.current;
    if (cur && !cur.daily && cur.level) return cur.level;
    return maxUnlocked();
  }
  function dailyUnlocked() { return !!S.p.lv[C.DAILY_UNLOCK]; }

  function startAudio() {
    const first = !Snd.ctx;
    Snd.init();
    if (first && Snd.ctx) { Snd.music(musicFor(App.screen)); Snd.preloadMusic(); }
  }
  document.addEventListener('pointerdown', startAudio, { capture: true });
  document.addEventListener('keydown', startAudio, { capture: true });

  const menu = {
    play: () => startLevel(nextPlayLevel()),
    levels: () => { renderLevels(); show('levels'); },
    daily: () => {
      if (!dailyUnlocked()) { toast('レベル' + C.DAILY_UNLOCK + 'をクリアすると遊べます'); return; }
      openDaily(); show('daily'); ruleCard('daily');
    },
    minis: () => { show('minis'); ruleCard('minigame'); },
    shop: () => { renderShop(); show('shop'); ruleCard('shop'); },
    collection: () => { renderCollection(); show('collection'); },
    achievements: () => { renderAchievements(); show('achievements'); },
    settings: () => openSettings(false),
  };


  // ---------------- title demo: bottles pouring by themselves ----------------
  const Demo = { s: null, anim: null, next: 0, raf: 0 };
  function demoReset() {
    const rng = E.mulberry32(Date.now() & 0xffff);
    const cols = E.shuffleArr([...Array(12).keys()], rng).slice(0, 3);
    const pool = [];
    cols.forEach((c) => { for (let k = 0; k < 4; k++) pool.push(c); });
    E.shuffleArr(pool, rng);
    Demo.s = E.fromLevel({ n: 0, k: [], cap: 4, b: [pool.slice(0, 4), pool.slice(4, 8), pool.slice(8, 12), []] });
  }
  function demoLoop() {
    Demo.raf = requestAnimationFrame(demoLoop);
    if (App.screen !== 'title' || document.hidden) return;
    const cv = $('#demo');
    const v = R.vessel('bottle');
    if (!cv || !v) return;
    const dpr = Math.min(root.devicePixelRatio || 1, 2);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!Demo.s || E.isSolved(Demo.s)) demoReset();
    const s = Demo.s;
    const bh = H * 0.82, bw = bh * v.aspect;
    const gap = bw * 1.1;
    const total = 4 * bw + 3 * gap;
    const rects = s.bottles.map((_, i) => ({ x: (W - total) / 2 + i * (bw + gap), y: H - bh - 4, w: bw, h: bh }));
    const t = performance.now();
    if (!Demo.anim && t > Demo.next) {
      const moves = E.legalMoves(s, true);
      if (!moves.length) { demoReset(); return; }
      const m = moves[Math.floor(Math.random() * moves.length)];
      Demo.anim = { from: m[0], to: m[1], n: E.pourAmount(s, m[0], m[1]), c: E.top(s.bottles[m[0]]).c, t0: t };
    }
    const odpr = R.dpr; R.dpr = dpr;
    const segs = (layers, extra) => {
      const out = []; let f = 0;
      const list = layers.map((l) => ({ c: l.c, a: 1 }));
      if (extra && extra.remove) { let r = extra.remove; while (r > 0 && list.length) { const tl = list[list.length - 1]; const take = Math.min(tl.a, r); tl.a -= take; r -= take; if (tl.a <= 1e-4) list.pop(); } }
      if (extra && extra.add) list.push({ c: extra.add.c, a: extra.add.a });
      list.forEach((l) => { out.push({ f0: f, f1: f + l.a / 4, color: GD.COLORS[l.c].hex }); f += l.a / 4; });
      return out;
    };
    const a = Demo.anim;
    let p = 0, fill = 0, move = 0;
    if (a) {
      p = Math.min(1, (t - a.t0) / 1400);
      move = Math.min(1, p / 0.3) * (1 - Math.max(0, (p - 0.78) / 0.22));
      fill = Math.max(0, Math.min(1, (p - 0.3) / 0.48));
    }
    s.bottles.forEach((b, i) => {
      if (a && i === a.from) return;
      R.drawVessel(ctx, v, rects[i], segs(b.layers, a && i === a.to ? { add: { c: a.c, a: a.n * fill } } : null), { noLines: true });
    });
    if (a) {
      const home = rects[a.from], dst = rects[a.to];
      const dir = dst.x > home.x ? 1 : -1;
      const mx = v.geo.neckX * bw, my = v.geo.silTop * bh;
      const tx = dst.x + v.geo.neckX * bw - dir * bw * 0.18 - mx, ty = dst.y - bh * 0.1 - my;
      const rect = { x: home.x + (tx - home.x) * move, y: home.y + (ty - home.y) * move, w: bw, h: bh };
      const ang = dir * move * Math.PI * 0.42;
      if (fill > 0 && fill < 1) {
        const mouth = R.localToWorld(rect, mx, my, ang, { x: mx, y: my });
        ctx.fillStyle = GD.COLORS[a.c].hex;
        const bottomY = dst.y + R.yForFraction(v.geo, (s.bottles[a.to].layers.length + a.n * fill) / 4) * bh;
        ctx.fillRect(mouth.x - bw * 0.05, mouth.y, bw * 0.1, bottomY - mouth.y);
      }
      R.drawVessel(ctx, v, rect, segs(s.bottles[a.from].layers, { remove: a.n * fill }), { angle: ang, pivot: { x: mx, y: my }, noLines: true });
      if (p >= 1) { E.pour(s, a.from, a.to); Demo.anim = null; Demo.next = t + 900; }
    }
    R.dpr = odpr;
  }

  // ---------------- login bonus ----------------
  function loginBonus() {
    if (App.screen !== 'title') return;
    const today = S.today();
    if (S.p.login.last === today) return;
    const day = (S.p.login.day % 7) + 1;
    const rw = C.LOGIN_BONUS[day - 1];
    S.p.login = { last: today, day };
    S.changed({ soon: true });
    const parts = [];
    if (rw.coins) parts.push('コイン ' + rw.coins + '枚');
    if (rw.undo) parts.push(GD.ITEMS.undo.name + ' ×' + rw.undo);
    if (rw.shuffle) parts.push(GD.ITEMS.shuffle.name + ' ×' + rw.shuffle);
    const week = h('div', { class: 'lb-week' }, C.LOGIN_BONUS.map((r, i) => h('div', { class: 'lb-day' + (i + 1 === day ? ' today' : i + 1 < day ? ' got' : '') },
      h('span', { class: 'lb-n', text: (i + 1) + '日目' }),
      h('span', { class: 'lb-r', text: r.coins ? r.coins + '枚' : r.undo ? '砂時計' : '' }))));
    const letter = h('div', { class: 'letter' }, img('letter', 'letter-img'));
    Snd.play('letter');
    dialog({
      title: '魔女からの手紙', cls: 'login',
      body: h('div', null, letter, h('p', { class: 'panel-text', text: '今日も工房へようこそ。ささやかな贈り物です: ' + parts.join('、') }), week),
      buttons: [{ label: '受け取る', primary: true, onClick: () => { S.grant({ coins: rw.coins || 0, undo: rw.undo || 0, shuffle: rw.shuffle || 0 }, 'ログインボーナス'); Snd.play('receive'); } }],
      closable: false,
    });
  }

  // ---------------- level select ----------------
  let levelPage = null;
  function renderLevels() {
    const unlocked = maxUnlocked();
    if (levelPage === null) levelPage = Math.floor((unlocked - 1) / 20);
    const pages = Math.ceil(C.MAX_LEVEL / 20);
    levelPage = Math.max(0, Math.min(pages - 1, levelPage));
    const grid = $('#level-grid');
    grid.textContent = '';
    for (let n = levelPage * 20 + 1; n <= Math.min(C.MAX_LEVEL, levelPage * 20 + 20); n++) {
      const lv = levelData(n);
      const rec = S.p.lv[n];
      const locked = n > unlocked;
      const giant = lv.k.includes('giant');
      const cell = h('button', {
        class: 'lvl' + (locked ? ' locked' : '') + (rec ? ' cleared' : '') + (giant ? ' giant' : '') + (n === unlocked ? ' next' : ''),
        'aria-label': 'レベル' + n + (locked ? '(未解放)' : rec ? '(星' + rec.s + ')' : ''),
        onclick: () => { if (locked) { Snd.play('error'); return; } startLevel(n); },
      });
      if (giant) {
        const gi = giantInfo(giantIndex(n));
        // the bottle is shown only after it has been filled; before that its shape stays a secret
        if (rec) cell.append(img('giant_' + gi.s + '_back', 'lvl-giant'));
        else cell.append(h('span', { class: 'lvl-giant-q', 'aria-hidden': 'true' }));
      }
      cell.append(h('span', { class: 'lvl-n', text: n }));
      if (locked) cell.append(h('span', { class: 'lvl-lock', 'aria-hidden': 'true', text: '🔒︎' }));
      else if (rec) cell.append(h('span', { class: 'lvl-stars' }, [1, 2, 3].map((k) => img(k <= rec.s ? 'star_icons_0' : 'star_icons_1', 'mini-star'))));
      const kinds = lv.k.filter((k) => k !== 'giant');
      if (kinds.length && !locked) cell.append(h('span', { class: 'lvl-kind', text: kinds.map((k) => (k === 'blind' ? '霧' : '幕')).join('') }));
      grid.append(cell);
    }
    $('#lv-page').textContent = (levelPage * 20 + 1) + '〜' + Math.min(C.MAX_LEVEL, levelPage * 20 + 20);
    $('#lv-prev').disabled = levelPage === 0;
    $('#lv-next').disabled = levelPage >= pages - 1;
    const total = Object.values(S.p.lv).reduce((a, r) => a + r.s, 0);
    $('#lv-summary').textContent = '集めた星 ' + total + ' / ' + C.MAX_LEVEL * 3;
  }

  // ---------------- game session ----------------
  function currentVesselKey() {
    const c = C.COSMETICS.find((x) => x.id === S.p.cosmetics.bottle);
    return c ? c.img : 'bottle';
  }

  async function startLevel(n, opts) {
    opts = opts || {};
    startAudio();
    const lv = levelData(n);
    if (!lv) return;
    let state = null;
    const cur = S.p.current;
    if (!opts.fresh && cur && cur.level === n && (cur.daily || null) === (opts.daily || null) && cur.st) {
      try { state = cur.st; if (!state.bottles || state.cap !== lv.cap || (lv.g && (!state.giant || state.giant.capacity == null))) state = null; } catch (e) { state = null; }
    }
    if (!state) state = E.fromLevel(lv);
    B.guide = null; B.pick = null; B.pickable = null; $('#t-shuffle').classList.remove('pulse');
    $('#hand').hidden = true; $('#hint').hidden = true; $('#skip-tut').hidden = true;
    App.game = { n, lv, daily: opts.daily || null, s: state, tutorial: null, freeUse: {}, lastSave: 0 };
    $('#g-level').textContent = opts.daily ? 'デイリー ' + opts.daily.slice(5).replace('-', '/') : 'レベル ' + n;
    $('#g-kinds').textContent = kindsLabel(lv.k).join(' · ');
    $('#g-par').textContent = lv.par;
    show('game');
    $('#g-loading').hidden = false;
    const vkey = currentVesselKey();
    let vessel = await R.loadVessel(vkey);
    // bottles drawn with their own stopper get no extra cork when finished
    const cos = C.COSMETICS.find((x) => x.img === vkey);
    B.noCork = !!(cos && cos.stopper);
    if (!vessel) vessel = (await R.loadVessel('bottle')) || R.fallbackVessel();
    let giant = null;
    if (lv.g) {
      const gkey = 'giant_' + lv.g.s;
      const loads = [R.loadVessel(gkey)];
      if (lv.g.v) loads.push(R.load('giant_trim_' + lv.g.v));
      giant = (await Promise.all(loads))[0];
    }
    $('#g-loading').hidden = true;
    if (App.screen !== 'game' || !App.game || App.game.n !== n) return;
    B.load(lv, state, vessel, giant);
    updateToolbar();
    const kindKey = lv.k.join('+');
    const cards = [];
    lv.k.forEach((k) => cards.push(k));
    if (lv.k.length > 1) cards.push(kindKey);
    const next = () => {
      const k = cards.shift();
      if (k) ruleCard(k, next); else setupTutorial();
    };
    next();
  }
  App.startLevel = startLevel;

  function saveCurrent(force) {
    const g = App.game;
    if (!g || !g.s || E.isSolved(g.s)) return;
    const t = Date.now();
    if (!force && t - g.lastSave < 5000) return;
    g.lastSave = t;
    S.p.current = { level: g.n, daily: g.daily, st: JSON.parse(JSON.stringify(g.s)), t };
    S.changed();
  }
  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveCurrent(true), 5000);
  }

  const boardHooks = {
    canInteract: () => App.dialogOpen === 0,
    vibrate,
    onMove(ev) {
      const g = App.game;
      if (ev.curtains.length) S.count('curtains', ev.curtains.length);
      $('#g-moves').textContent = g.s.moves;
      if (!ev.completed) vibrate(10);
      scheduleSave();
      updateToolbar();
    },
    afterMove() {
      const g = App.game;
      tutorialAfterMove();
      if (E.legalMoves(g.s, true).length === 0) setTimeout(stuckDialog, 350);
    },
    onSolved,
    onCurtainTap(c) {
      if (c.type === 'count') toast('瓶をあと' + Math.max(0, c.n - E.completedCount(App.game.s)) + '本完成させると開きます');
      else toast(c.colors.map((x) => GD.COLORS[x].name).join('と') + 'の瓶を完成させると開きます');
    },
    onGuideStep() { hideHand(); },
  };

  function updateToolbar() {
    const g = App.game;
    if (!g || !g.s) return;
    const s = g.s;
    $('#g-moves').textContent = s.moves;
    const can = {
      undo: s.history.length > 0,
      shuffle: s.bottles.some((b, i) => E.canShuffleBottle(s, i)),
      bottle: s.added < 2,
    };
    for (const k of ['undo', 'shuffle', 'bottle']) {
      const btn = $('#t-' + k);
      const cnt = S.items(k);
      btn.querySelector('.badge').textContent = g.freeUse[k] ? '無料' : cnt;
      btn.classList.toggle('empty', cnt === 0 && !g.freeUse[k]);
      btn.disabled = !can[k];
    }
  }

  function useItem(k) {
    const g = App.game;
    if (!g || B.busy || B.anims.length || App.dialogOpen) return;
    const s = g.s;
    const free = !!g.freeUse[k];
    if (!free && S.items(k) <= 0) { quickBuy(k); return; }
    if (k === 'undo') {
      if (!s.history.length) return;
      E.undo(s);
      B.selected = null;
      if (free) g.freeUse.undo = false; else S.spend('undo', 1, '一手戻す');
      s.itemsUsed++;
      Snd.play('select');
      tutorialItemUsed('undo');
    } else if (k === 'bottle') {
      if (s.added >= 2) return;
      E.addBottle(s);
      B.lift.push(0);
      B.layout();
      if (free) g.freeUse.bottle = false; else S.spend('bottle', 1, 'ボトル追加');
      s.itemsUsed++;
      Snd.play('cork');
      tutorialItemUsed('bottle');
    } else if (k === 'shuffle') {
      doShuffle(free);
      return;
    }
    updateToolbar();
    scheduleSave();
  }

  let worker = null;
  function checkSolvable(state) {
    return new Promise((resolve) => {
      try {
        if (!worker) worker = new Worker('solver-worker.js');
        const id = Math.random();
        const onMsg = (e) => { if (e.data.id === id) { worker.removeEventListener('message', onMsg); resolve(e.data.ok); } };
        worker.addEventListener('message', onMsg);
        worker.postMessage({ id, state: JSON.parse(JSON.stringify(state)), maxNodes: 60000, weight: 2.5 });
        setTimeout(() => resolve(null), 6000);
      } catch (err) {
        // no worker: check on the main thread with a smaller budget
        const r = E.solve(state, 20000, 3);
        resolve(!!r.path);
      }
    });
  }

  // shuffle item: the player picks one small bottle, and only that bottle's layers are mixed
  function doShuffle(free) {
    const g = App.game;
    const s = g.s;
    if (B.pick) { cancelPick(); return; }
    if (!s.bottles.some((b, i) => E.canShuffleBottle(s, i))) { toast('混ぜられる瓶がありません'); return; }
    B.selected = null;
    B.pickable = (i) => i !== 'g' && E.canShuffleBottle(s, i);
    B.pick = (i) => { cancelPick(); shuffleOne(i, free); };
    $('#t-shuffle').classList.add('pulse');
    showHint('混ぜる瓶を1本選んでください。もう一度杖を押すとやめます。');
  }
  function cancelPick() {
    B.pick = null;
    B.pickable = null;
    $('#t-shuffle').classList.remove('pulse');
    hideHint();
  }
  App.cancelPick = cancelPick;

  async function shuffleOne(i, free) {
    const g = App.game;
    const s = g.s;
    const rng = E.mulberry32((Date.now() & 0xffffff) ^ (s.moves * 7919) ^ (i * 104729));
    $('#g-busy').hidden = false;
    let found = null;
    for (let tries = 0; tries < 20; tries++) {
      const c = E.clone(s);
      if (!E.shuffleBottle(c, i, rng)) continue;
      c.history = [];
      E.updateCurtains(c);
      const ok = E.isSolved(c) || await checkSolvable(c);
      if (ok) { found = c; break; }
    }
    $('#g-busy').hidden = true;
    if (!found) { toast('この瓶はいま混ぜられません(アイテムは減っていません)'); return; }
    s.bottles[i].layers = found.bottles[i].layers;
    s.history = [];
    s.shuffled = true;
    s.itemsUsed++;
    if (free) g.freeUse.shuffle = false; else S.spend('shuffle', 1, 'シャッフル');
    Snd.play('magic');
    const r = B.rects[i];
    B.reveals[i] = performance.now();
    B.burst(r.x + r.w / 2, r.y + r.h * 0.4, 14, '#c7a6ff', 0.8);
    E.updateCurtains(s);
    tutorialItemUsed('shuffle');
    updateToolbar();
    scheduleSave();
    if (E.isSolved(s)) B.celebrate(false);
  }

  function quickBuy(k) {
    const p = C.PRICES.find((x) => x.item === k && x.qty === 1);
    const it = GD.ITEMS[k];
    const enough = S.coins() >= p.price;
    dialog({
      title: it.name + 'がありません',
      body: h('div', { class: 'buy-row' }, img(it.icon, 'buy-ic'), h('div', null,
        h('p', { class: 'panel-text', text: it.desc + '。コイン' + p.price + '枚で1個買えます。' }),
        h('p', { class: 'coins-line' }, img('coin', 'coin-ic'), h('span', { text: '所持 ' + S.coins() + '枚' })))),
      buttons: [
        { label: 'ミニゲームで稼ぐ', onClick: () => { saveCurrent(true); show('minis'); } },
        { label: p.price + '枚で買う', primary: true, disabled: !enough, onClick: () => { if (S.spend('coins', p.price, it.short + 'を購入')) { S.grant({ [k]: 1 }, '購入'); Snd.play('coin'); updateToolbar(); } } },
      ],
    });
  }

  function stuckDialog() {
    const g = App.game;
    if (!g || App.screen !== 'game' || E.isSolved(g.s) || App.dialogOpen) return;
    if (E.legalMoves(g.s, true).length) return;
    const btns = [];
    if (g.s.history.length) btns.push({ label: '一手戻す', onClick: () => useItem('undo') });
    btns.push({ label: 'シャッフル', onClick: () => useItem('shuffle') });
    if (g.s.added < 2) btns.push({ label: 'ボトル追加', onClick: () => useItem('bottle') });
    btns.push({ label: 'リスタート', primary: true, onClick: () => restart(true) });
    const noItems = ['undo', 'shuffle', 'bottle'].every((k) => S.items(k) === 0);
    dialog({
      title: '手詰まりです',
      body: h('div', null, h('p', { class: 'panel-text', text: '注げる組み合わせがありません。アイテムを使うか、最初からやり直しましょう。' }),
        noItems ? h('div', { class: 'panel-actions' },
          h('button', { class: 'btn small', onclick: () => { saveCurrent(true); renderShop(); show('shop'); } }, 'ショップで買う'),
          h('button', { class: 'btn small', onclick: () => { saveCurrent(true); show('minis'); } }, 'ミニゲームで稼ぐ')) : null),
      buttons: btns,
    });
  }

  function restart(noConfirm) {
    const g = App.game;
    if (!g) return;
    const go = () => {
      S.p.current = null;
      S.changed();
      startLevel(g.n, { daily: g.daily, fresh: true });
    };
    if (noConfirm) go();
    else confirmDlg('リスタート', '最初の状態に戻します。使ったアイテムは戻りません。', 'やり直す', go);
  }

  function onSolved() {
    endGuide();
    const g = App.game;
    const s = g.s;
    const lv = g.lv;
    const stars = starsFor(s, lv);
    let coins = 0;
    const notes = [];
    S.p.current = null;
    let registered = null;
    if (g.daily) {
      const prev = S.p.daily[g.daily];
      if (!prev) { coins += C.COIN.dailyClear; }
      S.p.daily[g.daily] = { s: Math.max(stars, prev ? prev.s : 0) };
      // trophy
      const ym = g.daily.slice(0, 7);
      const [y, m] = ym.split('-').map(Number);
      const days = new Date(y, m, 0).getDate();
      const cleared = Object.keys(S.p.daily).filter((d) => d.startsWith(ym)).length;
      if (cleared >= days && !S.p.trophyClaimed[ym]) {
        S.p.trophyClaimed[ym] = 1;
        coins += C.COIN.trophyFull;
        notes.push(m + '月のトロフィーが満杯になりました');
      } else notes.push(m + '月のトロフィー ' + cleared + ' / ' + days);
    } else {
      const prev = S.p.lv[g.n];
      const noItem = s.itemsUsed === 0 ? 1 : 0;
      if (!prev) {
        coins += C.COIN.clearBase + stars * C.COIN.perStar;
        if (lv.k.includes('giant')) coins += C.COIN.giantBonus;
        S.p.lv[g.n] = { s: stars, ni: noItem };
      } else {
        coins += C.COIN.replay;
        if (stars > prev.s) coins += (stars - prev.s) * C.COIN.starUp;
        S.p.lv[g.n] = { s: Math.max(prev.s, stars), ni: prev.ni || noItem };
      }
      if (lv.g) {
        const idx = giantIndex(g.n);
        const had = S.p.coll[idx];
        S.p.coll[idx] = { level: g.n, zones: [lv.g.c], stars: Math.max(stars, had ? had.stars : 0), date: had ? had.date : S.today() };
        registered = { idx, first: !had, newShape: !had && !Object.keys(S.p.coll).some((k) => +k !== idx && giantInfo(+k).s === lv.g.s) };
        checkSeries(notes);
      }
      if (g.n === C.MAX_LEVEL && !prev) notes.push('全レベル制覇! おめでとうございます');
    }
    if (coins) S.grant({ coins }, g.daily ? 'デイリー' : 'レベル' + g.n);
    S.changed({ soon: true });
    showClear(stars, coins, notes, registered);
  }

  function checkSeries(notes) {
    for (let si = 0; si < 10; si++) {
      if (S.p.seriesClaimed[si]) continue;
      let all = true;
      for (let k = 0; k < 10; k++) if (!S.p.coll[si * 10 + k]) { all = false; break; }
      if (all) {
        S.p.seriesClaimed[si] = 1;
        S.grant({ coins: C.COIN.seriesDone }, 'シリーズ完成');
        notes.push('シリーズ「' + GD.SERIES[si].name + '」完成! コイン' + C.COIN.seriesDone + '枚');
      }
    }
    if (Object.keys(S.p.coll).length >= 100 && !S.p.completeClaimed) {
      S.p.completeClaimed = 1;
      S.grant({ coins: C.COIN.collectionDone }, '図鑑コンプリート');
      if (!S.p.cosmetics.owned.includes('cauldron')) S.p.cosmetics.owned.push('cauldron');
      notes.push('図鑑コンプリート! 背景「月夜の大釜」とコイン' + C.COIN.collectionDone + '枚');
    }
  }

  function showClear(stars, coins, notes, registered) {
    const g = App.game;
    const lv = g.lv;
    const starRow = h('div', { class: 'clear-stars' }, [1, 2, 3].map((k) => img(k <= stars ? 'star_icons_0' : 'star_icons_1', 'big-star s' + k)));
    const body = h('div', { class: 'clear-body' }, starRow,
      h('dl', { class: 'clear-stats' },
        h('dt', { text: '手数' }), h('dd', { text: g.s.moves }),
        h('dt', { text: '目安の手数' }), h('dd', { text: lv.par }),
        coins ? [h('dt', { text: 'コイン' }), h('dd', { class: 'coin-dd' }, img('coin', 'coin-ic'), '+' + coins)] : null),
      notes.map((n) => h('p', { class: 'note', text: n })),
      registered ? h('div', { class: 'reg' }, img('giant_' + giantInfo(registered.idx).s + '_back', 'reg-img'),
        h('div', null, h('p', { class: 'reg-title', text: registered.first ? '図鑑に登録しました' : '図鑑の記録を更新しました' }),
          h('p', { class: 'reg-name', text: bottleName(registered.idx).name + '「' + bottleName(registered.idx).potion + '」' }),
          registered.newShape ? h('p', { class: 'reg-desc', text: bottleName(registered.idx).desc }) : null)) : null);
    // two buttons only: 次へ (next level, or back to the calendar after a daily) and ホーム
    const goHome = () => { renderTitle(); show('title'); };
    const next = g.daily
      ? () => { renderDaily(); show('daily'); }
      : g.n < C.MAX_LEVEL ? () => startLevel(g.n + 1) : goHome;
    const buttons = [{ label: 'ホーム', onClick: goHome }, { label: '次へ', primary: true, onClick: next }];
    if (coins) Snd.play('coin');
    dialog({ title: stars === 3 ? 'すばらしい調合!' : 'ポーション完成!', body, buttons, cls: 'clear', closable: false });
    checkAchievementToast();
  }

  // ---------------- tutorials ----------------
  function setupTutorial() {
    const g = App.game;
    if (g.daily) return;
    const seen = (k) => S.p.seen.includes(k);
    const mark = (k) => { if (!seen(k)) { S.p.seen.push(k); S.changed(); } };
    if (g.n === 1 && !seen('tut1') && g.s.moves === 0) {
      const r = E.solve(g.s, 20000, 1);
      if (!r.path) return;
      g.tutorial = { kind: 'basic', path: r.path, step: 0 };
      showSkip(() => { endGuide(); mark('tut1'); });
      guideNext();
    } else if (g.n === 2 && !seen('tut2')) {
      g.tutorial = { kind: 'undo' };
      g.freeUse.undo = true;
      updateToolbar();
      showSkip(() => { g.freeUse.undo = false; g.tutorial = null; hideHint(); mark('tut2'); updateToolbar(); });
    } else if (g.n === 3 && !seen('tut3')) {
      g.tutorial = { kind: 'bottle' };
      g.freeUse.bottle = true;
      updateToolbar();
      showHint('空の瓶が足りないときは「予備の薬瓶」で瓶を1本増やせます。今回は無料です。', '#t-bottle');
      showSkip(() => { g.freeUse.bottle = false; g.tutorial = null; hideHint(); mark('tut3'); updateToolbar(); });
    } else if (g.n === 4 && !seen('tut4')) {
      g.tutorial = { kind: 'shuffle' };
      showSkip(() => { g.tutorial = null; hideHint(); g.freeUse.shuffle = false; mark('tut4'); updateToolbar(); });
    }
  }
  function guideNext() {
    const g = App.game;
    const t = g.tutorial;
    if (!t || t.kind !== 'basic') return;
    const m = t.path[t.step];
    if (!m) { endGuide(); return; }
    B.guide = { from: m[0], to: m[1] };
    placeHand(m[0], 'この瓶をタップ');
    t.waitingTo = true;
  }
  function endGuide() {
    B.guide = null;
    hideHand();
    hideHint();
    hideSkip();
    const g = App.game;
    if (g) g.tutorial = null;
  }
  function tutorialAfterMove() {
    const g = App.game;
    const t = g.tutorial;
    if (!t) return;
    if (t.kind === 'basic') {
      t.step++;
      if (g.s.bottles.some((b) => E.isComplete(b, g.s.cap))) {
        B.guide = null;
        hideHand();
        showHint('同じ色で4つ揃えると完成です。あとは自由に注いでみましょう。');
        S.p.seen.push('tut1'); S.changed();
        g.tutorial = null;
        hideSkip();
        setTimeout(hideHint, 4000);
      } else guideNext();
    } else if (t.kind === 'undo' && g.s.moves === 2) {
      showHint('間違えたら「時戻りの砂時計」で1手戻せます。今回は無料です。', '#t-undo');
    } else if (t.kind === 'shuffle' && g.s.moves === 3) {
      g.freeUse.shuffle = true;
      updateToolbar();
      showHint('行き詰まったら「かき混ぜの杖」で、選んだ瓶1本の中身を混ぜ直せます。今回は無料です。', '#t-shuffle');
    }
  }
  function tutorialItemUsed(k) {
    const g = App.game;
    const t = g && g.tutorial;
    if (!t || t.kind !== k) return;
    hideHint(); hideSkip();
    g.tutorial = null;
    S.p.seen.push('tut' + { undo: 2, bottle: 3, shuffle: 4 }[k]);
    S.changed();
  }
  // placement of the pointing hand over a bottle
  const handObserver = { i: null, label: '' };
  function placeHand(i, label) {
    handObserver.i = i; handObserver.label = label;
    const hand = $('#hand');
    hand.hidden = false;
    hand.querySelector('span').textContent = label;
    positionHand();
  }
  function positionHand() {
    if (handObserver.i === null || $('#hand').hidden) return;
    const g = App.game;
    const t = g && g.tutorial;
    let i = handObserver.i;
    let label = handObserver.label;
    if (B.guide && B.selected !== null) { i = B.guide.to; label = 'ここへ注ぐ'; }
    const r = B.flashRect(i);
    if (!r) return;
    const hand = $('#hand');
    hand.querySelector('span').textContent = label;
    hand.style.left = (r.x + r.w / 2) + 'px';
    hand.style.top = (r.y + r.h * 0.55) + 'px';
    requestAnimationFrame(positionHand);
  }
  function hideHand() { $('#hand').hidden = true; setTimeout(() => { if (B.guide) { $('#hand').hidden = false; positionHand(); } }, 900); }
  function showHint(text, target) {
    const hint = $('#hint');
    hint.textContent = text;
    hint.hidden = false;
    $$('.tool.pulse').forEach((e) => e.classList.remove('pulse'));
    if (target) $(target).classList.add('pulse');
  }
  function hideHint() { $('#hint').hidden = true; $$('.tool.pulse').forEach((e) => e.classList.remove('pulse')); }
  function showSkip(fn) { const b = $('#skip-tut'); b.hidden = false; b.onclick = () => { fn(); hideSkip(); }; }
  function hideSkip() { $('#skip-tut').hidden = true; }

  // ---------------- settings ----------------
  function openSettings(inGame) {
    const st = S.p.settings;
    const row = (label, ctrl) => h('label', { class: 'set-row' }, h('span', { text: label }), ctrl);
    const slider = (key) => {
      const out = h('output', { text: st[key] });
      const inp = h('input', { type: 'range', min: 0, max: 100, value: st[key], id: 'set-' + key, oninput: (e) => { st[key] = +e.target.value; out.textContent = st[key]; applySettings(); }, onchange: () => S.changed() });
      return h('span', { class: 'set-slider' }, inp, out);
    };
    const toggle = (key) => h('input', { type: 'checkbox', class: 'switch', id: 'set-' + key, checked: st[key], onchange: (e) => { st[key] = e.target.checked; applySettings(); S.changed(); } });
    const body = h('div', { class: 'settings' },
      row('BGM', slider('bgm')),
      row('効果音', slider('se')),
      ('vibrate' in navigator) ? row('振動', toggle('vibration')) : null,
      row('色覚補助の記号', toggle('colorMarks')),
      row('演出を減らす', toggle('reduceMotion')),
      h('div', { class: 'set-row' }, h('span', { text: '進捗の保存' }), h('span', { class: 'sync', text: 'この端末のブラウザに保存' })),
      h('p', { class: 'set-note', text: '進捗はこの端末のブラウザに保存されます。ブラウザのデータを消すと進捗も消えます。別の端末とは共有されません。' }),
      inGame ? h('div', { class: 'panel-actions' },
        h('button', { class: 'btn', onclick: () => { d.close(); saveCurrent(true); renderTitle(); show('title'); } }, 'ホームに戻る')) : null,
      !inGame ? h('button', { class: 'btn danger small reset', onclick: () => resetFlow() }, '進捗をリセット') : null,
      h('p', { class: 'set-note diag', text: diagText() }));
    const d = dialog({ title: '設定', body, cls: 'settings-panel' });
  }
  App.openSettings = openSettings;
  // screen measurements, shown small in settings to help diagnose layout problems on phones
  function diagText() {
    const st = document.getElementById('stage').getBoundingClientRect();
    const mode = navigator.standalone === true ? 'ホーム画面' : (matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches ? 'アプリ' : 'ブラウザ');
    return '表示情報: ' + mode + ' / 画面 ' + screen.width + '×' + screen.height + ' / 窓 ' + innerWidth + '×' + innerHeight + ' / ゲーム ' + Math.round(st.width) + '×' + Math.round(st.height);
  }
  function resetFlow() {
    confirmDlg('進捗をリセット', 'クリアしたレベル、コイン、アイテム、図鑑などがすべて最初に戻ります。', '次へ', () => {
      confirmDlg('本当にリセットしますか?', 'この操作は取り消せません。', 'リセットする', () => {
        S.reset();
        levelPage = null;
        $$('.dlg-wrap').forEach((w) => w.remove());
        App.dialogOpen = 0;
        applySettings();
        renderTitle();
        toast('進捗をリセットしました');
      }, true);
    }, true);
  }

  // ---------------- shop ----------------
  let shopTab = 'items';
  function renderShop() {
    const box = $('#shop-body');
    box.textContent = '';
    $$('#shop .tab').forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === shopTab ? 'true' : 'false'));
    if (shopTab === 'items') {
      C.PRICES.forEach((p) => {
        const it = GD.ITEMS[p.item];
        const have = S.items(p.item);
        const full = have + p.qty > C.ITEM_MAX;
        box.append(h('div', { class: 'ware' },
          img(it.icon, 'ware-img'),
          h('div', { class: 'ware-info' },
            h('div', { class: 'ware-name', text: it.name + (p.qty > 1 ? ' ×' + p.qty : '') }),
            h('div', { class: 'ware-desc', text: it.desc }),
            h('div', { class: 'ware-have', text: '所持 ' + have + '個' })),
          h('button', {
            class: 'btn price', disabled: full || S.coins() < p.price,
            onclick: () => confirmDlg('購入の確認', 'コイン' + p.price + '枚で' + it.name + (p.qty > 1 ? 'を' + p.qty + '個' : '') + 'を買いますか?', '買う', () => {
              if (S.spend('coins', p.price, it.short + '×' + p.qty + 'を購入')) { S.grant({ [p.item]: p.qty }, '購入'); Snd.play('coin'); toast(it.name + 'を買いました', it.icon); renderShop(); }
            }),
          }, img('coin', 'coin-ic'), String(p.price))));
      });
    } else {
      ruleCard('cosmetics');
      const owned = new Set(S.p.cosmetics.owned);
      ['bottle', 'bg'].forEach((type) => {
        box.append(h('h3', { class: 'shop-sub', text: type === 'bottle' ? '瓶' : '背景' }));
        const grid = h('div', { class: 'cos-grid' });
        C.COSMETICS.filter((c) => c.type === type).forEach((c) => {
          const has = owned.has(c.id);
          const equipped = S.p.cosmetics[type] === c.id;
          const preview = type === 'bottle' ? img(c.img + '_back', 'cos-bottle') : img(c.img + '_portrait', 'cos-bg');
          const action = equipped ? h('span', { class: 'cos-state', text: '使用中' })
            : has ? h('button', { class: 'btn small', onclick: () => { S.p.cosmetics[type] = c.id; S.changed(); renderShop(); updateChrome(); toast(c.name + 'に着せ替えました'); } }, '使う')
              : c.price == null ? h('span', { class: 'cos-state', text: c.how })
                : h('button', { class: 'btn small price', disabled: S.coins() < c.price, onclick: () => previewCos(c) }, img('coin', 'coin-ic'), String(c.price));
          grid.append(h('div', { class: 'cos' + (equipped ? ' on' : ''), onclick: (e) => { if (e.target.tagName !== 'BUTTON' && !has) previewCos(c); } }, preview, h('div', { class: 'cos-name', text: c.name }), action));
        });
        box.append(grid);
      });
    }
  }
  function previewCos(c) {
    const pv = c.type === 'bottle'
      ? h('div', { class: 'pv-bottles' }, [0, 1, 2].map(() => img(c.img + '_back', 'pv-b')))
      : img(c.img + '_portrait', 'pv-bg');
    dialog({
      title: c.name, body: h('div', null, pv, h('p', { class: 'panel-text', text: c.price == null ? c.how : 'コイン' + c.price + '枚で買えます。' })),
      buttons: c.price == null ? [{ label: '閉じる' }] : [{ label: 'やめる' }, {
        label: c.price + '枚で買う', primary: true, disabled: S.coins() < c.price, onClick: () => {
          if (S.spend('coins', c.price, c.name + 'を購入')) {
            S.p.cosmetics.owned.push(c.id);
            S.p.cosmetics[c.type] = c.id;
            S.changed({ soon: true });
            Snd.play('coin');
            toast(c.name + 'を手に入れました');
            renderShop(); updateChrome();
          }
        },
      }],
    });
  }

  // ---------------- collection ----------------
  function renderCollection() {
    const box = $('#shelves');
    box.textContent = '';
    const unlocked = maxUnlocked();
    const count = Object.keys(S.p.coll).length;
    $('#coll-total').textContent = count + ' / 100';
    $('#coll-bar').style.width = count + '%';
    $('#coll-complete').hidden = count < 100;
    GD.SERIES.forEach((ser, si) => {
      const first = si * 50 + 5;
      const open = unlocked >= first;
      const got = [...Array(10).keys()].filter((k) => S.p.coll[si * 10 + k]).length;
      const row = h('section', { class: 'shelf' + (got === 10 ? ' done' : '') },
        h('header', { class: 'shelf-head' }, h('h3', { text: (si + 1) + ' ' + ser.name + (ser.variant ? 'の色違い' : '') }),
          h('span', { class: 'shelf-count', text: got + ' / 10' }), h('span', { class: 'gauge' }, h('i', { style: { width: got * 10 + '%' } })),
          got === 10 ? h('span', { class: 'done-mark', text: '完成' }) : null));
      if (!open) {
        row.append(h('div', { class: 'door' }, img('shelf_door', 'door-img'), h('span', { class: 'door-text', text: 'レベル' + first + 'で開きます' })));
      } else {
        const slots = h('div', { class: 'slots' });
        for (let k = 0; k < 10; k++) {
          const idx = si * 10 + k;
          const gi = giantInfo(idx);
          const rec = S.p.coll[idx];
          const slot = h('button', { class: 'slot' + (rec ? ' got' : ''), 'aria-label': rec ? bottleName(idx).name : '未登録', onclick: () => { if (rec) openDetail(idx); else toast('レベル' + (idx + 1) * 5 + 'で手に入ります'); } });
          if (rec) {
            const cv = h('canvas', { class: 'slot-cv', width: 150, height: 225 });
            slot.append(cv);
            drawThumb(cv, idx);
          } else {
            // not collected yet: keep the bottle's shape a secret
            slot.append(h('span', { class: 'slot-hidden', 'aria-hidden': 'true', text: '?' }));
          }
          slots.append(slot);
        }
        row.append(slots);
      }
      box.append(row);
    });
    // trophy shelf
    const tro = h('section', { class: 'shelf trophies' }, h('header', { class: 'shelf-head' }, h('h3', { text: 'トロフィー棚' })));
    const months = monthsSince(App.meta.dailyStart);
    const tgrid = h('div', { class: 'slots' });
    months.forEach((ym) => {
      const [y, m] = ym.split('-').map(Number);
      const days = new Date(y, m, 0).getDate();
      const cnt = Object.keys(S.p.daily).filter((d) => d.startsWith(ym)).length;
      const cv = h('canvas', { class: 'slot-cv', width: 150, height: 225 });
      tgrid.append(h('div', { class: 'slot got trophy' }, cv, h('span', { class: 'slot-cap', text: y + '年' + m + '月 ' + cnt + '/' + days })));
      drawTrophy(cv, m, cnt / days, y);
    });
    tro.append(tgrid);
    box.append(tro);
  }

  function monthsSince(start) {
    const out = [];
    const [sy, sm] = start.split('-').map(Number);
    const d = new Date();
    let y = sy, m = sm;
    while (y < d.getFullYear() || (y === d.getFullYear() && m <= d.getMonth() + 1)) {
      out.push(y + '-' + String(m).padStart(2, '0'));
      m++; if (m > 12) { m = 1; y++; }
    }
    return out;
  }

  async function drawThumb(cv, idx, opts) {
    const gi = giantInfo(idx);
    const v = await R.loadVessel('giant_' + gi.s);
    if (gi.v) await R.load('giant_trim_' + gi.v);
    if (!v) return;
    const ctx = cv.getContext('2d');
    const rec = S.p.coll[idx];
    const zones = rec ? rec.zones : [];
    const dpr = R.dpr;
    R.dpr = 1;
    const total = zones.length;
    const segs = zones.map((c, z) => ({ f0: z / total, f1: (z + 1) / total, color: GD.COLORS[c].hex }));
    ctx.clearRect(0, 0, cv.width, cv.height);
    R.drawVessel(ctx, v, { x: 0, y: 0, w: cv.width, h: cv.height }, segs, { variant: gi.v, noLines: true, wave: opts && opts.wave, time: opts && opts.time });
    R.dpr = dpr;
  }
  async function drawTrophy(cv, month, frac, year) {
    const key = 'trophy_' + String(month).padStart(2, '0');
    const v = await R.loadVessel(key);
    if (!v) return;
    const ctx = cv.getContext('2d');
    const dpr = R.dpr;
    R.dpr = 1;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const segs = frac > 0 ? [{ f0: 0, f1: frac, color: GD.TROPHY_COLORS[month - 1] }] : [];
    R.drawVessel(ctx, v, { x: 0, y: 0, w: cv.width, h: cv.height }, segs, { noLines: true });
    void year;
    R.dpr = dpr;
  }

  // detail view
  let detail = null;
  function openDetail(idx) {
    const series = Math.floor(idx / 10);
    const list = [...Array(10).keys()].map((k) => series * 10 + k).filter((i) => S.p.coll[i]);
    const view = $('#detail');
    view.hidden = false;
    App.dialogOpen++;
    detail = { idx, list, t0: performance.now(), swirl: 0, run: true };
    renderDetail();
    const cv = $('#detail-cv');
    const loop = () => {
      if (!detail || !detail.run) return;
      paintDetail();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  function renderDetail() {
    const idx = detail.idx;
    const rec = S.p.coll[idx];
    const nm = bottleName(idx);
    const lvn = (idx + 1) * 5;
    $('#detail-name').textContent = nm.name + '「' + nm.potion + '」';
    $('#detail-desc').textContent = nm.desc;
    const zl = $('#detail-zones');
    zl.textContent = '';
    rec.zones.forEach((c) => zl.append(h('li', null, h('i', { style: { background: GD.COLORS[c].hex } }), GD.COLORS[c].name)));
    $('#detail-meta').textContent = 'レベル' + lvn + ' · 星' + rec.stars + ' · ' + rec.date.replace(/-/g, '/');
    $('#detail-replay').onclick = () => { closeDetail(); startLevel(lvn, { fresh: true }); };
    R.loadVessel('giant_' + giantInfo(idx).s);
    const gi = giantInfo(idx);
    if (gi.v) R.load('giant_trim_' + gi.v);
    const pos = detail.list.indexOf(idx);
    $('#detail-prev').disabled = pos <= 0;
    $('#detail-next').disabled = pos >= detail.list.length - 1;
  }
  function paintDetail() {
    const cv = $('#detail-cv');
    const box = cv.parentElement.getBoundingClientRect();
    const dpr = Math.min(root.devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(box.width * dpr) || cv.height !== Math.round(box.height * dpr)) {
      cv.width = Math.round(box.width * dpr); cv.height = Math.round(box.height * dpr);
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gi = giantInfo(detail.idx);
    const v = R.vessel('giant_' + gi.s);
    if (!v) return;
    const bh = Math.min(box.height * 0.96, box.width / v.aspect);
    const bw = bh * v.aspect;
    const rect = { x: (box.width - bw) / 2, y: (box.height - bh) / 2, w: bw, h: bh };
    const rec = S.p.coll[detail.idx];
    const t = (performance.now() - detail.t0) / 1000;
    const total = rec.zones.length;
    const sw = Math.max(0, 1 - (performance.now() - detail.swirl) / 1200);
    const segs = rec.zones.map((c, z) => ({ f0: z / total, f1: (z + 1) / total, color: GD.COLORS[c].hex }));
    const odpr = R.dpr; R.dpr = dpr;
    R.drawVessel(ctx, v, rect, segs, { variant: gi.v, wave: 2 + sw * 8, time: t * (1 + sw * 3), noLines: true, shine: sw * 0.4 });
    if (gi.v) {
      const im = R.get('giant_trim_' + gi.v);
      if (im) {
        const w = rect.w * Math.max(0.34, v.geo.neckW * 1.9);
        const hh = w * im.naturalHeight / im.naturalWidth;
        ctx.drawImage(im, rect.x + v.geo.neckX * rect.w - w / 2, rect.y + v.geo.silTop * rect.h + rect.h * 0.07 - hh / 2, w, hh);
      }
    }
    R.dpr = odpr;
    // floating motes
    const sp = R.get('particle_sparkle');
    if (sp && !B.reduce) {
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 8; k++) {
        const px = rect.x + rect.w * (0.2 + 0.6 * ((Math.sin(k * 91.7) + 1) / 2));
        const py = rect.y + rect.h * (0.9 - ((t * 0.05 + k * 0.13) % 0.8));
        const s = 10 + 6 * Math.sin(t * 2 + k);
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 3 + k);
        ctx.drawImage(sp, px - s / 2, py - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  function detailStep(d) {
    if (!detail) return;
    const pos = detail.list.indexOf(detail.idx) + d;
    if (pos < 0 || pos >= detail.list.length) return;
    detail.idx = detail.list[pos];
    detail.t0 = performance.now();
    renderDetail();
  }
  function closeDetail() {
    if (!detail) return;
    detail.run = false;
    detail = null;
    $('#detail').hidden = true;
    App.dialogOpen = Math.max(0, App.dialogOpen - 1);
  }
  App.detailSwirl = () => { if (detail) { detail.swirl = performance.now(); Snd.play('pour', 2); } };

  // ---------------- achievements ----------------
  function achValue(id) {
    const lvs = Object.entries(S.p.lv);
    switch (id) {
      case 'clear': return lvs.length;
      case 'perfect': return lvs.filter(([, r]) => r.s === 3).length;
      case 'noitem': return lvs.filter(([, r]) => r.ni).length;
      case 'giant': return Object.keys(S.p.coll).length;
      case 'blind': return lvs.filter(([n]) => levelData(+n) && levelData(+n).k.includes('blind')).length;
      case 'curtain': return S.counter('curtains');
      case 'series': return Object.keys(S.p.seriesClaimed).length;
      case 'daily': return Object.keys(S.p.daily).length;
      case 'trophy': return Object.keys(S.p.trophyClaimed).length;
      case 'tables': return S.counter('tables');
      case 'chimneys': return S.counter('chimneys');
      case 'cauldron': return S.best('cauldron');
      default: return 0;
    }
  }
  function achState() {
    if (!App.levels) return [];
    return GD.ACH.map((a) => {
      const v = achValue(a.id);
      const reached = a.stages.filter((x) => v >= x).length;
      const claimed = S.p.achClaimed[a.id] || 0;
      return { a, v, reached, claimed, claimable: reached - claimed };
    });
  }
  function currentTitle() {
    if (!S.p.title) return null;
    const [id, k] = S.p.title.split(':');
    const a = GD.ACH.find((x) => x.id === id);
    return a ? a.titles[+k] : null;
  }
  let lastAchCount = null;
  function checkAchievementToast() {
    const n = achState().reduce((s, x) => s + x.reached, 0);
    if (lastAchCount !== null && n > lastAchCount) toast('実績の段階に届きました', 'achievement_badge');
    lastAchCount = n;
    updateChrome();
  }
  App.checkAchievementToast = checkAchievementToast;

  function renderAchievements() {
    const box = $('#ach-list');
    box.textContent = '';
    achState().forEach(({ a, v, reached, claimed, claimable }) => {
      const nextStage = a.stages[reached];
      const prevStage = reached ? a.stages[reached - 1] : 0;
      const pct = nextStage ? Math.min(100, ((v - prevStage) / (nextStage - prevStage)) * 100) : 100;
      const titleNow = claimed ? a.titles[claimed - 1] : '—';
      const medals = h('span', { class: 'medals' }, a.stages.map((_, k) => h('i', { class: k < claimed ? 'm got' : k < reached ? 'm ready' : 'm' })));
      const claim = claimable > 0 ? h('button', { class: 'btn small primary', onclick: () => claimAch(a) }, '受け取る') : null;
      box.append(h('div', { class: 'ach' },
        img('achievement_badge', 'ach-ic' + (claimed ? '' : ' dim')),
        h('div', { class: 'ach-main' },
          h('div', { class: 'ach-top' }, h('strong', { text: a.name }), h('span', { class: 'ach-title', text: '称号: ' + titleNow })),
          h('div', { class: 'ach-what', text: a.what + (nextStage ? ' · 次は「' + a.titles[reached] + '」' : ' · すべて達成') }),
          h('div', { class: 'ach-prog' }, h('span', { class: 'gauge' }, h('i', { style: { width: pct + '%' } })), h('span', { class: 'ach-num', text: nextStage ? v + ' / ' + nextStage : String(v) })),
          medals),
        claim));
    });
    // title picker
    const owned = [];
    GD.ACH.forEach((a) => { for (let k = 0; k < (S.p.achClaimed[a.id] || 0); k++) owned.push({ key: a.id + ':' + k, name: a.titles[k] }); });
    const sel = $('#title-select');
    sel.textContent = '';
    sel.append(h('option', { value: '', text: '表示しない' }));
    owned.forEach((o) => sel.append(h('option', { value: o.key, text: o.name, selected: S.p.title === o.key })));
    sel.disabled = !owned.length;
  }
  function claimAch(a) {
    const claimed = S.p.achClaimed[a.id] || 0;
    const v = achValue(a.id);
    const reached = a.stages.filter((x) => v >= x).length;
    let coins = 0;
    const got = [];
    for (let k = claimed; k < reached; k++) {
      const rw = GD.ACH_REWARD(a.id, k);
      coins += rw.coins || 0;
      if (rw.cosmetic && !S.p.cosmetics.owned.includes(rw.cosmetic)) { S.p.cosmetics.owned.push(rw.cosmetic); got.push('着せ替え「星座の小瓶」'); }
      got.push('称号「' + a.titles[k] + '」');
    }
    S.p.achClaimed[a.id] = reached;
    if (!S.p.title) S.p.title = a.id + ':' + (reached - 1);
    S.changed({ soon: true });
    if (coins) S.grant({ coins }, '実績');
    Snd.play('coin');
    toast(got.join('、') + (coins ? '、コイン' + coins + '枚' : ''), 'achievement_badge');
    renderAchievements();
    renderTitle();
  }

  // ---------------- daily ----------------
  let dailyMonth = null;
  function dailyLevelFor(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const ym = dateStr.slice(0, 7);
    let max = C.MAX_LEVEL;
    (App.meta.dailyCaps || []).forEach((c) => { if (c.from <= ym) max = c.max; });
    const cand = [];
    for (let n = 10; n <= max; n++) cand.push(n);
    E.shuffleArr(cand, E.mulberry32(y * 100 + m));
    return cand[(d - 1) % cand.length];
  }
  let dailySel = null;
  function renderDaily() {
    const today = S.today();
    if (!dailyMonth) dailyMonth = today.slice(0, 7);
    if (!dailySel) dailySel = today;
    const [y, m] = dailyMonth.split('-').map(Number);
    $('#d-month').textContent = y + '年' + m + '月';
    const startYm = App.meta.dailyStart.slice(0, 7);
    $('#d-prev').disabled = dailyMonth <= startYm;
    $('#d-next').disabled = dailyMonth >= today.slice(0, 7);
    const grid = $('#d-grid');
    grid.textContent = '';
    ['日', '月', '火', '水', '木', '金', '土'].forEach((w) => grid.append(h('span', { class: 'dow', text: w })));
    const first = new Date(y, m - 1, 1).getDay();
    const days = new Date(y, m, 0).getDate();
    for (let k = 0; k < first; k++) grid.append(h('span', { class: 'dpad' }));
    const col = GD.TROPHY_COLORS[m - 1];
    let cleared = 0;
    for (let d = 1; d <= days; d++) {
      const ds = dailyMonth + '-' + String(d).padStart(2, '0');
      const rec = S.p.daily[ds];
      if (rec) cleared++;
      const future = ds > today;
      const beforeStart = ds < App.meta.dailyStart;
      const cell = h('button', {
        class: 'dday' + (rec ? ' done' : '') + (ds === today ? ' today' : '') + (ds === dailySel ? ' sel' : '') + (future || beforeStart ? ' locked' : ''),
        disabled: future || beforeStart,
        'aria-label': m + '月' + d + '日' + (rec ? ' クリア済み' : ''),
        'aria-pressed': ds === dailySel ? 'true' : 'false',
        onclick: () => { dailySel = ds; renderDaily(); },
      }, h('span', { class: 'dnum', text: d }), rec ? h('i', { class: 'drop', style: { background: col } }) : future ? h('span', { class: 'dlock', text: '🔒︎' }) : null);
      grid.append(cell);
    }
    $('#d-trophy-label').textContent = m + '月 ' + GD.TROPHY_MOTIFS[m - 1] + 'のトロフィー';
    $('#d-trophy-num').textContent = cleared + ' / ' + days;
    $('#d-trophy-bar').style.width = (cleared / days * 100) + '%';
    drawTrophy($('#d-trophy'), m, cleared / days, y);
    // the play button always targets the selected day (today when the page opens)
    const [sy, sm, sd] = dailySel.split('-').map(Number);
    const done = !!S.p.daily[dailySel];
    $('#d-selected').textContent = (dailySel === today ? '今日 ' : '') + sm + '月' + sd + '日の問題' + (done ? '(クリア済み)' : '');
    const btn = $('#d-play');
    btn.disabled = done;
    btn.textContent = done ? 'クリア済み' : '問題に挑戦';
    btn.onclick = () => { if (!S.p.daily[dailySel]) startLevel(dailyLevelFor(dailySel), { daily: dailySel }); };
    void sy;
  }
  function openDaily() {
    const today = S.today();
    dailySel = today;
    dailyMonth = today.slice(0, 7);
    renderDaily();
  }

  // ---------------- keyboard ----------------
  let cursor = 0;
  function setupKeys() {
    document.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (App.screen === 'mini' && root.Minis) { root.Minis.key(e); return; }
      if (detail) {
        if (e.key === 'ArrowLeft') detailStep(-1);
        else if (e.key === 'ArrowRight') detailStep(1);
        else if (e.key === 'Escape') closeDetail();
        return;
      }
      if (e.key === 'Escape') {
        const w = $$('.dlg-wrap');
        if (w.length) { const x = w[w.length - 1].querySelector('.panel-x'); x && x.click(); return; }
      }
      if (App.screen !== 'game' || App.dialogOpen) return;
      const g = App.game;
      if (!g || !g.s) return;
      const n = g.s.bottles.length;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); useItem('undo'); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) {
        const i = e.key === '0' ? 9 : +e.key - 1;
        if (i < n) { cursor = i; B.tap(i); }
      } else if (e.key === 'g' || e.key === 'G') { if (g.s.giant) B.tap('g'); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { cursor = (cursor + 1) % (n + (g.s.giant ? 1 : 0)); showCursor(); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { cursor = (cursor - 1 + n + (g.s.giant ? 1 : 0)) % (n + (g.s.giant ? 1 : 0)); showCursor(); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === ' ') { B.tap(cursor >= n ? 'g' : cursor); e.preventDefault(); }
      else if (e.key === 'Escape') B.deselect();
      else if (e.key === 's' || e.key === 'S') useItem('shuffle');
      else if (e.key === 'b' || e.key === 'B') useItem('bottle');
      else if (e.key === 'r' || e.key === 'R') restart(false);
    });
  }
  function showCursor() {
    const g = App.game;
    const n = g.s.bottles.length;
    const r = B.flashRect(cursor >= n ? 'g' : cursor);
    const c = $('#kcursor');
    if (!r) return;
    c.hidden = false;
    c.style.left = r.x + 'px'; c.style.top = (r.y + r.h + 4) + 'px'; c.style.width = r.w + 'px';
    clearTimeout(showCursor.t);
    showCursor.t = setTimeout(() => { c.hidden = true; }, 2500);
  }

  // ---------------- wiring ----------------
  function wire() {
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', (e) => { startAudio(); Snd.play('tap'); fn(e); }); };
    on('#m-play', menu.play);
    on('#m-levels', menu.levels);
    on('#m-daily', menu.daily);
    on('#m-minis', menu.minis);
    on('#m-shop', menu.shop);
    on('#m-collection', menu.collection);
    on('#m-achievements', menu.achievements);
    on('#m-settings', menu.settings);
    $$('[data-home]').forEach((b) => b.addEventListener('click', () => { Snd.play('tap'); renderTitle(); show('title'); }));
    on('#lv-prev', () => { levelPage--; renderLevels(); });
    on('#lv-next', () => { levelPage++; renderLevels(); });
    on('#g-back', () => { saveCurrent(true); renderTitle(); show('title'); });
    on('#g-settings', () => openSettings(true));
    on('#t-undo', () => useItem('undo'));
    on('#t-shuffle', () => useItem('shuffle'));
    on('#t-bottle', () => useItem('bottle'));
    on('#t-restart', () => restart(false));
    $$('#shop .tab').forEach((t) => t.addEventListener('click', () => { shopTab = t.dataset.tab; renderShop(); }));
    on('#detail-close', closeDetail);
    on('#detail-prev', () => detailStep(-1));
    on('#detail-next', () => detailStep(1));
    $('#detail-cv').addEventListener('pointerdown', () => App.detailSwirl());
    let sx = null;
    $('#detail').addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    $('#detail').addEventListener('touchend', (e) => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) detailStep(dx < 0 ? 1 : -1); sx = null; });
    on('#d-prev', () => { const [y, m] = dailyMonth.split('-').map(Number); const d = new Date(y, m - 2, 1); dailyMonth = fmtDate(d).slice(0, 7); renderDaily(); });
    on('#d-next', () => { const [y, m] = dailyMonth.split('-').map(Number); const d = new Date(y, m, 1); dailyMonth = fmtDate(d).slice(0, 7); renderDaily(); });
    let dsx = null;
    $('#d-grid').addEventListener('touchstart', (e) => { dsx = e.touches[0].clientX; }, { passive: true });
    $('#d-grid').addEventListener('touchend', (e) => { if (dsx === null) return; const dx = e.changedTouches[0].clientX - dsx; if (Math.abs(dx) > 60) $(dx < 0 ? '#d-next' : '#d-prev').click(); dsx = null; });
    $('#title-select').addEventListener('change', (e) => { S.p.title = e.target.value || null; S.changed(); renderTitle(); });
    $$('[data-mini]').forEach((b) => b.addEventListener('click', () => { startAudio(); Snd.play('tap'); root.Minis.start(b.dataset.mini); }));
    $$('[data-best]').forEach((el) => { el.textContent = ''; });
    S.on(() => {
      $$('[data-best]').forEach((el) => {
        const k = el.dataset.best;
        el.textContent = k === 'tables' ? '拭いた机 ' + S.counter('tables') + '台' : '最高 ' + S.best(k);
      });
    });
  }

  App.back = function () { renderTitle(); show('title'); };
  App.grantMini = function (coins, why) { if (coins) S.grant({ coins }, why); checkAchievementToast(); };

  document.addEventListener('DOMContentLoaded', () => { wire(); App.boot(); });
  if (document.readyState !== 'loading') { wire(); App.boot(); }
})(typeof globalThis !== 'undefined' ? globalThis : this);
