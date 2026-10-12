// Native preparation microbenchmark; excludes CLI startup, apply, and cleanup.
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { deflateSync } = require('node:zlib');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { once } = require('node:events');
const hash = (body) => createHash('sha1').update(body).digest('hex');
async function main() {
  assert.ok(
    process.argv.length === 3 || (process.argv.length === 4 && process.argv[3] === '--packed'),
    'usage: merge-prepare-benchmark.cjs <release-helper> [--packed]'
  );
  const packedBodies = process.argv[3] === '--packed';
  const helper = await fs.realpath(process.argv[2]);
  const helperSha256 = createHash('sha256')
    .update(await fs.readFile(helper))
    .digest('hex');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-prepare-bench-'));
  const objectsDirectory = path.join(root, 'objects');
  async function object(kind, identity, body) {
    const file = path.join(objectsDirectory, identity.slice(0, 2), identity.slice(2));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, deflateSync(Buffer.concat([Buffer.from(`${kind} ${identity} ${body.length}\0`), body])));
  }
  const child = spawn(helper, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  const closed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  await once(child, 'spawn');
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let id = 0;
  async function request(data) {
    const bytes = Buffer.from(JSON.stringify(data)),
      header = Buffer.alloc(12);
    header.write('BMT1');
    header.writeUInt32BE(++id, 4);
    header.writeUInt32BE(bytes.length, 8);
    child.stdin.write(Buffer.concat([header, bytes]));
    const line = await lines.next();
    if (line.done) throw Error('helper exited');
    const result = JSON.parse(line.value);
    assert.equal(result.id, id);
    assert.equal(result.failed, false, JSON.stringify({ data, result }));
    return result.data;
  }
  const runs = [];
  try {
    for (const count of [6, 266, 1000]) {
      const baseFiles = [],
        targetFiles = [],
        current = [];
      for (let i = 0; i < count; i++) {
        const base = Buffer.from(`file ${i}\n${'base content\n'.repeat(80)}`),
          target = Buffer.from(`file ${i}\n${'target content\n'.repeat(80)}`);
        const relativePath = `file-${i}.ts`,
          name = relativePath,
          baseHash = hash(base),
          targetHash = hash(target);
        await object('Source', baseHash, base);
        await object('Source', targetHash, target);
        baseFiles.push({ hash: baseHash, relativePath, name, test: false });
        targetFiles.push({ hash: targetHash, relativePath, name, test: false });
        const file = path.join(root, relativePath);
        await fs.writeFile(file, base);
        current.push({ relativePath, workspace: { path: file, rawHash: baseHash, snapshotHash: baseHash } });
      }
      async function version(files) {
        const body = Buffer.from(JSON.stringify({ files: files.map(({ hash, ...f }) => ({ ...f, file: hash })) })),
          identity = hash(body);
        await object('Version', identity, body);
        return { hash: identity, files };
      }
      const base = await version(baseFiles),
        target = await version(targetFiles),
        samples = [];
      for (let round = 0; round < 8; round++) {
        const snapshotDirectory = await fs.mkdtemp(path.join(root, 'snap-'));
        const owner = await request({ kind: 'mergeTransactionBegin', mode: 'status', count: 1 });
        const start = performance.now();
        const result = await request({
          kind: 'mergePrepare',
          ...(packedBodies ? { packedBodies: true } : {}),
          token: owner.token,
          index: 0,
          objectsDirectory,
          snapshotDirectory,
          base,
          target,
          current,
          labels: { current: 'ours', other: 'theirs' },
        });
        const milliseconds = performance.now() - start;
        assert.equal(result.mergeRows.length, count);
        const spools = new Map();
        for (const [index, row] of result.mergeRows.entries()) {
          assert.equal(row.kind, 'updatedFiles');
          assert.equal(row.current, index);
          const retained = result.bodies[row.bodyPlanIndex];
          if (!spools.has(retained.spoolPath)) spools.set(retained.spoolPath, await fs.readFile(retained.spoolPath));
          const contents = spools.get(retained.spoolPath);
          const body =
            retained.spoolOffset === undefined
              ? contents
              : contents.subarray(retained.spoolOffset, retained.spoolOffset + retained.bytes);
          assert.equal(body.length, retained.bytes);
          assert.equal(hash(body), targetFiles[index].hash);
        }
        if (round > 0) samples.push({ milliseconds, reads: result.reads });
        await request({ kind: 'mergeTransactionFinish', token: owner.token });
        await fs.rm(snapshotDirectory, { recursive: true });
      }
      runs.push({ count, samples, medianMs: samples.map((s) => s.milliseconds).sort((a, b) => a - b)[3] });
    }
  } finally {
    child.stdin.end();
    const { code, signal } = await closed;
    assert.equal(code, 0, `helper exited with signal ${signal}`);
    await fs.rm(root, { recursive: true, force: true });
  }
  console.log(
    JSON.stringify(
      {
        scope: 'native-merge-prepare-only',
        helper,
        helperSha256,
        packedBodies,
        platform: process.platform,
        architecture: process.arch,
        warmups: 1,
        retainedRounds: 7,
        runs,
      },
      null,
      2
    )
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
