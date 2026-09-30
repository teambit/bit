// Usage: node path.js a/b:c/d ...   (APPLY_CUTS=1 removes the cut list first; EXTRA=from|to,... removes more edges)
const { outFile, TYPE, bitViewEdges } = require('./scc.js');
const { edges: rawEdges } = require(outFile('edges.json'));
const removed = new Set(
  (process.env.APPLY_CUTS ? require(outFile('iter.json')) : [])
    .map((p) => p.from + '|' + p.to)
    .concat((process.env.EXTRA || '').split(',').filter(Boolean))
);
const edges = bitViewEdges(rawEdges, new Set(require(outFile('views.json')).core)).filter(
  (e) => !removed.has(e.from + '|' + e.to)
);
const adj = new Map(),
  info = new Map();
edges.forEach((e) => {
  if (!adj.has(e.from)) adj.set(e.from, new Set());
  adj.get(e.from).add(e.to);
  const k = e.from + '|' + e.to;
  if (!info.has(k)) info.set(k, new Set());
  ((TYPE.has(e.kind) ? e.names.map((n) => n + ':t') : e.valueNames) || []).forEach((n) =>
    info.get(k).add(n + (e.fileKind !== 'main' ? '@' + e.fileKind : ''))
  );
});
function bfs(a, b) {
  const prev = new Map([[a, null]]);
  const q = [a];
  while (q.length) {
    const x = q.shift();
    for (const y of adj.get(x) || [])
      if (!prev.has(y)) {
        prev.set(y, x);
        if (y === b) {
          const p = [b];
          let c = x;
          while (c) {
            p.unshift(c);
            c = prev.get(c);
          }
          return p;
        }
        q.push(y);
      }
  }
  return null;
}
for (const [a, b] of process.argv.slice(2).map((s) => s.split(':'))) {
  const A = 'teambit.' + a,
    B = 'teambit.' + b;
  const p1 = bfs(A, B),
    p2 = bfs(B, A);
  const show = (p) =>
    p
      ? p
          .map((x, i) =>
            i
              ? ` -[${[...(info.get(p[i - 1] + '|' + x) || [])].slice(0, 3).join(',')}]-> ${x.replace('teambit.', '')}`
              : x.replace('teambit.', '')
          )
          .join('')
      : 'none';
  console.log(`\n${a} => ${b}: ${show(p1)}\n${b} => ${a}: ${show(p2)}`);
}
