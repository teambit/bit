#!/usr/bin/env node
/**
 * Guards against new circular dependencies between workspace components.
 *
 * Builds the component graph with `bit graph --json` (the same graph `bit deps circular` and the
 * CircularDependencies issue use), finds every strongly connected group, and compares it to
 * cycles-baseline.json:
 *   - a component that joins any cycle -> fail
 *   - a new edge between two members of the same cycle -> fail
 *   - a baseline component or edge that is no longer in a cycle -> fail, so the baseline gets lowered and a
 *     later PR can't re-add it unnoticed.
 *
 * Usage:
 *   node check-cycles.js            check against the baseline
 *   node check-cycles.js --update   write the current state as the new baseline
 *   node check-cycles.js --graph <file>   read `bit graph --json` output from a file instead of running bit
 * Set BIT_BIN to use a different bit binary (default: bit).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASELINE_FILE = path.join(__dirname, 'cycles-baseline.json');
const REPO_ROOT = path.join(__dirname, '../..');
const UPDATE_CMD = 'node scripts/circular-deps-check/check-cycles.js --update';

function stripVersion(id) {
  const at = id.lastIndexOf('@');
  return at > 0 ? id.slice(0, at) : id;
}

function loadGraph(graphFile) {
  const raw = graphFile
    ? fs.readFileSync(graphFile, 'utf8')
    : execFileSync(process.env.BIT_BIN || 'bit', ['graph', '--json'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'inherit'],
      });
  const graph = JSON.parse(raw.slice(raw.indexOf('{')));
  const nodes = graph.nodes.map(stripVersion);
  const edges = graph.edges.map((edge) => [stripVersion(edge.sourceId), stripVersion(edge.targetId)]);
  return { nodes, edges };
}

/** Tarjan's algorithm, iterative so deep graphs don't overflow the stack. Returns groups of size > 1. */
function findCycleGroups(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node, []]));
  for (const [from, to] of edges) {
    if (from === to) continue;
    if (!adjacency.has(from)) adjacency.set(from, []);
    if (!adjacency.has(to)) adjacency.set(to, []);
    adjacency.get(from).push(to);
  }
  let counter = 0;
  const index = new Map();
  const lowLink = new Map();
  const onStack = new Set();
  const stack = [];
  const groups = [];
  for (const root of adjacency.keys()) {
    if (index.has(root)) continue;
    const work = [[root, 0]];
    index.set(root, counter);
    lowLink.set(root, counter++);
    stack.push(root);
    onStack.add(root);
    while (work.length) {
      const frame = work[work.length - 1];
      const [node, childIdx] = frame;
      const children = adjacency.get(node);
      if (childIdx < children.length) {
        frame[1]++;
        const child = children[childIdx];
        if (!index.has(child)) {
          index.set(child, counter);
          lowLink.set(child, counter++);
          stack.push(child);
          onStack.add(child);
          work.push([child, 0]);
        } else if (onStack.has(child)) {
          lowLink.set(node, Math.min(lowLink.get(node), index.get(child)));
        }
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1][0];
        lowLink.set(parent, Math.min(lowLink.get(parent), lowLink.get(node)));
      }
      if (lowLink.get(node) === index.get(node)) {
        const group = [];
        let member;
        do {
          member = stack.pop();
          onStack.delete(member);
          group.push(member);
        } while (member !== node);
        if (group.length > 1) groups.push(group.sort());
      }
    }
  }
  return groups.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

function computeState({ nodes, edges }) {
  const groups = findCycleGroups(nodes, edges);
  const groupOf = new Map();
  groups.forEach((group, i) => group.forEach((member) => groupOf.set(member, i)));
  const cycleEdges = new Set();
  for (const [from, to] of edges) {
    if (from !== to && groupOf.has(from) && groupOf.get(from) === groupOf.get(to)) cycleEdges.add(`${from} -> ${to}`);
  }
  return {
    summary: {
      groups: groups.map((group) => group.length),
      components: groups.reduce((sum, group) => sum + group.length, 0),
      edges: cycleEdges.size,
    },
    groups,
    edges: [...cycleEdges].sort(),
  };
}

function printList(title, items) {
  if (!items.length) return;
  console.log(`\n${title} (${items.length}):`);
  items.forEach((item) => console.log(`  ${item}`));
}

function main() {
  const args = process.argv.slice(2);
  const graphFileIdx = args.indexOf('--graph');
  const graphFile = graphFileIdx !== -1 ? args[graphFileIdx + 1] : undefined;
  const current = computeState(loadGraph(graphFile));
  const { summary } = current;
  console.log(
    `current: ${summary.components} components in ${summary.groups.length} cycle groups [${summary.groups.join(', ')}], ${summary.edges} edges inside cycles`
  );

  if (args.includes('--update')) {
    fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`baseline written to ${path.relative(REPO_ROOT, BASELINE_FILE)}`);
    return;
  }
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error(`no baseline found. create one with: ${UPDATE_CMD}`);
    process.exit(1);
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  const b = baseline.summary;
  console.log(
    `baseline: ${b.components} components in ${b.groups.length} cycle groups [${b.groups.join(', ')}], ${b.edges} edges inside cycles`
  );

  const baselineMembers = new Set(baseline.groups.flat());
  const currentMembers = new Set(current.groups.flat());
  const baselineEdges = new Set(baseline.edges);
  const currentEdges = new Set(current.edges);
  const joined = [...currentMembers].filter((member) => !baselineMembers.has(member)).sort();
  const left = [...baselineMembers].filter((member) => !currentMembers.has(member)).sort();
  const addedEdges = current.edges.filter((edge) => !baselineEdges.has(edge));
  const removedEdges = baseline.edges.filter((edge) => !currentEdges.has(edge));

  printList('components that joined a cycle', joined);
  printList('new edges inside a cycle', addedEdges);
  printList('components no longer in any cycle', left);
  printList('edges no longer inside a cycle', removedEdges);

  if (joined.length || addedEdges.length) {
    console.log(
      '\nFAIL: this change adds circular dependencies. Remove the new import(s) above, or move the imported code' +
        ' to a component both sides can depend on.' +
        `\nIf the new cycle edge is intentional, accept it with: ${UPDATE_CMD}`
    );
    process.exit(1);
  }
  if (left.length || removedEdges.length) {
    console.log(`\nFAIL: circular dependencies were reduced, so lower the baseline to lock it in: ${UPDATE_CMD}`);
    process.exit(1);
  }
  console.log('\nPASS: no new circular dependencies');
}

if (require.main === module) main();

module.exports = { findCycleGroups, computeState };
