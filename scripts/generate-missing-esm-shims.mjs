#!/usr/bin/env node
// Walks every `@teambit/*` package in `node_modules` and creates a synthetic
// `dist/esm.mjs` shim for the ones whose package.json declares
// `exports.import: "./dist/esm.mjs"` but ships no such file.
//
// The Bit per-package compile pipeline ships an `esm.mjs` shim alongside
// `dist/index.js` for component packages that opt into ESM consumption.
// For ~75 workspace components the shim never made it to disk, which means
// Node's ESM resolver fails the moment anything tries to
// `import '@teambit/foo'` from an ESM context (e.g. the rollup bundle when
// emitted as ESM).
//
// This is a runtime-only band-aid: it generates the file inside
// `node_modules/@teambit/<pkg>/dist/esm.mjs`. The proper fix is in the
// Bit package.json generator (omit `exports.import` when the shim is
// missing) and the per-component `esm.mjs` source file, both out of scope
// here.
//
// Usage: node scripts/generate-missing-esm-shims.mjs

import { readdirSync, statSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(HERE);
const TEAMBIT_DIR = join(REPO_ROOT, 'node_modules/@teambit');

function* eachTeambitPkg() {
  for (const ent of readdirSync(TEAMBIT_DIR)) {
    const p = join(TEAMBIT_DIR, ent);
    try {
      if (statSync(p).isDirectory()) yield p;
    } catch {}
  }
}

function resolveImportEntry(pkg) {
  // Handles three common shapes:
  //   "exports": { ".": { "import": "..." } }
  //   "exports": { ".": { "node": { "import": "..." } } }
  //   "exports": { "node": { "import": "..." } }
  const root = pkg.exports;
  if (!root) return null;
  const dot = root['.'];
  if (dot?.import) return dot.import;
  if (dot?.node?.import) return dot.node.import;
  if (root.node?.import) return root.node.import;
  if (root.import) return root.import;
  return null;
}

function resolveRequireEntry(pkg) {
  const root = pkg.exports;
  const dot = root?.['.'];
  return (
    dot?.require ??
    dot?.node?.require ??
    root?.node?.require ??
    root?.require ??
    pkg.main ??
    'dist/index.js'
  );
}

// Detect which named exports a CJS bundle exposes by lexing
// `Object.defineProperty(exports, 'NAME', ...)` / `exports.NAME = ...` /
// `module.exports.NAME = ...`. Conservative but correct for the
// babel-emitted dist files Bit produces.
function detectCjsNamedExports(distIndexJs) {
  const names = new Set();
  const src = readFileSync(distIndexJs, 'utf8');
  const patterns = [
    /Object\.defineProperty\(\s*exports\s*,\s*['"]([A-Za-z_$][\w$]*)['"]/g,
    /exports\.([A-Za-z_$][\w$]*)\s*=/g,
    /module\.exports\.([A-Za-z_$][\w$]*)\s*=/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      if (m[1] === 'default') continue;
      if (m[1] === '__esModule') continue;
      names.add(m[1]);
    }
  }
  return [...names].sort();
}

function makeShim(names, cjsBasename) {
  const lines = [
    '// AUTO-GENERATED — synthetic ESM shim for a CJS dist.',
    '// Created by scripts/generate-missing-esm-shims.mjs because the',
    "// owning component's package.json declares `exports.import`",
    '// but no `esm.mjs` was emitted by the compile pipeline.',
    `import cjsModule from './${cjsBasename}';`,
    '',
  ];
  for (const n of names) lines.push(`export const ${n} = cjsModule.${n};`);
  lines.push('');
  lines.push('export default cjsModule;');
  lines.push('');
  return lines.join('\n');
}

let created = 0;
let skipped_existing = 0;
let skipped_no_index = 0;
let skipped_no_import = 0;
const created_pkgs = [];
for (const pkgDir of eachTeambitPkg()) {
  const pkgJsonP = join(pkgDir, 'package.json');
  if (!existsSync(pkgJsonP)) continue;
  let pkg;
  try { pkg = JSON.parse(readFileSync(pkgJsonP, 'utf8')); } catch { continue; }
  const importEntry = resolveImportEntry(pkg);
  if (!importEntry) { skipped_no_import++; continue; }
  const importPath = join(pkgDir, importEntry);
  if (existsSync(importPath)) { skipped_existing++; continue; }
  const requireEntry = resolveRequireEntry(pkg);
  const distCjs = join(pkgDir, requireEntry);
  if (!existsSync(distCjs)) { skipped_no_index++; continue; }
  const names = detectCjsNamedExports(distCjs);
  // The shim sits in the same `dist/` dir as the CJS file, so import by
  // basename (e.g. `./constants.js` for `dist/constants.js`).
  const cjsBasename = requireEntry.split('/').pop();
  const code = makeShim(names, cjsBasename);
  mkdirSync(dirname(importPath), { recursive: true });
  writeFileSync(importPath, code);
  created++;
  created_pkgs.push(pkg.name);
}

console.log(`created:                            ${created}`);
console.log(`skipped (already had esm.mjs):      ${skipped_existing}`);
console.log(`skipped (no dist/index.js):         ${skipped_no_index}`);
console.log(`skipped (no exports.import):        ${skipped_no_import}`);
if (created > 0) {
  console.log('\nfirst 10 created:');
  for (const n of created_pkgs.slice(0, 10)) console.log(`  ${n}`);
  if (created_pkgs.length > 10) console.log(`  ... and ${created_pkgs.length - 10} more`);
}
