#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Benchmark: the two per-dependency lookups of the tag/snap flow, with real ids and objects.
 *   - snapping.main.runtime: the flattened dependencies that are not among the components to tag.
 *     N components to tag, M flattened dependencies (half of them among the components).
 *   - get-flattened-dependencies: the version-dependencies of each dependency id.
 *     K imported version-dependencies, one lookup per dependency.
 * Each lookup is measured as the search of the array (before) and as a lookup in a set / map (after).
 *
 * Usage: node scripts/bench-tag-dependency-lookups.js [componentsToTag flattenedDeps versionDeps]   default: 2000 4000 2000
 */
const { createHash } = require('crypto');
const { ModelComponent, Version } = require('@teambit/objects');
const { ComponentVersion, VersionDependencies } = require('@teambit/legacy.scope');
const { ComponentID } = require('@teambit/component-id');

const sha = (s) => createHash('sha1').update(String(s)).digest('hex');
const ms = (start) => (Number(process.hrtime.bigint() - start) / 1e6).toFixed(1);

function runSnapping(n, m) {
  const components = Array.from({ length: n }, (_, i) => ({
    id: ComponentID.fromObject({ scope: 'acme.ui', name: `comp${i}`, version: '1.0.0' }),
  }));
  const allFlattenedUniq = Array.from({ length: m }, (_, i) =>
    i % 2
      ? ComponentID.fromObject({ scope: 'acme.ui', name: `comp${i % n}`, version: '1.0.0' })
      : ComponentID.fromObject({ scope: 'other.scope', name: `dep${i}`, version: '1.0.0' })
  );
  let start = process.hrtime.bigint();
  const bySearch = allFlattenedUniq.filter((id) => !components.find((c) => c.id.isEqual(id)));
  const searchMs = ms(start);
  start = process.hrtime.bigint();
  const currentIds = new Set(components.map((c) => c.id.toString()));
  const bySet = allFlattenedUniq.filter((id) => !currentIds.has(id.toString()));
  const setMs = ms(start);
  if (bySearch.length !== bySet.length) throw new Error('the two lookups disagree');
  console.log(
    `componentsToTag=${n} flattenedDeps=${m}  search: ${searchMs} ms   set: ${setMs} ms   (${bySet.length} not in tag)`
  );
}

function runFlattened(k) {
  const versionDependencies = Array.from({ length: k }, (_, i) => {
    const component = ModelComponent.from({ name: `dep${i}`, scope: 'acme.ui' });
    const version = new Version({ mainFile: 'index.ts', files: [], log: { date: '0' }, hash: sha(i), parents: [] });
    return new VersionDependencies(new ComponentVersion(component, sha(i)), [], version);
  });
  const ids = versionDependencies.map((versionDeps) => versionDeps.component.toComponentId());
  let start = process.hrtime.bigint();
  let found = 0;
  for (const id of ids) {
    if (versionDependencies.find(({ component }) => component.toComponentId().isEqual(id))) found += 1;
  }
  const searchMs = ms(start);
  start = process.hrtime.bigint();
  const byId = new Map();
  versionDependencies.forEach((versionDeps) => {
    const key = versionDeps.component.toComponentId().toString();
    if (!byId.has(key)) byId.set(key, versionDeps);
  });
  let foundByMap = 0;
  for (const id of ids) if (byId.get(id.toString())) foundByMap += 1;
  const mapMs = ms(start);
  if (found !== foundByMap) throw new Error('the two lookups disagree');
  console.log(`versionDependencies=${k}  search: ${searchMs} ms   map: ${mapMs} ms   (${found} found)`);
}

const [n = 2000, m = 4000, k = 2000] = process.argv.slice(2).map(Number);
runSnapping(n, m);
runFlattened(k);
