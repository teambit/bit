const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { setTimeout: delay } = require('node:timers/promises');
const { spawnSync } = require('node:child_process');
const installed = createRequire(
  path.resolve(process.env.BIT_LEGACY_ROOT || path.join(__dirname, '../..'), 'package.json')
);
const ts = installed('typescript');
const source = path.resolve(
  process.env.BIT_SCANNER_SESSION_MODULE ||
    path.join(__dirname, '../../scopes/dependencies/dependencies/files-dependency-builder/rust-scanner/session.ts')
);
// Compile only this standalone transport module. No full repository build or
// Babel project configuration is needed, and no generated file is committed.
const Module = require('node:module');
require.extensions['.ts'] = (target, filename) => {
  assert.equal(path.dirname(filename), path.dirname(source), 'compile only standalone scanner transport modules');
  target._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      fileName: filename,
    }).outputText,
    filename
  );
};
const compiled = new Module(source, module);
compiled.filename = source;
compiled.paths = Module._nodeModulePaths(path.dirname(source));
compiled._compile(
  ts.transpileModule(fs.readFileSync(source, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: source,
  }).outputText,
  source
);
const { RustDependencyScannerSession } = compiled.exports;

function fixture(context, mode = 'ok', options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-rust-session-test-'));
  const logPath = path.join(directory, 'requests.jsonl');
  const executable = path.join(directory, 'scanner');
  const implementation = path.join(__dirname, 'session-fixtures/fake-scanner.cjs');
  fs.writeFileSync(
    executable,
    `#!/usr/bin/env node\nrequire(${JSON.stringify(implementation)}).run(${JSON.stringify(mode)}, ${JSON.stringify(logPath)});\n`,
    { mode: 0o755 }
  );
  const session = new RustDependencyScannerSession({ executable, cwd: directory, timeoutMs: 3000, ...options });
  context.after(() => {
    session.dispose();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const logs = () =>
    fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
  return { directory, session, logs };
}

async function requested(logs) {
  for (let i = 0; i < 100; i++) {
    if (logs().some(({ event }) => event === 'request')) return;
    await delay(10);
  }
  assert.fail('fake scanner did not receive a request');
}

function unavailable(session, names) {
  assert.ok(session.unavailableReason, 'terminal failure must expose a reason');
  for (const name of names)
    assert.equal(session.get(name), undefined, 'terminal failure must clear cached and pending results');
}

test('batches respect file bounds, preserve logical paths, and cache duplicate requests', async (context) => {
  const { session, logs, directory } = fixture(context, 'ok', { maxBatchFiles: 2 });
  const names = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'];
  await session.prefetch([...names, './a.ts', path.join(directory, 'a.ts')]);
  const requests = logs()
    .filter(({ event }) => event === 'request')
    .map(({ request }) => request);
  assert.deepEqual(
    requests.map(({ files }) => files.length),
    [2, 2, 1]
  );
  assert.equal(new Set(requests.map(({ id }) => id)).size, 3);
  assert.ok(
    requests.every(
      ({ version, options, files }) =>
        version === 1 &&
        Object.keys(options || {}).length === 0 &&
        files.every(({ path: file }) => path.isAbsolute(file))
    )
  );
  for (const name of names) assert.equal(session.get(name).path, name);
  await session.prefetch(names);
  assert.equal(logs().filter(({ event }) => event === 'request').length, 3);
  assert.equal(session.unavailableReason, undefined);
});

test('overlapping concurrent prefetch calls share inflight work', async (context) => {
  const { session, logs } = fixture(context, 'delayed', { maxBatchFiles: 1 });
  await Promise.all([
    session.prefetch(['a.ts', 'b.ts']),
    session.prefetch(['./a.ts', 'c.ts']),
    session.prefetch(['b.ts']),
  ]);
  const files = logs()
    .filter(({ event }) => event === 'request')
    .flatMap(({ request }) => request.files.map(({ path: file }) => path.basename(file)));
  assert.deepEqual(files.slice().sort(), ['a.ts', 'b.ts', 'c.ts']);
  for (const name of ['a.ts', 'b.ts', 'c.ts']) assert.equal(session.get(name).status, 'ok');
});

test('cache results cannot be mutated and separate sessions isolate identical relative paths', async (context) => {
  const first = fixture(context);
  const second = fixture(context);
  await Promise.all([first.session.prefetch(['same.ts']), second.session.prefetch(['same.ts'])]);
  const result = first.session.get('same.ts');
  result.dependencies[path.join(first.directory, 'same.ts')].importSpecifiers[0].name = 'mutated';
  result.diagnostics.push('mutated');
  assert.equal(
    first.session.get('same.ts').dependencies[path.join(first.directory, 'same.ts')].importSpecifiers[0].name,
    'value'
  );
  assert.deepEqual(first.session.get('same.ts').diagnostics, []);
  assert.deepEqual(Object.keys(second.session.get('same.ts').dependencies), [path.join(second.directory, 'same.ts')]);
});

test('unsupported, parse_error, and read_error outcomes retain original status and diagnostics', async (context) => {
  const { session } = fixture(context);
  await session.prefetch(['ok.ts', 'unsupported.ts', 'parse-error.ts', 'read-error.ts']);
  for (const [name, status] of [
    ['unsupported.ts', 'unsupported'],
    ['parse-error.ts', 'parse_error'],
    ['read-error.ts', 'read_error'],
  ]) {
    assert.deepEqual(session.get(name), {
      path: name,
      status,
      dependencies: {},
      diagnostics: ['original scanner diagnostic'],
    });
  }
  assert.equal(session.get('ok.ts').status, 'ok');
  assert.equal(session.unavailableReason, undefined);
});

for (const mode of [
  'wrong-id',
  'wrong-path',
  'wrong-count',
  'bad-status',
  'bad-metadata',
  'wrong-version',
  'partial-error',
  'malformed',
  'crash',
  'duplicate-response',
  'invalid-utf8',
]) {
  test(`${mode} invalidates session without caching partial outcomes`, async (context) => {
    const { session, logs } = fixture(context, mode);
    await session.prefetch(['first.ts', 'second.ts']);
    unavailable(session, ['first.ts', 'second.ts']);
    const count = logs().filter(({ event }) => event === 'request').length;
    await session.prefetch(['third.ts']);
    assert.equal(
      logs().filter(({ event }) => event === 'request').length,
      count,
      'failed session must not restart child'
    );
  });
}

test('a later timeout clears previously cached success', async (context) => {
  const { session } = fixture(context, 'fail-after-first', { timeoutMs: 150 });
  await session.prefetch(['cached.ts']);
  assert.equal(session.get('cached.ts').status, 'ok');
  await session.prefetch(['timeout.ts']);
  unavailable(session, ['cached.ts', 'timeout.ts']);
});

test('abort cancels inflight scan and clears session', async (context) => {
  const controller = new AbortController();
  const { session, logs } = fixture(context, 'hang', { signal: controller.signal });
  const pending = session.prefetch(['pending.ts']);
  await requested(logs);
  controller.abort();
  await pending;
  unavailable(session, ['pending.ts']);
});

test('dispose cancels inflight and queued batches and is idempotent', async (context) => {
  const { session, logs } = fixture(context, 'hang', { maxBatchFiles: 1 });
  const pending = session.prefetch(['pending.ts', 'queued.ts']);
  await requested(logs);
  session.dispose();
  session.dispose();
  await pending;
  unavailable(session, ['pending.ts', 'queued.ts']);
  assert.equal(logs().filter(({ event }) => event === 'request').length, 1);
});

test('oversized stdout invalidates session before unbounded line accumulation', async (context) => {
  const { session } = fixture(context, 'stdout-overflow', { maxResponseBytes: 512 });
  await session.prefetch(['output.ts']);
  unavailable(session, ['output.ts']);
});

test('noisy stderr drains without deadlock or oversized failure diagnostics', async (context) => {
  const { session } = fixture(context, 'stderr-overflow');
  await session.prefetch(['stderr.ts']);
  assert.equal(session.unavailableReason, undefined);
  assert.equal(session.get('stderr.ts').status, 'ok');
});

test('split NDJSON chunks reconstruct a complete response', async (context) => {
  const { session } = fixture(context, 'split-output');
  await session.prefetch(['chunked.ts']);
  assert.equal(session.get('chunked.ts').status, 'ok');
});

test('request byte bounds refuse an unrepresentable file instead of hanging', async (context) => {
  const { session } = fixture(context, 'ok', { maxRequestBytes: 64 });
  await session.prefetch(['a'.repeat(128) + '.ts']);
  unavailable(session, ['a'.repeat(128) + '.ts']);
});

test('cache overflow invalidates the whole session rather than serving a partial batch', async (context) => {
  const { session } = fixture(context, 'ok', { maxCacheBytes: 64 });
  await session.prefetch(['first.ts', 'second.ts']);
  unavailable(session, ['first.ts', 'second.ts']);
});

test('byte-based batch splitting keeps each wire request within its configured bound', async (context) => {
  const { session, logs } = fixture(context, 'ok', { maxRequestBytes: 400 });
  const names = Array.from({ length: 5 }, (_, i) => `${i}-${'a'.repeat(64)}.ts`);
  await session.prefetch(names);
  assert.equal(session.unavailableReason, undefined);
  const requests = logs()
    .filter(({ event }) => event === 'request')
    .map(({ request }) => request);
  assert.ok(requests.length > 1);
  assert.ok(requests.every((request) => Buffer.byteLength(JSON.stringify(request)) <= 400));
  assert.equal(requests.flatMap(({ files }) => files).length, names.length);
  for (const name of names) assert.equal(session.get(name).status, 'ok');
});

test('pre-aborted sessions do not spawn a helper', async (context) => {
  const controller = new AbortController();
  controller.abort();
  const { session, logs } = fixture(context, 'ok', { signal: controller.signal });
  await session.prefetch(['aborted.ts']);
  unavailable(session, ['aborted.ts']);
  assert.deepEqual(logs(), []);
});

test('missing executable becomes unavailable without rejecting caller work', async (context) => {
  const { session } = fixture(context, 'ok', {
    executable: path.join(os.tmpdir(), 'bit-missing-scanner-' + process.pid),
  });
  await session.prefetch(['missing.ts']);
  unavailable(session, ['missing.ts']);
});

test('dispose eventually kills a helper that ignores SIGTERM', async (context) => {
  const { session, logs } = fixture(context, 'ignore-term');
  const pending = session.prefetch(['stubborn.ts']);
  await requested(logs);
  const pid = logs().find(({ event }) => event === 'start').pid;
  context.after(() => {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
  });
  session.dispose();
  await pending;
  for (let i = 0; i < 250; i++) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') return;
      throw error;
    }
    await delay(10);
  }
  assert.fail('disposed helper survived SIGTERM/SIGKILL cleanup');
});

test('inline cache keys include content and do not alias path-prefetch snapshots', async (context) => {
  const { session, logs, directory } = fixture(context);
  await session.prefetch(['same.ts']);
  const first = await session.scanSource('same.ts', 'first contents');
  const second = await session.scanSource('./same.ts', 'second contents');
  const repeated = await session.scanSource(path.join(directory, 'same.ts'), 'first contents');
  assert.deepEqual(Object.keys(first.dependencies), ['inline:first contents']);
  assert.deepEqual(Object.keys(second.dependencies), ['inline:second contents']);
  assert.deepEqual(repeated.dependencies, first.dependencies);
  assert.equal(repeated.path, path.join(directory, 'same.ts'));
  assert.deepEqual(Object.keys(session.get('same.ts').dependencies), [path.join(directory, 'same.ts')]);
  assert.equal(logs().filter(({ event }) => event === 'request').length, 3);
});

test('concurrent inline requests deduplicate matching content and isolate different files', async (context) => {
  const { session, logs } = fixture(context, 'delayed');
  const results = await Promise.all([
    session.scanSource('a.ts', 'content'),
    session.scanSource('./a.ts', 'content'),
    session.scanSource('b.ts', 'content'),
  ]);
  assert.equal(logs().filter(({ event }) => event === 'request').length, 2);
  assert.deepEqual(
    results.map(({ path: file }) => file),
    ['a.ts', './a.ts', 'b.ts']
  );
});

test('oversized inline sources fall back without spawning or contaminating later cache', async (context) => {
  const { session, logs } = fixture(context);
  assert.equal(await session.scanSource('large.ts', 'x'.repeat(1024 * 1024 + 1)), undefined);
  assert.deepEqual(logs(), []);
  assert.equal(session.unavailableReason, undefined);
  const good = await session.scanSource('large.ts', 'small');
  assert.deepEqual(Object.keys(good.dependencies), ['inline:small']);
  assert.equal(logs().filter(({ event }) => event === 'request').length, 1);
});

test('inline JSON request overflow preserves the session for smaller requests', async (context) => {
  const { session, logs } = fixture(context, 'ok', { maxRequestBytes: 400 });
  assert.equal(await session.scanSource('source.ts', 'x'.repeat(500)), undefined);
  assert.equal(session.unavailableReason, undefined);
  await delay(30);
  assert.deepEqual(logs(), []);
  const good = await session.scanSource('source.ts', 'small');
  assert.equal(good.status, 'ok');
});

test('pending request overload falls back while accepted work and later scans remain usable', async (context) => {
  const { session, logs } = fixture(context, 'delayed', { maxPendingRequests: 1 });
  const first = session.scanSource('accepted.ts', 'accepted');
  assert.equal(await session.scanSource('dropped.ts', 'dropped'), undefined);
  await session.prefetch(['dropped-prefetch.ts']);
  assert.equal((await first).status, 'ok');
  assert.equal(session.unavailableReason, undefined);
  assert.equal(session.get('dropped-prefetch.ts'), undefined);
  assert.equal((await session.scanSource('later.ts', 'later')).status, 'ok');
  assert.equal(logs().filter(({ event }) => event === 'request').length, 2);
});

test('queued byte overload releases reservations and retains accepted outcomes', async (context) => {
  const { session, logs } = fixture(context, 'delayed', { maxQueuedBytes: 1024 });
  const first = session.scanSource('first.ts', 'a'.repeat(700));
  assert.equal(await session.scanSource('second.ts', 'b'.repeat(700)), undefined);
  assert.equal((await first).status, 'ok');
  const after = await session.scanSource('second.ts', 'small');
  assert.equal(after.status, 'ok');
  assert.equal(session.unavailableReason, undefined);
  assert.equal(logs().filter(({ event }) => event === 'request').length, 2);
});

test('inline cache copies preserve parse and fallback semantics after caller mutation', async (context) => {
  const { session, logs } = fixture(context);
  const first = await session.scanSource('ok.ts', 'contents');
  first.dependencies['inline:contents'].importSpecifiers[0].name = 'mutated';
  const again = await session.scanSource('ok.ts', 'contents');
  assert.equal(again.dependencies['inline:contents'].importSpecifiers[0].name, 'value');
  for (const [name, status] of [
    ['unsupported.ts', 'unsupported'],
    ['parse-error.ts', 'parse_error'],
    ['read-error.ts', 'read_error'],
  ]) {
    const outcome = await session.scanSource(name, 'contents');
    assert.deepEqual(outcome, { path: name, status, dependencies: {}, diagnostics: ['original scanner diagnostic'] });
  }
  assert.equal(logs().filter(({ event }) => event === 'request').length, 4);
  assert.equal(session.unavailableReason, undefined);
});

test('an undisposed idle session does not keep the parent process alive', (context) => {
  const { directory } = fixture(context);
  const executable = path.join(directory, 'scanner');
  // A separate Node process loads the session exactly as this harness does, then returns without dispose.
  const script = `
    const Module = require('node:module');
    const fs = require('node:fs');
    const ts = Module.createRequire(${JSON.stringify(installed.resolve('typescript'))})('typescript');
    require.extensions['.ts'] = (target, filename) => target._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText, filename);
    const { RustDependencyScannerSession } = require(${JSON.stringify(source)});
    const session = new RustDependencyScannerSession({ executable: ${JSON.stringify(executable)}, cwd: ${JSON.stringify(directory)} });
    session.prefetch(['a.ts']).then(() => console.log(session.get('a.ts').status));
  `;
  const run = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(run.error, undefined, 'parent process must exit while the helper is idle');
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), 'ok');
});
