// Tarjan SCC + edge-kind constants shared by the analysis scripts.
function tarjan(nodes, adj) {
  let index = 0;
  const idx = new Map(),
    low = new Map(),
    on = new Set(),
    stack = [],
    sccs = [];
  function strong(v) {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    on.add(v);
    for (const w of adj.get(v) || []) {
      if (!idx.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const s = [];
      let w;
      do {
        w = stack.pop();
        on.delete(w);
        s.push(w);
      } while (w !== v);
      if (s.length > 1) sccs.push(s);
    }
  }
  for (const n of nodes) if (!idx.has(n)) strong(n);
  return sccs.sort((a, b) => b.length - a.length);
}

const TYPE = new Set(['type-explicit', 'type-elided']);
const LAZY = new Set(['dynamic-import', 'require']);
module.exports = { tarjan, TYPE, LAZY };
