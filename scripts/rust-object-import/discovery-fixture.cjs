// Compile only the standalone coordinators; no Bit installation is needed for these unit tests.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createRequire } = require('node:module');
const { root, installed } = require('./load-source.cjs');
const ts = installed('typescript');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bit object installation λ '));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const moduleDirectory = path.join(directory, 'node_modules/@teambit/objects/dist/objects');
  const legacyDirectory = path.join(directory, 'node_modules/@teambit/legacy.scope/dist/objects-fetcher');
  const networkDirectory = path.join(directory, 'node_modules/@teambit/scope.network/dist/http');
  fs.mkdirSync(moduleDirectory, { recursive: true });
  fs.mkdirSync(legacyDirectory, { recursive: true });
  fs.mkdirSync(networkDirectory, { recursive: true });
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  write(path.join(directory, 'package.json'), '{}');
  for (const name of ['objects', 'legacy.scope', 'scope.network'])
    write(
      path.join(directory, 'node_modules/@teambit', name, 'package.json'),
      JSON.stringify({ main: 'dist/index.js' })
    );
  const compile = (source, destination) =>
    write(
      destination,
      ts.transpileModule(fs.readFileSync(path.join(root, source), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
        fileName: source,
      }).outputText
    );
  compile('scopes/scope/objects/objects/rust-object-package.ts', path.join(moduleDirectory, 'rust-object-package.js'));
  const load = createRequire(path.join(directory, 'package.json'));
  const contract = load(path.join(moduleDirectory, 'rust-object-package.js'));
  for (const [base, files] of [
    [moduleDirectory, contract.OBJECT_IMPORT_RUNTIME_MODULES],
    [legacyDirectory, contract.OBJECT_IMPORT_LEGACY_MODULES],
    [networkDirectory, contract.OBJECT_IMPORT_NETWORK_MODULES],
  ])
    for (const name of files)
      if (!fs.existsSync(path.join(base, name))) write(path.join(base, name), 'module.exports = {};\n');
  write(path.join(legacyDirectory, '../index.js'), 'module.exports = {};\n');
  write(path.join(networkDirectory, '../index.js'), 'module.exports = {};\n');
  for (const name of ['discovery', 'inventory', 'reader', 'directory', 'operation'])
    compile(
      `scopes/scope/objects/objects/rust-object-${name}.ts`,
      path.join(moduleDirectory, `rust-object-${name}.js`)
    );
  for (const name of ['rust-source-validator', 'rust-object-importer', 'rust-import-transport'])
    compile(`components/legacy/scope/objects-fetcher/${name}.ts`, path.join(legacyDirectory, `${name}.js`));
  const previousAddon = process.env.BIT_TEST_WORKSPACE_ADDON;
  // Test the child transport here; addon discovery executes separately in a disposable process.
  process.env.BIT_TEST_WORKSPACE_ADDON = 'off';
  t.after(() => {
    if (previousAddon === undefined) delete process.env.BIT_TEST_WORKSPACE_ADDON;
    else process.env.BIT_TEST_WORKSPACE_ADDON = previousAddon;
  });
  const previous = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_OBJECT_IMPORT = 'packaged';
  t.after(() => {
    if (previous === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = previous;
  });
  const resolve = load(path.join(moduleDirectory, 'rust-object-discovery.js')).resolveRustObjectImportExecutable;
  return { directory, moduleDirectory, legacyDirectory, networkDirectory, resolve, load, contract, compile };
}
module.exports = { fixture };
