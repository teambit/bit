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
  ],
])
  cp.execFileSync(executable, [...prefix, ...args], { stdio: 'inherit' });
