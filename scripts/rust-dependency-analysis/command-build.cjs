#!/usr/bin/env node
// Isolated standard Bit build; authentication is inherited, never printed or copied.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
assert.equal(process.argv.length, 4, 'usage: command-build.cjs <installed-checkout> <new-private-directory>');
const source = path.resolve(__dirname, '../..');
const installed = path.resolve(process.argv[2]);
const target = path.resolve(process.argv[3]);
assert.ok(
  [os.tmpdir(), '/tmp'].some((directory) => target.startsWith(directory + path.sep)),
  'target must be disposable under tmp'
);
assert.ok(!fs.existsSync(target), 'target must not already exist');
assert.equal(
  fs.realpathSync(path.dirname(target)),
  path.dirname(target),
  'target parent must not alias another directory'
);
assert.ok(!target.startsWith(installed + path.sep) && !target.startsWith(source + path.sep));
const load = createRequire(path.join(installed, 'package.json'));
const bitmap = load('comment-json').parse(fs.readFileSync(path.join(source, '.bitmap'), 'utf8'));
const components = Object.values(bitmap).filter(
  (component) => component.rootDir && component.scope && component.version
);
const ids = components.map((component) => `${component.scope}/${component.name}@${component.version}`);
const version = components.find((component) => component.rootDir === 'scopes/harmony/bit').version;
const revision = cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const archive = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-cli-build-'));
fs.mkdirSync(target);
function execute(args, output) {
  const descriptor = fs.openSync(path.join(target, output), 'w');
  try {
    cp.execFileSync(process.execPath, ['bin/bit.js', ...args], {
      cwd: target,
      stdio: ['ignore', descriptor, 'inherit'],
    });
  } finally {
    fs.closeSync(descriptor);
  }
}
try {
  const tar = path.join(archive, 'source.tar');
  cp.execFileSync('git', ['archive', '--format=tar', `--output=${tar}`, revision], { cwd: source });
  cp.execFileSync('tar', ['-xf', tar, '-C', target]);
  // cp preserves links within the private copy but never hardlinks into installed outputs.
  cp.execFileSync('cp', ['-a', path.join(installed, 'node_modules'), path.join(target, 'node_modules')]);
  let rerouted = 0;
  let copiedExternal = 0;
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const link = fs.readlinkSync(filename);
        if (link.startsWith(installed + path.sep)) {
          fs.unlinkSync(filename);
          fs.symlinkSync(target + link.slice(installed.length), filename);
          rerouted++;
        } else if (!path.resolve(path.dirname(filename), link).startsWith(target + path.sep)) {
          // Links leaving the checkout (e.g. a relative link into a global Bit install) would
          // make the private build read shared state; snapshot their current contents instead.
          let external;
          try {
            external = fs.realpathSync(path.join(installed, path.relative(target, filename)));
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            continue; // Dangling in the installed checkout too; checkLinks reports it if it escapes.
          }
          fs.unlinkSync(filename);
          fs.cpSync(external, filename, { recursive: true, dereference: true });
          copiedExternal++;
        }
      } else if (entry.isDirectory()) visit(filename);
    }
  };
  visit(path.join(target, 'node_modules'));
  let prunedBrokenExternalLinks = 0;
  const checkLinks = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        let resolved;
        let missing = false;
        try {
          resolved = fs.realpathSync(filename);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          missing = true;
          resolved = path.resolve(path.dirname(filename), fs.readlinkSync(filename));
        }
        if (resolved !== target && !resolved.startsWith(target + path.sep)) {
          // Live external links were copied above. What remains here was already dangling in
          // the installed checkout and cannot be copied: remove that private alias. A live
          // external link reaching this point would be a bug, so it still fails.
          assert.ok(missing, `external private-build link: ${filename}`);
          fs.unlinkSync(filename);
          prunedBrokenExternalLinks++;
        }
      } else if (entry.isDirectory()) checkLinks(filename);
    }
  };
  checkLinks(path.join(target, 'node_modules'));
  cp.execFileSync('git', ['init', '-q'], { cwd: target });
  const common = cp.execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: installed, encoding: 'utf8' }).trim();
  const scope = path.join(path.resolve(installed, common), 'bit');
  const privateScope = path.join(target, '.git/bit');
  fs.mkdirSync(privateScope, { recursive: true });
  for (const entry of ['objects', 'components', 'refs', 'index.json', 'scope.json']) {
    const existing = path.join(scope, entry);
    if (fs.existsSync(existing))
      fs.cpSync(existing, path.join(privateScope, entry), { recursive: true, preserveTimestamps: true });
  }
  // Retain the exact successful bootstrap sequence; no source checkout or installs occur.
  execute(
    [
      'import',
      'teambit.dependencies/dependencies@' +
        components.find((c) => c.rootDir === 'scopes/dependencies/dependencies').version,
      '--objects',
      '--skip-dependency-installation',
      '--fetch-deps',
      '--json',
      '--safe-mode',
    ],
    '.bit-rust-import-dependencies.json'
  );
  execute(['compile', 'dependencies', '--json', '--safe-mode'], '.bit-rust-compile-dependencies.json');
  execute(
    ['import', ...ids, '--objects', '--skip-dependency-installation', '--fetch-deps', '--json', '--safe-mode'],
    '.bit-rust-import-all.json'
  );
  const imports = JSON.parse(fs.readFileSync(path.join(target, '.bit-rust-import-all.json'), 'utf8'));
  assert.equal(imports.missingIds.length, 0);
  execute(['compile', ...ids, '--json', '--safe-mode'], '.bit-rust-compile-all.json');
  const compiled = JSON.parse(fs.readFileSync(path.join(target, '.bit-rust-compile-all.json'), 'utf8'));
  assert.equal(compiled.length, components.length);
  assert.ok(compiled.every((component) => component.errors.length === 0));
  assert.ok(
    compiled.every((component) =>
      component.buildResults.every((file) => fs.realpathSync(file).startsWith(target + path.sep))
    )
  );
  const actual = cp
    .execFileSync(process.execPath, ['bin/bit.js', '--version'], { cwd: target, encoding: 'utf8' })
    .trim();
  assert.equal(actual, version);
  const modules = [
    'bit/dist/app.js',
    'bit/dist/run-bit.js',
    'dependencies/dist/files-dependency-builder/generate-tree-madge.js',
    'dependencies/dist/files-dependency-builder/rust-scanner/scope.js',
    'legacy.consumer-component/dist/component-loader.js',
  ];
  const provenance = {
    revision,
    version,
    sourceBitmapSha256: hash(path.join(target, '.bitmap')),
    components: compiled.map((component) => component.component),
    componentCount: compiled.length,
    outputCount: compiled.reduce((n, component) => n + component.buildResults.length, 0),
    reroutedLinks: rerouted,
    copiedExternalLinks: copiedExternal,
    prunedBrokenExternalLinks,
    compileResultSha256: hash(path.join(target, '.bit-rust-compile-all.json')),
    compiledModules: modules.map((file) => ({
      path: file,
      sha256: hash(path.join(target, 'node_modules/@teambit', file)),
    })),
    bootstrap: 'installed CLI used only to import pinned objects and compile snapshot source',
    dependencySource: 'private copied installed node_modules with rerouted workspace links',
  };
  fs.writeFileSync(path.join(target, '.bit-rust-private-build.json'), JSON.stringify(provenance, null, 2) + '\n');
  console.log(
    `Built ${actual} from ${revision}; ${compiled.length} components, zero compile errors; private directory ${target}`
  );
} finally {
  fs.rmSync(archive, { recursive: true, force: true });
}
