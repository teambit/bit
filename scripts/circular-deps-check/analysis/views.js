const fs = require('fs');
const { outFile, TYPE, LAZY, bitViewEdges, cycleGroups } = require('./scc.js');
const { comps, edges } = require(outFile('edges.json'));
const corePkgs = new Set(require(outFile('core-pkgs.json')));
const core = new Set(
  Object.values(comps)
    .filter((c) => corePkgs.has(c.pkg))
    .map((c) => c.id)
);
console.log('core aspects in workspace:', core.size);

const bitView = bitViewEdges(edges, core);
const nodes = Object.keys(comps);
const isType = (e) => TYPE.has(e.kind);
const isTestDocs = (e) => e.fileKind === 'test' || e.fileKind === 'docs';
const isRuntimeEagerProd = (e) => !isType(e) && !isTestDocs(e) && !LAZY.has(e.kind);
const views = {
  'bit-view: all': bitView,
  'bit-view: no type-only': bitView.filter((e) => !isType(e)),
  'bit-view: no type, no test/docs': bitView.filter((e) => !isType(e) && !isTestDocs(e)),
  'bit-view: runtime eager prod': bitView.filter(isRuntimeEagerProd),
  'raw: all': edges,
  'raw: runtime eager prod': edges.filter(isRuntimeEagerProd),
};
let mine;
for (const [name, viewEdges] of Object.entries(views)) {
  const groups = cycleGroups(nodes, viewEdges);
  if (!mine) mine = new Set(groups.flat());
  console.log(name.padEnd(36), 'SCCs', groups.length, 'sizes', groups.map((x) => x.length).join(','));
}
const bitSet = new Set(require(outFile('bit-circular.json')).flatMap((c) => c.map((s) => s.replace(/@.*/, ''))));
console.log(
  'match bit? bit-only:',
  [...bitSet].filter((x) => !mine.has(x)),
  'mine-only:',
  [...mine].filter((x) => !bitSet.has(x))
);
fs.writeFileSync(outFile('views.json'), JSON.stringify({ core: [...core] }, null, 1));
