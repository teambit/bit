#!/usr/bin/env node
// Post-compile sweep: for every `dist/**/*.js` file under
// `node_modules/@teambit/*`, find relative imports like `./foo.js` where
// `./foo.js` doesn't exist but `./foo/index.js` does, and rewrite to
// `./foo/index.js`.
//
// Why this is separate from `fix-bare-esm-imports.mjs`: the inline babel
// plugin (`bvm-patches/apply.mjs --esm`) blindly appends `.js` to every
// extension-less relative specifier. It can't tell file from directory
// because bit strips the source path from the filename it hands babel.
// This script has real filesystem access to the emitted dist tree, so it
// can fix the directory cases the plugin couldn't.
//
// Idempotent — re-runs are no-ops because already-correct imports stay.

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(HERE, '..', '..');
const ROOT = join(WORKSPACE_ROOT, 'node_modules', '@teambit');
const DRY_RUN = process.argv.includes('--dry-run');

let scanned = 0;
let patched = 0;
let rewrites = 0;

function isEsmFile(content) {
  return /^\s*(export|import)\b/m.test(content);
}

function patchFile(filePath) {
  scanned++;
  const src = readFileSync(filePath, 'utf8');
  if (!isEsmFile(src)) return;
  const fileDir = dirname(filePath);
  let out = src;
  let localRewrites = 0;

  function rewriteSpec(spec) {
    if (!/^\.{1,2}\//.test(spec)) return null;
    if (!spec.endsWith('.js')) return null;
    const baseAbs = resolve(fileDir, spec);
    if (existsSync(baseAbs)) return null; // file IS the right answer
    // The plugin wrote `./foo.js` but it's actually a directory. Check.
    const withoutExt = baseAbs.slice(0, -3); // strip ".js"
    if (existsSync(join(withoutExt, 'index.js'))) {
      return spec.slice(0, -3) + '/index.js';
    }
    return null;
  }

  const lineRe = /^([ \t]*(?:export|import)\b[^'"\n]*?\bfrom\s*)(['"])([^'"]+)\2/gm;
  out = out.replace(lineRe, (m, lead, q, spec) => {
    const next = rewriteSpec(spec);
    if (!next) return m;
    localRewrites++;
    return `${lead}${q}${next}${q}`;
  });
  const dynRe = /\bimport\(\s*(['"])([^'"]+)\1\s*\)/g;
  out = out.replace(dynRe, (m, q, spec) => {
    const next = rewriteSpec(spec);
    if (!next) return m;
    localRewrites++;
    return `import(${q}${next}${q})`;
  });

  if (localRewrites > 0) {
    if (!DRY_RUN) writeFileSync(filePath, out);
    patched++;
    rewrites += localRewrites;
  }
}

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    if (entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      patchFile(full);
    }
  }
}

if (!existsSync(ROOT)) {
  console.error(`[fix-dir-imports] not found: ${ROOT}`);
  process.exit(1);
}

for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
  if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
  const distDir = join(ROOT, entry.name, 'dist');
  if (existsSync(distDir)) walk(distDir);
}

const pnpmRoot = join(WORKSPACE_ROOT, 'node_modules', '.pnpm');
if (existsSync(pnpmRoot)) {
  for (const key of readdirSync(pnpmRoot, { withFileTypes: true })) {
    if (!key.isDirectory() || !key.name.startsWith('@teambit+')) continue;
    const inner = join(pnpmRoot, key.name, 'node_modules', '@teambit');
    if (!existsSync(inner)) continue;
    for (const sub of readdirSync(inner, { withFileTypes: true })) {
      if (!sub.isDirectory() || sub.isSymbolicLink()) continue;
      const distDir = join(inner, sub.name, 'dist');
      if (existsSync(distDir)) walk(distDir);
    }
  }
}

console.log(`[fix-dir-imports] scanned ${scanned} files`);
console.log(`[fix-dir-imports] rewrote ${rewrites} specifiers across ${patched} files${DRY_RUN ? ' [dry-run]' : ''}`);
