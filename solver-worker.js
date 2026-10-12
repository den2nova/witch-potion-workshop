/* Checks in the background whether the current board can still be solved (for the "stuck" notice). */
importScripts('engine.js');
self.onmessage = function (e) {
  const { id, state, maxNodes } = e.data;
  let res = { id, solvable: null };
  try {
    const r = self.Engine.solve(state, maxNodes || 200000, 2);
    res = { id, solvable: r.path ? true : (r.exhausted ? false : null) };
  } catch (err) { /* unknown */ }
  self.postMessage(res);
};
