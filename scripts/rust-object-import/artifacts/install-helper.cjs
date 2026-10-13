// Explicit distribution assembly only: never download or discover a user's workspace.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { ROOT, targets, sourceIdentity, sha256, verifyMembers } = require('./contract.cjs');
const { verifiedArchive, smoke } = require('./smoke.cjs');

function read(file, limit = 65536) {
  const stat = fs.lstatSync(file);
  assert.ok(stat.isFile() && stat.size <= limit, 'invalid installed file');
  const data = fs.readFileSync(file);
  assert.ok(data.length <= limit, 'installed file exceeds limit');
  return data;
}
function writeJson(file, value, limit = 65536) {
  const data = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  assert.ok(data.length <= limit, 'installed contract exceeds limit');
  const temporary = path.join(path.dirname(file), `.selection-${randomUUID()}`);
  try {
    const descriptor = fs.openSync(temporary, 'wx', 0o644);
    try {
      fs.writeFileSync(descriptor, data);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
function selection(manifest) {
  assert.equal(manifest.version, '0.1.0');
  assert.ok(Object.hasOwn(targets, manifest.target), 'unsupported installed target');
  assert.match(manifest.gitRevision, /^[a-f0-9]{40}$/);
  return { version: manifest.version, target: manifest.target, revision: manifest.gitRevision };
}
function entry(manifest, bytes) {
  return { ...selection(manifest), binarySha256: manifest.binary.sha256, manifestSha256: sha256(bytes) };
}
function moduleHashes(directory, names) {
  const root = fs.realpathSync(directory);
  return Object.fromEntries(
    names.map((name) => {
      assert.ok(
        typeof name === 'string' && /^(\.\.\/(models|component-ops)\/|\.\.\/)?[A-Za-z0-9_.-]+\.js$/.test(name),
        'invalid runtime module name'
      );
      const file = path.join(directory, name);
      assert.equal(fs.realpathSync(file), path.resolve(root, name), 'runtime module redirect');
      return [name, sha256(read(file, 4 * 1024 * 1024))];
    })
  );
}
function runtime(directory) {
  const moduleDirectory = fs.realpathSync(directory);
  const relative = path.relative(fs.realpathSync(ROOT), moduleDirectory);
  assert.ok(
    relative.startsWith('..' + path.sep) || path.isAbsolute(relative),
    'install only into a separate distribution'
  );
  // This is a trusted, already compiled Bit build, as with the existing scanner assembler.
  const contractModule = path.join(moduleDirectory, 'rust-object-package.js');
  read(contractModule, 4 * 1024 * 1024);
  const {
    OBJECT_IMPORT_RUNTIME_MODULES: objects,
    OBJECT_IMPORT_LEGACY_MODULES: legacy,
    OBJECT_IMPORT_NETWORK_MODULES: network,
  } = require(contractModule);
  assert.ok(
    objects.includes('rust-object-discovery.js') && objects.includes('repository.js'),
    'compiled object runtime required'
  );
  assert.ok(
    legacy.includes('rust-object-importer.js') && legacy.includes('objects-fetcher.js'),
    'compiled import runtime required'
  );
  assert.ok(Array.isArray(network) && network.includes('http.js'), 'compiled HTTP runtime required');
  const requireRuntime = createRequire(contractModule);
  const legacyEntry = requireRuntime.resolve('@teambit/legacy.scope');
  const legacyDirectory = path.join(path.dirname(legacyEntry), 'objects-fetcher');
  const networkDirectory = path.join(
    path.dirname(createRequire(legacyEntry).resolve('@teambit/scope.network')),
    'http'
  );
  return {
    moduleDirectory,
    legacyDirectory,
    networkDirectory,
    modules: moduleHashes(moduleDirectory, objects),
    legacyModules: moduleHashes(legacyDirectory, legacy),
    networkModules: moduleHashes(networkDirectory, network),
  };
}
function rootDirectory(directory) {
  const root = path.join(directory, 'packaged');
  fs.mkdirSync(root, { recursive: true });
  assert.ok(fs.lstatSync(root).isDirectory() && !fs.lstatSync(root).isSymbolicLink(), 'packaged root redirect');
  assert.equal(fs.realpathSync(root), root, 'packaged root redirect');
  return root;
}
function withLock(root, operation) {
  const lock = path.join(root, '.install-lock');
  const descriptor = fs.openSync(lock, 'wx', 0o600);
  try {
    return operation();
  } finally {
    fs.closeSync(descriptor);
    fs.unlinkSync(lock);
  }
}
function installed(root, chosen) {
  assert.ok(chosen, 'no previous helper selection');
  assert.equal(chosen.version, '0.1.0');
  assert.ok(Object.hasOwn(targets, chosen.target), 'invalid installed target');
  assert.match(chosen.revision, /^[a-f0-9]{40}$/);
  const directory = path.join(root, chosen.version, chosen.target, chosen.revision);
  assert.equal(fs.realpathSync(directory), directory, 'installed directory redirect');
  const manifestBytes = read(path.join(directory, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  const members = Object.fromEntries(
    fs
      .readdirSync(directory)
      .map((name) => [
        name,
        read(
          path.join(directory, name),
          (name.startsWith('bit-object-import') || name === 'bit-workspace.node') ? 64 * 1024 * 1024 : name === 'manifest.json' ? 65536 : 4 * 1024 * 1024
        ),
      ])
  );
  verifyMembers(members);
  assert.deepEqual(selection(manifest), chosen, 'installed selection mismatch');
  return { directory, manifest, manifestBytes, members };
}
function stage(root, chosen, members) {
  const destination = path.join(root, chosen.version, chosen.target, chosen.revision);
  for (const directory of [path.join(root, chosen.version), path.dirname(destination)]) {
    if (!fs.existsSync(directory)) fs.mkdirSync(directory);
    assert.ok(
      fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink(),
      'version/target redirect'
    );
    assert.equal(fs.realpathSync(directory), directory, 'version/target redirect');
  }
  let present = false;
  try {
    fs.lstatSync(destination);
    present = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (present) {
    assert.deepEqual({ ...installed(root, chosen).members }, { ...members }, 'immutable installed artifact mismatch');
    return destination;
  }
  const temporary = fs.mkdtempSync(path.join(root, '.stage-'));
  try {
    for (const [name, data] of Object.entries(members)) {
      const descriptor = fs.openSync(
        path.join(temporary, name),
        'wx',
        name.startsWith('bit-object-import') ? 0o755 : 0o644
      );
      try {
        fs.writeFileSync(descriptor, data);
        if (process.platform !== 'win32')
          fs.fchmodSync(descriptor, name.startsWith('bit-object-import') ? 0o755 : 0o644);
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
    }
    fs.renameSync(temporary, destination);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  return destination;
}
function install(moduleDirectory, archive, options = {}) {
  const build = runtime(moduleDirectory);
  const { manifest, members } = verifiedArchive(archive);
  const identity = sourceIdentity();
  assert.equal(manifest.objectImportSourceSha256, identity, 'artifact native source differs from assembler checkout');
  if (options.target) assert.equal(manifest.target, options.target, 'distribution target mismatch');
  if (options.smoke !== false) smoke(archive);
  const chosen = selection(manifest);
  const root = rootDirectory(build.moduleDirectory);
  return withLock(root, () => {
    const destination = stage(root, chosen, members);
    const contractPath = path.join(build.moduleDirectory, 'packaged-build.json');
    const previousContract = fs.existsSync(contractPath) ? JSON.parse(read(contractPath)) : undefined;
    const previousEntries = previousContract?.objectImportSourceSha256 === identity ? previousContract.artifacts : [];
    assert.ok(Array.isArray(previousEntries), 'invalid installed build contract');
    const artifact = entry(manifest, members['manifest.json']);
    const artifacts = [...previousEntries.filter((item) => !isDeepStrictEqual(item, artifact)), artifact].slice(-32);
    const selectedPath = path.join(root, 'selection.json');
    const selected = fs.existsSync(selectedPath) ? JSON.parse(read(selectedPath, 4096)) : {};
    writeJson(contractPath, {
      format: 1,
      objectImportSourceSha256: identity,
      modules: build.modules,
      legacyModules: build.legacyModules,
      networkModules: build.networkModules,
      artifacts,
    });
    const previous = isDeepStrictEqual(selected.current, chosen) ? selected.previous : selected.current;
    writeJson(selectedPath, { current: chosen, ...(previous ? { previous } : {}) }, 4096);
    return destination;
  });
}
function rollback(moduleDirectory) {
  const build = runtime(moduleDirectory);
  const root = rootDirectory(build.moduleDirectory);
  return withLock(root, () => {
    const selectedPath = path.join(root, 'selection.json');
    const selected = JSON.parse(read(selectedPath, 4096));
    const prior = installed(root, selected.previous);
    const contract = JSON.parse(read(path.join(build.moduleDirectory, 'packaged-build.json')));
    assert.equal(
      prior.manifest.objectImportSourceSha256,
      contract.objectImportSourceSha256,
      'rollback native source mismatch'
    );
    assert.deepEqual(contract.modules, build.modules, 'rollback object runtime changed');
    assert.deepEqual(contract.legacyModules, build.legacyModules, 'rollback import runtime changed');
    assert.deepEqual(contract.networkModules, build.networkModules, 'rollback HTTP runtime changed');
    assert.ok(
      contract.artifacts.some((item) => isDeepStrictEqual(item, entry(prior.manifest, prior.manifestBytes))),
      'rollback artifact not bound to runtime'
    );
    writeJson(selectedPath, { current: selected.previous, previous: selected.current }, 4096);
    return prior.directory;
  });
}
function assemble(distribution, archive, target) {
  assert.ok(Object.hasOwn(targets, target), 'assembly requires an explicit supported target');
  const root = fs.realpathSync(distribution);
  const requireDistribution = createRequire(path.join(root, 'package.json'));
  const directory = path.join(path.dirname(requireDistribution.resolve('@teambit/objects')), 'objects');
  const build = runtime(directory);
  for (const dir of [
    build.moduleDirectory,
    fs.realpathSync(build.legacyDirectory),
    fs.realpathSync(build.networkDirectory),
  ])
    assert.ok(dir.startsWith(root + path.sep), 'runtime escapes distribution');
  return install(directory, archive, { target, smoke: false });
}
if (require.main === module) {
  const [operation, ...args] = process.argv.slice(2);
  assert.ok(args.length % 2 === 0, 'options require values');
  const options = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, i) => [args[i * 2], args[i * 2 + 1]]));
  let result;
  if (operation === 'install') result = install(options['--module-directory'], options['--archive']);
  else if (operation === 'rollback') result = rollback(options['--module-directory']);
  else {
    assert.equal(operation, 'assemble', 'expected install, rollback or assemble');
    result = assemble(options['--distribution'], options['--archive'], options['--target']);
  }
  console.log(result);
}
module.exports = { install, rollback, assemble, runtime, installed };
