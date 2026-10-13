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
const entry = (row) => ({
  id: ComponentID.fromString(row.identity),
  packageName: row.packageName ?? undefined,
  versionRange: row.versionRange ?? undefined,
});
const row = (item) => ({
  identity: item.id.toString(),
  packageName: item.packageName ?? null,
  versionRange: item.versionRange ?? null,
});
async function canonical(request) {
  const value = Object.create(ApplyOverrides.prototype);
  const entries = request.state.entries.map(entry);
  value.componentId = ComponentID.fromString(request.selfIdentity);
  value.allDependencies = Object.fromEntries(
    fields.map((field, index) => [field, request.state.components[index].map((index) => entries[index])])
  );
  value.allPackagesDependencies = Object.fromEntries(
    pkgFields.map((field, index) => [field, { ...request.state.packages[index] }])
  );
  value.component = {
    id: value.componentId,
    files: [],
    overrides: {
      componentOverridesData: Object.fromEntries(fields.map((field, index) => [field, request.manual[index]])),
    },
  };
  value.componentFromModel = {
    dependencies: { get: () => request.environment.modelComponents.map(entry) },
    packageDependencies: request.environment.modelPackages,
  };
  value.overridesDependencies = new OverridesDependencies(value.component);
  value._getPackageJson = () => Object.fromEntries(fields.map((field, index) => [field, request.packageJson[index]]));
  value._resolvePackageData = (name) => {
    const resolved = request.resolved[name];
    return (
      resolved && {
        ...resolved,
        componentId: resolved.componentIdentity ? ComponentID.fromString(resolved.componentIdentity) : undefined,
      }
    );
  };
  value.getEnvExtendsDeps = () => [];
  value.depsResolver = {
    getEnvPolicyFromEnvId: async () => ({ selfPolicy: { toVersionManifest: () => request.environment.policy } }),
    getWorkspacePolicyManifest: () => request.environment.workspace,
  };
  const ignoredSelf = [];
  value.logger = { warn: (message) => ignoredSelf.push(message.match(/depends on itself (.*)\. ignoring it\./)[1]) };
  await value.applyAutoDetectedPeersFromEnvOnEnvItSelf();
  value.manuallyAddDependencies();
  value.removeCompDepsFromPackages();
  return {
    packages: pkgFields.map((field) => value.allPackagesDependencies[field]),
    components: fields.map((field) => value.allDependencies[field].map(row)),
    added: fields.map((field) => value.overridesDependencies.manuallyAddedDependencies[field] ?? []),
    missing: value.overridesDependencies.missingPackageDependencies,
    ignoredSelf,
    envOwn: [...value.overridesDependencies.envOwnPkgNames],
  };
}
function cases() {
  let state = 519;
  const next = (n) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % n;
  };
  const names = ['alpha', 'beta', 'self', '@scope/pkg', '@types/node'];
  const versions = ['', '-', '+', '1.0.0', '^2.0.0'];
  const map = () =>
    Object.fromEntries(names.filter(() => next(3) === 0).map((name) => [name, versions[next(versions.length)]]));
  return Array.from({ length: 512 }, () => {
    const entries = Array.from({ length: next(7) }, (_, index) => ({
      identity: `scope/component${index % 3}@1.0.0`,
      packageName: names[next(names.length)],
      versionRange: next(2) ? '^1.0.0' : null,
    }));
    const resolved = Object.fromEntries(
      names
        .filter(() => next(2))
        .map((name, index) => [
          name,
          {
            name,
            componentIdentity: next(2) ? `scope/${name === 'self' ? 'self' : 'component' + (index % 3)}@2.0.0` : null,
            concreteVersion: next(2) ? '2.0.0' : null,
          },
        ])
    );
    return {
      state: {
        entries,
        packages: [map(), map(), map()],
        components: fields.map(() => entries.flatMap((_, i) => (next(3) === 0 ? [i] : []))),
      },
      resolved,
      selfIdentity: 'scope/self@1.0.0',
      manual: [map(), map(), map()],
      packageJson: [map(), map(), map()],
      environment: {
        policy: map(),
        workspace: { dependencies: map(), peerDependencies: map() },
        modelComponents: entries,
        modelPackages: map(),
      },
    };
  });
}
test('native env-self and manual policies match actual Node precedence and missing-package receipts', async () => {
  const requests = cases();
  const frames = requests.map((request, index) => {
    const body = Buffer.from(JSON.stringify({ kind: 'dependencyPolicyFinish', ...request }));
    const header = Buffer.alloc(12);
    header.write('BWS1');
    header.writeUInt32BE(index + 1, 4);
    header.writeUInt32BE(body.length, 8);
    return Buffer.concat([header, body]);
  });
  const responses = execFileSync(process.env.BIT_TEST_OBJECT_IMPORT, {
    input: Buffer.concat(frames),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
    .trim()
    .split('\n')
    .map(JSON.parse);
  for (let index = 0; index < requests.length; index++) {
    assert.equal(responses[index].failed, false, `case ${index}`);
    if (process.env.BIT_TEST_WORKSPACE_ADDON) {
      const { planDependencyPolicy } = require(process.env.BIT_TEST_WORKSPACE_ADDON);
      const direct = planDependencyPolicy(JSON.stringify(requests[index]), true);
      assert.deepEqual(JSON.parse(direct), responses[index].data);
    }
    const { state, ...receipts } = responses[index].data;
    const actual = {
      ...receipts,
      packages: state.packages,
      components: state.components.map((indices) => indices.map((index) => state.entries[index])),
    };
    const expected = await canonical(requests[index]);
    assert.deepEqual(actual, expected, `case ${index}: ${JSON.stringify(requests[index])}`);
    actual.packages.forEach((map, field) =>
      assert.deepEqual(Object.keys(map), Object.keys(expected.packages[field]), `case ${index} package order`)
    );
  }
});
