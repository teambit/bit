const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const test = require('node:test');
test('diagnostic tracing forwards source APIs, real detective results and original parser errors', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-profile-trace-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = "import './x';";
  fs.writeFileSync(path.join(root, 'input.ts'), source);
  const trace = path.join(root, 'source.json');
  const script = `
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const filename = process.cwd() + '/input.ts';
    (async () => {
      assert.equal(fs.readFileSync(filename, 'utf8'), ${JSON.stringify(source)});
      assert.equal(await fs.promises.readFile(filename, 'utf8'), ${JSON.stringify(source)});
      assert.equal(await new Promise((resolve, reject) => fs.readFile(filename, 'utf8', (error, value) => error ? reject(error) : resolve(value))), ${JSON.stringify(source)});
      await assert.rejects(fs.promises.readFile(filename + '.missing'), { code: 'ENOENT' });
      const load = require('node:module').createRequire(process.env.BIT_LEGACY_ROOT + '/package.json');
      const detective = load('@teambit/typescript.deps-detectors.detective-typescript').default;
      for (let i = 0; i < 2; i++) assert.deepEqual(Object.keys(detective(${JSON.stringify(source)}, {})), ['./x']);
      assert.throws(() => detective('const value: = invalid;', {}), { name: 'TSError', message: 'Type expected.' });
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const env = { ...process.env, BIT_COMMAND_PROFILE_TRACE: trace };
  delete env.BIT_COMMAND_BENCH_TRACE_OWNER;
  const result = cp.spawnSync(
    process.execPath,
    ['--require', path.join(__dirname, 'command-profile-trace.cjs'), '-e', script],
    {
      cwd: root,
      encoding: 'utf8',
      env,
    }
  );
  // Use a fresh trace owner rather than an inherited command PID.
  if (result.status !== 0) assert.fail(result.stderr);
  const value = JSON.parse(fs.readFileSync(trace));
  assert.equal(value.uniqueSourceReads, 1);
  assert.equal(value.sourceReadCalls, 3);
  assert.deepEqual(value.sourceReadTypes, { sync: 1, callback: 1, promise: 1 });
  assert.equal(value.detectorCalls, 3);
  assert.equal(value.uniqueDetectorInputs, 2);
  assert.equal(value.repeatedDetectorInputs, 1);
});
