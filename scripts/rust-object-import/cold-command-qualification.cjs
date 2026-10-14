const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { inflateSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { createFixture, rebaseLinks } = require('./cold-command-fixture.cjs');
const { observe } = require('./workspace-inspection-body-read.cjs');
const { sourceIdentity } = require('./artifacts/contract.cjs');
const { createRequire } = require('node:module');

function versionObjects(state) {
  return Object.entries(state.objects).flatMap(([hash, hex]) => {
    const bytes = Buffer.from(hex, 'hex');
    const separator = bytes.indexOf(0);
    return bytes.subarray(0, separator).toString().startsWith('Version ')
      ? [[hash, JSON.parse(bytes.subarray(separator + 1).toString())]]
      : [];
  });
}

async function binding(cli, helper, allowUnmarkedCli = false) {
  const sha256 = async (filename) =>
    createHash('sha256')
      .update(await fs.readFile(filename))
      .digest('hex');
  const load = createRequire(path.join(cli, 'package.json'));
  const discovery = load('@teambit/objects/dist/objects/rust-object-discovery.js');
  const addon = helper && discovery.resolveRustWorkspaceAddon(helper);
  const verifiedCli = await require('./cold-command-binding.cjs').verifyCli(cli, allowUnmarkedCli);
  return {
    nativeSourceDigest: sourceIdentity(path.resolve(__dirname, '../..')),
    cliMarker: verifiedCli.marker,
    verifiedCli,
    helperSha256: helper ? await sha256(helper) : undefined,
    addonSha256: addon ? await sha256(addon) : undefined,
    harness: Object.fromEntries(
      await Promise.all(
        [
          'cold-command-qualification.cjs',
          'cold-command-fixture.cjs',
          'checkout-transition-determinism.cjs',
          'workspace-inspection-body-read.cjs',
          'import-trace.cjs',
          'cold-command-measure.cjs',
          'cold-command-binding.cjs',
          'cold-command-wrapper-baseline.cjs',
          'merge-history-measurement.cjs',
          '../rust-dependency-analysis/process-tree-memory.cjs',
          '../rust-dependency-analysis/process-tree-memory-control.cjs',
        ].map(async (name) => [name, await sha256(path.join(__dirname, name))])
      )
    ),
  };
}

async function replace(from, to) {
  await fs.rm(to, { recursive: true, force: true });
  await fs.cp(from, to, { recursive: true, verbatimSymlinks: true });
}
async function removeObjects(scope, type) {
  const objects = path.join(scope, 'objects');
  for (const shard of await fs.readdir(objects)) {
    if (!/^[a-f0-9]{2}$/.test(shard)) continue;
    for (const suffix of await fs.readdir(path.join(objects, shard))) {
      if (!/^[a-f0-9]{38}$/.test(suffix)) continue;
      const filename = path.join(objects, shard, suffix);
      if (
        inflateSync(await fs.readFile(filename))
          .toString()
          .startsWith(`${type} `)
      )
        await fs.rm(filename);
    }
  }
}
async function scopeObjects(scope) {
  const result = {};
  for (const shard of (await fs.readdir(path.join(scope, 'objects'))).sort()) {
    if (!/^[a-f0-9]{2}$/.test(shard)) continue;
    for (const suffix of (await fs.readdir(path.join(scope, 'objects', shard))).sort()) {
      if (!/^[a-f0-9]{38}$/.test(suffix)) continue;
      result[shard + suffix] = inflateSync(await fs.readFile(path.join(scope, 'objects', shard, suffix))).toString(
        'hex'
      );
    }
  }
  return result;
}
async function durableTree(directory, prefix = '') {
  const result = {};
  for (const entry of (await fs.readdir(path.join(directory, prefix), { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const filename = path.join(directory, relative);
    if (entry.isDirectory()) Object.assign(result, await durableTree(directory, relative));
    else if (entry.isSymbolicLink()) result[relative] = { link: await fs.readlink(filename) };
    else {
      const bytes = await fs.readFile(filename);
      result[relative] = { sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
    }
  }
  return result;
}
function comparable(state, persistEvent = false) {
  const value = structuredClone(state);
  // Cold commands do not request docs. Any entries they do write are validated below.
  delete value.docsCache;
  // Repository.persist launches this async hook without awaiting its file write.
  // Compare invocation intent and present payload separately from exit-time presence.
  if (persistEvent) delete value.events.onPostObjectsPersist;
  if (value.index) {
    value.index = JSON.parse(Buffer.from(value.index, 'hex'));
    for (const field of ['components', 'lanes'])
      if (Array.isArray(value.index[field]))
        value.index[field].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return value;
}

async function runQualification(cli, helper, options = {}) {
  const bound = await binding(cli, helper, options.allowUnmarkedCli);
  const dimensions = { extraFiles: options.extraFiles ?? 0 };
  const wrapperEligibility = {};
  let wrapperAuditSha256;
  let proofSha256;
  if (options.measure) {
    assert.ok(options.proof, 'measurement requires matching completed four-mode proof');
    assert.equal(options.diagnostic, undefined, 'measurement must bind frozen sources');
    assert.equal(options.canonicalOnly, undefined);
    const bytes = await fs.readFile(options.proof);
    const proof = JSON.parse(bytes);
    assert.equal(proof.qualified, true);
    assert.equal(proof.runs.length, 100, 'all twenty-five scenarios need four-mode qualification');
    assert.deepEqual(proof.binding, bound, 'measure exactly the qualified source, CLI, binaries and harness');
    assert.deepEqual(proof.endBinding, bound);
    assert.deepEqual(proof.dimensions, dimensions);
    for (const run of proof.runs.filter(
      (run) =>
        run.mode === 'native' &&
        !['checkout-divergent-head', 'main-last-target-callback-fallback', 'main-duplicate-package-fallback'].includes(
          run.scenario
        )
    )) {
      assert.deepEqual(run.trace.loadedCommandModels, []);
      assert.equal(run.trace.workspace.commandApply.applied, 1);
    }
    proofSha256 = createHash('sha256').update(bytes).digest('hex');
    if (options.wrapper) {
      assert.ok(options.wrapperProof, 'wrapper baselines require complete eligibility audit');
      const auditBytes = await fs.readFile(options.wrapperProof);
      const audit = JSON.parse(auditBytes);
      assert.equal(audit.wrapperAudit, true);
      assert.equal(audit.runs.length, 44);
      assert.deepEqual(audit.binding, bound);
      assert.deepEqual(audit.endBinding, bound);
      assert.deepEqual(audit.dimensions, dimensions);
      Object.assign(wrapperEligibility, audit.wrapperEligibility);
      assert.equal(Object.keys(wrapperEligibility).length, 22);
      wrapperAuditSha256 = createHash('sha256').update(auditBytes).digest('hex');
    }
  }
  if (!options.canonicalOnly)
    assert.ok(bound.addonSha256, 'resolved native addon required (debug builds need BIT_TEST_WORKSPACE_ADDON)');
  const temporary = await fs.mkdtemp(path.join(options.scratch || os.tmpdir(), 'bit-cold-command-'));
  const fixture = await createFixture(cli, temporary, dimensions);
  const skip = '--skip-dependency-installation';
  const scenarios = [
    { name: 'local-head-noop', base: 'local', args: ['checkout', 'head', fixture.id, skip] },
    { name: 'local-reset', base: 'local', args: ['checkout', 'reset', fixture.id, skip], edit: true },
    { name: 'file-same-head', remote: 'remoteOne', args: ['checkout', 'head', fixture.id, skip] },
    { name: 'file-advanced-head', args: ['checkout', 'head', fixture.id, skip] },
    { name: 'file-advanced-version', args: ['checkout', '1.0.1', fixture.id, skip] },
    { name: 'file-missing-remote-refs', args: ['checkout', 'head', fixture.id, skip], missingRefs: true },
    { name: 'file-missing-local-versions', args: ['checkout', 'head', fixture.id, skip], missingVersions: true },
    {
      name: 'file-missing-remote-histories',
      args: ['checkout', 'head', fixture.id, skip],
      missingRemoteHistories: true,
    },
    { name: 'merge-keeps-cached-remote', args: ['merge', fixture.id, skip] },
    { name: 'merge-no-pattern-keeps-cached-remote', args: ['merge', skip] },
    {
      name: 'main-divergent-no-snap',
      args: ['merge', fixture.id, skip, '--no-snap'],
      diverge: true,
      importRemote: true,
    },
    { name: 'main-divergent-auto-snap', args: ['merge', fixture.id, skip], diverge: true, importRemote: true },
    {
      name: 'main-duplicate-package-fallback',
      args: ['merge', fixture.id, skip],
      diverge: true,
      importRemote: true,
      duplicatePackage: true,
      snapFailed: true,
      fallback: true,
      latePreparationFallback: true,
    },
    { name: 'main-fast-forward', args: ['merge', fixture.id, skip], importRemote: true, fastForward: fixture.id },
    {
      name: 'main-fast-forward-cached-target',
      args: ['merge', fixture.id, skip],
      importRemote: true,
      fastForward: fixture.id,
      advancedRemote: true,
    },
    {
      name: 'main-mixed-no-snap',
      args: ['merge', '**', skip, '--no-snap'],
      diverge: true,
      importRemote: true,
      peerVersion: '1.0.1',
      fastForward: fixture.peerId,
    },
    {
      name: 'main-mixed-auto-snap',
      seedUnrelatedCache: true,
      args: ['merge', '**', skip],
      diverge: true,
      importRemote: true,
      peerVersion: '1.0.1',
      fastForward: fixture.peerId,
    },
    {
      name: 'main-mixed-changed-graph',
      args: ['merge', '**', skip],
      remote: 'remoteGraph',
      diverge: true,
      importRemote: true,
      fastForward: fixture.peerId,
      incomingVersion: '1.0.2',
    },
    {
      name: 'main-added-source-graph',
      args: ['merge', fixture.id, skip],
      remote: 'remoteAddedFiles',
      diverge: true,
      importRemote: true,
    },
    {
      name: 'main-runtime-to-dev-graph',
      args: ['merge', fixture.id, skip],
      remote: 'remoteDevDependency',
      diverge: true,
      importRemote: true,
    },
    {
      name: 'main-forced-component-policy',
      args: ['merge', fixture.id, skip],
      remote: 'remotePolicy',
      diverge: true,
      importRemote: true,
    },
    {
      name: 'main-last-target-callback-fallback',
      args: ['merge', '**', skip],
      remote: 'remoteUnsupportedCallbacks',
      diverge: true,
      importRemote: true,
      fastForward: fixture.peerId,
      incomingVersion: '1.0.3',
      fallback: true,
      latePreparationFallback: true,
    },
    {
      name: 'main-bare-divergent-only',
      args: ['merge', skip, '--no-snap'],
      diverge: true,
      importRemote: true,
      peerVersion: '1.0.0',
      fastForward: fixture.peerId,
    },
    {
      name: 'main-harmony1-auto-snap',
      args: ['merge', fixture.id, skip],
      diverge: true,
      importRemote: true,
      harmony1: true,
    },
    {
      name: 'checkout-divergent-head',
      args: ['checkout', 'head', fixture.id, skip],
      diverge: true,
      failure: true,
      fallback: true,
    },
  ];
  const runs = [];
  for (const scenario of scenarios) {
    if (options.scenarios && !options.scenarios.includes(scenario.name)) continue;
    if ((options.measure || options.wrapperAudit) && scenario.fallback) continue;
    let expected;
    const workspace = path.join(temporary, scenario.name, 'workspace');
    const prepared = path.join(temporary, scenario.name, 'prepared');
    const remoteBefore = path.join(temporary, scenario.name, 'remote-before');
    await replace(fixture[scenario.base || 'consumer'], prepared);
    await rebaseLinks(prepared, fixture[scenario.base || 'consumer'], prepared);
    await replace(fixture[scenario.remote || 'remoteTwo'], fixture.remote);
    if (scenario.edit) await fixture.write(prepared, 'component/index.js', 'module.exports = "local edit";\n');
    if (scenario.diverge) {
      const filename = path.join(prepared, 'command/component/index.js');
      await fs.writeFile(
        filename,
        (await fs.readFile(filename, 'utf8')).replace("exports.last = 'one'", "exports.last = 'local'")
      );
      fixture.tag(prepared, '2.0.0', fixture.id);
    }
    if (scenario.importRemote) fixture.command(prepared, ['import', '--objects']);
    if (scenario.duplicatePackage) {
      const filename = path.join(prepared, 'package.json');
      const value = JSON.parse(await fs.readFile(filename, 'utf8'));
      value.dependencies = { ...value.dependencies, '@qualification/command.component': '1.0.0' };
      await fs.writeFile(filename, JSON.stringify(value, null, 2));
    }
    if (scenario.fastForward) await fixture.stageFastForward(prepared, scenario.fastForward, scenario.incomingVersion);
    if (scenario.harmony1) await fixture.stageHarmony1(prepared, fixture.id);
    if (scenario.advancedRemote) await replace(fixture.remoteThree, fixture.remote);
    if (scenario.missingRefs) await fs.rm(path.join(prepared, '.bit/refs/remotes'), { recursive: true, force: true });
    if (scenario.missingVersions) await removeObjects(path.join(prepared, '.bit'), 'Version');
    if (scenario.missingRemoteHistories) await removeObjects(fixture.remote, 'VersionHistory');
    // Make the default persistence event observable even when setup already emitted it.
    await fs.rm(path.join(prepared, '.bit/events/onPostObjectsPersist'), { force: true });
    await fs.rm(path.join(prepared, '.bit/cache/components/deps'), { recursive: true, force: true });
    await fs.cp(fixture.remote, remoteBefore, { recursive: true });
    let entries = options.measure
      ? require('./merge-history-measurement.cjs')
          .pairedEntries(options.rounds || 3)
          .filter((entry) => !entry.fallback)
      : (options.canonicalOnly ? ['node'] : ['node', 'native', 'missing-helper', 'crashed-helper']).map((mode) => ({
          mode,
        }));
    if (options.wrapperAudit) entries = [{ mode: 'node' }, { mode: 'wrapper', diagnostic: true }];
    if (options.measure && options.wrapper && wrapperEligibility[scenario.name].eligible) {
      entries = [{ mode: 'wrapper', round: -2, warmup: true, diagnostic: true }];
      for (let round = -1; round < (options.rounds || 3); round++) {
        const modes = ['node', 'native', 'wrapper'];
        const offset = Math.max(round, 0) % modes.length;
        for (const mode of [...modes.slice(offset), ...modes.slice(0, offset)])
          entries.push({ mode, round, warmup: round < 0 });
      }
    }
    for (const { mode, round, warmup, diagnostic } of entries) {
      await replace(prepared, workspace);
      await rebaseLinks(workspace, prepared, workspace);
      await replace(remoteBefore, fixture.remote);
      if (scenario.seedUnrelatedCache) await fixture.seedUnrelatedCache(workspace);
      const before = await fixture.state(workspace);
      const durableBefore = await durableTree(workspace);
      const trace =
        !options.measure || diagnostic ? path.join(temporary, `${scenario.name}-${mode}-trace.json`) : undefined;
      const systemTrace =
        trace && mode === 'native' && !diagnostic && process.platform === 'linux' && options.bodyObservation !== false
          ? `${trace}.strace`
          : undefined;
      const selectedHelper =
        mode === 'missing-helper'
          ? path.join(temporary, 'absent-helper')
          : mode === 'crashed-helper'
            ? process.execPath
            : helper;
      let measurement;
      const output = await fixture.command(workspace, scenario.args, {
        native: mode !== 'node',
        wrapper: mode === 'wrapper',
        helper: selectedHelper,
        trace,
        systemTrace,
        seed: scenario.name,
        allowFailure: scenario.failure,
        ...(options.measure && !diagnostic
          ? {
              measure: {
                step: `${scenario.name}-${mode}-${round}`,
                record: (value) => {
                  measurement = value;
                },
              },
            }
          : {}),
      });
      const after = await fixture.state(workspace);
      const durableAfter = await durableTree(workspace);
      const remoteObjects = await scopeObjects(fixture.remote);
      const durableChanges = [...new Set([...Object.keys(durableBefore), ...Object.keys(durableAfter)])]
        .sort()
        .filter((name) => JSON.stringify(durableBefore[name]) !== JSON.stringify(durableAfter[name]))
        .map((name) => ({ path: name, before: durableBefore[name], after: durableAfter[name] }));
      const row = { scenario: scenario.name, mode, output, before, after, remoteObjects, durableChanges };
      if (options.measure) Object.assign(row, { round, warmup, measurement, diagnostic });
      const suffix = options.measure ? `.${round}` : '';
      if (options.report)
        await fs.writeFile(`${options.report}.${scenario.name}.${mode}${suffix}.json`, JSON.stringify(row, null, 2));
      assert.equal(output.code === 0, !scenario.failure, `${scenario.name}: expected command exit status`);
      if (scenario.snapFailed) {
        assert.match(output.stdout, /tracked component added as a package/);
        assert.match(output.stdout, /Total Snapped: 0/);
        assert.equal(
          versionObjects(after).filter(([hash]) => !before.objects[hash]).length,
          0,
          'blocked snap must not create a Version'
        );
      }
      if (systemTrace) {
        const sources = [before, after].flatMap((state) =>
          Object.entries(state.roots).flatMap(([root, files]) =>
            Object.keys(files).map((file) => path.join(workspace, root, file))
          )
        );
        row.bodyObservation = await observe(systemTrace, sources);
        if (!scenario.fallback)
          assert.equal(row.bodyObservation.bytes, 0, `${scenario.name}: Node must not read workspace Source bytes`);
      }
      if (trace) {
        row.trace = JSON.parse(await fs.readFile(trace));
        if (options.report)
          await fs.writeFile(`${options.report}.${scenario.name}.${mode}.json`, JSON.stringify(row, null, 2));
        if (scenario.args[0] === 'merge') {
          const expectedNotifications =
            scenario.diverge && !scenario.snapFailed && !scenario.args.includes('--no-snap') ? 2 : 1;
          assert.equal(row.trace.postPersistNotifications, expectedNotifications, 'canonical persistence hook intent');
        }
        if (mode !== 'native' && mode !== 'wrapper') {
          assert.ok(row.trace.loadedCommandModels.length, 'canonical mode loads command models');
        } else if (scenario.fallback || mode === 'wrapper') {
          assert.ok(
            row.trace.loadedCommandModels.length,
            `${scenario.name}: unsupported state must reach canonical command`
          );
          assert.equal(
            row.trace.workspaceFrames.some((frame) => frame.kind === 'commandApply'),
            false,
            'fallback must happen before apply'
          );
        } else {
          assert.deepEqual(
            row.trace.loadedCommandModels,
            [],
            `${scenario.name}: cold command must not load model classes`
          );
          assert.equal(row.trace.objectTypes?.Source || 0, 0, `${scenario.name}: no Source objects parsed in Node`);
          assert.ok(
            row.trace.workspaceFrames.some((frame) => frame.kind === 'commandApply'),
            `${scenario.name}: actual native command owner`
          );
          assert.equal(row.trace.workspace.commandApply.applied, 1, 'one successful retained command apply receipt');
          for (const kind of [
            'commandPrepare',
            'commandPlan',
            'commandPolicyPrepare',
            'commandDependencyDetect',
            'commandDependencyComplete',
            'commandFinalize',
            'commandApply',
          ])
            assert.equal(row.trace.workspace[kind].sourceBodyBytes, 0, `${kind}: no Source bytes cross Node`);
        }
      }
      if (mode === 'native' && scenario.latePreparationFallback) {
        assert.ok(row.trace.workspace.commandPlan.completed > 0, 'supported plan precedes last callback rejection');
        assert.equal(
          row.trace.workspace.commandFinalize.frames,
          0,
          'unsupported callbacks must decline before snap IDs/finalization'
        );
        assert.equal(
          row.trace.workspace.commandApply.frames,
          0,
          'unsupported callbacks must decline before publication'
        );
      }
      if (scenario.args[0] === 'merge' && after.events.onPostObjectsPersist)
        assert.deepEqual(after.events.onPostObjectsPersist, { bytes: '' }, 'canonical persistence event payload');
      if (!expected) expected = row;
      else {
        const compare = () => {
          assert.deepEqual(output, expected.output, `${scenario.name}/${mode}: exact public command output`);
          assert.deepEqual(
            comparable(after, scenario.args[0] === 'merge'),
            comparable(expected.after, scenario.args[0] === 'merge'),
            `${scenario.name}/${mode}: exact workspace state`
          );
          assert.deepEqual(
            remoteObjects,
            expected.remoteObjects,
            `${scenario.name}/${mode}: exact remote object state`
          );
          for (const [key, value] of Object.entries(after.docsCache))
            assert.equal(value, expected.after.docsCache[key], `${scenario.name}/${mode}: canonical docs cache ${key}`);
        };
        if (options.wrapperAudit) {
          try {
            compare();
            wrapperEligibility[scenario.name] = { eligible: true };
          } catch (error) {
            wrapperEligibility[scenario.name] = { eligible: false, reason: error.message };
          }
        } else compare();
      }
      if (scenario.name.includes('keeps-cached-remote')) {
        assert.deepEqual(after.roots, before.roots, 'main merge must not fetch advanced remote files');
        assert.deepEqual(after.remoteRefs, before.remoteRefs, 'main merge must retain cached remote refs');
      }
      if (scenario.advancedRemote) {
        const bitmap = createRequire(path.join(cli, 'package.json'))('comment-json').parse(
          Buffer.from(after.bitmap, 'hex').toString()
        );
        assert.equal((bitmap.component || bitmap[fixture.id]).version, '1.0.1', 'merge uses cached selected target');
        assert.match(
          Buffer.from(after.roots['command/component']['index.js'].bytes, 'hex').toString(),
          /first = 'two'/
        );
      }
      if (scenario.peerVersion) {
        const bitmap = createRequire(path.join(cli, 'package.json'))('comment-json').parse(
          Buffer.from(after.bitmap, 'hex').toString()
        );
        const peer = bitmap.peer || bitmap[fixture.peerId];
        assert.equal(peer?.version, scenario.peerVersion, `${scenario.name}: canonical peer selection`);
        const expectedPeer = scenario.peerVersion === '1.0.1' ? 'peer-two' : 'peer-one';
        assert.equal(
          Buffer.from(after.roots['command/peer']['index.js'].bytes, 'hex').toString(),
          `module.exports = "${expectedPeer}";\n`,
          `${scenario.name}: peer materialization`
        );
      }
      if (scenario.seedUnrelatedCache)
        assert.equal(
          after.dependenciesCache['unrelated/stale@1.0.0'],
          undefined,
          'snap clears unrelated dependency cache'
        );
      if (['main-added-source-graph', 'main-runtime-to-dev-graph'].includes(scenario.name)) {
        const created = versionObjects(after).filter(([hash]) => !before.objects[hash]);
        assert.equal(created.length, 1, 'changed graph creates exactly one merge snap');
        const version = created[0][1];
        const devOnly = scenario.name === 'main-runtime-to-dev-graph';
        assert.equal(version.dependencies.length, devOnly ? 0 : 1, 'resolved runtime lifecycle');
        assert.equal(version.devDependencies.length, devOnly ? 1 : 0, 'resolved development lifecycle');
        const dev = version.extensions.find((extension) => extension.name === 'teambit.component/dev-files');
        assert.deepEqual(
          dev.data.devFiles['teambit.defender/tester'],
          devOnly ? ['fresh.test.ts'] : ['fresh.spec.js', 'fresh.test.ts']
        );
        for (const filename of ['support.js', 'support.ts', 'load-support.js', 'fresh.test.ts'])
          assert.ok(
            version.files.some((file) => file.relativePath === filename),
            `retained added file ${filename}`
          );
        for (const [hash] of versionObjects(before))
          assert.equal(after.objects[hash], before.objects[hash], 'changed graph preserves historical Version bytes');
      }
      if (scenario.harmony1) {
        for (const [hash] of versionObjects(before))
          assert.equal(after.objects[hash], before.objects[hash], 'historical Version bytes remain immutable');
        const created = versionObjects(after).filter(([hash]) => !before.objects[hash]);
        assert.equal(created.length, 1, 'canonical autosnap creates one Version');
        assert.equal(created[0][1].schema, '2.0.0', 'new snap upgrades mixed ancestry to schema2');
      }
      runs.push(row);
      if (options.report)
        await fs.writeFile(
          options.report + '.partial',
          JSON.stringify({ qualified: false, temporary, binding: bound, runs }, null, 2)
        );
      options.progress?.({ scenario: scenario.name, mode, output });
    }
  }
  const endBinding = await binding(cli, helper, options.allowUnmarkedCli);
  const stableBinding = (value) => (options.diagnostic ? { ...value, nativeSourceDigest: undefined } : value);
  assert.deepEqual(
    stableBinding(endBinding),
    stableBinding(bound),
    'source, CLI, helper, addon and harness must remain frozen during qualification'
  );
  const report = {
    qualified: !options.canonicalOnly && !options.diagnostic && !options.wrapperAudit && Boolean(bound.cliMarker),
    dimensions,
    temporary,
    binding: bound,
    endBinding,
    ...(options.wrapperAudit || options.wrapper
      ? { wrapperAudit: Boolean(options.wrapperAudit), wrapperEligibility, wrapperAuditSha256 }
      : {}),
    ...(options.measure
      ? {
          proofSha256,
          measurement: true,
          qualificationOnlyScenarios: [
            'checkout-divergent-head',
            'main-last-target-callback-fallback',
            'main-duplicate-package-fallback',
          ],
        }
      : {}),
    runs,
  };
  if (options.report) await fs.writeFile(options.report, JSON.stringify(report, null, 2));
  return report;
}

module.exports = { runQualification, removeObjects, scopeObjects, comparable, durableTree };
