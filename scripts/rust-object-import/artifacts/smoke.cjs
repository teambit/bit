const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { decode, MAX_ARCHIVE } = require('./archive.cjs');
const { verifyMembers, sha256, binaryName } = require('./contract.cjs');

function verifiedArchive(archive) {
  const stat = fs.lstatSync(archive);
  assert.ok(stat.isFile() && stat.size <= MAX_ARCHIVE, 'invalid archive');
  const bytes = fs.readFileSync(archive);
  const sidecar = (suffix, limit) => {
    const file = archive + suffix;
    const stat = fs.lstatSync(file);
    assert.ok(stat.isFile() && stat.size <= limit, 'invalid artifact sidecar');
    const data = fs.readFileSync(file);
    assert.ok(data.length <= limit, 'artifact sidecar exceeds limit');
    return data;
  };
  assert.equal(
    sidecar('.sha256', 4096).toString('ascii'),
    `${sha256(bytes)}  ${path.basename(archive)}\n`,
    'archive checksum mismatch'
  );
  const members = decode(bytes);
  const manifest = verifyMembers(members);
  assert.ok(sidecar('.manifest.json', 65536).equals(members['manifest.json']), 'detached manifest mismatch');
  return { manifest, members };
}

function smoke(archive) {
  const { manifest, members } = verifiedArchive(archive);
  assert.equal(manifest.platform.os, process.platform, 'smoke host OS mismatch');
  assert.equal(manifest.platform.arch, process.arch, 'smoke host architecture mismatch');
  if (process.platform === 'linux') {
    const runtime = process.report.getReport().header.glibcVersionRuntime;
    assert.equal(manifest.platform.abi, runtime ? 'gnu' : 'musl', 'smoke host ABI mismatch');
    if (runtime) {
      const actual = runtime.split('.').map(Number),
        required = manifest.minimumGlibc.split('.').map(Number);
      assert.ok(
        actual[0] > required[0] || (actual[0] === required[0] && actual[1] >= required[1]),
        'smoke host GLIBC too old'
      );
    }
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bit object artifact λ '));
  try {
    const executable = path.join(directory, binaryName(manifest.target));
    fs.writeFileSync(executable, members[binaryName(manifest.target)], { mode: 0o755 });
    const body = Buffer.from('standalone Source body λ\0');
    const hash = createHash('sha1').update(body).digest();
    const serialized = Buffer.concat([Buffer.from(`Source ${hash.toString('hex')} ${body.length}\0`), body]);
    const compressed = zlib.deflateSync(serialized);
    const request = Buffer.alloc(36 + compressed.length);
    request.write('BOI3');
    request.writeUInt32BE(17, 4);
    request.writeUInt32BE(1, 8);
    hash.copy(request, 12);
    request.writeUInt32BE(compressed.length, 32);
    compressed.copy(request, 36);
    const commit = Buffer.alloc(16);
    commit.write('BOC3');
    commit.writeUInt32BE(17, 4);
    commit.writeUInt32BE(1, 8);
    commit.writeUInt32BE(0, 12);
    const inventory = Buffer.alloc(32);
    inventory.write('BEX1');
    inventory.writeUInt32BE(18, 4);
    inventory.writeUInt32BE(1, 8);
    hash.copy(inventory, 12);
    const result = spawnSync(executable, ['--objects-dir', directory], {
      input: Buffer.concat([request, commit, inventory]),
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const responses = result.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(responses.length, 3);
    assert.equal(responses[0].version, 3);
    assert.equal(responses[0].id, 17);
    assert.equal(responses[0].files[0].status, 'source');
    assert.equal(responses[0].files[0].hash, hash.toString('hex'));
    assert.deepEqual(responses[1], { version: 3, id: 17, persisted: [0], failed: [] });
    assert.deepEqual(responses[2], { version: 1, id: 18, exists: [true] });
    assert.ok(
      fs
        .readFileSync(path.join(directory, hash.toString('hex').slice(0, 2), hash.toString('hex').slice(2)))
        .equals(compressed),
      'standalone persisted bytes differ'
    );
    if (manifest.addon) {
      const addon = path.join(directory, manifest.addon.name);
      fs.writeFileSync(addon, members[manifest.addon.name]);
      const checked = spawnSync(process.execPath, [path.join(__dirname, 'addon-smoke.cjs'), addon, executable, directory], {
        encoding:'utf8', timeout:30000, maxBuffer:1024 * 1024,
      });
      assert.ifError(checked.error);
      assert.equal(checked.status, 0, checked.stderr);
    }
    return manifest;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
if (require.main === module) {
  assert.equal(process.argv.length, 3, 'usage: smoke.cjs ARCHIVE');
  console.log(JSON.stringify(smoke(process.argv[2]), null, 2));
}
module.exports = { verifiedArchive, smoke };
