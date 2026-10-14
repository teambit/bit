// Paired, complete public-command timings on fresh disposable workspaces.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const {
  run,
  scenarios,
  cloneInboundScenario,
  spawn,
  comparable,
  captureStorage,
} = require('./cold-inbound-qualification.cjs');
const { snapshotScope } = require('./transfer-fixture.cjs');

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

async function fingerprint(file) {
  return { file, sha256: hash(await fs.readFile(file)) };
}

async function httpRemotes(cli, paths, globals) {
  const server = cp.fork(path.join(__dirname, 'transfer-http-fixture.cjs'), [cli, JSON.stringify(Object.keys(paths))], {
    env: { ...process.env, BIT_GLOBALS_DIR: globals },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  const message = (predicate) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        server.off('message', receive);
        reject(new Error('HTTP benchmark fixture timeout'));
      }, 15000);
      function receive(value) {
        if (predicate(value)) {
          clearTimeout(timer);
          server.off('message', receive);
          resolve(value);
        }
      }
      server.on('message', receive);
    });
  try {
    const urls = (await message((value) => value.remotes)).remotes;
    const ready = message((value) => value.configured);
    server.send({
      configure: Object.fromEntries(Object.entries(paths).map(([name, target]) => [name, { path: target }])),
    });
    await ready;
    return { remotes: urls, close: () => server.disconnect() };
  } catch (error) {
    server.disconnect();
    throw error;
  }
}

async function benchmark(cli, helper, reportFile, options = {}) {
  assert.ok(!helper.includes('/debug/'), 'measure a release helper');
  const extraFiles = options.extraFiles ?? 0;
  assert.ok(Number.isInteger(extraFiles) && extraFiles >= 0 && extraFiles <= 2048);
  const transport = options.transport ?? 'file';
  assert.ok(['file', 'http'].includes(transport));
  const qualificationFile = options.qualificationReport;
  assert.ok(qualificationFile, 'complete release qualification report required for retained timings');
  const qualification = JSON.parse(await fs.readFile(qualificationFile, 'utf8'));
  assert.equal(qualification.qualified, true, 'release qualification must pass');
  assert.equal(path.resolve(qualification.cli), path.resolve(cli));
  assert.equal(path.resolve(qualification.helper), path.resolve(helper));
  assert.equal(qualification.extraFiles || 0, extraFiles);
  assert.ok(
    Array.isArray(qualification.fingerprints) && qualification.fingerprints.length >= 10,
    'qualified artifact fingerprints required'
  );
  assert.deepEqual(
    await Promise.all(qualification.fingerprints.map(({ file }) => fingerprint(file))),
    qualification.fingerprints,
    'qualified artifacts differ from timed inputs'
  );
  const required = new Set(
    scenarios.flatMap(({ name, fileOnly }) =>
      ['file', 'http'].flatMap((transport) =>
        fileOnly && transport !== 'file'
          ? []
          : ['node', 'native', 'missing-helper', 'crashed-helper'].map((mode) => `${transport}/${mode}/${name}`)
      )
    )
  );
  for (const row of qualification.runs) required.delete(`${row.transport}/${row.mode}/${row.scenario}`);
  assert.equal(required.size, 0, `qualification rows missing: ${[...required].join(', ')}`);
  const root = await fs.mkdtemp(path.join(options.scratch || os.tmpdir(), 'bit-cold-inbound-timing-'));
  const setup = await run(cli, helper, path.join(root, 'setup.json'), {
    modes: ['node'],
    transports: ['file'],
    scratch: root,
    extraFiles,
  });
  assert.equal(setup.qualified, true);
  const producer = path.join(setup.temporary, 'producer');
  const remotePathsByName = Object.fromEntries(
    ['qualification.alpha', 'qualification.beta'].map((name) => [name, path.join(setup.temporary, 'remotes', name)])
  );
  const server =
    transport === 'http' ? await httpRemotes(cli, remotePathsByName, path.join(setup.temporary, 'globals')) : undefined;
  try {
    const remotes =
      server?.remotes ||
      Object.fromEntries(Object.entries(remotePathsByName).map(([name, target]) => [name, `file://${target}`]));
    const addon = path.join(path.dirname(helper), 'bit-workspace.node');
    const fingerprints = await Promise.all([
      fingerprint(path.join(cli, 'bin/bit.js')),
      fingerprint(path.join(cli, 'package.json')),
      fingerprint(helper),
      fingerprint(addon),
      fingerprint(path.join(cli, 'node_modules/@teambit/bit/dist/run-bit.js')),
      fingerprint(path.join(cli, 'node_modules/@teambit/bit/dist/rust-workspace-inbound.js')),
      fingerprint(path.join(cli, 'node_modules/@teambit/bit/dist/rust-workspace-inbound-options.js')),
      fingerprint(path.join(cli, 'node_modules/@teambit/bit/dist/rust-workspace-inbound-report.js')),
      fingerprint(path.join(cli, 'node_modules/@teambit/importer/dist/fetch-cmd.js')),
      fingerprint(path.join(cli, 'node_modules/@teambit/importer/dist/import.cmd.js')),
      fingerprint(__filename),
      fingerprint(require.resolve('./cold-inbound-qualification.cjs')),
      fingerprint(require.resolve('./transfer-fixture.cjs')),
    ]);
    const remotePaths = ['qualification.alpha', 'qualification.beta'].map((name) =>
      path.join(setup.temporary, 'remotes', name)
    );
    const remoteBefore = await Promise.all(remotePaths.map((remote) => snapshotScope(remote)));
    const report = {
      qualified: false,
      cli,
      helper,
      root,
      transport,
      extraFiles,
      qualificationFile,
      qualificationSha256: hash(await fs.readFile(qualificationFile)),
      setup: path.join(root, 'setup.json'),
      fingerprints,
      rows: [],
      medians: [],
    };
    const rounds = options.rounds ?? 3;
    assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 20);
    await fs.mkdir(path.dirname(reportFile), { recursive: true });
    const command = (directory, args) => spawn(cli, directory, args, envFor('node', args), undefined);
    function envFor(mode, args) {
      const seed = hash(args.join('\0'));
      const env = {
        ...process.env,
        BIT_GLOBALS_DIR: path.join(setup.temporary, 'globals'),
        CI: '1',
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
    }
    for (const scenario of scenarios) {
      if (scenario.fileOnly && transport !== 'file') continue;
      const durations = { node: [], native: [] };
      for (let round = -1; round < rounds; round += 1) {
        const order = round % 2 === 0 ? ['node', 'native'] : ['native', 'node'];
        const states = {};
        for (const mode of order) {
          const directory = path.join(root, `${scenario.name}-${round}-${mode}`);
          const before = await cloneInboundScenario(producer, directory, scenario, remotes, command);
          const beforeStorage = await captureStorage(cli, directory, before);
          const result = await spawn(cli, directory, scenario.args, envFor(mode, scenario.args), undefined);
          assert.equal(result.signal, null, `${scenario.name}/${mode}: signal`);
          assert.equal(result.code, 0, `${scenario.name}/${mode}: ${result.stderr || result.stdout}`);
          const after = await snapshotScope(directory, true);
          const afterStorage = await captureStorage(cli, directory, after);
          const state = comparable({
            before,
            beforeStorage,
            after,
            afterStorage,
            stdout: result.stdout,
            code: result.code,
          });
          const artifact = path.join(directory, 'timing-state.json');
          await fs.writeFile(artifact, JSON.stringify({ state, compressedStorage: { beforeStorage, afterStorage } }));
          states[mode] = state;
          if (round >= 0) durations[mode].push(result.wallMs);
          report.rows.push({
            transport,
            scenario: scenario.name,
            round,
            mode,
            retained: round >= 0,
            wallMs: result.wallMs,
            artifact,
            sha256: hash(await fs.readFile(artifact)),
          });
        }
        assert.deepEqual(states.native, states.node, `${scenario.name}/${round}: complete command and state parity`);
        await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
      }
      const node = median(durations.node);
      const native = median(durations.native);
      report.medians.push({
        scenario: scenario.name,
        nodeMs: node,
        nativeMs: native,
        ratio: native / node,
        speedup: node / native,
      });
    }
    assert.deepEqual(
      await Promise.all(remotePaths.map((remote) => snapshotScope(remote))),
      remoteBefore,
      'timed source scopes changed'
    );
    assert.deepEqual(
      await Promise.all(fingerprints.map(({ file }) => fingerprint(file))),
      fingerprints,
      'timed binaries changed'
    );
    assert.deepEqual(
      await Promise.all(qualification.fingerprints.map(({ file }) => fingerprint(file))),
      qualification.fingerprints,
      'qualified artifacts changed during timing'
    );
    assert.equal(
      hash(await fs.readFile(qualificationFile)),
      report.qualificationSha256,
      'qualification report changed'
    );
    report.qualified = true;
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    return report;
  } finally {
    server?.close();
  }
}

if (require.main === module) {
  const [cli, helper, report] = process.argv.slice(2);
  benchmark(cli, helper, report || path.join(os.tmpdir(), 'bit-cold-inbound-benchmark.json'), {
    extraFiles: Number(process.env.BIT_INBOUND_BENCH_EXTRA_FILES || 0),
    transport: process.env.BIT_INBOUND_BENCH_TRANSPORT || 'file',
    qualificationReport: process.env.BIT_INBOUND_QUALIFICATION_REPORT,
  })
    .then((value) =>
      console.log(
        JSON.stringify({
          qualified: value.qualified,
          medians: value.medians,
          report: report || path.join(os.tmpdir(), 'bit-cold-inbound-benchmark.json'),
        })
      )
    )
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = { benchmark };
