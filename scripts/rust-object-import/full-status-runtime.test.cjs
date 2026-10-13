const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { inflateSync, deflateSync } = require('node:zlib');
const { execFileSync } = require('node:child_process');
const { source, installed } = require('./load-source.cjs');
const { writeComponents, mutate } = require('./workspace-inspection-fixture.cjs');
const { benchmarkGlobals } = require('../rust-dependency-analysis/command-workspace.cjs');

const readRustStatus =
  process.env.BIT_TEST_STATUS_COMPILED === '1'
    ? installed('@teambit/bit/dist/rust-status.js').readRustStatus
    : source('scopes/harmony/bit/rust-status.ts').readRustStatus;

test('cold full status owns real default-Node workspaces and preserves canonical JSON', async (t) => {
  assert.ok(process.env.BIT_LEGACY_ROOT, 'canonical CLI is required');
  assert.ok(process.env.BIT_TEST_OBJECT_IMPORT, 'native helper is required');
  assert.ok(process.env.BIT_TEST_WORKSPACE_ADDON, 'native addon is required');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-full-status-runtime-'));
  const directory = path.join(temporary, 'workspace');
  await fs.mkdir(directory);
  const globals = benchmarkGlobals(temporary);
  const previous = { flag: process.env.BIT_RUST_CLIENT_VCS, helper: process.env.BIT_RUST_OBJECT_IMPORT };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = process.env.BIT_TEST_OBJECT_IMPORT;
  t.after(async () => {
    await fs.rm(temporary, { recursive: true, force: true });
    for (const [key, value] of [
      ['BIT_RUST_CLIENT_VCS', previous.flag],
      ['BIT_RUST_OBJECT_IMPORT', previous.helper],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  function command(args) {
    return execFileSync(process.execPath, [path.join(process.env.BIT_LEGACY_ROOT, 'bin/bit.js'), ...args], {
      cwd: directory,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, CI: '1', BIT_GLOBALS_DIR: globals, BIT_RUST_CLIENT_VCS: 'off' },
    });
  }
  command(['init', '--skip-interactive', '--default-scope', 'qualification.inspection']);
  const scopeFile = path.join(directory, '.bit/scope.json');
  const scope = JSON.parse(await fs.readFile(scopeFile, 'utf8'));
  scope.name = 'qualification.inspection';
  await fs.writeFile(scopeFile, JSON.stringify(scope));
  await fs.writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: 'full-status-runtime', private: true })
  );
  await writeComponents(directory);
  for (const name of ['alpha', 'beta']) command(['add', name, '--id', name, '--main', 'index.js']);
  command(['link']);
  command([
    'tag',
    '--ver',
    '1.0.0',
    '--message',
    'full status baseline',
    '--soft',
    '--disable-tag-pipeline',
    '--ignore-issues',
    '*',
  ]);
  command(['tag', '--persist=skip-build', '--disable-tag-pipeline', '--ignore-issues', '*']);
  const compare = async (label) => {
    // The canonical read refreshes the dependency cache; the production route must then own the next read.
    const expected = JSON.parse(command(['status', '--json']));
    const actual = await readRustStatus(directory, temporary);
    assert.ok(actual, `${label}: native command must complete, not silently fall back`);
    assert.deepEqual(actual, expected, label);
    assert.equal(JSON.stringify(actual), JSON.stringify(expected), `${label}: JSON property order`);
    return actual;
  };
  const clean = await compare('clean');
  assert.deepEqual(clean.modifiedComponents, []);
  const objects = path.join(directory, '.bit/objects');
  let componentObject;
  for (const shard of await fs.readdir(objects)) {
    if (!/^[a-f0-9]{2}$/.test(shard)) continue;
    for (const suffix of await fs.readdir(path.join(objects, shard))) {
      if (!/^[a-f0-9]{38}$/.test(suffix)) continue;
      const filename = path.join(objects, shard, suffix);
      const original = await fs.readFile(filename);
      const inflated = inflateSync(original);
      const separator = inflated.indexOf(0);
      const [type, hash] = inflated.subarray(0, separator).toString().split(' ');
      if (type !== 'Component') continue;
      const model = JSON.parse(inflated.subarray(separator + 1));
      if (model.name === 'beta') componentObject = { filename, original, model, hash };
    }
  }
  assert.ok(componentObject, 'actual tagged Component model exists');
  for (const prefix of ['@alternate', undefined, '']) {
    const model = { ...componentObject.model };
    if (prefix === undefined) delete model.bindingPrefix;
    else model.bindingPrefix = prefix;
    const body = JSON.stringify(model);
    await fs.writeFile(
      componentObject.filename,
      deflateSync(Buffer.concat([Buffer.from(`Component ${componentObject.hash} ${body.length}\0`), Buffer.from(body)]))
    );
    const result = await compare(`Component bindingPrefix ${String(prefix)}`);
    assert.deepEqual(result.modifiedComponents, prefix === '@alternate' ? ['qualification.inspection/beta'] : []);
    command(['link']);
    await compare(`linked Component bindingPrefix ${String(prefix)}`);
  }
  await fs.writeFile(componentObject.filename, componentObject.original);
  await compare('restored Component binding prefix');
  const versionHash = componentObject.model.versions['1.0.0'];
  const versionFile = path.join(objects, versionHash.slice(0, 2), versionHash.slice(2));
  const versionOriginal = await fs.readFile(versionFile);
  const versionBytes = inflateSync(versionOriginal);
  const versionData = JSON.parse(versionBytes.subarray(versionBytes.indexOf(0) + 1));
  versionData.extensions
    .find((extension) => extension.name === 'teambit.dependencies/dependency-resolver')
    .data.dependencies.push({
      __type: 'component',
      lifecycle: 'peer',
      id: 'qualification.external/peer@1.0.0',
      version: '1.0.0',
      componentId: { scope: 'qualification.external', name: 'peer', version: '1.0.0' },
    });
  const versionBody = JSON.stringify(versionData);
  await fs.writeFile(
    versionFile,
    deflateSync(
      Buffer.concat([Buffer.from(`Version ${versionHash} ${versionBody.length}\0`), Buffer.from(versionBody)])
    )
  );
  try {
    const { Scope } = installed('@teambit/legacy.scope');
    const { ComponentID } = installed('@teambit/component-id');
    const legacyScope = await Scope.load(path.join(directory, '.bit'), false);
    const model = await legacyScope.getModelComponent(ComponentID.fromString('qualification.inspection/beta@1.0.0'));
    const consumer = await model.toConsumerComponent('1.0.0', undefined, legacyScope.objects);
    const policyModule =
      process.env.BIT_TEST_STATUS_COMPILED === '1'
        ? installed('@teambit/bit/dist/rust-status-policy.js')
        : source('scopes/harmony/bit/rust-status-policy.ts');
    const target = { identity: 'qualification.inspection/beta', version: '1.0.0' };
    const policy = policyModule.statusPolicy(
      {
        models: [componentObject.model],
        versions: [[versionHash, versionData]],
        targets: [target],
        workspace: {},
        packageJson: {},
      },
      target
    );
    assert.deepEqual(
      policy.input.resolution.sources.model,
      Array.from(consumer.getAllDependenciesIds(), (id) => id.toString()),
      'resolver-data peers are not legacy model dependencies during version selection'
    );
  } finally {
    await fs.writeFile(versionFile, versionOriginal);
  }
  for (const phase of ['eol', 'config', 'content', 'inventory']) {
    await mutate(directory, phase);
    await compare(phase);
  }
  await fs.mkdir(path.join(directory, 'alpha/dist'), { recursive: true });
  await fs.mkdir(path.join(directory, 'beta/dist'), { recursive: true });
  await compare('dist existence');
  await fs.rm(path.join(directory, 'beta/dist'), { recursive: true });
  await fs.writeFile(
    path.join(directory, 'beta/index.js'),
    "module.exports = require('@qualification/inspection.alpha');\n"
  );
  await fs.writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name: 'full-status-runtime',
      private: true,
      dependencies: { '@qualification/inspection.beta': '1.0.0' },
    })
  );
  const cycle = await compare('circular and duplicate issue ordering');
  const betaIssues = cycle.componentsWithIssues
    .find((row) => row.id.endsWith('/beta'))
    .issues.map((issue) => issue.type);
  for (const issue of ['CircularDependencies', 'DuplicateComponentAndPackage', 'MissingDists'])
    assert.ok(betaIssues.includes(issue), issue);
  await fs.mkdir(path.join(directory, 'gamma'));
  await fs.writeFile(path.join(directory, 'gamma/index.js'), 'module.exports = 3;\n');
  command(['add', 'gamma', '--id', 'gamma', '--main', 'index.js']);
  command(['link']);
  const added = await compare('new component');
  assert.deepEqual(added.newComponents, ['qualification.inspection/gamma']);
  await fs.rm(path.join(directory, '.bit/cache/components/deps'), { recursive: true, force: true });
  assert.equal(await readRustStatus(directory, temporary), undefined, 'absent dependency cache falls back');
  await compare('cache refresh');
  await fs.utimes(path.join(directory, 'gamma/index.js'), 2000000000, 2000000000);
  assert.equal(await readRustStatus(directory, temporary), undefined, 'stale dependency cache falls back');
  await fs.utimes(path.join(directory, 'gamma/index.js'), 1700000000, 1700000000);
  const workspaceFile = path.join(directory, 'workspace.jsonc');
  const original = await fs.readFile(workspaceFile);
  const workspace = installed('comment-json').parse(original.toString());
  workspace['qualification.custom/runtime'] = {};
  await fs.writeFile(workspaceFile, JSON.stringify(workspace));
  assert.equal(await readRustStatus(directory, temporary), undefined, 'configured runtime retains canonical callbacks');
  await fs.writeFile(workspaceFile, original);
  await fs.writeFile(path.join(temporary, '.bitrc.jsonc'), '{}');
  assert.equal(await readRustStatus(directory, temporary), undefined, 'global runtime configuration falls back');
});
