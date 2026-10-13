const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { installed } = require('../rust-object-import/load-source.cjs');
const { ApplyOverrides } = installed('@teambit/dependencies/dist/dependencies-loader/apply-overrides.js');
const OverridesDependencies = installed(
  '@teambit/dependencies/dist/dependencies-loader/overrides-dependencies.js'
).default;
const { ComponentID } = installed('@teambit/component-id');
const fields = ['dependencies', 'devDependencies', 'peerDependencies'];
const pkgFields = ['packageDependencies', 'devPackageDependencies', 'peerPackageDependencies'];
function native(requests) {
  const frames = requests.map((request, index) => {
    const { modelPeers, packagePolicy, workspacePolicy, automatic, ...state } = request;
    const body = Buffer.from(
      JSON.stringify({
        kind: 'dependencyPolicy',
        ...state,
        policies: { modelPeers, packagePolicy, workspacePolicy, automatic },
      })
    );
    const header = Buffer.alloc(12);
    header.write('BWS1');
    header.writeUInt32BE(index + 1, 4);
    header.writeUInt32BE(body.length, 8);
    return Buffer.concat([header, body]);
  });
  return execFileSync(process.env.BIT_TEST_OBJECT_IMPORT, {
    input: Buffer.concat(frames),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
    .trim()
    .split('\n')
    .map(JSON.parse);
}
async function canonical(request) {
  const entries = request.entries.map((entry) => ({
    id: ComponentID.fromString(entry.identity),
    packageName: entry.packageName ?? undefined,
    versionRange: entry.versionRange ?? undefined,
  }));
  const indices = new Map(entries.map((entry, index) => [entry, index]));
  const value = Object.create(ApplyOverrides.prototype);
  value.allDependencies = Object.fromEntries(
    fields.map((field, i) => [field, request.components[i].map((index) => entries[index])])
  );
  value.allPackagesDependencies = Object.fromEntries(pkgFields.map((field, i) => [field, { ...request.packages[i] }]));
  const issue = { data: structuredClone(request.missing) };
  let present = true;
  value.issues = {
    getIssueByName: () => (present ? issue : undefined),
    delete: () => {
      present = false;
    },
  };
  value.component = { overrides: { getIgnoredPackages: (field) => request.ignored[fields.indexOf(field)] } };
  value.overridesDependencies = new OverridesDependencies(value.component);
  value._getPackageJsonFromComponentModel = () => ({ peerDependencies: request.modelPeers });
  value._getPackageJson = () => request.packagePolicy;
  value.depsResolver = { getWorkspacePolicyManifest: () => request.workspacePolicy };
  value.autoDetectOverrides = Object.fromEntries(fields.map((field, i) => [field, request.automatic[i]]));
  const missingRows = [...issue.data];
  value.removeIgnoredComponentsByOverrides();
  value.cloneAllPackagesDependencies();
  value.removeIgnoredPackagesByOverrides();
  value.removeDevAndEnvDepsIfTheyAlsoRegulars();
  value.applyPeersFromComponentModel();
  value.applyPackageJson();
  value.applyWorkspacePolicy();
  value.makeLegacyAsPeer();
  await value.applyAutoDetectOverridesOnComponent();
  return {
    packages: pkgFields.map((field) => value.allPackagesDependencies[field]),
    components: fields.map((field) => value.allDependencies[field].map((entry) => indices.get(entry))),
    ranges: entries.map((entry) => entry.versionRange ?? null),
    missing: missingRows.map((row) => row.missingPackages),
    removed: fields.map((field) => value.overridesDependencies.manuallyRemovedDependencies[field] ?? []),
  };
}
function cases() {
  let state = 73;
  const next = (n) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % n;
  };
  const names = ['alpha', 'beta', '@scope/pkg', '@types/node', '@teambit/legacy'];
  const versions = ['', '-', '+', '1.0.0', '^2.0.0'];
  const map = () =>
    Object.fromEntries(names.filter(() => next(3) === 0).map((name) => [name, versions[next(versions.length)]]));
  return Array.from({ length: 512 }, () => {
    const entries = Array.from({ length: next(9) }, (_, index) => ({
      identity: `scope/component${index % 3}@${next(2)}.0.0`,
      packageName: next(3) ? names[next(names.length)] : null,
      versionRange: next(2) ? versions[next(versions.length)] : null,
    }));
    return {
      packages: [map(), map(), map()],
      entries,
      components: fields.map(() => entries.flatMap((_, index) => (next(3) === 0 ? [index] : []))),
      ignored: fields.map(() => names.filter(() => next(5) === 0)),
      missing: [
        { isDevFile: false, missingPackages: names.filter(() => next(2)) },
        { isDevFile: true, missingPackages: names.filter(() => next(2)) },
      ],
      modelPeers: map(),
      packagePolicy: { dependencies: map(), peerDependencies: map() },
      workspacePolicy: { dependencies: map(), peerDependencies: map() },
      automatic: [map(), map(), map()],
    };
  });
}
test('native precedence matches actual Node policy methods, component aliases and removal receipts', async () => {
  const requests = cases();
  const actual = native(requests);
  for (let index = 0; index < requests.length; index++) {
    assert.equal(actual[index].failed, false, `case ${index}`);
    if (process.env.BIT_TEST_WORKSPACE_ADDON) {
      const { planDependencyPolicy } = require(process.env.BIT_TEST_WORKSPACE_ADDON);
      const { modelPeers, packagePolicy, workspacePolicy, automatic, ...state } = requests[index];
      const direct = planDependencyPolicy(
        JSON.stringify({ ...state, policies: { modelPeers, packagePolicy, workspacePolicy, automatic } }),
        false
      );
      assert.deepEqual(JSON.parse(direct), actual[index].data);
    }
    const expected = await canonical(requests[index]);
    assert.deepEqual(actual[index].data, expected, `case ${index}: ${JSON.stringify(requests[index])}`);
    actual[index].data.packages.forEach((map, field) =>
      assert.deepEqual(Object.keys(map), Object.keys(expected.packages[field]), `case ${index} package order`)
    );
  }
});
test('invalid references, inherited names and non-string values decline the whole plan', () => {
  const request = cases()[0];
  const invalid = [
    { ...request, components: [[9999], [], []] },
    { ...request, packages: [{ constructor: '1' }, {}, {}] },
    { ...request, packages: [{ alpha: false }, {}, {}] },
    { ...request, packages: [JSON.parse('{"__proto__":"1"}'), {}, {}] },
  ];
  for (const result of native(invalid)) {
    assert.equal(result.failed, true);
    assert.equal(result.data, undefined);
  }
});

test(
  'synchronous policy binding bounds input and remains usable after a declined plan',
  { skip: !process.env.BIT_TEST_WORKSPACE_ADDON },
  () => {
    const { planDependencyPolicy } = require(process.env.BIT_TEST_WORKSPACE_ADDON);
    assert.throws(() => planDependencyPolicy('x'.repeat(4 * 1024 * 1024 + 1), false), /input limit/);
    assert.throws(() => planDependencyPolicy('{', false));
    assert.throws(() => planDependencyPolicy('{}', true));
    const { modelPeers, packagePolicy, workspacePolicy, automatic, ...state } = cases()[0];
    const request = { ...state, policies: { modelPeers, packagePolicy, workspacePolicy, automatic } };
    assert.ok(JSON.parse(planDependencyPolicy(JSON.stringify(request), false)).packages);
  }
);
