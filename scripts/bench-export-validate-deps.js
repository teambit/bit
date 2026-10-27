#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Benchmark: mergeObjects with the dependency check (ExportValidate on a remote scope).
 * It creates a bare scope in a temp dir and merges an export of N components, each with V versions, whose heads depend
 * on D other exported components. Nothing is persisted. The remaining time after the change is the filesystem lookup
 * of every dependency (the scope doesn't have them).
 *
 * Usage (after `bit compile scopes/scope/export`):
 *   node scripts/bench-export-validate-deps.js [components depsPerComponent versionsPerComponent]
 *   default: 200 50 2, then 500 100 2, then 500 200 3
 */
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const { createHash } = require('crypto');
const { Scope } = require('@teambit/legacy.scope');
const { ModelComponent, Version, BitObjectList, Ref } = require('@teambit/objects');
const { ComponentID, ComponentIdList } = require('@teambit/component-id');
const { mergeObjects } = require('@teambit/export/dist/export-scope-components.js');

const sha = (s) => createHash('sha1').update(String(s)).digest('hex');

async function run(numComps, depsPerComp, versionsPerComp) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-bench-export-'));
  const scope = await Scope.ensure(dir, 'bench.export');
  const scopeName = scope.name;
  const headOf = (i) => sha(`c${i}-v${versionsPerComp - 1}`);
  const components = [];
  const versions = [];
  for (let i = 0; i < numComps; i += 1) {
    const component = ModelComponent.from({ name: `comp${i}`, scope: scopeName });
    for (let v = 0; v < versionsPerComp; v += 1) {
      const version = new Version({
        mainFile: 'index.ts',
        files: [],
        log: { message: '', date: '0', username: 'u', email: 'e' },
        hash: sha(`c${i}-v${v}`),
        parents: v ? [new Ref(sha(`c${i}-v${v - 1}`))] : [],
      });
      const deps = [];
      for (let d = 1; d <= depsPerComp; d += 1) {
        const j = (i + d) % numComps;
        deps.push(ComponentID.fromObject({ scope: scopeName, name: `comp${j}`, version: headOf(j) }));
      }
      version.flattenedDependencies = ComponentIdList.fromArray(deps);
      versions.push(version);
    }
    component.setHead(new Ref(headOf(i)));
    components.push(component);
  }
  const start = process.hrtime.bigint();
  const result = await mergeObjects(scope, new BitObjectList([...components, ...versions]), true);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  console.log(
    `components=${numComps} deps/comp=${depsPerComp} versions=${versions.length}  mergedIds=${result.mergedIds.length}  ${ms.toFixed(0)} ms`
  );
  await fs.remove(dir);
}

(async () => {
  const args = process.argv.slice(2).map(Number);
  const runs =
    args.length === 3
      ? [args]
      : [
          [200, 50, 2],
          [500, 100, 2],
          [500, 200, 3],
        ];
  for (const [numComps, depsPerComp, versionsPerComp] of runs) await run(numComps, depsPerComp, versionsPerComp);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
