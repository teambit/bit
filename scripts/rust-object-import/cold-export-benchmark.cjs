// Gated paired complete-command timings; no row is retained before parity.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { benchmarkGlobals } = require('../rust-dependency-analysis/command-workspace.cjs');
const { sourceIdentity } = require('./artifacts/contract.cjs');
const { createTransferRemotes } = require('./transfer-fixture.cjs');
const {
  scenarios,
  stageExportProducer,
  cloneExportScenario,
  snapshot,
  snapshotRemote,
  verifyPrivateMarker,
} = require('./cold-export-qualification.cjs');
const { spawn, comparable } = require('./cold-inbound-qualification.cjs');

const sha = (value) => createHash('sha256').update(value).digest('hex');
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const fingerprint = async (file) => ({ file, sha256: sha(await fs.readFile(file)) });
const timedScenarios = scenarios.filter((scenario) => scenario.native && !scenario.fails);
const fullQualificationRows = scenarios.reduce(
  (count, scenario) => count + (scenario.httpOnly || scenario.fileOnly ? 4 : 8),
  0
);

function ipc(server, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.off('message', receive);
      reject(new Error('HTTP export benchmark fixture timeout'));
    }, 15000);
    function receive(message) {
      if (!predicate(message)) return;
      clearTimeout(timer);
      server.off('message', receive);
      resolve(message);
    }
    server.on('message', receive);
  });
}

async function benchmark(cli, helper, reportFile, options = {}) {
  cli = path.resolve(cli);
  helper = path.resolve(helper);
  assert.ok(!helper.includes('/debug/'), 'release helper required');
  const addon = path.resolve(options.addon || path.join(path.dirname(helper), 'bit-workspace.node'));
  const extraFiles = options.extraFiles ?? 0;
  assert.ok([0, 260].includes(extraFiles), 'export benchmark profiles are 0 or 260 extra files');
  const transport = options.transport || 'file';
  assert.ok(['file', 'http'].includes(transport));
  const rounds = options.rounds ?? 3;
  assert.ok(Number.isInteger(rounds) && rounds >= 3 && rounds <= 20, 'three retained rounds required');
  const qualificationFile = path.resolve(options.qualificationReport || '');
  assert.ok(options.qualificationReport, 'complete export qualification report required');
  const qualificationBytes = await fs.readFile(qualificationFile);
  const qualification = JSON.parse(qualificationBytes);
  assert.equal(qualification.qualified, true);
  assert.equal(path.resolve(qualification.cli), cli);
  assert.equal(path.resolve(qualification.helper), helper);
  assert.equal(path.resolve(qualification.addon), addon);
  assert.equal(qualification.extraFiles, extraFiles);
  assert.ok(
    qualification.marker && qualification.marker.sourceCount > 0 && qualification.marker.compiledCount > 0,
    'private CLI source/compiled marker verification required'
  );
  const required = new Set(
    scenarios.flatMap((scenario) =>
      ['file', 'http'].flatMap((kind) =>
        (scenario.httpOnly && kind === 'file') || (scenario.fileOnly && kind === 'http')
          ? []
          : ['node', 'native', 'missing-helper', 'crashed-helper'].map((mode) => `${kind}/${mode}/${scenario.name}`)
      )
    )
  );
  for (const row of qualification.runs) required.delete(`${row.transport}/${row.mode}/${row.scenario}`);
  assert.equal(required.size, 0, `qualification rows missing: ${[...required].join(', ')}`);
  assert.equal(qualification.runs.length, fullQualificationRows, 'exact full export qualification required');
  const repository = path.resolve(__dirname, '../..');
  assert.equal(
    sourceIdentity(repository),
    qualification.nativeSourceSha256,
    'native sources differ from qualification'
  );
  assert.deepEqual(await verifyPrivateMarker(cli, repository), qualification.marker, 'private CLI marker changed');
  assert.ok(Array.isArray(qualification.fingerprints) && qualification.fingerprints.length >= 20);
  assert.deepEqual(
    await Promise.all(qualification.fingerprints.map(({ file }) => fingerprint(file))),
    qualification.fingerprints,
    'qualified binaries or sources differ from timing inputs'
  );
  for (const row of qualification.runs)
    assert.equal(
      sha(await fs.readFile(row.artifact)),
      row.sha256,
      `${row.transport}/${row.mode}/${row.scenario} stage changed`
    );

  const root = await fs.mkdtemp(path.join(options.scratch || os.tmpdir(), 'bit-cold-export-timing-'));
  const globals = benchmarkGlobals(root);
  const seedRemotes = await createTransferRemotes(cli, path.join(root, 'seed-remotes'));
  const envFor = (mode, args) => {
    const seed = sha(args.join('\0'));
    const env = {
      ...process.env,
      CI: '1',
      BIT_GLOBALS_DIR: globals,
      BIT_RUST_CLIENT_VCS: mode === 'node' ? 'off' : 'on',
      BIT_RUST_OBJECT_IMPORT: helper,
      BIT_TEST_WORKSPACE_ADDON: addon,
      BIT_SNAPSHOT_QUALIFICATION_SEED: seed,
      BIT_SNAPSHOT_QUALIFICATION_CLOCK: '1800000000000',
      BIT_CHECKOUT_TRANSITION_QUALIFICATION_SEED: seed,
      BIT_CHECKOUT_TRANSITION_QUALIFICATION_CLOCK: '1800000000000',
      BIT_CHECKOUT_TRANSITION_DISPLAY_DURATION: 'deterministic',
    };
    delete env.BIT_IMPORT_TRACE;
    delete env.NODE_OPTIONS;
    return env;
  };
  const command = (directory, args, mode = 'node') => spawn(cli, directory, args, envFor(mode, args));
  const producer = path.join(root, 'producer');
  await stageExportProducer(
    cli,
    producer,
    Object.fromEntries(Object.entries(seedRemotes).map(([name, target]) => [name, `file://${target}`])),
    command,
    extraFiles
  );
  const sourceBefore = await snapshot(cli, producer, true);
  const seedRemoteBefore = Object.fromEntries(
    await Promise.all(Object.entries(seedRemotes).map(async ([name, target]) => [name, await snapshotRemote(target)]))
  );
  let server;
  let httpUrls;
  if (transport === 'http') {
    server = cp.fork(
      path.join(__dirname, 'transfer-http-fixture.cjs'),
      [cli, JSON.stringify(Object.keys(seedRemotes))],
      {
        env: { ...process.env, BIT_GLOBALS_DIR: globals },
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      }
    );
    httpUrls = (await ipc(server, (value) => value.remotes)).remotes;
  }
  const bindings = await Promise.all([
    fingerprint(__filename),
    fingerprint(require.resolve('./cold-export-qualification.cjs')),
    fingerprint(require.resolve('./transfer-fixture.cjs')),
    fingerprint(require.resolve('./transfer-http-fixture.cjs')),
  ]);
  const report = {
    qualified: false,
    cli,
    helper,
    addon,
    root,
    transport,
    extraFiles,
    rounds,
    qualificationFile,
    qualificationSha256: sha(qualificationBytes),
    fingerprints: bindings,
    sourceBeforeSha256: sha(Buffer.from(JSON.stringify(sourceBefore))),
    rows: [],
    medians: [],
  };
  const available = timedScenarios.filter((scenario) =>
    !(scenario.httpOnly && transport !== 'http') && !(scenario.fileOnly && transport !== 'file')
  );
  const selected = options.scenarios
    ? available.filter((scenario) => options.scenarios.includes(scenario.name))
    : available;
  assert.equal(selected.length, options.scenarios?.length || available.length);
  try {
    await fs.mkdir(path.dirname(reportFile), { recursive: true });
    for (const scenario of selected) {
      const durations = { node: [], native: [] };
      for (let round = -1; round < rounds; round++) {
        const order = round % 2 === 0 ? ['node', 'native'] : ['native', 'node'];
        const states = {};
        const pairedRows = [];
        for (const mode of order) {
          const remoteRoot = path.join(root, 'active-remotes');
          await fs.rm(remoteRoot, { recursive: true, force: true });
          const remotes = await createTransferRemotes(cli, remoteRoot);
          const urls =
            transport === 'http'
              ? httpUrls
              : Object.fromEntries(Object.entries(remotes).map(([name, target]) => [name, `file://${target}`]));
          if (server) {
            const ready = ipc(server, (value) => value.configured);
            server.send({
              configure: Object.fromEntries(Object.entries(remotes).map(([name, target]) => [name, {
                path: target,
                failPersist: scenario.setup === 'resumable' && name === 'qualification.alpha',
              }])),
            });
            await ready;
          }
          const directory = path.join(root, `${scenario.name}-${round}-${mode}`);
          await cloneExportScenario(producer, directory, scenario, urls, command);
          let args = scenario.args;
          if (scenario.setup === 'resumable') {
            const initial = await command(directory, ['export', '--origin-directly'], 'node');
            assert.notEqual(initial.code, 0, 'resume benchmark setup must leave pending objects');
            const pending = await snapshotRemote(remotes['qualification.alpha']);
            const exportIds = new Set(Object.keys(pending.pending).map((name) => name.split('/')[0]));
            assert.equal(exportIds.size, 1, 'resume benchmark setup must retain one export ID');
            args = [...scenario.args, ...exportIds];
            const ready = ipc(server, (value) => value.configured);
            server.send({
              configure: Object.fromEntries(Object.entries(remotes).map(([name, target]) => [name, { path: target }])),
            });
            await ready;
          }
          const before = {
            local: await snapshot(cli, directory, true),
            remote: await snapshotRemote(remotes['qualification.alpha']),
            ...(scenario.multiScope ? { secondRemote: await snapshotRemote(remotes['qualification.beta']) } : {}),
          };
          const result = await command(directory, args, mode);
          assert.equal(result.signal, null, `${scenario.name}/${round}/${mode}: signal`);
          assert.equal(result.code, 0, `${scenario.name}/${round}/${mode}: ${result.stderr || result.stdout}`);
          const after = {
            local: await snapshot(cli, directory, true),
            remote: await snapshotRemote(remotes['qualification.alpha']),
            ...(scenario.multiScope ? { secondRemote: await snapshotRemote(remotes['qualification.beta']) } : {}),
          };
          if (scenario.multiScope) {
            assert.ok(after.secondRemote.index, 'second remote index must persist');
            assert.ok(Object.keys(after.secondRemote.objects).length > 0, 'second remote must receive objects');
          } else {
            const untouched = await snapshotRemote(remotes['qualification.beta']);
            assert.equal(untouched.index, null, 'unselected remote index changed');
            assert.deepEqual(untouched.objects, {}, 'unselected remote objects changed');
          }
          const state = comparable({ before, after, code: result.code, stdout: result.stdout, stderr: result.stderr });
          const artifact = path.join(directory, 'timing-state.json');
          await fs.writeFile(artifact, JSON.stringify({ state, wallMs: result.wallMs }));
          states[mode] = state;
          pairedRows.push({
            scenario: scenario.name,
            transport,
            round,
            mode,
            retained: round >= 0,
            wallMs: result.wallMs,
            artifact,
            sha256: sha(await fs.readFile(artifact)),
          });
        }
        assert.deepEqual(states.native, states.node, `${scenario.name}/${round}: exact public result and state`);
        for (const row of pairedRows) {
          report.rows.push(row);
          if (round >= 0) durations[row.mode].push(row.wallMs);
        }
        await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
      }
      const node = median(durations.node),
        native = median(durations.native);
      report.medians.push({
        scenario: scenario.name,
        nodeMs: node,
        nativeMs: native,
        ratio: native / node,
        speedup: node / native,
      });
    }
    assert.deepEqual(await snapshot(cli, producer, true), sourceBefore, 'source producer changed');
    assert.deepEqual(
      Object.fromEntries(
        await Promise.all(
          Object.entries(seedRemotes).map(async ([name, target]) => [name, await snapshotRemote(target)])
        )
      ),
      seedRemoteBefore,
      'seed remotes changed'
    );
    assert.deepEqual(
      await Promise.all(bindings.map(({ file }) => fingerprint(file))),
      bindings,
      'benchmark sources changed'
    );
    assert.deepEqual(
      await Promise.all(qualification.fingerprints.map(({ file }) => fingerprint(file))),
      qualification.fingerprints,
      'qualified inputs changed'
    );
    assert.equal(sourceIdentity(repository), qualification.nativeSourceSha256, 'native sources changed during timing');
    assert.deepEqual(await verifyPrivateMarker(cli, repository), qualification.marker, 'private CLI marker changed');
    assert.equal(sha(await fs.readFile(qualificationFile)), report.qualificationSha256, 'qualification report changed');
    report.qualified = true;
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    return report;
  } finally {
    server?.disconnect();
  }
}

if (require.main === module) {
  const [cli, helper, report] = process.argv.slice(2);
  benchmark(cli, helper, report || path.join(os.tmpdir(), 'bit-cold-export-benchmark.json'), {
    addon: process.env.BIT_EXPORT_BENCH_ADDON,
    extraFiles: Number(process.env.BIT_EXPORT_BENCH_EXTRA_FILES || 0),
    transport: process.env.BIT_EXPORT_BENCH_TRANSPORT || 'file',
    qualificationReport: process.env.BIT_EXPORT_QUALIFICATION_REPORT,
  })
    .then((value) => console.log(JSON.stringify({ qualified: value.qualified, medians: value.medians, report })))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = { benchmark };
