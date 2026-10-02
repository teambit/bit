// Helpers shared by the analysis scripts.
const path = require('path');
const { findCycleGroups } = require('../check-cycles.js');

const OUT_DIR = process.env.OUT_DIR || path.join(__dirname, 'out');
const outFile = (name) => path.join(OUT_DIR, name);

const TYPE = new Set(['type-explicit', 'type-elided']);
const LAZY = new Set(['dynamic-import', 'require']);

/** the edges bit sees: non-core components' imports of core aspects are dropped (processCoreAspects) */
const bitViewEdges = (edges, core) => edges.filter((e) => core.has(e.from) || !core.has(e.to));

/** cycle groups (size > 1), largest first */
const cycleGroups = (nodes, edges) =>
  findCycleGroups(
    nodes,
    edges.map((e) => [e.from, e.to])
  );

module.exports = { OUT_DIR, outFile, TYPE, LAZY, bitViewEdges, cycleGroups };
