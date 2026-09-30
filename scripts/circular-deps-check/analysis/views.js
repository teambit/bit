const path = require('path');
const fs = require('fs');
const T = (process.env.OUT_DIR || require('path').join(__dirname, 'out')) + '/';
const { comps, edges: rawEdges } = require(T + 'edges.json');
const { tarjan, TYPE, LAZY } = require('./scc.js');
const corePkgs = new Set(require(T + 'core-pkgs.json'));
const core = new Set(
  Object.values(comps)
    .filter((c) => corePkgs.has(c.pkg))
    .map((c) => c.id)
);
console.log('core aspects in workspace:', core.size);

// drop mdx (bit strips code fences / my regex false positives)
const edges = rawEdges.filter((e) => !e.file.endsWith('.mdx'));
const bitView = (e) => core.has(e.from) || !core.has(e.to);
const nodes = Object.keys(comps);
function sccsFor(filter) {
  const adj = new Map();
  for (const e of edges)
    if (filter(e)) {
      if (!adj.has(e.from)) adj.set(e.from, new Set());
      adj.get(e.from).add(e.to);
    }
  return tarjan(nodes, adj);
}
const isType = (e) => TYPE.has(e.kind);
const isTestDocs = (e) => e.fileKind === 'test' || e.fileKind === 'docs';
const views = {
  'bit-view: all': (e) => bitView(e),
  'bit-view: no type-only': (e) => bitView(e) && !isType(e),
  'bit-view: no type, no test/docs': (e) => bitView(e) && !isType(e) && !isTestDocs(e),
  'bit-view: runtime eager prod': (e) => bitView(e) && !isType(e) && !isTestDocs(e) && !LAZY.has(e.kind),
  'raw: all': () => true,
  'raw: runtime eager prod': (e) => !isType(e) && !isTestDocs(e) && !LAZY.has(e.kind),
};
const out = {};
for (const [name, f] of Object.entries(views)) {
  const s = sccsFor(f);
  out[name] = s;
  console.log(name.padEnd(36), 'SCCs', s.length, 'sizes', s.map((x) => x.length).join(','));
}
const bit = require(T + 'bit-circular.json').map((c) => c.map((s) => s.replace(/@.*/, '')));
const bitSet = new Set(bit.flat());
const mine = new Set(out['bit-view: all'].flat());
console.log(
  'match bit? bit-only:',
  [...bitSet].filter((x) => !mine.has(x)),
  'mine-only:',
  [...mine].filter((x) => !bitSet.has(x))
);
fs.writeFileSync(T + 'views.json', JSON.stringify({ out, core: [...core] }, null, 1));
