const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { installed } = require('../rust-object-import/load-source.cjs');
const { ApplyOverrides } = installed('@teambit/dependencies/dist/dependencies-loader/apply-overrides.js');
const { updateDependenciesVersions } = installed('@teambit/dependencies/dist/dependencies-loader/dependencies-versions-resolver.js');
const { ComponentID, ComponentIdList } = installed('@teambit/component-id');
const { IssuesList, IssuesClasses } = installed('@teambit/component-issues');
const { Dependencies } = installed('@teambit/legacy.consumer-component');
const semver = installed('semver');
const fields = ['dependencies', 'devDependencies', 'peerDependencies'];
const pkgFields = ['packageDependencies', 'devPackageDependencies', 'peerPackageDependencies'];
const named = (values) => Object.fromEntries(fields.map((field, i) => [field, values[i]]));
const ids = (values) => ComponentIdList.fromArray(values.map((id) => ComponentID.fromString(id)));
const entry = (row) => ({ id: ComponentID.fromString(row.identity), packageName: row.packageName ?? undefined,
  versionRange: row.versionRange ?? undefined, relativePaths: [] });
const row = (entry) => ({ identity: entry.id.toString(), packageName: entry.packageName ?? null,
  versionRange: entry.versionRange ?? null });

function native(request, kind = 'dependencyPolicyComplete') {
  const body = Buffer.from(JSON.stringify({ kind, ...request }));
  const header = Buffer.alloc(12);
  header.write('BWS1');
  header.writeUInt32BE(1, 4);
  header.writeUInt32BE(body.length, 8);
  return JSON.parse(execFileSync(process.env.BIT_TEST_OBJECT_IMPORT, {
    input: Buffer.concat([header, body]), encoding: 'utf8', maxBuffer: 40 * 1024 * 1024,
  }));
}

async function canonical(request, includeIssues = false) {
  const { initial, finish, resolution } = request;
  const entries = initial.entries.map(entry);
  const component = {
    id: ComponentID.fromString(finish.selfIdentity), componentId: ComponentID.fromString(finish.selfIdentity),
    componentMap: { rootDir: path.relative(request.root, request.componentRoot) }, files: [], issues: new IssuesList(),
    extensions: resolution.extensions.map((id) => ({ extensionId: ComponentID.fromString(id) })),
    overrides: { componentOverridesData: named(finish.manual),
      getIgnoredPackages: (field) => initial.ignored[fields.indexOf(field)],
      getComponentDependenciesWithVersion: () => resolution.sources.componentConfig },
    componentFromModel: { isLegacy: false, dependencies: new Dependencies(finish.environment.modelComponents.map(entry)),
      packageDependencies: finish.environment.modelPackages, getAllDependenciesIds: () => ids(resolution.sources.model) },
  };
  if (initial.missing.length) component.issues.getOrCreate(IssuesClasses.MissingPackagesDependenciesOnFs).data =
    initial.missing.map((row, i) => ({ ...structuredClone(row), filePath: `file-${i}.js` }));
  const depsResolver = {
    getWorkspacePolicyManifest: () => initial.policies.workspacePolicy,
    getEnvPolicyFromEnvId: async () => ({ selfPolicy: { toVersionManifest: () => finish.environment.policy } }),
    calcComponentRangePrefixByConsumerComponent: () => resolution.prefix,
  };
  const workspace = {
    consumer: { getPath: () => request.root, packageJson: { packageJsonObject: named(finish.packageJson) },
      bitmapIdsFromCurrentLane: ids(resolution.sources.bitmap) },
    getAutoDetectOverrides: async () => named(initial.policies.automatic),
    getAutoDetectConfigMerge: () => named(resolution.merge),
    getCurrentLaneObject: async () => ({ updateDependents: ids(resolution.sources.lane) }),
  };
  const ignoredSelf = [];
  const value = new ApplyOverrides(component, depsResolver, {
    warn: (message) => ignoredSelf.push(message.match(/depends on itself (.*)\. ignoring it\./)[1]),
  }, workspace);
  value.allDependencies = Object.fromEntries(fields.map((field, i) => [field, initial.components[i].map((i) => entries[i])]));
  value.allPackagesDependencies = Object.fromEntries(pkgFields.map((field, i) => [field, { ...initial.packages[i] }]));
  value._getPackageJsonFromComponentModel = () => ({ peerDependencies: initial.policies.modelPeers });
  const result = await value.getDependenciesData();
  for (const [field, setter] of [['dependencies', 'setDependencies'], ['devDependencies', 'setDevDependencies'], ['peerDependencies', 'setPeerDependencies']])
    component[setter] = (deps) => { component[field] = new Dependencies(deps); };
  const { DependenciesLoader } = installed('@teambit/dependencies/dist/dependencies-loader/dependencies-loader.js');
  DependenciesLoader.prototype.setDependenciesDataOnComponent.call({ component }, result.dependenciesData, result.overridesDependencies);
  await updateDependenciesVersions(depsResolver, workspace, component, result.overridesDependencies,
    result.autoDetectOverrides);
  return {
    ...(includeIssues ? { issues: result.dependenciesData.issues.serialize() } : {}),
    packages: pkgFields.map((field) => result.dependenciesData.allPackagesDependencies[field]),
    components: fields.map((field) => component[field].get().map(row)),
    added: fields.map((field) => result.overridesDependencies.manuallyAddedDependencies[field] ?? []),
    removed: fields.map((field) => result.overridesDependencies.manuallyRemovedDependencies[field] ?? []),
    missing: result.overridesDependencies.missingPackageDependencies,
    envOwn: [...result.overridesDependencies.envOwnPkgNames], ignoredSelf,
    extensions: component.extensions.map((extension) => extension.extensionId.toString()),
    detectedMissing: result.dependenciesData.issues.getIssueByName('MissingPackagesDependenciesOnFs')?.data
      .map((row) => row.missingPackages) ?? [],
  };
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-policy-pipeline-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const componentRoot = path.join(root, 'component');
  await fs.mkdir(componentRoot);
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'workspace' }));
  for (const [name, data] of Object.entries({
    alpha: { componentId: { scope: 'qualification.pipeline', name: 'alpha', version: '1.0.0' } },
    beta: {}, alias: { name: 'real-package' },
    self: { componentId: { scope: 'qualification.pipeline', name: 'self', version: '1.0.0' } },
  })) {
    const directory = path.join(root, 'node_modules', name);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ name, version: '1.3.0', ...data }));
  }
  return { root, componentRoot };
}

function cases(location) {
  let seed = 3619;
  const next = (n) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 8) % n; };
  const names = ['alpha', 'beta', 'alias', 'self', 'missing', '@types/missing'];
  const specs = ['', '-', '+', '^2.3.0', '1.0.0', '~1.3.0', '*'];
  const map = () => Object.fromEntries(names.filter(() => next(3) === 0).map((name) => [name, specs[next(specs.length)]]));
  const grammar = Object.fromEntries(specs.map((spec) => [spec, { valid: !!semver.valid(spec),
    range: !!semver.validRange(spec), coerced: semver.coerce(spec)?.version ?? null }]));
  return Array.from({ length: 128 }, () => {
    const entries = names.slice(0, next(4)).map((packageName, i) => ({
      identity: `qualification.pipeline/${i % 2 ? 'other' : 'alpha'}@1.0.0`, packageName, versionRange: '^1.0.0',
    }));
    const manual = [map(), map(), map()];
    const packageJson = [map(), map(), map()];
    const workspace = { dependencies: map(), peerDependencies: map() };
    return { ...location,
      initial: { entries, packages: [map(), map(), map()],
        components: fields.map(() => entries.flatMap((_, i) => next(2) ? [i] : [])),
        ignored: manual.map((map) => Object.keys(map).filter((name) => map[name] === '-')),
        missing: [{ isDevFile: false, missingPackages: [...names] }, { isDevFile: true, missingPackages: ['missing'] }],
        policies: { modelPeers: map(), packagePolicy: { dependencies: packageJson[0], peerDependencies: packageJson[2] },
          workspacePolicy: workspace, automatic: [map(), map(), map()] } },
      finish: { manual, packageJson, selfIdentity: 'qualification.pipeline/self@1.0.0',
        environment: { policy: map(), workspace, modelComponents: entries, modelPackages: map() } },
      resolution: { grammar, extensions: ['qualification.pipeline/extension@1.0.0'],
        sources: { bitmap: next(2) ? ['qualification.pipeline/alpha@3.0.0'] : [],
          lane: ['qualification.pipeline/other@2.0.0'], model: ['qualification.pipeline/alpha@2.0.0'],
          componentConfig: {} }, prefix: [null, '^', '~', '-'][next(4)], merge: [map(), map(), map()] },
    };
  });
}

test('complete Rust policy pipeline matches Node with real package resolution and shared dependencies', async (t) => {
  const location = await fixture(t);
  for (const [index, request] of cases(location).entries()) {
    const expected = await canonical(request);
    const response = native(request);
    assert.equal(response.failed, false, `case ${index}`);
    const output = response.data;
    assert.deepEqual({ packages: output.state.packages,
      components: output.state.components.map((field) => field.map((i) => output.state.entries[i])),
      added: output.added, removed: output.removed, missing: output.missing, envOwn: output.envOwn,
      ignoredSelf: output.ignoredSelf, extensions: output.extensions,
      detectedMissing: output.detectedMissing.filter((row) => row.length),
    }, expected, `case ${index}: ${JSON.stringify(request)}`);
  }
});

test('complete pipeline declines invalid intermediates and recovers after package corruption', async (t) => {
  const request = cases(await fixture(t))[0];
  request.finish.manual[0].alpha = '1.0.0';
  assert.equal(native(request).failed, false);
  for (const field of ['state', 'resolved']) {
    const malformed = structuredClone(request);
    malformed.finish[field] = {};
    assert.equal(native(malformed).failed, true);
  }
  const filename = path.join(request.root, 'node_modules/alpha/package.json');
  const original = await fs.readFile(filename);
  await fs.writeFile(filename, '{invalid');
  const corrupt = native(request);
  assert.equal(corrupt.failed, true);
  assert.equal(corrupt.data, undefined);
  await fs.writeFile(filename, original);
  assert.equal(native(request).failed, false);
});

test('cached policy pipeline owns freshness, cache hydration and current missing-package issues', async (t) => {
  const location = await fixture(t);
  const cacache = installed('cacache');
  const cache = path.join(location.root, '.bit/cache/components/deps');
  const filename = path.join(location.componentRoot, 'index.js');
  await fs.writeFile(filename, 'module.exports = 1;\n');
  for (const [index, request] of cases(location).slice(0, 64).entries()) {
    // Serialized dependencies do not preserve JS aliases across fields.
    const original = request.initial.entries;
    request.initial.entries = [];
    request.initial.components = request.initial.components.map((field) => field.map((i) => {
      request.initial.entries.push(structuredClone(original[i]));
      return request.initial.entries.length - 1;
    }));
    const detected = {
      allDependencies: Object.fromEntries(fields.map((field, i) => [field,
        request.initial.components[i].map((index) => {
          const item = entry(request.initial.entries[index]);
          return { ...item, id: item.id.toObject() };
        })])),
      allPackagesDependencies: Object.fromEntries(pkgFields.map((field, i) => [field, request.initial.packages[i]])),
      issues: [{ type: 'MissingPackagesDependenciesOnFs', data: JSON.stringify(
        request.initial.missing.map((row, i) => ({ ...row, filePath: `file-${i}.js` }))) }],
      coreAspects: [],
    };
    await cacache.put(cache, request.finish.selfIdentity, JSON.stringify(detected), {
      metadata: { timestamp: Date.now() + 60000 },
    });
    const input = { ...location, identity: request.finish.selfIdentity, files: [filename],
      policies: request.initial.policies, finish: request.finish, resolution: request.resolution };
    const actual = native(input, 'dependencyPolicyCached');
    assert.equal(actual.failed, false, `case ${index}`);
    const expected = await canonical(request, true);
    assert.deepEqual(actual.data.issues, expected.issues, `issues ${index}`);
    assert.deepEqual(actual.data.state.packages, expected.packages, `packages ${index}`);
    assert.deepEqual(actual.data.state.components.map((field) => field.map((i) => actual.data.state.entries[i])),
      expected.components, `components ${index}`);
    await cacache.put(cache, request.finish.selfIdentity, JSON.stringify(detected), { metadata: { timestamp: 0 } });
    const stale = native(input, 'dependencyPolicyCached');
    assert.equal(stale.failed, false);
    assert.deepEqual(stale.data, { needsDetection: true });
  }
});

test('cached policy pipeline rejects custom envs and malformed caches while root components use explicit policy', async (t) => {
  const location = await fixture(t);
  const request = cases(location)[0];
  const cache = path.join(location.root, '.bit/cache/components/deps');
  const cacache = installed('cacache');
  const input = { ...location, identity: request.finish.selfIdentity, files: [],
    policies: request.initial.policies, finish: request.finish, resolution: request.resolution };
  const missing = native(input, 'dependencyPolicyCached');
  assert.equal(missing.failed, false, 'ordinary missing cache requests fresh detection');
  assert.deepEqual(missing.data, { needsDetection: true });
  const empty = { allDependencies: { dependencies: [], devDependencies: [], peerDependencies: [] },
    allPackagesDependencies: { packageDependencies: {}, devPackageDependencies: {}, peerPackageDependencies: {} }, issues: [] };
  for (const detected of [{ ...empty, allDependencies: {} }, { ...empty, allPackagesDependencies: null },
    { ...empty, issues: [{ type: 'MissingPackagesDependenciesOnFs', data: '{broken' }] }]) {
    await cacache.put(cache, input.identity, JSON.stringify(detected), { metadata: { timestamp: Date.now() + 60000 } });
    assert.equal(native(input, 'dependencyPolicyCached').failed, true);
  }
  await cacache.put(cache, input.identity, JSON.stringify(empty), { metadata: { timestamp: Date.now() + 60000 } });
  assert.equal(native(input, 'dependencyPolicyCached').failed, false);
  const env = path.join(location.componentRoot, 'env.jsonc');
  await fs.writeFile(env, '{}');
  assert.equal(native(input, 'dependencyPolicyCached').failed, true);
  await fs.unlink(env);
  await cacache.rm.entry(cache, input.identity);
  input.componentRoot = input.root;
  request.componentRoot = request.root;
  request.initial.entries = [];
  request.initial.components = [[], [], []];
  request.initial.packages = [{}, {}, {}];
  request.initial.missing = [];
  const expected = await canonical(request, true);
  const root = native(input, 'dependencyPolicyCached');
  assert.equal(root.failed, false);
  assert.deepEqual(root.data.state.packages, expected.packages);
  assert.deepEqual(root.data.issues, expected.issues);
});
