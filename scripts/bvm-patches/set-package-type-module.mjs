#!/usr/bin/env node
// Stamps `"type": "module"` into every `node_modules/@teambit/<pkg>/package.json`
// whose dist actually emits ESM (i.e. contains top-level `import` / `export`
// keywords in any of its `dist/**/*.js` files).
//
// Step 2 of the ESM source migration (docs/migration/09-esm-source-migration.md).
// Bit's package-json generator currently hardcodes a CJS-shaped package.json
// (`"main": "dist/index.js"`, no `"type"` field). Without `"type": "module"`,
// Node parses `.js` files as CJS regardless of whether they contain `import`
// keywords — breaking every ESM consumer of those packages.
//
// This script is the temporary band-aid while we wait for the package-json
// generator to be updated. It's idempotent (re-runs are no-ops) and reversible
// (.bak file).
//
// Usage:
//   node scripts/bvm-patches/set-package-type-module.mjs [--dry-run]

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(HERE, '..', '..');
const ROOT = join(WORKSPACE_ROOT, 'node_modules', '@teambit');
const DRY_RUN = process.argv.includes('--dry-run');

let scanned = 0;
let stamped = 0;
let skippedCjs = 0;

function fileLooksEsm(filePath) {
  try {
    const src = readFileSync(filePath, 'utf8');
    return /^\s*(export|import)\b/m.test(src);
  } catch {
    return false;
  }
}

function mainEntryIsEsm(pkgDir, pkg) {
  // Probe the *CJS* entry (`require` / `main`) rather than `import`. The
  // `import` entry is often a dedicated `esm.mjs` shim that re-exports
  // from a CJS index — looking ESM regardless of the underlying package's
  // module shape. The `require` entry tells us what consumers without
  // ESM-shim plumbing actually load, which is what determines whether
  // `"type": "module"` is safe to set on the package.
  const candidates = [];
  const dot = pkg.exports?.['.'];
  if (dot?.require) candidates.push(dot.require);
  if (dot?.node?.require) candidates.push(dot.node.require);
  if (pkg.exports?.node?.require) candidates.push(pkg.exports.node.require);
  if (pkg.exports?.require) candidates.push(pkg.exports.require);
  if (pkg.main) candidates.push(pkg.main);
  candidates.push('dist/index.js');
  for (const rel of candidates) {
    const abs = join(pkgDir, rel);
    if (!existsSync(abs)) continue;
    return fileLooksEsm(abs);
  }
  return false;
}

function processPackage(pkgDir) {
  const pkgJsonP = join(pkgDir, 'package.json');
  if (!existsSync(pkgJsonP)) return;
  scanned++;
  let pkg;
  try { pkg = JSON.parse(readFileSync(pkgJsonP, 'utf8')); } catch { return; }
  if (pkg.type === 'module') return; // already stamped
  if (!mainEntryIsEsm(pkgDir, pkg)) { skippedCjs++; return; }
  if (!DRY_RUN) {
    const backup = `${pkgJsonP}.pre-type-module.bak`;
    if (!existsSync(backup)) copyFileSync(pkgJsonP, backup);
    pkg.type = 'module';
    // Re-point `exports.import` away from the now-broken `esm.mjs` shim.
    // Those shims look like `import cjsModule from './index.js'; export const
    // X = cjsModule.X;` — they were valid when `index.js` was CJS, but now
    // `index.js` is itself ESM with named exports and no default, so the
    // shim fails to load. Pointing at the dist file the shim was wrapping
    // gives the direct, working ESM entry point.
    const normalize = (p) => (p && !p.startsWith('./') ? `./${p}` : p);
    const rawRequire = pkg.exports?.['.']?.require ?? pkg.main ?? 'dist/index.js';
    const requireEntry = normalize(rawRequire);
    if (pkg.exports?.['.']?.import) pkg.exports['.'].import = requireEntry;
    if (pkg.exports?.['.']?.node?.import) pkg.exports['.'].node.import = requireEntry;
    if (pkg.exports?.node?.import) pkg.exports.node.import = normalize(pkg.exports.node.require) ?? requireEntry;
    if (pkg.exports?.import) pkg.exports.import = normalize(pkg.exports.require) ?? requireEntry;
    writeFileSync(pkgJsonP, JSON.stringify(pkg, null, 2));
  }
  stamped++;
}

if (!existsSync(ROOT)) {
  console.error(`[type-module] not found: ${ROOT}`);
  process.exit(1);
}

for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
  if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
  processPackage(join(ROOT, entry.name));
}

// Same sweep for the pnpm .pnpm/<key>/node_modules/@teambit/* copies so
// Node sees the patched flag regardless of which path resolution takes.
const pnpmRoot = join(WORKSPACE_ROOT, 'node_modules', '.pnpm');
if (existsSync(pnpmRoot)) {
  for (const key of readdirSync(pnpmRoot, { withFileTypes: true })) {
    if (!key.isDirectory() || !key.name.startsWith('@teambit+')) continue;
    const inner = join(pnpmRoot, key.name, 'node_modules', '@teambit');
    if (!existsSync(inner)) continue;
    for (const sub of readdirSync(inner, { withFileTypes: true })) {
      if (!sub.isDirectory() || sub.isSymbolicLink()) continue;
      processPackage(join(inner, sub.name));
    }
  }
}

console.log(`[type-module] scanned ${scanned} package.json files`);
console.log(`[type-module] stamped ${stamped} with "type": "module"${DRY_RUN ? ' [dry-run]' : ''}`);
console.log(`[type-module] left ${skippedCjs} CJS-shaped packages alone`);
