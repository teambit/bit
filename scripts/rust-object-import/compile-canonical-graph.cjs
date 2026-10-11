// Resolve BVM's Windows linked package entry; its command shim lives outside the POSIX bin directory.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const windows = process.platform === 'win32';
const executable = windows ? process.execPath : 'bbit';
const prefix = windows
  ? [path.join(process.env.LOCALAPPDATA, '.bvm', 'links', 'bbit', 'node_modules', '@teambit', 'bit', 'bin', 'bit')]
  : [];
if (windows && !fs.statSync(prefix[0]).isFile()) throw new Error('missing BVM canonical Bit CLI');
for (const args of [
  ['config', 'set', 'analytics_reporting', 'false'],
  ['config', 'set', 'error_reporting', 'false'],
  ['config', 'set', 'registry', 'https://node-registry.bit.cloud'],
  ['init'],
  ['install'],
  [
    'compile',
    'teambit.legacy/scope',
    'teambit.scope/objects',
    'teambit.scope/network',
    'teambit.scope/scope',
    'teambit.component/sources',
    'teambit.component/component-writer',
    'teambit.scope/importer',
    'teambit.component/checkout',
    'teambit.legacy/consumer',
    'teambit.legacy/consumer-component',
    'teambit.legacy/bit-map',
    'teambit.legacy/component-diff',
    'teambit.component/status',
    'teambit.component/component-compare',
    'teambit.workspace/workspace',
    'teambit.component/snapping',
    'teambit.component/snap-distance',
    'teambit.component/modules/merge-helper',
    'teambit.component/merging',
    'teambit.lanes/merge-lanes',
    'teambit.harmony/modules/in-memory-cache',
    'teambit.workspace/config-merger',
    'teambit.scope/export',
    'teambit.legacy/scope-api',
    'teambit.legacy/extension-data',
    'teambit.legacy/logger',
  ],
])
  cp.execFileSync(executable, [...prefix, ...args], { stdio: 'inherit' });
