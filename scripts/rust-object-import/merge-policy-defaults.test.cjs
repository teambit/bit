const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { source, installed } = require('./load-source.cjs');
const { benchmarkGlobals } = require('../rust-dependency-analysis/command-workspace.cjs');
const { commandDefaultNodeReceipt } =
  process.env.BIT_TEST_COMMAND_COMPILED === '1'
    ? installed('@teambit/bit/dist/rust-workspace-command-defaults.js')
    : source('scopes/harmony/bit/rust-workspace-command-defaults.ts');

// Invoke the actual Harmony workspace in a separate process, so its component
// cache cannot conceal a changed file/configuration between differential cases.
test('default Node receipts match actual fresh and tagged Consumer load callbacks', async (t) => {
  const cli = process.env.BIT_LEGACY_ROOT;
  assert.ok(cli, 'physical canonical CLI required');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-merge-policy-defaults-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const directory = path.join(temporary, 'workspace');
  await fs.mkdir(directory);
  const env = { ...process.env, CI: '1', BIT_RUST_CLIENT_VCS: 'off', BIT_GLOBALS_DIR: benchmarkGlobals(temporary) };
  const run = (args) =>
    execFileSync(process.execPath, [path.join(cli, 'bin/bit.js'), ...args], {
      cwd: directory,
      env,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });
  run(['init', '--skip-interactive', '--default-scope', 'qualification.policy']);
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'policy-oracle', private: true }));
  await fs.mkdir(path.join(directory, 'component'));
  await fs.writeFile(path.join(directory, 'component/index.js'), 'module.exports = 1;\n');
  run(['add', 'component', '--id', 'component', '--main', 'index.js']);
  const identity = 'qualification.policy/component';
  async function compare(label, componentPolicy = {}) {
    const output = path.join(temporary, `${label}.json`);
    execFileSync(
      process.execPath,
      [path.join(__dirname, 'merge-policy-oracle.cjs'), cli, directory, output, identity],
      {
        cwd: directory,
        env,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
      }
    );
    const [actual] = JSON.parse(await fs.readFile(output, 'utf8'));
    const metadata = actual.metadata;
    const byName = new Map(metadata.extensions.map((extension) => [extension.name, extension]));
    const receipt = commandDefaultNodeReceipt(
      { identity, version: metadata.version },
      {
        extensions: [{ name: 'teambit.dependencies/dependency-resolver', config: { policy: componentPolicy } }],
        input: { resolution: {} },
      },
      metadata.files.map((file) => file.relativePath)
    );
    assert.deepEqual(receipt.env.data, byName.get('teambit.envs/envs').data, `${label}: env`);
    assert.deepEqual(
      JSON.parse(JSON.stringify(receipt.policyEntries)),
      byName.get('teambit.dependencies/dependency-resolver').data.policy,
      `${label}: policy entries`
    );
    assert.deepEqual(
      { devPatterns: receipt.devPatterns, devFiles: receipt.devFiles },
      byName.get('teambit.component/dev-files').data,
      `${label}: dev callbacks`
    );
    for (const slot of receipt.slotData) {
      assert.deepEqual(slot.data, byName.get(slot.id).data, `${label}: ${slot.id}`);
      assert.deepEqual(slot.undefinedKeys, actual.undefinedDataKeys[slot.id], `${label}: undefined keys ${slot.id}`);
    }
    return receipt;
  }
  await compare('new');
  run(['tag', '--ver', '1.0.0', '--message', 'oracle', '--soft', '--disable-tag-pipeline', '--ignore-issues', '*']);
  run(['tag', '--persist=skip-build', '--disable-tag-pipeline', '--ignore-issues', '*']);
  await compare('tagged');
  await fs.writeFile(path.join(directory, 'component/fresh.test.ts'), 'export const test = 1;\n');
  await fs.writeFile(path.join(directory, 'component/fresh.spec.js'), 'exports.test = 1;\n');
  await fs.writeFile(path.join(directory, 'component/fresh.ts'), 'export const value = 1;\n');
  run(['add', 'component', '--id', 'component', '--main', 'index.js']);
  const changed = await compare('added-files');
  assert.deepEqual(changed.devFiles['teambit.defender/tester'], ['fresh.spec.js', 'fresh.test.ts']);
  await fs.unlink(path.join(directory, 'component/fresh.spec.js'));
  const policy = { devDependencies: { '@types/node': '22.10.4' }, peerDependencies: { react: '^18.0.0' } };
  await fs.writeFile(
    path.join(directory, 'component/component.json'),
    JSON.stringify({
      componentId: { scope: 'qualification.policy', name: 'component', version: '1.0.0' },
      extensions: { 'teambit.dependencies/dependency-resolver': { policy } },
    })
  );
  const configured = await compare('deleted-and-configured', policy);
  assert.deepEqual(configured.devFiles['teambit.defender/tester'], ['fresh.test.ts']);
});

test('default Node receipt helpers do not load workspace or component model classes', () => {
  const loaded = Object.keys(require.cache).filter((filename) =>
    /\/(?:load-bit|consumer-component|model-component)\.js$|\/models\/version\.js$|\/workspace\/dist\/workspace\.js$/.test(
      filename
    )
  );
  assert.deepEqual(loaded, []);
});

test('projected merged config overrides component.json even without propagation and keeps automatic policy separate', () => {
  const { statusPolicy } =
    process.env.BIT_TEST_COMMAND_COMPILED === '1'
      ? installed('@teambit/bit/dist/rust-status-policy.js')
      : source('scopes/harmony/bit/rust-status-policy.ts');
  const { VariantPolicy } = installed('@teambit/dependency-resolver/dist/policy/variant-policy/variant-policy.js');
  const resolver = 'teambit.dependencies/dependency-resolver';
  const automatic = VariantPolicy.fromConfigObject(
    {
      dependencies: [{ name: '@qualification/policy.dependency', version: '^2.0.0', force: false }],
      devDependencies: [{ name: 'test-package', version: '^3.0.0', force: false }],
    },
    { source: 'auto' }
  ).toLegacyAutoDetectOverrides();
  const merge = ['dependencies', 'devDependencies', 'peerDependencies'].map((field) => automatic[field] || {});
  const config = { policy: { devDependencies: { '@types/node': '^22.10.5' } } };
  for (const propagate of [true, false, undefined]) {
    const target = {
      identity: 'qualification.policy/component',
      config: { propagate, extensions: { [resolver]: { policy: { devDependencies: { '@types/node': '22.10.4' } } } } },
      mergedConfigNames: [resolver],
      autoDetectMergePolicy: merge,
    };
    const context = { models: [], versions: [], workspace: {}, targets: [target] };
    const projected = { schema: '2.0.0', extensions: [{ name: resolver, config, data: {} }] };
    const policy = statusPolicy(context, target, projected);
    assert.deepEqual(policy.extensions[0], { name: resolver, config });
    assert.equal(policy.input.finish.manual[1]['@types/node'], '^22.10.5');
    assert.equal(policy.input.finish.manual[0]['@qualification/policy.dependency'], undefined);
    assert.equal(policy.input.finish.manual[1]['test-package'], undefined);
    assert.deepEqual(policy.input.resolution.merge, merge);
    assert.equal(policy.input.policies.automatic[0]['@qualification/policy.dependency'], '^2.0.0');
    assert.equal(policy.input.policies.automatic[1]['test-package'], '^3.0.0');
    assert.equal(policy.input.resolution.grammar['^3.0.0'].range, true);
    const receipt = commandDefaultNodeReceipt(target, policy, ['index.js', 'index.test.ts']);
    assert.deepEqual(
      Object.keys(policy.input.finish.manual[1]),
      ['@types/node', '@types/jest'],
      'configured dependency replaces its environment entry in canonical manual insertion order'
    );
    assert.deepEqual(
      Object.keys(policy.input.finish.manual[1]),
      receipt.policyEntries
        .filter((entry) => entry.force && entry.lifecycleType === 'dev')
        .map((entry) => entry.dependencyId),
      'native finish order matches the canonical merged VariantPolicy receipt'
    );
    const configured = receipt.policyEntries.find((entry) => entry.dependencyId === '@types/node');
    assert.equal(configured.source, 'config');
    assert.equal(configured.value.version, '^22.10.5');
  }
});
