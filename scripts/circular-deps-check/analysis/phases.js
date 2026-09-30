const { outFile, bitViewEdges, cycleGroups } = require('./scc.js');
const { comps, edges: rawEdges } = require(outFile('edges.json'));
const cuts = require(outFile('iter.json'));
const edges = bitViewEdges(rawEdges, new Set(require(outFile('views.json')).core));
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
cuts.forEach((c) => (groups[phaseOf(c)] ||= []).push(c));
const order = Object.keys(groups).sort();
const removed = new Set();
const sizes = () => {
  const s = cycleGroups(
    Object.keys(comps),
    edges.filter((e) => !removed.has(e.from + '|' + e.to))
  );
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
