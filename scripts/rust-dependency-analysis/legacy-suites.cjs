#!/usr/bin/env node
// Run the existing suites against checkout source, with an isolated test temp root.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const installedRoot = process.env.BIT_LEGACY_ROOT || path.resolve(__dirname, '../..');
const installed = Module.createRequire(path.join(installedRoot, 'package.json'));
const ts = installed('typescript');
const Mocha = installed('mocha');
const root = path.resolve(__dirname, '../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-rust-legacy-suites-'));
const load = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@teambit/defender.fs.global-bit-temp-dir') {
    return { BIT_TEMP_ROOT: temporary, globalBitTempDir: () => fs.mkdtempSync(path.join(temporary, 'test-')) };
  }
  return load.apply(this, arguments);
};
require.extensions['.ts'] = (target, filename) => {
  target.paths = [...Module._nodeModulePaths(installedRoot), ...target.paths];
  target._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      fileName: filename,
    }).outputText,
    filename
  );
};
const mocha = new Mocha({ timeout: 10000 });
const builder = 'scopes/dependencies/dependencies/files-dependency-builder';
for (const file of [
  `${builder}/precinct/index.spec.ts`,
  `${builder}/dependency-tree/index.spec.ts`,
  `${builder}/filing-cabinet/index.spec.ts`,
  `${builder}/build-tree.spec.ts`,
  'components/legacy/consumer-component/component-loader.spec.ts',
])
  mocha.addFile(path.join(root, file));
try {
  mocha.run((failures) => {
    fs.rmSync(temporary, { recursive: true, force: true });
    process.exitCode = failures ? 1 : 0;
  });
} catch (error) {
  fs.rmSync(temporary, { recursive: true, force: true });
  throw error;
}
