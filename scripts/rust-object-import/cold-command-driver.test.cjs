const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { source, installed } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_COMMAND_COMPILED === '1';
const load = (name) => (compiled ? installed(`@teambit/bit/dist/${name}.js`) : source(`scopes/harmony/bit/${name}.ts`));
const { parseRustWorkspaceCommand } = load('rust-workspace-command-options');

test('CLI binding verifies unchanged bootstrap modules and replacement overlay bytes', async (t) => {
  const { verifyCli } = require('./cold-command-binding.cjs');
  const { createHash } = require('node:crypto');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-cold-binding-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const modules = path.join(directory, 'node_modules/@teambit');
  await fs.mkdir(modules, { recursive: true });
  const entry = (name, bytes) => ({ path: name, sha256: createHash('sha256').update(bytes).digest('hex') });
  await fs.writeFile(
    path.join(directory, '.bit-rust-private-build.json'),
    JSON.stringify({ revision: 'base', compiledModules: [entry('bootstrap.js', 'base'), entry('overlay.js', 'old')] })
  );
  await fs.writeFile(
    path.join(directory, '.bit-object-import-build.json'),
    JSON.stringify({ installedRevision: 'base', compiledModules: [entry('overlay.js', 'new')] })
  );
  await fs.writeFile(path.join(modules, 'bootstrap.js'), 'base');
  await fs.writeFile(path.join(modules, 'overlay.js'), 'new');
  assert.equal((await verifyCli(directory)).modules.length, 2);
  await fs.writeFile(path.join(modules, 'bootstrap.js'), 'tampered');
  await assert.rejects(verifyCli(directory), /bootstrap.js/);
  await fs.writeFile(path.join(modules, 'bootstrap.js'), 'base');
  await fs.writeFile(path.join(modules, 'overlay.js'), 'tampered');
  await assert.rejects(verifyCli(directory), /overlay.js/);
});

test('qualification snap identities are independent of discarded comparison Version UUIDs', async () => {
  const preload = await fs.readFile(path.join(__dirname, 'checkout-transition-determinism.cjs'), 'utf8');
  function identities(discardedVersions) {
    const module = { _load: () => ({ v4: () => assert.fail('uncontrolled UUID') }) };
    require('node:vm').runInNewContext(preload, {
      require: (name) => (name === 'node:module' ? module : require(name)),
      process: {
        env: {
          BIT_CHECKOUT_TRANSITION_QUALIFICATION_SEED: 'same-command',
          BIT_CHECKOUT_TRANSITION_QUALIFICATION_CLOCK: '1800000000000',
        },
      },
    });
    const incidental = module._load('uuid', { filename: '/models/version.js' });
    const durable = module._load('uuid', { filename: '/snapping/new-snap-hash.js' });
    for (let index = 0; index < discardedVersions; index++) incidental.v4();
    return [durable.v4(), durable.v4()];
  }
  assert.deepEqual(identities(0), identities(3));
  assert.notEqual(identities(0)[0], identities(0)[1]);
});

test('wrapper benchmark bypasses only the cold entry and retains native kernel modules', async () => {
  const preload = await fs.readFile(path.join(__dirname, 'cold-command-wrapper-baseline.cjs'), 'utf8');
  const kernel = { request: () => 'native kernel' };
  const cold = { runRustWorkspaceCommand: () => assert.fail('cold entry must not run'), otherExport: true };
  const module = { _load: (name) => (name.endsWith('rust-workspace-command.js') ? cold : kernel) };
  require('node:vm').runInNewContext(preload, {
    require: (name) => (name === 'node:module' ? module : require(name)),
    process: { env: { BIT_COLD_COMMAND_WRAPPER_BASELINE: '1' } },
  });
  assert.equal(await module._load('./rust-workspace-command.js').runRustWorkspaceCommand(), false);
  assert.equal(module._load('./rust-workspace-command.js').otherExport, true);
  assert.equal(module._load('./rust-object-import.js'), kernel);
});

test('cold workspace command grammar rejects unsupported or ambiguous options before native dispatch', () => {
  for (const args of [
    ['checkout', 'head'],
    ['checkout', 'head', '-x', '--skip-dependency-installation'],
    ['checkout', 'head', '-x', '--force-ours', '--force-theirs'],
    ['checkout', 'head', '-x', '--manual', '-r', 'manual'],
    ['checkout', 'head', '-x', '--unknown'],
    ['checkout', 'head', '-x', 'component', 'extra'],
    ['checkout', 'head', '-x', '*'],
    ['checkout', 'head', '--all', '-x'],
    ['merge', '-x', '--build'],
    ['merge', '-x', '--no-snap', '-m', 'message'],
    ['merge', '-x', '-r', 'invalid'],
    ['merge', '-x', '--abort'],
    ['merge', '-x', '--resolve'],
  ])
    assert.equal(parseRustWorkspaceCommand(args), undefined, args.join(' '));
  assert.equal(parseRustWorkspaceCommand(['checkout', 'head', 'scope/component', '-x']).operation, 'checkout');
  assert.equal(parseRustWorkspaceCommand(['merge', 'scope/component', '-x', '--no-snap']).noSnap, true);
});

test('cold driver validates the complete plan before writes and propagates failures once commit starts', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-cold-driver-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const addon = path.join(directory, 'test-addon.cjs');
  await fs.writeFile(addon, 'module.exports = {};');
  const discovery = installed('@teambit/objects/dist/objects/rust-object-discovery.js');
  const originalExecutable = discovery.resolveRustObjectImportExecutable;
  const originalAddon = discovery.resolveRustWorkspaceAddon;
  discovery.resolveRustObjectImportExecutable = () => path.join(directory, 'unused-helper');
  discovery.resolveRustWorkspaceAddon = () => addon;
  const capture = load('rust-client-capture');
  const originalCapture = capture.captureRustClientCurrent;
  const { readRustWorkspaceCommand } = load('rust-workspace-command');
  const events = [];
  let failure;
  let invalidReport = false;
  require(addon).WorkspaceEngine = class {
    async request(frame) {
      const input = JSON.parse(frame.subarray(12));
      events.push(input.kind);
      if (failure === input.kind) throw new Error(`failure at ${failure}`);
      const data =
        input.kind === 'commandPrepare'
          ? { token: 'retained', context: { models: [] }, targets: [] }
          : input.kind === 'commandPlan'
            ? {
                token: 'retained',
                result: invalidReport ? { invalid: true } : { components: [], failedComponents: [] },
              }
            : { applied: true };
      return Buffer.from(JSON.stringify({ version: 1, id: frame.readUInt32BE(4), failed: false, skipped: [], data }));
    }
    close() {
      events.push('close');
    }
  };
  capture.captureRustClientCurrent = async () => ({
    captured: [],
    fresh: () => true,
    commit: async () => {
      events.push('cache/history commit');
      if (failure === 'commit') throw new Error('cache commit failure');
    },
  });
  t.after(() => {
    discovery.resolveRustObjectImportExecutable = originalExecutable;
    discovery.resolveRustWorkspaceAddon = originalAddon;
    capture.captureRustClientCurrent = originalCapture;
    delete require.cache[addon];
  });
  const options = parseRustWorkspaceCommand(['merge', '-x']);
  const run = () =>
    readRustWorkspaceCommand(directory, directory, options, async () => {
      events.push('beforeCommit');
      if (failure === 'beforeCommit') throw new Error('presentation setup failure');
    });
  for (const phase of ['commandPrepare', 'commandPlan']) {
    failure = phase;
    events.length = 0;
    assert.equal(await run(), undefined, `${phase}: read-only failure can fall back`);
    assert.equal(events.includes('beforeCommit'), false);
    assert.equal(events.includes('cache/history commit'), false);
    assert.equal(events.includes('commandApply'), false);
    assert.equal(events.at(-1), 'close');
  }
  failure = undefined;
  invalidReport = true;
  events.length = 0;
  assert.equal(await run(), undefined, 'unknown report data must decline before any writes');
  assert.deepEqual(events, ['commandPrepare', 'commandPlan', 'close']);
  invalidReport = false;
  for (const phase of ['beforeCommit', 'commit', 'commandApply']) {
    failure = phase;
    events.length = 0;
    await assert.rejects(run(), /failure/, `${phase}: must not return fallback after durable boundary`);
    assert.equal(events.at(-1), 'close');
    assert.equal(events.filter((event) => event === 'commandApply').length, phase === 'commandApply' ? 1 : 0);
  }
  failure = undefined;
  events.length = 0;
  assert.ok(await run());
  assert.deepEqual(events, [
    'commandPrepare',
    'commandPlan',
    'beforeCommit',
    'cache/history commit',
    'commandApply',
    'close',
  ]);
});
