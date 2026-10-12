// Read-only native microbenchmark including body response transfer. Whole-command speed requires qualification.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { once } = require('node:events');
const hash = (body, algorithm = 'sha1') => createHash(algorithm).update(body).digest('hex');

function frame(id, rows) {
  const body = Buffer.from(JSON.stringify({ kind: 'read', files: rows.map((row) => row.path) }));
  const header = Buffer.alloc(12);
  header.write('BWS1');
  header.writeUInt32BE(id, 4);
  header.writeUInt32BE(body.length, 8);
  return Buffer.concat([header, body]);
}

async function fixture(directory, size) {
  await fs.mkdir(directory);
  const rows = [];
  for (let index = 0; index < 64; index++) {
    const body = Buffer.alloc(size, 97);
    body.write(String(index));
    const filename = path.join(directory, String(index));
    await fs.writeFile(filename, body);
    rows.push({ path: filename, hash: hash(body), contents: body.toString('hex') });
  }
  return rows;
}

async function main() {
  assert.equal(process.argv.length, 4, 'usage: workspace-read-benchmark.cjs <baseline-helper> <candidate-helper>');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-workspace-read-bench-'));
  const helpers = [],
    clients = [],
    results = [];
  try {
    for (const name of process.argv.slice(2)) {
      const helper = await fs.realpath(name);
      helpers.push({ helper, sha256: hash(await fs.readFile(helper), 'sha256'), arguments: [] });
      const child = spawn(helper, [], { stdio: ['pipe', 'pipe', 'inherit'] });
      const closed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
      clients.push({ child, closed, lines: createInterface({ input: child.stdout })[Symbol.asyncIterator](), id: 0 });
      await once(child, 'spawn');
    }
    for (const size of [1024, 65536, 131072]) {
      const directory = path.join(root, String(size)),
        rows = await fixture(directory, size);
      const samples = [[], []];
      for (let round = 0; round < 9; round++) {
        for (const index of round % 2 ? [1, 0] : [0, 1]) {
          const client = clients[index],
            bytes = frame(++client.id, rows);
          const start = performance.now();
          client.child.stdin.write(bytes);
          const line = await client.lines.next();
          const milliseconds = performance.now() - start;
          assert.equal(line.done, false, 'helper exited before receipt');
          const result = JSON.parse(line.value);
          assert.equal(result.failed, false);
          assert.equal(result.completed, rows.length);
          assert.equal(result.id, client.id);
          assert.deepEqual(result.data.files, rows.map((row) => ({
            ...row, linuxHash: row.hash, snapshotHash: row.hash,
          })));
          if (round >= 2) samples[index].push(milliseconds);
        }
      }
      results.push({ sourceBytes: size, files: rows.length, samples });
    }
    console.log(
      JSON.stringify(
        { scope: 'native workspace read response only', warmupPairs: 2, retainedPairs: 7, helpers, results },
        null,
        2
      )
    );
  } finally {
    for (const client of clients) client.child.stdin.end();
    for (const client of clients) assert.deepEqual(await client.closed, { code: 0, signal: null });
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
