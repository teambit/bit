const fs = require('fs');
const { outFile, TYPE, bitViewEdges, cycleGroups } = require('./scc.js');
const { comps, edges: rawEdges } = require(outFile('edges.json'));
const di = require(outFile('di.json'));
const edges = bitViewEdges(rawEdges, new Set(require(outFile('views.json')).core));
const nodes = Object.keys(comps);
// transitive DI dependencies over the union of all runtimes. that union can contain cycles, so each
// closure is a full BFS (a memoized recursion would cache partial sets for cycle members).
const memo = new Map();
const clo = (id) => {
  if (memo.has(id)) return memo.get(id);
  const reached = new Set();
  const queue = [id];
  while (queue.length) {
    for (const dep of Object.values(di[queue.shift()] || {}).flat()) {
      if (!reached.has(dep)) {
        reached.add(dep);
        queue.push(dep);
      }
    }
  }
  memo.set(id, reached);
  return reached;
};
const diDirect = (a, b) =>
  Object.entries(di[a] || {})
    .filter(([, ds]) => ds.includes(b))
    .map(([rt]) => rt);
const pairs = new Map();
edges.forEach((e) => {
  const k = e.from + '|' + e.to;
  if (!pairs.has(k)) pairs.set(k, { from: e.from, to: e.to, sites: [] });
  pairs.get(k).sites.push(e);
});
const summarize = (p) => {
  const typeOnly = p.sites.every((s) => TYPE.has(s.kind));
  const uiOnly = p.sites.every((s) => s.fileKind === 'ui');
  const testOnly = p.sites.every((s) => s.fileKind === 'test' || s.fileKind === 'docs');
  const names = [...new Set(p.sites.flatMap((s) => (TYPE.has(s.kind) ? s.names : s.valueNames) || []))];
  const direct = diDirect(p.from, p.to);
  const rel = direct.length
    ? 'DI-direct(' + direct + ')'
    : clo(p.from).has(p.to)
      ? 'DI-transitive'
      : clo(p.to).has(p.from)
        ? 'DI-AGAINST'
        : 'no-DI';
  return { typeOnly, uiOnly, testOnly, names, rel };
};
const score = (p) => {
  // lower = cut first
  const s = summarize(p);
  let v = 0;
  if (s.rel === 'DI-AGAINST') v -= 100;
  else if (s.rel === 'no-DI') v -= 50;
  else if (s.rel === 'DI-transitive') v -= 10;
  if (s.testOnly) v -= 40;
  if (s.typeOnly) v -= 5;
  return v + p.sites.length * 0.01;
};
let active = new Set(pairs.keys());
const cuts = [];
const activeEdges = () => [...active].map((k) => pairs.get(k));
function adjOf() {
  const a = new Map();
  for (const p of activeEdges()) {
    if (!a.has(p.from)) a.set(p.from, new Set());
    a.get(p.from).add(p.to);
  }
  return a;
}
function shortestCycle(adj, scc) {
  const set = new Set(scc);
  let best = null;
  for (const start of scc) {
    const prev = new Map([[start, null]]);
    const q = [start];
    let found = null;
    while (q.length && !found) {
      const x = q.shift();
      for (const y of adj.get(x) || []) {
        if (!set.has(y)) continue;
        if (y === start) {
          found = x;
          break;
        }
        if (!prev.has(y)) {
          prev.set(y, x);
          q.push(y);
        }
      }
    }
    if (found) {
      let c = found;
      const rev = [];
      while (c !== start) {
        rev.unshift(c);
        c = prev.get(c);
      }
      const cyc = [start, ...rev];
      if (!best || cyc.length < best.length) best = cyc;
    }
    if (best && best.length === 2) break;
  }
  return best;
}
for (let i = 0; i < 300; i++) {
  const groups = cycleGroups(nodes, activeEdges());
  if (!groups.length) break;
  const cyc = shortestCycle(adjOf(), groups[0]);
  const cycPairs = cyc.map((x, j) => pairs.get(x + '|' + cyc[(j + 1) % cyc.length]));
  cycPairs.sort((a, b) => score(a) - score(b));
  const pick = cycPairs[0];
  active.delete(pick.from + '|' + pick.to);
  cuts.push({
    ...summarize(pick),
    from: pick.from,
    to: pick.to,
    cycle: cyc,
    sites: [...new Set(pick.sites.map((s) => s.file + ':' + s.line))],
  });
}
// prune unnecessary cuts (re-add in reverse if still acyclic)
for (let i = cuts.length - 1; i >= 0; i--) {
  const k = cuts[i].from + '|' + cuts[i].to;
  active.add(k);
  if (cycleGroups(nodes, activeEdges()).length) active.delete(k);
  else cuts.splice(i, 1);
}
fs.writeFileSync(outFile('iter.json'), JSON.stringify(cuts, null, 1));
const sh = (x) => x.replace(/teambit\./g, '');
console.log(`${cuts.length} edge cuts make the bit-view graph acyclic`);
cuts.forEach((c, i) =>
  console.log(
    `${String(i + 1).padStart(2)}. ${sh(c.from)} -> ${sh(c.to)} {${c.rel}}${c.typeOnly ? ' [type-only]' : ''}${c.uiOnly ? ' [ui]' : ''}${c.testOnly ? ' [test/docs]' : ''} ${c.names.slice(0, 5).join(',')}  @${c.sites[0]}${c.sites.length > 1 ? ' +' + (c.sites.length - 1) : ''}`
  )
);
