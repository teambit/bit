const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const zlib = require('node:zlib');
const { PassThrough } = require('node:stream');
const { source, installed, root } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_SNAPSHOT_TRANSACTION_COMPILED === '1';
const sources = installed('@teambit/component.sources');
const objects = installed('@teambit/objects');
const base = path.dirname(installed.resolve('@teambit/component.sources'));
const adapter = compiled
  ? require(path.join(base, 'rust-artifact-source.js'))
  : source('scopes/component/sources/rust-artifact-source.ts');
const transaction = compiled
  ? require(path.join(path.dirname(installed.resolve('@teambit/objects')), 'objects/rust-snapshot-transaction.js'))
  : source('scopes/scope/objects/objects/rust-snapshot-transaction.ts');

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-snapshot-artifact-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const previousFlag = process.env.BIT_RUST_CLIENT_VCS;
  const previousHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT =
    process.env.BIT_TEST_OBJECT_IMPORT ||
    path.join(root, 'native/target/debug/bit-object-import' + (process.platform === 'win32' ? '.exe' : ''));
  t.after(() => {
    if (previousFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = previousFlag;
    if (previousHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = previousHelper;
  });
  return directory;
}

test('genuine capsule BOM, CRLF and binary artifacts persist directly from verified disk bytes', async (t) => {
  const directory = await fixture(t);
  const repository = await objects.Repository.create({ scopePath: directory, scopeJson: { name: 'qualification' } });
  for (const [index, contents] of [Buffer.from('\ufeffUnicode Ω🌱\r\n'), Buffer.from([0, 255, 13, 10])].entries()) {
    const filename = path.join(directory, `artifact-${index}`);
    await fs.writeFile(filename, contents);
    const vinyl = new sources.ArtifactVinyl({ path: `dist/virtual-artifact-${index}`, contents });
    assert.notEqual(vinyl.path, filename, 'capsule provenance must not use Vinyl workspace-relative path');
    assert.equal(adapter.hasRustArtifactVinyl(vinyl), true);
    adapter.registerRustArtifactFile(vinyl, filename, contents);
    const clone = vinyl.clone();
    assert.notEqual(clone.contents, vinyl.contents, 'canonical Vinyl clone owns an independent Buffer');
    adapter.inheritRustArtifactFile(vinyl, clone);
    const value = clone.toSourceAsLinuxEOL();
    adapter.registerRustArtifactSource(clone, value);
    const descriptor = adapter.getRustArtifactSourceDescriptor(value);
    assert.equal(descriptor?.path, filename);
    assert.equal(descriptor?.normalization, 'linuxEol');
    const expected = value.serialize();
    const stagingDirectory = await fs.mkdtemp(path.join(directory, 'spool-'));
    await transaction.withRustSnapshotTransaction(async () => {
      const serialized = await transaction.requestRustSnapshotTransaction(
        {
          kind: 'snapshotSerialize',
          stagingDirectory,
          objects: [{ type: 'Source', hash: descriptor.sourceHash, source: descriptor }],
        },
        (data) => data?.count === 1
      );
      assert.ok(serialized, 'real Native artifact descriptor must be accepted');
      const committed = await transaction.requestRustSnapshotTransaction(
        {
          kind: 'snapshotCommit',
          token: serialized.token,
          objectsDirectory: repository.getPath(),
          owner: null,
        },
        (data) => data?.completed === 1 && !data.failed
      );
      assert.ok(committed);
    });
    assert.deepEqual(zlib.inflateSync(await fs.readFile(repository.objectPath(value.hash()))), expected);
    clone.contents[0] ^= 1;
    assert.equal(adapter.getRustArtifactSourceDescriptor(value), undefined);
  }
});

test('custom artifact getters, stat objects and streams decline without speculative getters', async (t) => {
  const directory = await fixture(t);
  let reads = 0;
  const value = new sources.ArtifactVinyl({ path: path.join(directory, 'artifact'), contents: Buffer.from('output') });
  Object.defineProperty(value, 'custom', {
    enumerable: true,
    get() {
      reads++;
      throw Error('custom getter');
    },
  });
  assert.equal(adapter.hasRustArtifactVinyl(value), false);
  adapter.registerRustArtifactFile(value, value.path, Buffer.from('output'));
  assert.equal(reads, 0);
  const customClone = new sources.ArtifactVinyl({ path: value.path, contents: Buffer.from('output') });
  customClone.clone = () => {
    reads++;
    throw Error('custom clone');
  };
  assert.equal(adapter.hasRustArtifactVinyl(customClone), false);
  assert.equal(reads, 0);
  const stat = new sources.ArtifactVinyl({
    path: value.path,
    contents: Buffer.from('output'),
    stat: await fs.stat(directory),
  });
  assert.equal(adapter.hasRustArtifactVinyl(stat), false);
  const stream = new PassThrough();
  t.after(() => stream.destroy());
  assert.equal(adapter.hasRustArtifactVinyl(new sources.ArtifactVinyl({ path: value.path, contents: stream })), false);
});
