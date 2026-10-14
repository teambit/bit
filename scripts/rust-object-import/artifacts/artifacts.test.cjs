const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { encode, decode, MAX_ARCHIVE } = require('./archive.cjs');
const { targets, sha256, buildCommand, sourceIdentity, verifyBinary, verifyMembers } = require('./contract.cjs');
const { dependencyInventory, licenseFiles } = require('./notices.cjs');
const { verifiedArchive, smoke } = require('./smoke.cjs');
const { packageHelper } = require('./package-helper.cjs');
function fixture(target = 'x86_64-unknown-linux-gnu') {
  const binary = Buffer.alloc(256);
  binary.set([127, 69, 76, 70, 2, 1]);
  binary.writeUInt16LE(62, 18);
  binary.write('GLIBC_2.17', 64);
  const manifest = {
    name: 'bit-object-import',
    version: '0.1.0',
    artifactFormat: 2,
    protocolVersion: 1,
    target,
    platform: targets[target],
    gitRevision: 'a'.repeat(40),
    gitParents: ['b'.repeat(40)],
    objectImportSourceSha256: 'b'.repeat(64),
    cargoLockSha256: 'c'.repeat(64),
    minimumGlibc: '2.17',
    provenance: { binaryInput: 'checkout release output', buildCommand: buildCommand(target) },
    binary: { name: 'bit-object-import', bytes: binary.length, sha256: sha256(binary) },
    license: { name: 'LICENSE', sha256: sha256(Buffer.from('license')) },
    notices: { name: 'THIRD-PARTY-NOTICES.txt', sha256: sha256(Buffer.from('notices')) },
  };
  return {
    LICENSE: Buffer.from('license'),
    'THIRD-PARTY-NOTICES.txt': Buffer.from('notices'),
    'bit-object-import': binary,
    'manifest.json': Buffer.from(JSON.stringify(manifest)),
  };
}
function mutateHeader(archive, edit) {
  const data = zlib.gunzipSync(archive);
  edit(data.subarray(0, 512));
  data.fill(32, 148, 156);
  const total = data.subarray(0, 512).reduce((sum, byte) => sum + byte, 0);
  data.write(total.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return zlib.gzipSync(data);
}

test('four-member artifacts are deterministic and preserve exact bytes', () => {
  const members = fixture();
  const first = encode(members);
  assert.ok(first.equals(encode(members)));
  assert.deepEqual({ ...decode(first) }, members);
  assert.equal(verifyMembers(decode(first)).name, 'bit-object-import');
});

test('archive rejects redirects, duplicate names, extra members, checksums and truncation', () => {
  const archive = encode(fixture());
  for (const edit of [
    (header) => header.write('../evil\0'),
    (header) => {
      header[156] = 50;
      header.write('outside\0', 157);
    },
    (header) => {
      header[156] = 49;
    },
    (header) => {
      header[156] = 53;
    },
    (header) => header.write('prefix\0', 345),
    (header) => header.write('manifest.json\0'),
    (header) => header.fill(255, 124, 136),
    (header) => header.write('00077777777\0', 124, 12),
  ])
    assert.throws(() => decode(mutateHeader(archive, edit)));
  const broken = zlib.gunzipSync(archive);
  broken[100] ^= 1;
  assert.throws(() => decode(zlib.gzipSync(broken)), /checksum/);
  assert.throws(() => decode(zlib.gzipSync(broken.subarray(0, -1024))));
  const tail = zlib.gunzipSync(archive);
  tail[tail.length - 1] = 1;
  assert.throws(() => decode(zlib.gzipSync(tail)), /after USTAR/);
  assert.throws(() => encode({ ...fixture(), extra: Buffer.from('x') }));
});

test('compressed and expanded limits reject oversized or bomb artifacts', () => {
  assert.throws(() => decode(Buffer.alloc(MAX_ARCHIVE + 1)), /compressed/);
  const bomb = zlib.gzipSync(Buffer.alloc(81 * 1024 * 1024));
  assert.throws(() => decode(bomb), /larger than|length/i);
});

test('manifest binds source, target, release provenance, checksums and all members', () => {
  for (const edit of [
    (m) => {
      m.name = 'bit-dependency-scanner';
    },
    (m) => {
      m.version = '9.0.0';
    },
    (m) => {
      m.protocolVersion = 2;
    },
    (m) => {
      m.target = '../redirect';
    },
    (m) => {
      m.platform.arch = 'arm64';
    },
    (m) => {
      m.gitRevision = '../bad';
    },
    (m) => {
      m.gitParents = ['../bad'];
    },
    (m) => {
      delete m.gitParents;
    },
    (m) => {
      delete m.objectImportSourceSha256;
    },
    (m) => {
      m.cargoLockSha256 = '';
    },
    (m) => {
      m.minimumGlibc = 'latest';
    },
    (m) => {
      m.minimumGlibc = '2.1';
    },
    (m) => {
      m.provenance.binaryInput = 'explicit --binary';
    },
    (m) => {
      m.provenance.buildCommand.pop();
    },
    (m) => {
      m.binary.bytes++;
    },
    (m) => {
      m.binary.sha256 = '0'.repeat(64);
    },
    (m) => {
      m.license.sha256 = '0'.repeat(64);
    },
    (m) => {
      m.notices.name = '../notices';
    },
  ]) {
    const members = fixture();
    const manifest = JSON.parse(members['manifest.json']);
    edit(manifest);
    members['manifest.json'] = Buffer.from(JSON.stringify(manifest));
    assert.throws(() => verifyMembers(members));
  }
  const members = fixture();
  members['bit-object-import'][0] = 0;
  assert.throws(() => verifyMembers(members), /checksum/);
});

test('executable verification covers ELF, Mach-O, PE, architecture and ABI', () => {
  const elf = fixture()['bit-object-import'];
  verifyBinary(elf, 'x86_64-unknown-linux-gnu');
  assert.throws(() => verifyBinary(elf, 'aarch64-unknown-linux-gnu'), /architecture/);
  const gnu = Buffer.from(elf);
  gnu.write('GLIBC_2.17', 64);
  assert.throws(() => verifyBinary(gnu, 'x86_64-unknown-linux-musl'), /GNU/);
  const macho = Buffer.alloc(256);
  macho.writeUInt32LE(0xfeedfacf);
  macho.writeUInt32LE(0x0100000c, 4);
  verifyBinary(macho, 'aarch64-apple-darwin');
  assert.throws(() => verifyBinary(macho, 'x86_64-apple-darwin'), /architecture/);
  const pe = Buffer.alloc(256);
  pe.write('MZ');
  pe.writeUInt32LE(128, 60);
  pe.write('PE\0\0', 128);
  pe.writeUInt16LE(0x8664, 132);
  verifyBinary(pe, 'x86_64-pc-windows-msvc');
  pe.writeUInt32LE(255, 60);
  assert.throws(() => verifyBinary(pe, 'x86_64-pc-windows-msvc'), /offset/);
});

test('sidecars must exactly match archive and embedded manifest', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bit artifact test '));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'artifact.tar.gz');
  const members = fixture(),
    bytes = encode(members);
  fs.writeFileSync(file, bytes);
  fs.writeFileSync(file + '.sha256', `${sha256(bytes)}  artifact.tar.gz\n`);
  fs.writeFileSync(file + '.manifest.json', members['manifest.json']);
  assert.equal(verifiedArchive(file).manifest.version, '0.1.0');
  fs.writeFileSync(file + '.manifest.json', '{}');
  assert.throws(() => verifiedArchive(file), /detached/);
  fs.writeFileSync(file + '.sha256', 'bad');
  assert.throws(() => verifiedArchive(file), /archive checksum/);
});

test('notice inventory follows object-import closure including build dependencies', () => {
  const metadata = {
    packages: [
      { id: 'root', name: 'bit-object-import', source: null },
      { id: 'runtime', name: 'runtime', version: '1', source: 'registry' },
      { id: 'build', name: 'build', version: '1', source: 'registry' },
      { id: 'scanner', name: 'scanner-only', version: '1', source: 'registry' },
    ],
    resolve: {
      nodes: [
        { id: 'root', dependencies: ['runtime', 'build'] },
        { id: 'runtime', dependencies: ['build'] },
        { id: 'build', dependencies: [] },
        { id: 'scanner', dependencies: [] },
      ],
    },
  };
  assert.deepEqual(
    dependencyInventory(metadata).map(({ name }) => name),
    ['build', 'runtime']
  );
});

test('source identity covers native inputs, is portable across CRLF, and ignores scanner-only edits', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bit artifact source '));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const name of [
    'Cargo.toml',
    'Cargo.lock',
    'rust-toolchain.toml',
    'object-import/Cargo.toml',
    'object-import/src/main.rs',
  ]) {
    const file = path.join(directory, 'native', name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'one\ntwo\n');
  }
  const identity = sourceIdentity(directory);
  const source = path.join(directory, 'native/object-import/src/main.rs');
  fs.writeFileSync(source, 'one\r\ntwo\r\n');
  assert.equal(sourceIdentity(directory), identity);
  fs.mkdirSync(path.join(directory, 'native/dependency-scanner'));
  fs.writeFileSync(path.join(directory, 'native/dependency-scanner/main.rs'), 'unrelated');
  assert.equal(sourceIdentity(directory), identity);
  fs.writeFileSync(source, 'changed');
  assert.notEqual(sourceIdentity(directory), identity);
});

test('packager refuses repository output before invoking a build', () => {
  assert.throws(() => packageHelper(path.resolve(__dirname, 'generated')), /outside/);
  assert.throws(() => packageHelper('relative'), /absolute/);
});

test(
  'actual release artifact validates and executes from a Unicode path',
  { skip: !process.env.BIT_TEST_OBJECT_ARTIFACT },
  () => {
    const manifest = smoke(process.env.BIT_TEST_OBJECT_ARTIFACT);
    assert.equal(manifest.objectImportSourceSha256, sourceIdentity());
    assert.ok(manifest.dependencies.some(({ name }) => name === 'zlib-rs'));
    assert.ok(manifest.dependencies.some(({ name, license }) => name === 'oxc_parser' && license === 'MIT'));
    const { members } = verifiedArchive(process.env.BIT_TEST_OBJECT_ARTIFACT);
    assert.match(members['THIRD-PARTY-NOTICES.txt'].toString(), /=== oxc_parser [^\n]+ ===\nSPDX: MIT/);
  }
);

test(
  'packager rejects an external output symlink pointing into the source checkout',
  { skip: process.platform === 'win32' },
  (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bit artifact redirect '));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.symlinkSync(__dirname, path.join(directory, 'redirect'));
    assert.throws(() => packageHelper(path.join(directory, 'redirect', 'generated')), /outside/);
  }
);

test('artifact sidecars reject redirects and oversize files', { skip: process.platform === 'win32' }, (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bit artifact sidecar '));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const archive = path.join(directory, 'artifact.tar.gz');
  const bytes = encode(fixture());
  fs.writeFileSync(archive, bytes);
  const checksum = path.join(directory, 'checksum');
  fs.writeFileSync(checksum, `${sha256(bytes)}  artifact.tar.gz\n`);
  fs.symlinkSync(checksum, archive + '.sha256');
  assert.throws(() => verifiedArchive(archive), /sidecar/);
  fs.unlinkSync(archive + '.sha256');
  fs.writeFileSync(archive + '.sha256', Buffer.alloc(4097));
  assert.throws(() => verifiedArchive(archive), /sidecar/);
});


test('optional workspace addon is bound to exact bytes, target, ABI and build provenance', () => {
  const { addonBuildCommand, addonRustFlags, addonPostBuild } = require('./contract.cjs');
  const members = fixture();
  const manifest = JSON.parse(members['manifest.json']);
  const addon = Buffer.from(members['bit-object-import']);
  members['bit-workspace.node'] = addon;
  manifest.addon = {name:'bit-workspace.node', bytes:addon.length, sha256:sha256(addon), napiVersion:8,
    buildCommand:addonBuildCommand(manifest.target), rustFlags:addonRustFlags(manifest.target), postBuild:addonPostBuild(manifest.target), minimumGlibc:'2.17'};
  members['manifest.json'] = Buffer.from(JSON.stringify(manifest));
  assert.deepEqual(verifyMembers(decode(encode(members))), manifest);
  for (const edit of [
    value => { value.napiVersion = 9; }, value => { value.bytes++; },
    value => { value.sha256 = '0'.repeat(64); }, value => { value.name = '../addon.node'; },
    value => { value.buildCommand.pop(); }, value => { value.rustFlags = '-C target-cpu=native'; },
    value => { value.minimumGlibc = '2.1'; }, value => { value.postBuild = [['strip', '{addon}']]; },
  ]) {
    const changed = structuredClone(manifest); edit(changed.addon);
    assert.throws(() => verifyMembers({...members, 'manifest.json':Buffer.from(JSON.stringify(changed))}));
  }
  const missing = {...members}; delete missing['bit-workspace.node'];
  assert.throws(() => verifyMembers(missing));
  addon[18] ^= 1;
  assert.throws(() => verifyMembers(members));
});

test('notice discovery includes COPYRIGHT license text and excludes matching directories', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-notice-copyright-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const license = 'MIT License\nCopyright (c) fixture author\nPermission is hereby granted...\n';
  fs.writeFileSync(path.join(directory, 'COPYRIGHT'), license);
  fs.writeFileSync(path.join(directory, 'README.md'), 'not a license');
  fs.mkdirSync(path.join(directory, 'LICENSES'));
  assert.deepEqual(licenseFiles(directory), ['COPYRIGHT']);
  assert.equal(fs.readFileSync(path.join(directory, licenseFiles(directory)[0]), 'utf8'), license);
  fs.writeFileSync(path.join(directory, 'license-mit.txt'), license);
  fs.writeFileSync(path.join(directory, 'NOTICE'), 'notice');
  assert.deepEqual(licenseFiles(directory), ['COPYRIGHT', 'NOTICE', 'license-mit.txt']);
});

test('Apple addons are stripped by Apple strip and re-signed, other targets by rustc', () => {
  const { addonRustFlags, addonPostBuild } = require('./contract.cjs');
  for (const target of ['aarch64-apple-darwin', 'x86_64-apple-darwin']) {
    assert.equal(addonRustFlags(target), '-C strip=none');
    assert.deepEqual(addonPostBuild(target).map(([program]) => program), ['xcrun', 'codesign']);
  }
  assert.deepEqual(addonPostBuild('x86_64-unknown-linux-gnu'), []);
  assert.equal(addonRustFlags('x86_64-unknown-linux-gnu'), '');
});
