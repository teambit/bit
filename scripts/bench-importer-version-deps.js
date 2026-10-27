#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Benchmark: ScopeComponentsImporter.bitIdsToVersionDeps, the last step of every importMany. It resolves the
 * flattened dependencies of every imported version to the loaded versions of the dependencies.
 * It creates a bare scope in a temp dir with N components, each depending on D other components, persists them, and
 * resolves the version dependencies of all of them.
 *
 * Usage (after `bit compile components/legacy/scope`), one size per process (the importer is a singleton per scope name):
 *   node scripts/bench-importer-version-deps.js <components> <depsPerComponent>     e.g. 500 300
 */
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const { createHash } = require('crypto');
const { Scope } = require('@teambit/legacy.scope');
const { ModelComponent, Version, Ref } = require('@teambit/objects');
const { ComponentID, ComponentIdList } = require('@teambit/component-id');

const sha = (s) => createHash('sha1').update(String(s)).digest('hex');

async function run(numComps, depsPerComp) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-bench-importer-'));
  const scope = await Scope.ensure(dir, 'bench.importer');
  const scopeName = scope.name;
  const headOf = (i) => sha(`c${i}`);
  const objects = [];
  for (let i = 0; i < numComps; i += 1) {
    const component = ModelComponent.from({ name: `comp${i}`, scope: scopeName });
    const version = new Version({
      mainFile: 'index.ts',
      files: [],
      log: { message: '', date: '0', username: 'u', email: 'e' },
      hash: headOf(i),
      parents: [],
    });
    const deps = [];
    for (let d = 1; d <= depsPerComp; d += 1) {
      const j = (i + d) % numComps;
      deps.push(ComponentID.fromObject({ scope: scopeName, name: `comp${j}`, version: headOf(j) }));
    }
    version.flattenedDependencies = ComponentIdList.fromArray(deps);
    component.setHead(new Ref(headOf(i)));
    objects.push(component, version);
  }
  scope.objects.addMany(objects);
  await scope.objects.persist(false);
  const ids = ComponentIdList.fromArray(
    objects.filter((o) => o instanceof ModelComponent).map((c) => c.toComponentIdWithHead())
  );
  const start = process.hrtime.bigint();
  const versionDeps = await scope.scopeImporter.bitIdsToVersionDeps(ids, false, false);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  const resolved = versionDeps.reduce((acc, v) => acc + v.dependencies.length, 0);
  console.log(
    `components=${numComps} deps/comp=${depsPerComp}  versionDeps=${versionDeps.length} resolved=${resolved}  ${ms.toFixed(0)} ms`
  );
  await fs.remove(dir);
}

const [numComps = 500, depsPerComp = 300] = process.argv.slice(2).map(Number);
run(numComps, depsPerComp).catch((err) => {
  console.error(err);
  process.exit(1);
});
