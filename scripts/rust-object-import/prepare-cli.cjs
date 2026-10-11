// Rebuild the affected components in a physical private copy of an already bootstrapped Bit CLI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const [installedArg, targetArg, refresh] = process.argv.slice(2);
assert.ok(refresh === undefined || refresh === '--refresh');
assert.ok(installedArg && targetArg, 'usage: prepare-cli.cjs <prepared-private-cli> <new-private-copy>');
const installed = fs.realpathSync(installedArg);
const target = path.resolve(targetArg);
assert.ok(
  [os.tmpdir(), '/tmp'].some((p) => target.startsWith(p + path.sep)),
  'output must be a disposable temporary copy'
);
assert.equal(fs.realpathSync(path.dirname(target)), path.dirname(target));
assert.ok(!target.startsWith(installed + path.sep));
assert.ok(refresh ? fs.existsSync(path.join(target, '.bit-object-import-build.json')) : !fs.existsSync(target));
const previous = JSON.parse(fs.readFileSync(path.join(installed, '.bit-rust-private-build.json')));
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const module of previous.compiledModules)
  assert.equal(hash(path.join(installed, 'node_modules/@teambit', module.path)), module.sha256);
if (!refresh) {
  fs.mkdirSync(target);
  cp.execFileSync('cp', ['-a', '--reflink=auto', installed + '/.', target]);
}
let rerouted = 0;
function links(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const link = fs.readlinkSync(filename);
      const absolute = path.resolve(path.dirname(filename), link);
      if (absolute.startsWith(installed + path.sep)) {
        fs.unlinkSync(filename);
        fs.symlinkSync(path.relative(path.dirname(filename), target + absolute.slice(installed.length)), filename);
        rerouted++;
      }
      let resolved;
      try {
        resolved = fs.realpathSync(filename);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        resolved = path.resolve(path.dirname(filename), fs.readlinkSync(filename));
      }
      assert.ok(resolved.startsWith(target + path.sep), 'private CLI cannot retain live external aliases');
    } else if (entry.isDirectory()) links(filename);
  }
}
links(target);
const files = [
  'scopes/component/sources/abstract-vinyl.ts',
  'scopes/component/sources/data-to-persist.ts',
  'scopes/component/sources/rust-workspace-materializer.ts',
  'components/legacy/scope/objects-fetcher/objects-fetcher.ts',
  'components/legacy/scope/objects-fetcher/import-cancellation.ts',
  'components/legacy/scope/objects-fetcher/objects-writable-stream.ts',
  'components/legacy/scope/objects-fetcher/write-objects-queue.ts',
  'components/legacy/scope/objects-fetcher/rust-source-validator.ts',
  'components/legacy/scope/objects-fetcher/rust-object-importer.ts',
  'components/legacy/scope/objects-fetcher/rust-tar-client.ts',
  'components/legacy/scope/objects-fetcher/rust-tar-importer.ts',
  'components/legacy/scope/objects-fetcher/rust-tar-transfer.ts',
  'components/legacy/scope/objects-fetcher/rust-tar-staging.ts',
  'components/legacy/scope/objects-fetcher/rust-tar-stream.ts',
  'scopes/scope/objects/objects/repository.ts',
  'scopes/scope/objects/objects/object.ts',
  'scopes/scope/objects/objects/object-list.ts',
  'scopes/scope/objects/objects/tar-input-stream.ts',
  'scopes/scope/objects/objects/tar-input-stream.spec.ts',
  'scopes/scope/network/http/http.ts',
  'scopes/scope/objects/objects/rust-object-inventory.ts',
  'scopes/scope/objects/objects/rust-object-reader.ts',
  'scopes/scope/objects/objects/rust-object-directory.ts',
  'scopes/scope/objects/objects/rust-object-discovery.ts',
  'scopes/scope/objects/objects/rust-object-package.ts',
  'scopes/scope/objects/objects/rust-object-operation.ts',
  'scopes/scope/objects/objects/scope-index.ts',
  'scopes/scope/objects/index.ts',
  'scopes/scope/objects/models/version-history.ts',
  'scopes/scope/objects/models/lane-history.ts',
  'scopes/scope/objects/models/detach-heads.ts',
  'scopes/scope/objects/models/version-history.spec.ts',
  'components/legacy/scope/component-ops/scope-components-importer.ts',
  'components/legacy/scope/component-ops/model-components-merger.ts',
  'components/legacy/scope/component-ops/multiple-component-merger.ts',
  'scopes/scope/scope/scope.main.runtime.ts',
];
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(target, file));
const output = fs.openSync(path.join(target, '.bit-object-import-compile.json'), 'w');
try {
  cp.execFileSync(
    process.execPath,
    [
      'bin/bit.js',
      'compile',
      'teambit.legacy/scope',
      'teambit.scope/objects',
      'teambit.scope/network',
      'teambit.scope/scope',
      'teambit.component/sources',
      '--json',
      '--safe-mode',
    ],
    { cwd: target, stdio: ['ignore', output, 'inherit'] }
  );
} finally {
  fs.closeSync(output);
}
const compilation = JSON.parse(fs.readFileSync(path.join(target, '.bit-object-import-compile.json')));
assert.deepEqual(
  compilation.map((component) => component.component.split('@')[0]).sort(),
  [
    'teambit.legacy/scope',
    'teambit.scope/objects',
    'teambit.scope/network',
    'teambit.scope/scope',
    'teambit.component/sources',
  ].sort()
);
assert.ok(compilation.every((c) => c.errors.length === 0));
for (const component of compilation)
  for (const file of component.buildResults) assert.ok(fs.realpathSync(file).startsWith(target + path.sep));
const modules = [
  'component.sources/dist/abstract-vinyl.js',
  'component.sources/dist/data-to-persist.js',
  'component.sources/dist/rust-workspace-materializer.js',
  'legacy.scope/dist/objects-fetcher/objects-fetcher.js',
  'legacy.scope/dist/objects-fetcher/import-cancellation.js',
  'legacy.scope/dist/objects-fetcher/objects-writable-stream.js',
  'legacy.scope/dist/objects-fetcher/write-objects-queue.js',
  'legacy.scope/dist/objects-fetcher/rust-source-validator.js',
  'legacy.scope/dist/objects-fetcher/rust-object-importer.js',
  'legacy.scope/dist/objects-fetcher/rust-tar-client.js',
  'legacy.scope/dist/objects-fetcher/rust-tar-importer.js',
  'legacy.scope/dist/objects-fetcher/rust-tar-transfer.js',
  'legacy.scope/dist/objects-fetcher/rust-tar-staging.js',
  'legacy.scope/dist/objects-fetcher/rust-tar-stream.js',
  'objects/dist/objects/repository.js',
  'objects/dist/objects/object.js',
  'objects/dist/objects/object-list.js',
  'objects/dist/objects/tar-input-stream.js',
  'scope.network/dist/http/http.js',
  'objects/dist/objects/rust-object-inventory.js',
  'objects/dist/objects/rust-object-reader.js',
  'objects/dist/objects/rust-object-directory.js',
  'objects/dist/objects/rust-object-discovery.js',
  'objects/dist/objects/rust-object-package.js',
  'objects/dist/objects/rust-object-operation.js',
  'objects/dist/objects/scope-index.js',
  'objects/dist/index.js',
  'objects/dist/models/version-history.js',
  'objects/dist/models/lane-history.js',
  'objects/dist/models/detach-heads.js',
  'legacy.scope/dist/component-ops/scope-components-importer.js',
  'legacy.scope/dist/component-ops/model-components-merger.js',
  'legacy.scope/dist/component-ops/multiple-component-merger.js',
  'scope/dist/scope.main.runtime.js',
];
const provenance = {
  schemaVersion: 1,
  installedRevision: previous.revision,
  integrationRevision: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  version: previous.version,
  rerouted,
  sourceSha256: Object.fromEntries(files.map((file) => [file, hash(path.join(target, file))])),
  compiledModules: modules.map((file) => ({
    path: file,
    sha256: hash(path.join(target, 'node_modules/@teambit', file)),
  })),
};
fs.writeFileSync(path.join(target, '.bit-object-import-build.json'), JSON.stringify(provenance, null, 2));
console.log(target);
