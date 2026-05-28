'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Native CJS so Babel's modules-commonjs transform leaves the import() alone;
// @pnpm/releasing.commands is ESM-only and must go through Node's ESM loader.
//
// We import the internal pack.js by absolute path instead of going through the
// package's index.js. The index.js re-exports `deploy`, whose dependency chain
// reaches @pnpm/installing.commands/lib/import/index.js — that file does
// `import { parse } from '@yarnpkg/lockfile'`, which fails at ESM evaluation
// because @yarnpkg/lockfile is a webpack-bundled CJS module that doesn't expose
// statically-detectable named exports. pack.js itself doesn't import any of
// that subtree, so loading it directly avoids the failure.
//
// The package's `exports` field only allows the `.` subpath, so we resolve the
// main entry first and then jump sideways to pack.js inside the same lib dir.
exports.loadPack = async () => {
  const indexPath = require.resolve('@pnpm/releasing.commands');
  const packModulePath = path.join(path.dirname(indexPath), 'publish/pack.js');
  return import(pathToFileURL(packModulePath).href);
};
