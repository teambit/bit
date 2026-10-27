#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Benchmark: Workspace.getIdIfExist, called once per component by status, export and import.
 * For a .bitmap of N components it does N lookups by id without version:
 *   - before: the previous expression, a search of the ids with ComponentID.isEqualWithoutVersion
 *   - after:  BitMap.getIdAvailableOnLaneIfExist (n/a when the method doesn't exist)
 *
 * Usage (after `bit compile components/legacy/bit-map`):
 *   node scripts/bench-workspace-id-lookup.js [sizes...]     default: 500 2000 5000
 */
const { BitMap, ComponentMap } = require('@teambit/legacy.bit-map');
const { ComponentID, ComponentIdList } = require('@teambit/component-id');

function run(n) {
  const ids = ComponentIdList.fromArray(
    Array.from({ length: n }, (_, i) =>
      ComponentID.fromObject({ scope: 'acme.ui', name: `comp${i}`, version: '1.0.0' })
    )
  );
  const lookups = ids.map((id) => id.changeVersion(undefined));
  let start = process.hrtime.bigint();
  for (const id of lookups) ids.find((_) => _.isEqualWithoutVersion(id));
  const beforeMs = Number(process.hrtime.bigint() - start) / 1e6;

  const bitMap = new BitMap('/tmp/ws', '/tmp/ws/.bitmap', '17.0.0', undefined, false);
  ids.forEach((id) => {
    bitMap.components.push(new ComponentMap({ id, files: [], mainFile: 'index.ts', rootDir: id.fullName }));
  });
  let afterMs = 'n/a';
  if (bitMap.getIdAvailableOnLaneIfExist) {
    start = process.hrtime.bigint();
    for (const id of lookups) bitMap.getIdAvailableOnLaneIfExist(id);
    afterMs = `${(Number(process.hrtime.bigint() - start) / 1e6).toFixed(1)} ms`;
  }
  console.log(`workspaceComponents=${n}  search: ${beforeMs.toFixed(1)} ms   index: ${afterMs}`);
}

const sizes = process.argv.slice(2).map(Number);
(sizes.length ? sizes : [500, 2000, 5000]).forEach(run);
