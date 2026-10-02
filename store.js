/* 魔女のポーション工房 — progress storage (this device only, in localStorage)
 *
 * Coins and items are kept as running totals of what was earned and spent (a small ledger);
 * the balance is the starting amount plus those totals.
 */
(function (root) {
  'use strict';
  const G = root.GameData;
  const LS_KEY = 'witch-potion-v1';
  const LS_DEV = 'witch-potion-device';

  const S = {
    p: null,        // progress (merged, synced as one document)
    dev: null,      // this device's ledger + counters
    others: {},     // ledgers kept from older synced versions (still counted)
    listeners: [],
  };

  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  S.today = today;

  function freshProgress() {
    return {
      v: 1,
      lv: {},
      coll: {},
      daily: {},
      trophyClaimed: {},
      achClaimed: {},
      seriesClaimed: {},
      completeClaimed: 0,
      gacha: { owned: {}, pulls: 0, points: 0 },
      title: null,
      cosmetics: { owned: ['flask', 'workshop'], bottle: 'flask', bg: 'workshop' },
      login: { last: null, day: 0 },
      seen: [],
      settings: { bgm: 60, se: 80, vibration: true, colorMarks: false, reduceMotion: false },
      current: null,
      updatedAt: 0,
    };
  }
  function freshDevice(id) {
    return { id, totals: { coins: 0, undo: 0, shuffle: 0, bottle: 0 }, counters: { tables: 0, chimneys: 0, curtains: 0 }, best: { cauldron: 0, broom: 0 }, log: [] };
  }
  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  function lsGet(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { root.localStorage.setItem(k, v); return true; } catch (e) { return false; } }

  S.load = function () {
    let data = null;
    try { data = JSON.parse(lsGet(LS_KEY) || 'null'); } catch (e) { data = null; }
    S.p = Object.assign(freshProgress(), (data && data.p) || {});
    S.p.settings = Object.assign(freshProgress().settings, S.p.settings || {});
    S.p.cosmetics = Object.assign(freshProgress().cosmetics, S.p.cosmetics || {});
    let devId = lsGet(LS_DEV);
    if (!devId) { devId = 'd' + rid(); lsSet(LS_DEV, devId); }
    S.dev = Object.assign(freshDevice(devId), (data && data.dev && data.dev.id === devId) ? data.dev : {});
    S.others = (data && data.others) || {};
    delete S.others[devId];
  };

  S.saveLocal = function () {
    lsSet(LS_KEY, JSON.stringify({ p: S.p, dev: S.dev, others: S.others }));
  };

  S.changed = function (opts) {
    S.p.updatedAt = Date.now();
    S.saveLocal();
    S.emit();
  };
  S.devChanged = function () {
    S.saveLocal();
    S.emit();
  };
  S.on = (fn) => S.listeners.push(fn);
  S.emit = () => S.listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

  // ---------- balances ----------
  function sumTotals(k) {
    let v = S.dev.totals[k] || 0;
    for (const id in S.others) v += (S.others[id].totals && S.others[id].totals[k]) || 0;
    return v;
  }
  S.coins = () => Math.max(0, Math.min(G.CONFIG.COIN_MAX, sumTotals('coins')));
  S.items = (k) => Math.max(0, Math.min(G.CONFIG.ITEM_MAX, G.CONFIG.START_ITEMS[k] + sumTotals(k)));
  S.counter = function (k) {
    let v = S.dev.counters[k] || 0;
    for (const id in S.others) v += (S.others[id].counters && S.others[id].counters[k]) || 0;
    return v;
  };
  S.best = function (k) {
    let v = S.dev.best[k] || 0;
    for (const id in S.others) v = Math.max(v, (S.others[id].best && S.others[id].best[k]) || 0);
    return v;
  };

  // add a ledger entry: delta = {coins, undo, shuffle, bottle}; clamps to the caps
  S.grant = function (delta, why) {
    const d = {};
    for (const k of ['coins', 'undo', 'shuffle', 'bottle']) {
      if (!delta[k]) continue;
      const cur = k === 'coins' ? S.coins() : S.items(k);
      const max = k === 'coins' ? G.CONFIG.COIN_MAX : G.CONFIG.ITEM_MAX;
      const v = delta[k] > 0 ? Math.min(delta[k], max - cur) : Math.max(delta[k], -cur);
      if (!v) continue;
      S.dev.totals[k] = (S.dev.totals[k] || 0) + v;
      d[k] = v;
    }
    if (Object.keys(d).length) {
      S.dev.log.push({ t: Date.now(), why: why || '', d });
      if (S.dev.log.length > 60) S.dev.log.splice(0, S.dev.log.length - 60);
      S.devChanged();
    }
    return d;
  };
  S.spend = function (k, n, why) {
    const have = k === 'coins' ? S.coins() : S.items(k);
    if (have < n) return false;
    S.grant({ [k]: -n }, why);
    return true;
  };
  S.count = function (k, n) {
    S.dev.counters[k] = (S.dev.counters[k] || 0) + (n || 1);
    S.devChanged();
  };
  S.setBest = function (k, v) {
    if (v > S.best(k)) { S.dev.best[k] = v; S.devChanged(); return true; }
    if (v > (S.dev.best[k] || 0)) { S.dev.best[k] = v; S.devChanged(); }
    return false;
  };

  S.flush = function () { S.saveLocal(); };

  S.reset = function () {
    const devId = S.dev.id;
    // resetting keeps the ledger honest: spend everything this account holds back to the starting amounts
    const delta = {};
    for (const k of ['coins', 'undo', 'shuffle', 'bottle']) {
      const sum = sumTotals(k);
      if (sum) delta[k] = -sum;
    }
    for (const k in delta) S.dev.totals[k] = (S.dev.totals[k] || 0) + delta[k];
    const settings = S.p.settings;
    S.p = freshProgress();
    S.p.settings = settings;
    S.p.updatedAt = Date.now();
    S.dev.counters = { tables: 0, chimneys: 0, curtains: 0 };
    for (const id in S.others) {
      const oc = S.others[id].counters || {};
      for (const k in oc) S.dev.counters[k] = (S.dev.counters[k] || 0) - (oc[k] || 0);
    }
    S.dev.best = { cauldron: 0, broom: 0 };
    S.dev.id = devId;
    S.saveLocal();
    S.emit();
  };

  root.Store = S;
})(typeof globalThis !== 'undefined' ? globalThis : this);
