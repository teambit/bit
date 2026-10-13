const { test } = require('node:test');
const assert = require('node:assert/strict');
const { source, installed } = require('../rust-object-import/load-source.cjs');
const kernel = process.env.BIT_TEST_SCANNER_COMPILED
  ? installed('@teambit/dependencies/dist/dependencies-loader/rust-policy-kernel.js')
  : source('scopes/dependencies/dependencies/dependencies-loader/rust-policy-kernel.ts');
function fixture(t) {
  const previous = { ...process.env };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = process.env.BIT_TEST_OBJECT_IMPORT;
  delete process.env.BIT_RUST_DEPENDENCY_SCANNER;
  t.after(() => {
    process.env = previous;
  });
  return {
    packages: [{ alpha: '1.0.0' }, {}, {}],
    components: [[], [], []],
    entries: [],
    ignored: [[], [], []],
    missing: [],
    policies: {
      modelPeers: {},
      packagePolicy: { dependencies: {}, peerDependencies: {} },
      workspacePolicy: { dependencies: {}, peerDependencies: { alpha: '^2.0.0' } },
      automatic: [{}, {}, {}],
    },
  };
}
test('policy bridge uses the actual synchronous addon without mutating caller input', (t) => {
  const input = fixture(t),
    saved = structuredClone(input);
  const result = kernel.planNativeDependencyPolicy(input);
  assert.deepEqual(result.packages, [{}, {}, { alpha: '^2.0.0' }]);
  assert.deepEqual(input, saved);
  const finish = {
    state: { packages: result.packages, components: result.components, entries: [] },
    manual: [{}, {}, {}],
    packageJson: [{}, {}, {}],
    resolved: {},
    selfIdentity: 'scope/self',
    environment: {
      policy: { alpha: '+' },
      workspace: { dependencies: { alpha: '3.0.0' }, peerDependencies: {} },
      modelComponents: [],
      modelPackages: {},
    },
  };
  assert.deepEqual(kernel.finishNativeDependencyPolicy(finish).state.packages, [{ alpha: '3.0.0' }, {}, {}]);
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  assert.equal(kernel.planNativeDependencyPolicy(input), undefined);
});
test('missing and malformed bindings preserve fallback without partially mutating caller data', (t) => {
  const input = fixture(t),
    binding = require(process.env.BIT_TEST_WORKSPACE_ADDON),
    original = binding.planDependencyPolicy;
  t.after(() => {
    binding.planDependencyPolicy = original;
  });
  for (const replacement of [
    undefined,
    () => {
      throw Error('lost addon');
    },
    () => '{',
    () =>
      JSON.stringify({
        packages: [{}, {}, {}],
        components: [[99], [], []],
        ranges: [],
        missing: [],
        removed: [[], [], []],
      }),
  ]) {
    binding.planDependencyPolicy = replacement;
    assert.equal(kernel.planNativeDependencyPolicy(input), undefined);
    assert.deepEqual(input.packages, [{ alpha: '1.0.0' }, {}, {}]);
  }
});
