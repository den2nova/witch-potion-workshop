/* Checks in the background whether a shuffled board can still be solved. */
importScripts('engine.js');
self.onmessage = function (e) {
  const { id, state, maxNodes, weight } = e.data;
  let ok = false;
  try {
    const r = self.Engine.solve(state, maxNodes || 80000, weight || 2);
    ok = !!r.path;
  } catch (err) { ok = false; }
  self.postMessage({ id, ok });
};
