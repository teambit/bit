#!/usr/bin/env node
// A real, local-only Bit workspace; setup is excluded from measurements.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
assert.equal(process.argv.length, 4, 'usage: install-fixture.cjs <private-cli> <new-fixture-root>');
const cli = path.resolve(process.argv[2]);
const root = path.resolve(process.argv[3]);
assert.ok([os.tmpdir(), '/tmp'].some((parent) => root.startsWith(parent + path.sep)));
assert.equal(fs.realpathSync(path.dirname(root)), path.dirname(root));
assert.ok(!fs.existsSync(root), 'fixture root must not exist');
assert.ok(fs.existsSync(path.join(cli, '.bit-rust-private-build.json')), 'CLI requires private build provenance');
fs.mkdirSync(root);
fs.mkdirSync(path.join(root, '.globals/config'), { recursive: true });
fs.writeFileSync(
  path.join(root, '.globals/config/config.json'),
  JSON.stringify({ analytics_reporting: 'false', error_reporting: 'false', anonymous_reporting: 'false' })
);
function bit(args) {
  cp.execFileSync('unshare', ['-Urn', process.execPath, path.join(cli, 'bin/bit.js'), ...args], {
    cwd: root,
    env: {
      ...process.env,
      BIT_ENABLE_GLOBAL_VIRTUAL_STORE: 'false',
      BIT_GLOBALS_DIR: path.join(root, '.globals'),
      NODE_COMPILE_CACHE: path.join(root, '.node-compile-cache'),
    },
    stdio: 'pipe',
    timeout: 60_000,
  });
}
bit(['init', '--no-package-json']);
assert.ok(fs.existsSync(path.join(root, '.bitmap')), 'real init must complete, not exit at a prompt');
fs.writeFileSync(
  path.join(root, 'workspace.jsonc'),
  JSON.stringify(
    {
      'teambit.workspace/workspace': {
        name: 'rust-install-fixture',
        defaultScope: 'validation.local',
        resolveAspectsFromNodeModules: true,
        resolveEnvsFromRoots: true,
      },
      'teambit.dependencies/dependency-resolver': {
        allowScripts: {},
        overrides: {
          react: `link:${path.join(cli, 'node_modules/react')}`,
          'react-dom': `link:${path.join(cli, 'node_modules/react-dom')}`,
        },
        rootComponents: true,
        policy: {
          dependencies: {
            react: `link:${path.join(cli, 'node_modules/react')}`,
            'react-dom': `link:${path.join(cli, 'node_modules/react-dom')}`,
          },
          peerDependencies: {},
        },
      },
      'teambit.workspace/workspace-config-files': { enableWorkspaceConfigWrite: false },
      'teambit.workspace/variants': {
        '*': {
          'teambit.dependencies/dependency-resolver': {
            policy: { devDependencies: { '@types/jest': '-', '@types/node': '-' } },
          },
          'teambit.pkg/pkg': { packageJson: { main: 'index.js' } },
        },
      },
    },
    null,
    2
  ) + '\n'
);
fs.writeFileSync(
  path.join(root, 'package.json'),
  JSON.stringify({ name: 'rust-install-fixture', version: '1.0.0', private: true }, null, 2) + '\n'
);
const components = 4;
const filesPerComponent = 16;
for (let component = 0; component < components; component++) {
  const directory = path.join(root, `source-${component}`);
  fs.mkdirSync(directory);
  for (let file = 1; file < filesPerComponent; file++) {
    const next =
      file + 1 < filesPerComponent ? `import { value as next } from './file-${file + 1}.js';\n` : 'const next = 0;\n';
    fs.writeFileSync(path.join(directory, `file-${file}.js`), `${next}export const value = next + ${file};\n`);
  }
  const peer = component
    ? `import { value as peer } from '@validation/local.source-${component - 1}';\n`
    : 'const peer = 0;\n';
  fs.writeFileSync(
    path.join(directory, 'index.js'),
    `import { value as child } from './file-1.js';\n${peer}export const value = child + peer;\n`
  );
  bit(['add', `source-${component}`, '--id', `source-${component}`]);
}
bit(['link']);
const bitmap = require(path.join(cli, 'node_modules/comment-json')).parse(
  fs.readFileSync(path.join(root, '.bitmap'), 'utf8')
);
assert.equal(
  Object.values(bitmap).filter((entry) => entry?.rootDir).length,
  components,
  'real add must track every component'
);
const sources = {};
for (let component = 0; component < components; component++) {
  const directory = path.join(root, `source-${component}`);
  for (const file of fs.readdirSync(directory).sort()) {
    const relative = `source-${component}/${file}`;
    sources[relative] = createHash('sha256')
      .update(fs.readFileSync(path.join(root, relative)))
      .digest('hex');
  }
}
fs.writeFileSync(
  path.join(root, '.rust-install-fixture.json'),
  JSON.stringify(
    {
      schemaVersion: 1,
      cliRevision: JSON.parse(fs.readFileSync(path.join(cli, '.bit-rust-private-build.json'))).revision,
      components,
      componentCount: components,
      filesPerComponent,
      sources,
      externalRegistryDependencies: 0,
      localRuntimePackageLinks: ['react', 'react-dom'],
      unusedEnvironmentTypePackagesRemovedBySupportedPolicy: ['@types/jest', '@types/node'],
      setup: 'real bit init + bit add + bit link in unshare -Urn; no package installation',
    },
    null,
    2
  ) + '\n'
);
process.stdout.write(root + '\n');
