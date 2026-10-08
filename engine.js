/* 魔女のポーション工房 — puzzle engine (no DOM). Shared by the game page and the level generator. */
(function (root) {
  'use strict';

  // ---------- helpers ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffleArr(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ---------- state ----------
  // level (from levels.json): { n, k:[kinds], cap, b:[[c,...],...], h:[[0/1,...],...], cu:[{i,t:'c'|'n',v}], g:{s,v,c,cap,pre}, par }
  // giant bottle: holds one colour c; it starts with pre layers inside and is full at cap layers
  function fromLevel(lv) {
    const s = {
      level: lv.n,
      kinds: lv.k || [],
      cap: lv.cap,
      bottles: lv.b.map((layers, i) => ({
        layers: layers.map((c, k) => ({ c, h: !!(lv.h && lv.h[i] && lv.h[i][k]) })),
        curtain: null,
        extra: false,
      })),
      giant: null,
      moves: 0,
      history: [],
      added: 0,
      shuffled: false,
      itemsUsed: 0,
    };
    (lv.cu || []).forEach((c) => {
      s.bottles[c.i].curtain = c.t === 'c' ? { type: 'color', colors: c.v, open: false } : { type: 'count', n: c.v, open: false };
    });
    if (lv.g) s.giant = { shape: lv.g.s, variant: lv.g.v || null, color: lv.g.c, capacity: lv.g.cap, pre: lv.g.pre, filled: lv.g.pre };
    // the top layer of each bottle is always visible
    s.bottles.forEach((b) => { if (b.layers.length) b.layers[b.layers.length - 1].h = false; });
    return s;
  }

  const top = (b) => b.layers[b.layers.length - 1];
  const isLocked = (b) => !!(b.curtain && !b.curtain.open);
  function isComplete(b, cap) {
    if (b.layers.length !== cap) return false;
    const c = b.layers[0].c;
    for (let i = 1; i < cap; i++) if (b.layers[i].c !== c) return false;
    return true;
  }
  function topRun(b) {
    const L = b.layers;
    if (!L.length) return 0;
    const c = L[L.length - 1].c;
    let n = 1;
    for (let i = L.length - 2; i >= 0; i--) {
      if (L[i].c !== c || L[i].h) break;
      n++;
    }
    return n;
  }
  function zoneColor(s) {
    const g = s.giant;
    if (!g) return null;
    return g.filled < g.capacity ? g.color : null;
  }

  function canPour(s, i, j) {
    if (i === j) return false;
    const src = s.bottles[i];
    // a finished bottle is sealed, except on giant-bottle stages where its colour may still be needed
    if (!src || !src.layers.length || isLocked(src) || (!s.giant && isComplete(src, s.cap))) return false;
    const t = top(src);
    if (j === 'g') {
      const zc = zoneColor(s);
      return zc !== null && t.c === zc;
    }
    const dst = s.bottles[j];
    if (!dst || isLocked(dst) || dst.layers.length >= s.cap) return false;
    if (!dst.layers.length) return true;
    return top(dst).c === t.c;
  }

  function pourAmount(s, i, j) {
    const run = topRun(s.bottles[i]);
    const space = j === 'g' ? s.giant.capacity - s.giant.filled : s.cap - s.bottles[j].layers.length;
    return Math.min(run, space);
  }

  function completedCount(s) {
    let n = 0;
    for (const b of s.bottles) if (!isLocked(b) && isComplete(b, s.cap)) n++;
    return n;
  }

  function updateCurtains(s) {
    const opened = [];
    const cnt = completedCount(s);
    const doneColors = new Set();
    for (const b of s.bottles) if (!isLocked(b) && isComplete(b, s.cap)) doneColors.add(b.layers[0].c);
    s.bottles.forEach((b, i) => {
      if (!isLocked(b)) return;
      const c = b.curtain;
      const ok = c.type === 'count' ? cnt >= c.n : c.colors.every((x) => doneColors.has(x));
      if (ok) {
        c.open = true;
        if (b.layers.length) top(b).h = false;
        opened.push(i);
      }
    });
    return opened;
  }

  function pour(s, i, j) {
    const src = s.bottles[i];
    const n = pourAmount(s, i, j);
    const color = top(src).c;
    const moved = src.layers.splice(src.layers.length - n, n);
    const ev = { from: i, to: j, n, color, revealed: [], completed: false, curtains: [], zoneDone: false, giantDone: false };
    if (j === 'g') {
      const before = s.giant.filled;
      s.giant.filled += n;
      // a small milestone every bottle's worth, for feedback
      ev.zoneDone = Math.floor(before / s.cap) !== Math.floor(s.giant.filled / s.cap);
      ev.giantDone = s.giant.filled >= s.giant.capacity;
    } else {
      const dst = s.bottles[j];
      moved.forEach((l) => dst.layers.push(l));
      if (isComplete(dst, s.cap)) {
        ev.completed = true;
        dst.layers.forEach((l) => { l.h = false; });
      }
    }
    if (src.layers.length && top(src).h) {
      top(src).h = false;
      ev.revealed.push(i);
    }
    s.history.push({ f: i, t: j, n, c: color });
    s.moves++;
    ev.curtains = updateCurtains(s);
    return ev;
  }

  function undo(s) {
    const h = s.history.pop();
    if (!h) return null;
    const src = s.bottles[h.f];
    if (h.t === 'g') {
      s.giant.filled -= h.n;
      for (let k = 0; k < h.n; k++) src.layers.push({ c: h.c, h: false });
    } else {
      const dst = s.bottles[h.t];
      const moved = dst.layers.splice(dst.layers.length - h.n, h.n);
      moved.forEach((l) => src.layers.push(l));
    }
    s.moves = Math.max(0, s.moves - 1); // the undone move no longer counts
    return h;
  }

  function isSolved(s) {
    if (s.giant) return s.giant.filled >= s.giant.capacity;
    return s.bottles.every((b) => (isLocked(b) ? b.layers.length === 0 : b.layers.length === 0 || isComplete(b, s.cap)));
  }

  function isPointless(s, i, j) {
    if (j === 'g') return false;
    const src = s.bottles[i];
    const dst = s.bottles[j];
    // pouring a single-colour bottle into an empty bottle just moves it
    return dst.layers.length === 0 && topRun(src) === src.layers.length && !src.layers.some((l) => l.h);
  }

  function legalMoves(s, meaningful) {
    const out = [];
    const N = s.bottles.length;
    for (let i = 0; i < N; i++) {
      if (s.giant && canPour(s, i, 'g')) out.push([i, 'g']);
      for (let j = 0; j < N; j++) {
        if (canPour(s, i, j) && !(meaningful && isPointless(s, i, j))) out.push([i, j]);
      }
    }
    return out;
  }

  function shuffle(s, rng) {
    const idx = [];
    s.bottles.forEach((b, i) => {
      if (!isLocked(b) && b.layers.length && !isComplete(b, s.cap)) idx.push(i);
    });
    const pool = [];
    idx.forEach((i) => pool.push(...s.bottles[i].layers));
    shuffleArr(pool, rng);
    let p = 0;
    idx.forEach((i) => {
      const b = s.bottles[i];
      const n = b.layers.length;
      b.layers = pool.slice(p, p + n);
      p += n;
      top(b).h = false;
    });
    return idx;
  }

  // the shuffle item mixes the layers of ONE chosen small bottle
  function canShuffleBottle(s, i) {
    const b = s.bottles[i];
    if (!b || isLocked(b) || b.layers.length < 2 || isComplete(b, s.cap)) return false;
    return b.layers.some((l) => l.c !== b.layers[0].c);
  }
  // layers that already sit together in the same colour move as one block, so they are never split up
  function shuffleBottle(s, i, rng) {
    const b = s.bottles[i];
    const key = (ls) => ls.map((l) => l.c).join(',');
    const before = key(b.layers);
    const blocks = [];
    b.layers.forEach((l) => {
      const last = blocks[blocks.length - 1];
      if (last && last[0].c === l.c) last.push(l); else blocks.push([l]);
    });
    let layers = b.layers.slice();
    for (let t = 0; t < 20; t++) {
      layers = [].concat(...shuffleArr(blocks.slice(), rng));
      if (key(layers) !== before) break;
    }
    if (key(layers) === before && blocks.length > 1) layers = [].concat(...blocks.slice(1), blocks[0]);
    b.layers = layers;
    top(b).h = false;
    return b.layers.map((l) => l.c).join(',') !== before;
  }

  // every distinct order of the bottle's same-colour blocks, other than the current one
  function shuffleOptions(s, i) {
    const b = s.bottles[i];
    const key = (ls) => ls.map((l) => l.c).join(',');
    const blocks = [];
    b.layers.forEach((l) => {
      const last = blocks[blocks.length - 1];
      if (last && last[0].c === l.c) last.push(l); else blocks.push([l]);
    });
    const seen = new Set([key(b.layers)]);
    const out = [];
    const perm = (rest, acc) => {
      if (!rest.length) {
        const ls = [].concat(...acc), k = key(ls);
        if (!seen.has(k)) { seen.add(k); out.push(ls); }
        return;
      }
      rest.forEach((blk, j) => perm(rest.slice(0, j).concat(rest.slice(j + 1)), acc.concat([blk])));
    };
    perm(blocks, []);
    return out;
  }

  function addBottle(s) {
    s.bottles.push({ layers: [], curtain: null, extra: true });
    s.added++;
    s.history = [];
  }

  // ---------- solver ----------
  // compact state: b = arrays of ints (colour | hidden<<5), L = locked flags, g = giant fill
  function compact(s) {
    return {
      b: s.bottles.map((b) => b.layers.map((l) => l.c | (l.h ? 32 : 0))),
      L: s.bottles.map((b) => isLocked(b)),
      cu: s.bottles.map((b) => (b.curtain ? b.curtain : null)),
      g: s.giant ? s.giant.filled : -1,
    };
  }

  function makeSolver(s) {
    const cap = s.cap;
    const gColor = s.giant ? s.giant.color : -1;
    const gCap = s.giant ? s.giant.capacity : 0;
    const N = s.bottles.length;
    const curt = s.bottles.map((b) => (b.curtain ? b.curtain : null));

    const key = (st) => {
      const parts = [];
      const locked = [];
      for (let i = 0; i < N; i++) {
        const str = st.b[i].join(',');
        if (st.L[i]) locked.push(i + ':' + str);
        else parts.push(str);
      }
      parts.sort();
      return parts.join('|') + '#' + locked.join('|') + '#' + st.g;
    };
    const isDone = (b) => {
      if (b.length !== cap) return false;
      const c = b[0] & 31;
      for (let k = 1; k < cap; k++) if ((b[k] & 31) !== c) return false;
      return true;
    };
    const solved = (st) => {
      if (gCap) return st.g >= gCap;
      for (let i = 0; i < N; i++) {
        const b = st.b[i];
        if (st.L[i]) { if (b.length) return false; } else if (b.length && !isDone(b)) return false;
      }
      return true;
    };
    const h = (st) => {
      let v = 0;
      for (let i = 0; i < N; i++) {
        const b = st.b[i];
        for (let k = 1; k < b.length; k++) if ((b[k] & 31) !== (b[k - 1] & 31)) v++;
        if (st.L[i] && b.length) v += 1;
      }
      if (gCap) {
        const left = gCap - st.g;
        v += Math.ceil(left / cap) * 2;
      }
      return v;
    };
    const run = (b) => {
      const c = b[b.length - 1] & 31;
      let n = 1;
      for (let k = b.length - 2; k >= 0; k--) {
        if ((b[k] & 31) !== c || b[k] & 32) break;
        n++;
      }
      return n;
    };
    const openCurtains = (st) => {
      if (!curt.some((c) => c)) return;
      let cnt = 0;
      const colors = new Set();
      for (let i = 0; i < N; i++) if (!st.L[i] && isDone(st.b[i])) { cnt++; colors.add(st.b[i][0] & 31); }
      for (let i = 0; i < N; i++) {
        if (!st.L[i]) continue;
        const c = curt[i];
        const ok = c.type === 'count' ? cnt >= c.n : c.colors.every((x) => colors.has(x));
        if (ok) {
          st.L[i] = false;
          const b = st.b[i];
          if (b.length) b[b.length - 1] &= 31;
        }
      }
    };
    const moves = (st) => {
      const out = [];
      const zc = gCap && st.g < gCap ? gColor : -1;
      let emptyTried = false;
      for (let i = 0; i < N; i++) {
        const src = st.b[i];
        if (!src.length || st.L[i]) continue;
        const done = isDone(src);
        if (done && !gCap) continue;
        const tc = src[src.length - 1] & 31;
        const r = run(src);
        if (zc >= 0 && tc === zc) out.push([i, -1, Math.min(r, gCap - st.g)]);
        if (done) continue; // a finished bottle only ever pours into the giant bottle
        const mono = r === src.length;
        emptyTried = false;
        for (let j = 0; j < N; j++) {
          if (j === i || st.L[j]) continue;
          const dst = st.b[j];
          if (dst.length >= cap) continue;
          if (!dst.length) {
            if (mono || emptyTried) continue;
            emptyTried = true;
            out.push([i, j, Math.min(r, cap)]);
          } else if ((dst[dst.length - 1] & 31) === tc) {
            out.push([i, j, Math.min(r, cap - dst.length)]);
          }
        }
      }
      return out;
    };
    const apply = (st, m) => {
      const b = st.b.map((x) => x);
      const src = b[m[0]].slice();
      const moved = src.splice(src.length - m[2], m[2]);
      if (src.length) src[src.length - 1] &= 31;
      b[m[0]] = src;
      let g = st.g;
      if (m[1] < 0) g += m[2];
      else {
        const dst = b[m[1]].concat(moved);
        if (isDone(dst)) for (let k = 0; k < dst.length; k++) dst[k] &= 31;
        b[m[1]] = dst;
      }
      const ns = { b, L: st.L.slice(), g };
      openCurtains(ns);
      return ns;
    };

    // weighted best-first search; returns move list [[from,to|'g',n],...] or null
    function solve(maxNodes, weight) {
      const start = compact(s);
      const startKey = key(start);
      const seen = new Map();
      seen.set(startKey, 0);
      const heap = [];
      const push = (node) => {
        heap.push(node);
        let i = heap.length - 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (heap[p].f <= node.f) break;
          heap[i] = heap[p]; i = p;
        }
        heap[i] = node;
      };
      const pop = () => {
        const topN = heap[0];
        const last = heap.pop();
        if (heap.length) {
          let i = 0;
          const n = heap.length;
          for (;;) {
            let l = 2 * i + 1, r = l + 1, m = i;
            if (l < n && heap[l].f < (m === i ? last.f : heap[m].f)) m = l;
            if (r < n && heap[r].f < (m === i ? last.f : heap[m].f)) m = r;
            if (m === i) break;
            heap[i] = heap[m]; i = m;
          }
          heap[i] = last;
        }
        return topN;
      };
      push({ st: start, gc: 0, f: weight * h(start), parent: null, m: null });
      let nodes = 0;
      while (heap.length && nodes < maxNodes) {
        const cur = pop();
        nodes++;
        if (solved(cur.st)) {
          const path = [];
          for (let n = cur; n.parent; n = n.parent) path.push([n.m[0], n.m[1] < 0 ? 'g' : n.m[1], n.m[2]]);
          return { path: path.reverse(), nodes };
        }
        for (const m of moves(cur.st)) {
          const ns = apply(cur.st, m);
          const k = key(ns);
          const gc = cur.gc + 1;
          const prev = seen.get(k);
          if (prev !== undefined && prev <= gc) continue;
          seen.set(k, gc);
          push({ st: ns, gc, f: gc + weight * h(ns), parent: cur, m });
        }
      }
      return { path: null, nodes };
    }
    return { solve };
  }

  function solve(s, maxNodes, weight) {
    return makeSolver(s).solve(maxNodes || 200000, weight || 1.5);
  }

  const Engine = {
    mulberry32, shuffleArr, clone, fromLevel, top, isLocked, isComplete, topRun, zoneColor,
    canPour, pourAmount, pour, undo, isSolved, legalMoves, isPointless, shuffle, canShuffleBottle, shuffleBottle, shuffleOptions, addBottle,
    completedCount, updateCurtains, solve,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
