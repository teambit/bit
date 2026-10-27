#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Benchmark: the lookups of Lane by component id. It measures, for a lane of N components:
 *   - add:    addComponent of N new components (a lane merged into a scope that doesn't have it yet)
 *   - lookup: getCompHeadIncludeUpdateDependents for every component (the export refs per component)
 *   - merge:  for every component of an incoming lane, the steps of sources.mergeLane for an existing entry:
 *             the exact lookup, removeComponentFromUpdateDependentsIfExist and addComponent
 *
 * Usage (after `bit compile scopes/scope/objects`):
 *   node scripts/bench-lane-lookups.js [sizes...]     default: 500 2000 5000
 */
const { createHash } = require('crypto');
const { Lane, Ref } = require('@teambit/objects');
const { ComponentID } = require('@teambit/component-id');

const sha = (s) => createHash('sha1').update(String(s)).digest('hex');
const id = (i) => ComponentID.fromObject({ scope: 'acme.ui', name: `comp${i}` });
const newLane = () => new Lane({ name: 'dev', scope: 'acme.ui', hash: sha('lane'), log: { date: '0' } });
// the lookup sources.mergeLane does for an incoming entry. before this change it was a search of the array.
const exactLookup = (lane, componentId) =>
  lane.getComponentExact ? lane.getComponentExact(componentId) : lane.components.find((c) => c.id.isEqual(componentId));

function run(n) {
  let start = process.hrtime.bigint();
  const lane = newLane();
  for (let i = 0; i < n; i += 1) lane.addComponent({ id: id(i), head: new Ref(sha(i)) });
  const addMs = Number(process.hrtime.bigint() - start) / 1e6;

  const ids = lane.components.map((c) => c.id);
  start = process.hrtime.bigint();
  for (const componentId of ids) lane.getCompHeadIncludeUpdateDependents(componentId);
  const lookupMs = Number(process.hrtime.bigint() - start) / 1e6;

  start = process.hrtime.bigint();
  for (let i = 0; i < n; i += 1) {
    const componentId = id(i);
    exactLookup(lane, componentId);
    lane.removeComponentFromUpdateDependentsIfExist(componentId);
    lane.addComponent({ id: componentId, head: new Ref(sha(`${i}-new`)) });
  }
  const mergeMs = Number(process.hrtime.bigint() - start) / 1e6;
  console.log(
    `laneComponents=${n}  add: ${addMs.toFixed(1)} ms  lookup: ${lookupMs.toFixed(1)} ms  merge: ${mergeMs.toFixed(1)} ms`
  );
}

const sizes = process.argv.slice(2).map(Number);
(sizes.length ? sizes : [500, 2000, 5000]).forEach(run);
