const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');

// Usage: node config-merge-differential.cjs PRIVATE_CLI HELPER [REPORT_JSON]
// Calls the real canonical private methods with inert public callbacks. Never
// patches installed modules or changes production dependency/configuration data.
const cli = path.resolve(process.argv[2] || '');
const helper = path.resolve(process.argv[3] || '');
assert.ok(process.argv[2] && process.argv[3], 'PRIVATE_CLI and HELPER are required');
assert.ok(cli.startsWith(os.tmpdir() + path.sep), 'private CLI required');
process.env.BIT_RUST_CLIENT_VCS = 'off';
const repository = path.resolve(__dirname, '../..');
const marker = JSON.parse(fs.readFileSync(path.join(cli, '.bit-object-import-build.json')));
const digest = (filename) => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const bindings = new Map([
  [__filename, digest(__filename)],
  [helper, digest(helper)],
]);
for (const [filename, sha] of Object.entries(marker.sourceSha256)) {
  const absolute = path.join(repository, filename);
  assert.equal(digest(absolute), sha, filename);
  bindings.set(absolute, sha);
}
for (const entry of marker.compiledModules) {
  const absolute = path.join(cli, 'node_modules/@teambit', entry.path);
  assert.equal(digest(absolute), entry.sha256, entry.path);
  bindings.set(absolute, entry.sha256);
}
const requireCli = createRequire(path.join(cli, 'package.json'));
const semver = requireCli('semver');
const { ConfigMergerMain } = requireCli('@teambit/config-merger/dist/config-merger.main.runtime.js');
const { MergingMain } = requireCli('@teambit/merging/dist/merging.main.runtime.js');
for (const filename of Object.keys(require.cache)) {
  if (filename.startsWith(cli + path.sep)) bindings.set(filename, digest(filename));
}
const child = spawn(helper, ['--threads', '1'], { stdio: ['pipe', 'pipe', 'inherit'] });
let sequence = 0;
let buffered = Buffer.alloc(0);
let pending;
function fail(error) {
  if (pending) {
    clearTimeout(pending.timer);
    pending.reject(error);
    pending = undefined;
  }
  child.kill();
}
child.on('error', fail);
child.on('exit', (code) => {
  if (pending) fail(new Error(`helper exited ${code}`));
});
child.stdout.on('data', (chunk) => {
  buffered = Buffer.concat([buffered, chunk]);
  if (buffered.length > 4 * 1024 * 1024) return fail(new Error('oversized helper response'));
  const newline = buffered.indexOf(10);
  if (newline < 0) return;
  try {
    assert.ok(pending, 'unsolicited helper response');
    const response = JSON.parse(buffered.subarray(0, newline));
    buffered = buffered.subarray(newline + 1);
    assert.equal(buffered.length, 0, 'multiple helper responses');
    assert.equal(response.version, 1);
    assert.equal(response.id, pending.id);
    assert.equal(response.completed, 1);
    assert.deepEqual(response.skipped, []);
    assert.equal(response.failed, false);
    clearTimeout(pending.timer);
    pending.resolve(response);
    pending = undefined;
  } catch (error) {
    fail(error);
  }
});
const request = (input) =>
  new Promise((resolve, reject) => {
    assert.equal(pending, undefined);
    const bytes = Buffer.from(JSON.stringify(input));
    assert.ok(bytes.length <= 4 * 1024 * 1024);
    const header = Buffer.alloc(12);
    header.write('BMT1');
    header.writeUInt32BE(++sequence, 4);
    header.writeUInt32BE(bytes.length, 8);
    pending = {
      id: sequence,
      resolve,
      reject,
      timer: setTimeout(() => fail(new Error('helper request timeout')), 30000),
    };
    child.stdin.write(Buffer.concat([header, bytes]));
  });
const version = (value) => ({
  major: value.major,
  minor: value.minor,
  patch: value.patch,
  prerelease: [...value.prerelease],
});
function normalize(strings) {
  const result = Object.create(null);
  for (const text of new Set(strings)) {
    const entry = {};
    if (semver.valid(text)) entry.version = version(new semver.SemVer(text));
    if (semver.validRange(text)) {
      entry.range = new semver.Range(text).set.map((set) =>
        set.map((comparator) => ({
          operator: comparator.operator,
          ...(comparator.value ? { version: version(comparator.semver) } : {}),
        }))
      );
      const minimum = semver.minVersion(text);
      if (minimum) {
        entry.minimum = version(minimum);
        entry.minimumText = minimum.toString();
      }
    }
    result[text] = entry;
  }
  return result;
}
const values = [
  '0.0.0',
  '0.1.0',
  '1.0.0',
  '1.2.3',
  '2.0.0',
  '3.0.0',
  '1.2.3-alpha.1',
  '1.2.3-beta.2',
  '1.2.3+build',
  '2.0.0-0',
  '2.0.0-alpha',
  '1.2.3-9007199254740992',
  '1.2.3-9007199254740993',
  '^0.1.0',
  '^1.0.0',
  '~1.2.3',
  '>=1.0.0',
  '>1.0.0',
  '<=2.0.0',
  '<1.0.0',
  '1.x',
  '*',
  '1.0.0 - 2.0.0',
  '>=1.0.0 <2.0.0 || >=3.0.0',
  '>=1.2.3-alpha <2.0.0',
  '>0.0.0 <0.0.0',
  '<0.0.0',
  '^2.0.0-0',
  'latest',
  'abcdef',
  'ABC123',
  'git:foo',
  'v1.2.3',
  '=1.2.3',
  '1.2',
  '>=0.0.0',
  '<=0.0.0',
];
let workspaceSeed = 0x6a09e667;
function random(max) {
  workspaceSeed = (Math.imul(workspaceSeed, 1664525) + 1013904223) >>> 0;
  return workspaceSeed % max;
}
async function canonical(workspace, components, strategy, peer) {
  const warnings = [];
  const workspaceEntries = [
    { dependencyId: 'pkg', lifecycleType: peer ? 'peer' : 'runtime', value: { version: workspace } },
  ];
  const owner = {
    depsResolver: {
      getWorkspacePolicyFromConfig: () => ({ entries: workspaceEntries }),
      getDependenciesFromLegacyComponent: (component) => [
        { source: 'auto', version: component.version, getPackageName: () => 'pkg' },
      ],
    },
    logger: {
      debug() {},
      info() {},
      warn(value) {
        warnings.push(value);
      },
    },
    updateWsConfigWithGivenChanges: async () => {},
    writeWorkspaceJsoncWithConflictsGracefully: async () => undefined,
  };
  const result = await ConfigMergerMain.prototype.updateDepsInWorkspaceConfigWithinOperation.call(
    owner,
    components.map((version) => ({ version })),
    strategy
  );
  return {
    hasDeps: result !== undefined,
    updates: Object.entries(result?.workspaceDepsUpdates || {}).map(([name, [from, to]]) => [name, from, to]),
    conflicts: result?.workspaceDepsConflicts || {},
    logs: result?.logs || [],
    warnings,
  };
}

async function workspaceCases() {
  const cases = 2500;
  for (let index = 0; index < cases; index++) {
    const workspace = values[random(values.length)];
    const components = [values[random(values.length)]];
    if (index % 13 === 0) components.push(values[random(values.length)]);
    const strategy = index % 3 === 0 ? 'theirs' : index % 3 === 1 ? 'manual' : undefined;
    const peer = index % 2 === 0;
    const expected = await canonical(workspace, components, strategy, peer);
    const versions = [...new Set(components.filter((value) => value !== workspace))];
    const input = {
      kind: 'configWorkspaceUpdates',
      workspaceEntries: [
        { dependencyId: 'pkg', lifecycleType: peer ? 'peer' : 'runtime', value: { version: workspace } },
      ],
      componentDeps: versions.length ? [{ name: 'pkg', versions }] : [],
      strategy,
      semver: normalize([workspace, ...components, ...components.map((component) => workspace[0] + component)]),
    };
    const response = await request(input);
    try {
      assert.equal(response.failed, false);
      assert.deepEqual(response.data, expected);
    } catch (error) {
      error.message += `\ncase ${index}: ${JSON.stringify({ workspace, components, strategy, peer, input, response, expected })}`;
      throw error;
    }
  }
}
const aspect = 'teambit.dependencies/dependency-resolver';
let scopeSeed = 0x243f6a88;
const scopeRandom = (max) => {
  scopeSeed = (Math.imul(scopeSeed, 1664525) + 1013904223) >>> 0;
  return scopeSeed % max;
};
const copy = (value) => JSON.parse(JSON.stringify(value));
function fixture() {
  const fields = ['dependencies', 'devDependencies', 'peerDependencies'];
  const merged = {};
  const scope = {};
  fields
    .sort(() => scopeRandom(3) - 1)
    .forEach((field) => {
      if (scopeRandom(3)) {
        merged[field] = [];
        for (let index = 0; index < scopeRandom(5); index++)
          merged[field].push({
            name: `pkg${scopeRandom(4)}`,
            version: scopeRandom(4) ? `${scopeRandom(3)}.0.0` : '-',
            force: scopeRandom(2) === 0,
            marker: { index },
          });
      }
    });
  fields
    .sort(() => scopeRandom(3) - 1)
    .forEach((field) => {
      if (scopeRandom(3)) {
        scope[field] = {};
        for (let index = 0; index < scopeRandom(5); index++)
          scope[field][`pkg${scopeRandom(4)}`] = scopeRandom(4) ? `${scopeRandom(3)}.0.0` : '-';
      }
    });
  return { merged, scope };
}

async function scopeCases() {
  const cases = 1500;
  for (let index = 0; index < cases; index++) {
    const { merged, scope } = fixture();
    const actual = copy(merged);
    const native = copy(merged);
    const actualAliases = Object.values(actual);
    const nativeAliases = Object.values(native);
    const owner = { addScopePolicyToMergedArray: MergingMain.prototype.addScopePolicyToMergedArray };
    const canonicalConfig = { [aspect]: { policy: actual } };
    MergingMain.prototype.mergeScopeSpecificDepsPolicy.call(
      owner,
      { findCoreExtension: () => ({ config: { policy: scope } }) },
      canonicalConfig
    );
    MergingMain.prototype.filterDeletedDependenciesFromConfig.call(owner, canonicalConfig);
    const project = (policy) =>
      Object.entries(policy).map(([field, entries]) => ({
        field,
        entries: entries.map(({ name, version }) => ({ name, version })),
      }));
    const input = {
      kind: 'configScopePolicy',
      merged: project(merged),
      scope: Object.entries(scope).map(([field, entries]) => ({
        field,
        entries: Object.entries(entries).map(([name, version]) => ({ name, version })),
      })),
    };
    const response = await request(input);
    assert.equal(response.failed, false);
    const plan = response.data;
    for (const field of plan.appendOrder) {
      native[field] ||= [];
      native[field].push(...plan.fields.find((entry) => entry.field === field).append);
    }
    for (const field of plan.fields) {
      const values = native[field.field] || [];
      if (field.delete) delete native[field.field];
      else
        native[field.field] = field.retain.map(
          (selector) =>
            values[
              selector.original !== undefined
                ? selector.original
                : (merged[field.field]?.length || 0) + selector.appended
            ]
        );
    }
    try {
      assert.deepEqual(native, actual);
      assert.deepEqual(nativeAliases, actualAliases);
      for (const field of Object.keys(native)) {
        assert.notEqual(native[field], nativeAliases[Object.keys(merged).indexOf(field)]);
      }
    } catch (error) {
      error.message += `\ncase ${index}: ${JSON.stringify({ merged, scope, input, response, actual, native, actualAliases, nativeAliases })}`;
      throw error;
    }
  }
}

(async () => {
  await workspaceCases();
  await scopeCases();
  child.stdin.end();
  for (const [filename, sha] of bindings) assert.equal(digest(filename), sha, filename);
  const report = {
    result: 'PASS',
    cases: 4000,
    workspace: { cases: 2500, seed: '0x6a09e667' },
    scope: { cases: 1500, seed: '0x243f6a88' },
    cli,
    helper,
    helperSha256: bindings.get(helper),
    bindings: Object.fromEntries(bindings),
    semverVersion: requireCli('semver/package.json').version,
    checks: [
      'canonical workspace updates, logs and warnings',
      'canonical scope policy final values',
      'original array mutations',
      'filtered array replacement aliases',
    ],
  };
  if (process.argv[4]) fs.writeFileSync(process.argv[4], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
})().catch((error) => {
  child.kill();
  console.error(error);
  process.exitCode = 1;
});
