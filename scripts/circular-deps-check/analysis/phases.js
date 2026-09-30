const T = (process.env.OUT_DIR || require('path').join(__dirname, 'out')) + '/';
const { comps, edges: rawEdges } = require(T + 'edges.json');
const { tarjan, TYPE } = require('./scc.js');
const { core } = require(T + 'views.json');
const cuts = require(T + 'iter-full.json');
const coreSet = new Set(core);
const edges = rawEdges.filter((e) => !e.file.endsWith('.mdx') && (coreSet.has(e.from) || !coreSet.has(e.to)));
const RT = ['UIRuntime', 'PreviewRuntime', 'MainRuntime', 'SSR'];
const LEG = /legacy\/|scope\/(network|remotes|remote-actions)|component\/(sources|snap-distance)/;
const phaseOf = (c) => {
  if (LEG.test(c.from) && LEG.test(c.to)) return '4-legacy';
  if (c.testOnly) return '1-quick';
  if (
    !c.typeOnly &&
    c.names.every((n) => RT.includes(n) || /UI$|Aspect$/.test(n)) &&
    c.names.some((n) => RT.includes(n))
  )
    return '1-quick';
  if (!c.typeOnly && c.rel === 'DI-AGAINST') return '1-quick'; // misplaced utils, service locator, aspect-object imports
  if (c.typeOnly && c.rel !== 'DI-direct(ui)') return '2-contracts';
  if (
    c.from === 'teambit.generator/generator' ||
    c.from === 'teambit.component/new-component-helper' ||
    c.from === 'teambit.ui-foundation/ui'
  )
    return '1-quick';
  return '3-structural';
};
const groups = {};
cuts.forEach((c) => (groups[phaseOf(c)] = groups[phaseOf(c)] || []).push(c));
const order = Object.keys(groups).sort();
const removed = new Set();
const sizes = () => {
  const a = new Map();
  edges.forEach((e) => {
    if (removed.has(e.from + '|' + e.to)) return;
    if (!a.has(e.from)) a.set(e.from, new Set());
    a.get(e.from).add(e.to);
  });
  const s = tarjan(Object.keys(comps), a);
  return s.length ? `${s.length} SCCs [${s.map((x) => x.length).join(',')}], ${s.flat().length} comps` : 'ACYCLIC';
};
console.log('baseline:', sizes());
for (const p of order) {
  groups[p].forEach((c) => removed.add(c.from + '|' + c.to));
  console.log(`after ${p} (${groups[p].length} cuts):`, sizes());
}
// and each phase alone
for (const p of order) {
  removed.clear();
  groups[p].forEach((c) => removed.add(c.from + '|' + c.to));
  console.log(`  ${p} alone:`, sizes());
}
require('fs').writeFileSync(T + 'phases.json', JSON.stringify(groups, null, 1));
for (const p of order) {
  console.log('\n#', p);
  groups[p].forEach((c) =>
    console.log(
      '  ',
      c.from.replace(/teambit\./g, ''),
      '->',
      c.to.replace(/teambit\./g, ''),
      c.typeOnly ? '[type]' : '',
      c.uiOnly ? '[ui]' : '',
      c.names.slice(0, 4).join(',')
    )
  );
}
