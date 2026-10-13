const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const zlib = require('node:zlib');
const { fixture } = require('./discovery-fixture.cjs');
const { install, rollback, assemble } = require('./artifacts/install-helper.cjs');
const { verifiedArchive } = require('./artifacts/smoke.cjs');
const { encode } = require('./artifacts/archive.cjs');
const { sha256 } = require('./artifacts/contract.cjs');
const archive = process.env.BIT_TEST_OBJECT_ARTIFACT;
function installedFixture(t) {
  const f = fixture(t);
  const destination = install(f.moduleDirectory, archive);
  return { ...f, destination, executable: path.join(destination, verifiedArchive(archive).manifest.binary.name) };
}
const real = { skip: !archive };

test('default, off, invalid relative overrides and unsupported empty installation fall back', (t) => {
  const f = fixture(t);
  for (const value of ['', 'off', 'relative-helper', 'packaged']) {
    process.env.BIT_RUST_OBJECT_IMPORT = value;
    assert.equal(f.resolve(), undefined);
  }
  delete process.env.BIT_RUST_OBJECT_IMPORT;
  assert.equal(f.resolve(), undefined);
  process.env.BIT_RUST_OBJECT_IMPORT = path.join(f.directory, 'explicit-helper');
  assert.equal(f.resolve(), path.toNamespacedPath(process.env.BIT_RUST_OBJECT_IMPORT));
});

test('real installation is immutable, discoverable and shared by import/read protocols', real, async (t) => {
  const f = installedFixture(t);
  assert.equal(f.resolve(), path.toNamespacedPath(f.executable));
  assert.equal(f.resolve('import'), path.toNamespacedPath(f.executable));
  assert.equal(install(f.moduleDirectory, archive), f.destination);
  const body = Buffer.from('packaged body λ');
  const hash = createHash('sha1').update(body).digest('hex');
  const buffer = zlib.deflateSync(Buffer.concat([Buffer.from(`Source ${hash} ${body.length}\0`), body]));
  const objectsDirectory = path.join(f.directory, 'store');
  fs.mkdirSync(objectsDirectory);
  const { RustSourceValidator, createRustSourceValidator } = f.load(
    path.join(f.legacyDirectory, 'rust-source-validator.js')
  );
  const validator = createRustSourceValidator(f.resolve('import'));
  assert.ok(validator instanceof RustSourceValidator);
  const { RustObjectImporter } = f.load(path.join(f.legacyDirectory, 'rust-object-importer.js'));
  const importer = new RustObjectImporter(f.resolve('import'), { objectsDirectory });
  // The fixture's directory removal is an earlier-registered after hook, so it runs first. Stop
  // both helpers here: Windows cannot unlink an executable while a process is still running it.
  try {
    await realInstallation(validator, importer, hash, buffer, objectsDirectory, f);
  } finally {
    const validatorChild = validator.child;
    validator.dispose();
    if (validatorChild && validatorChild.exitCode === null && validatorChild.signalCode === null)
      await new Promise((resolve) => validatorChild.once('exit', resolve));
    await importer.disposeAndWait();
  }
});

async function realInstallation(validator, importer, hash, buffer, objectsDirectory, f) {
  assert.ok((await validator.validate(hash, buffer)).inflatedBytes > 0);
  const records = [{ ref: { toString: () => hash }, buffer }];
  let persisted;
  await importer.importBatch(
    records,
    async () => [0],
    async (_, completed) => {
      persisted = completed;
    }
  );
  assert.deepEqual([...persisted], [0]);
  {
    const hashes = Array(1024).fill(hash);
    const { nativeObjectExists } = f.load(path.join(f.moduleDirectory, 'rust-object-inventory.js'));
    assert.ok((await nativeObjectExists(objectsDirectory, hashes)).every(Boolean));
    const { nativeObjectBuffers, nativeObjectHeaders } = f.load(path.join(f.moduleDirectory, 'rust-object-reader.js'));
    assert.ok((await nativeObjectBuffers(objectsDirectory, hashes)).every((bytes) => bytes.equals(buffer)));
    assert.ok((await nativeObjectHeaders(objectsDirectory, hashes)).every((header) => header.type === 'Source'));
    for (let prefix = 0; prefix < 256; prefix++)
      fs.mkdirSync(path.join(objectsDirectory, prefix.toString(16).padStart(2, '0')), { recursive: true });
    const { nativeObjectDirectory } = f.load(path.join(f.moduleDirectory, 'rust-object-directory.js'));
    const rows = await nativeObjectDirectory(objectsDirectory, true);
    assert.deepEqual(
      rows.map((row) => [row.hash, row.header.type]),
      [[hash, 'Source']]
    );
  }
}

test('changed executable, license, notices or runtime modules invalidate cached verification', real, (t) => {
  const f = installedFixture(t);
  const files = [
    f.executable,
    path.join(f.destination, 'LICENSE'),
    path.join(f.destination, 'THIRD-PARTY-NOTICES.txt'),
    path.join(f.moduleDirectory, 'rust-object-reader.js'),
  ];
  for (const file of files) {
    assert.ok(f.resolve());
    const bytes = fs.readFileSync(file);
    fs.appendFileSync(file, '\nchanged');
    assert.equal(f.resolve(), undefined, file);
    fs.writeFileSync(file, bytes);
    assert.ok(f.resolve(), 'restored bytes are reverified');
  }
  const legacy = path.join(f.legacyDirectory, 'objects-fetcher.js');
  fs.appendFileSync(legacy, '\nchanged');
  assert.ok(f.resolve(), 'read-only operations do not load the import graph');
  assert.equal(f.resolve('import'), undefined, 'imports verify their own coordinators');
});

test('changed HTTP handoff invalidates imports while preserving read-only selection', real, (t) => {
  const f = installedFixture(t);
  const filename = path.join(f.networkDirectory, 'http.js');
  assert.ok(f.resolve('import'));
  fs.appendFileSync(filename, '\nchanged');
  assert.ok(f.resolve());
  assert.equal(f.resolve('import'), undefined);
});

test('unbound manifest, source, target, version, GLIBC and selection reject native discovery', real, (t) => {
  const f = installedFixture(t);
  const selector = path.join(f.moduleDirectory, 'packaged/selection.json');
  const original = fs.readFileSync(selector);
  for (const edit of [
    (s) => {
      s.current.target = 'unsupported';
    },
    (s) => {
      s.current.revision = '../redirect';
    },
    (s) => {
      s.current.version = '9';
    },
  ]) {
    const data = JSON.parse(original);
    edit(data);
    fs.writeFileSync(selector, JSON.stringify(data));
    assert.equal(f.resolve(), undefined);
  }
  fs.writeFileSync(selector, original);
  const manifestFile = path.join(f.destination, 'manifest.json');
  const manifestBytes = fs.readFileSync(manifestFile);
  const bindingFile = path.join(f.moduleDirectory, 'packaged-build.json');
  const bindingBytes = fs.readFileSync(bindingFile);
  for (const edit of [
    (m) => {
      m.objectImportSourceSha256 = '0'.repeat(64);
    },
    (m) => {
      m.protocolVersion = 9;
    },
    ...(JSON.parse(manifestBytes).target.endsWith('-gnu')
      ? [
          (m) => {
            m.minimumGlibc = '999.0';
          },
        ]
      : []),
    (m) => {
      m.name = 'wrong';
    },
  ]) {
    const m = JSON.parse(manifestBytes);
    edit(m);
    const bytes = Buffer.from(JSON.stringify(m));
    fs.writeFileSync(manifestFile, bytes);
    const binding = JSON.parse(bindingBytes);
    binding.artifacts[0].manifestSha256 = sha256(bytes);
    fs.writeFileSync(bindingFile, JSON.stringify(binding));
    assert.equal(f.resolve(), undefined);
  }
  fs.writeFileSync(manifestFile, manifestBytes);
  fs.writeFileSync(bindingFile, bindingBytes);
  assert.ok(f.resolve());
  const buildFile = path.join(f.moduleDirectory, 'packaged-build.json');
  const build = JSON.parse(fs.readFileSync(buildFile));
  build.artifacts = [];
  fs.writeFileSync(buildFile, JSON.stringify(build));
  assert.equal(f.resolve(), undefined);
});

test('compatible installations can roll back atomically; tampering never selects the old artifact', real, (t) => {
  const f = installedFixture(t);
  const { manifest, members } = verifiedArchive(archive);
  const newer = { ...manifest, gitRevision: 'd'.repeat(40) };
  const updated = { ...members, 'manifest.json': Buffer.from(JSON.stringify(newer)) };
  const filename = path.join(f.directory, 'second.tar.gz');
  const bytes = encode(updated);
  fs.writeFileSync(filename, bytes);
  fs.writeFileSync(filename + '.sha256', `${sha256(bytes)}  second.tar.gz\n`);
  fs.writeFileSync(filename + '.manifest.json', updated['manifest.json']);
  const next = install(f.moduleDirectory, filename);
  assert.notEqual(next, f.destination);
  assert.ok(f.resolve().startsWith(path.toNamespacedPath(next)));
  assert.equal(rollback(f.moduleDirectory), f.destination);
  assert.equal(f.resolve(), path.toNamespacedPath(f.executable));
  assert.equal(rollback(f.moduleDirectory), next);
  fs.appendFileSync(f.executable, 'corrupt');
  assert.throws(() => rollback(f.moduleDirectory), /checksum|metadata/);
  assert.ok(f.resolve().startsWith(path.toNamespacedPath(next)));
});

test(
  'assembly verifies the target and runtime boundary, preserves selection on failure and honors locking',
  real,
  (t) => {
    const f = installedFixture(t);
    const manifest = verifiedArchive(archive).manifest;
    assert.equal(assemble(f.directory, archive, manifest.target), f.destination);
    assert.throws(() => assemble(f.directory, archive, 'unsupported'), /target/);
    const root = path.join(f.moduleDirectory, 'packaged');
    const before = fs.readFileSync(path.join(root, 'selection.json'));
    fs.writeFileSync(path.join(root, '.install-lock'), 'busy');
    assert.throws(() => install(f.moduleDirectory, archive), /EEXIST/);
    fs.unlinkSync(path.join(root, '.install-lock'));
    fs.appendFileSync(path.join(f.destination, 'LICENSE'), 'changed');
    assert.throws(() => install(f.moduleDirectory, archive), /checksum/);
    assert.ok(fs.readFileSync(path.join(root, 'selection.json')).equals(before));
  }
);

test(
  'packaged directories and files cannot redirect out of the installed runtime',
  { ...real, skip: !archive || process.platform === 'win32' },
  (t) => {
    const f = installedFixture(t);
    const binary = fs.readFileSync(f.executable);
    const outside = path.join(f.directory, 'outside');
    fs.writeFileSync(outside, binary);
    fs.unlinkSync(f.executable);
    fs.symlinkSync(outside, f.executable);
    assert.equal(f.resolve(), undefined);
    assert.throws(() => install(f.moduleDirectory, archive), /installed file|redirect/);
    fs.unlinkSync(f.executable);
    fs.writeFileSync(f.executable, binary, { mode: 0o755 });
    const root = path.join(f.moduleDirectory, 'packaged');
    fs.renameSync(root, root + '-old');
    fs.symlinkSync(root + '-old', root);
    assert.equal(f.resolve(), undefined);
    assert.throws(() => install(f.moduleDirectory, archive), /redirect/);
  }
);

test('host target selection covers supported ABIs and rejects unsupported hosts', (t) => {
  const f = fixture(t);
  const original = Object.fromEntries(
    ['platform', 'arch'].map((key) => [key, Object.getOwnPropertyDescriptor(process, key)])
  );
  const report = Object.getOwnPropertyDescriptor(process.report, 'getReport');
  t.after(() => {
    for (const [key, value] of Object.entries(original)) Object.defineProperty(process, key, value);
    Object.defineProperty(process.report, 'getReport', report);
  });
  for (const [platform, arch, glibc, expected] of [
    ['linux', 'x64', '2.39', 'x86_64-unknown-linux-gnu'],
    ['linux', 'x64', undefined, 'x86_64-unknown-linux-musl'],
    ['linux', 'arm64', '2.39', 'aarch64-unknown-linux-gnu'],
    ['linux', 'arm64', undefined, undefined],
    ['darwin', 'x64', undefined, 'x86_64-apple-darwin'],
    ['darwin', 'arm64', undefined, 'aarch64-apple-darwin'],
    ['win32', 'x64', undefined, 'x86_64-pc-windows-msvc'],
    ['win32', 'arm64', undefined, undefined],
    ['freebsd', 'x64', undefined, undefined],
  ]) {
    Object.defineProperty(process, 'platform', { value: platform });
    Object.defineProperty(process, 'arch', { value: arch });
    Object.defineProperty(process.report, 'getReport', {
      value: () => ({ header: glibc ? { glibcVersionRuntime: glibc } : {} }),
    });
    assert.equal(f.contract.packagedObjectTarget(), expected);
  }
});

test('packaged discovery rejects old Node without restricting absolute overrides', real, (t) => {
  const f = installedFixture(t);
  const node = Object.getOwnPropertyDescriptor(process.versions, 'node');
  t.after(() => Object.defineProperty(process.versions, 'node', node));
  for (const value of ['20.20.0', '22.12.0']) {
    Object.defineProperty(process.versions, 'node', { value });
    assert.equal(f.resolve(), undefined);
    process.env.BIT_RUST_OBJECT_IMPORT = f.executable;
    assert.equal(f.resolve(), path.toNamespacedPath(f.executable));
    process.env.BIT_RUST_OBJECT_IMPORT = 'packaged';
  }
});

test('packaged discovery never searches another installation or PATH', real, (t) => {
  const present = installedFixture(t),
    absent = fixture(t);
  const original = process.env.PATH;
  t.after(() => {
    if (original === undefined) delete process.env.PATH;
    else process.env.PATH = original;
  });
  process.env.PATH = present.destination + path.delimiter + (original || '');
  assert.ok(present.resolve());
  assert.equal(absent.resolve(), undefined);
});

test(
  'release assembly selects exactly one target artifact and leaves unsupplied distributions unchanged',
  real,
  (t) => {
    const { assembleRelease } = require('./artifacts/assemble-release.cjs');
    const f = fixture(t);
    const { manifest } = verifiedArchive(archive);
    const artifacts = path.join(f.directory, 'release artifacts λ');
    fs.mkdirSync(artifacts);
    assert.equal(assembleRelease(f.directory, manifest.target, ''), undefined);
    assert.equal(f.resolve(), undefined);
    assert.throws(() => assembleRelease(f.directory, manifest.target, artifacts), /exactly one/);
    const name = path.basename(archive);
    for (const suffix of ['', '.sha256', '.manifest.json'])
      fs.copyFileSync(archive + suffix, path.join(artifacts, name + suffix));
    fs.writeFileSync(path.join(artifacts, 'bit-object-import-0.1.0-unrelated-target-ignore.tar.gz'), 'ignored');
    const destination = assembleRelease(f.directory, manifest.target, artifacts);
    assert.equal(f.resolve('import'), path.toNamespacedPath(path.join(destination, manifest.binary.name)));
    fs.copyFileSync(path.join(artifacts, name), path.join(artifacts, name.replace('.tar.gz', '-duplicate.tar.gz')));
    assert.throws(() => assembleRelease(f.directory, manifest.target, artifacts), /exactly one/);
    assert.equal(f.resolve('import'), path.toNamespacedPath(path.join(destination, manifest.binary.name)));
    assert.throws(() => assembleRelease(f.directory, 'unsupported', artifacts), /supported target/);
  }
);


test('verified companion discovery rejects corruption while retaining the child helper', real, (t) => {
  const f = installedFixture(t);
  const manifest = verifiedArchive(archive).manifest;
  if (!manifest.addon) return;
  delete process.env.BIT_TEST_WORKSPACE_ADDON;
  const { resolveRustWorkspaceAddon } = f.load(path.join(f.moduleDirectory, 'rust-object-discovery.js'));
  const addon = path.join(f.destination, 'bit-workspace.node');
  assert.equal(resolveRustWorkspaceAddon(f.executable), addon);
  const bytes = fs.readFileSync(addon);
  fs.writeFileSync(addon, Buffer.from('corrupt addon'));
  assert.equal(resolveRustWorkspaceAddon(f.executable), undefined);
  assert.equal(f.resolve(), path.toNamespacedPath(f.executable));
  fs.writeFileSync(addon, bytes);
  assert.equal(resolveRustWorkspaceAddon(f.executable), addon);
  const script = `
    const assert = require('node:assert/strict');
    const {NativeImportOperation}=require(process.argv[1]);
    const WorkspaceEngine=process.argv[5] === 'addon' ? require(process.argv[3]).WorkspaceEngine : undefined;
    (async()=>{const operation=new NativeImportOperation(process.argv[2], {objectsDirectory:process.argv[4]});
      try { assert.equal(await operation.request({kind:'version',existing:'9',incoming:'10'},value=>value),true);
        if (WorkspaceEngine) { assert.ok(operation.engine instanceof WorkspaceEngine); assert.equal(operation.child,undefined); }
        else { assert.equal(operation.engine,undefined); assert.ok(operation.child); }
      } finally { await operation.disposeAndWait(); }
    })().catch(error=>{console.error(error);process.exitCode=1});`;
  const child = require('node:child_process').spawnSync(process.execPath, ['-e', script,
    path.join(f.moduleDirectory,'rust-object-operation.js'), f.executable, addon, path.join(f.directory,'addon-objects'), 'addon'],
    {encoding:'utf8',timeout:30000});
  assert.ifError(child.error);
  assert.equal(child.status,0,child.stderr);
  const invalid = Buffer.from('unsupported native library');
  fs.writeFileSync(addon, invalid);
  const changed = structuredClone(manifest);
  changed.addon.bytes = invalid.length;
  changed.addon.sha256 = sha256(invalid);
  fs.writeFileSync(path.join(f.destination, 'manifest.json'), JSON.stringify(changed));
  // An explicit helper may have an incompatible companion. Failure to load it
  // must select the child before accepting any operation, including on Windows.
  const fallback = require('node:child_process').spawnSync(process.execPath, ['-e', script,
    path.join(f.moduleDirectory,'rust-object-operation.js'), f.executable, addon, path.join(f.directory,'fallback-objects'), 'child'],
    {encoding:'utf8',timeout:30000});
  assert.ifError(fallback.error);
  assert.equal(fallback.status,0,fallback.stderr);
});
