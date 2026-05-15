#!/usr/bin/env node
// Codemod: add `.js` extensions to relative ESM imports/exports in
// `@teambit/**/dist/**/*.js` files that ship as ESM-syntax (`export`/`import`
// keywords) without explicit extensions.
//
// Why this exists: many upstream Teambit-Cloud UI packages were published
// with `export { X } from './foo'` (bare specifier) in their `dist/index.js`.
// While babel-lazy was deferring our compiled requires, the broken packages
// were never reached at module-load time. Without babel-lazy, every eager
// require chain hits these packages and Node's ESM resolver rejects the
// bare specifier with `ERR_MODULE_NOT_FOUND`.
//
// This script does a single mechanical sweep: for every `dist/**/*.js` under
// `node_modules/@teambit/<X>/`, if the file contains `export`/`import` at
// the top level (i.e., it's actually ESM), append `.js` to relative
// specifiers that don't already have an extension. Idempotent — re-runs are
// no-ops because all the imports now have extensions.
//
// Usage:
//   node scripts/bvm-patches/fix-bare-esm-imports.mjs
//   node scripts/bvm-patches/fix-bare-esm-imports.mjs --dry-run

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(HERE, '..', '..');
const ROOT = join(WORKSPACE_ROOT, 'node_modules', '@teambit');
const DRY_RUN = process.argv.includes('--dry-run');

let scanned = 0;
let patched = 0;
let extensionsAdded = 0;

function isEsmFile(content) {
  // Heuristic: ESM if file has top-level `export` or `import` keyword.
  // Avoid matching string contents — but for a quick sweep this is fine.
  return /^\s*(export|import)\b/m.test(content);
}

function looksLikeRelative(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

function hasExtension(specifier) {
  const last = specifier.split('/').pop();
  return /\.[a-zA-Z0-9]+$/.test(last ?? '');
}

function resolveRelativeTarget(fileDir, specifier) {
  // For `./foo`, try ./foo.js, ./foo/index.js. Pick whichever exists.
  const baseAbs = resolve(fileDir, specifier);
  const candidates = [`${baseAbs}.js`, `${baseAbs}.mjs`, `${baseAbs}.cjs`, join(baseAbs, 'index.js')];
  for (const c of candidates) {
    if (existsSync(c)) {
      if (c.endsWith('index.js')) return `${specifier}/index.js`;
      const ext = c.slice(c.lastIndexOf('.'));
      return `${specifier}${ext}`;
    }
  }
  return null;
}

// Split `react/jsx-runtime` → `react` + `jsx-runtime`. Returns null for bare
// package specifiers (`react`) and scoped no-subpath (`@x/y`).
function splitPackageSpec(specifier) {
  if (specifier.startsWith('@')) {
    // `@scope/pkg/sub/path` → pkg = `@scope/pkg`, sub = `sub/path`
    const parts = specifier.split('/');
    if (parts.length < 3) return null;
    return { pkg: `${parts[0]}/${parts[1]}`, sub: parts.slice(2).join('/') };
  }
  const idx = specifier.indexOf('/');
  if (idx === -1) return null;
  return { pkg: specifier.slice(0, idx), sub: specifier.slice(idx + 1) };
}

// Walk up from `fileDir` looking for `node_modules/<pkg>/<sub>` and try .js
// variants. Returns the new specifier (or null).
function resolvePackageSubpath(fileDir, pkg, sub) {
  let dir = fileDir;
  for (let i = 0; i < 40; i++) {
    const candidate = join(dir, 'node_modules', pkg, sub);
    const variants = [`${candidate}.js`, `${candidate}.mjs`, `${candidate}.cjs`, join(candidate, 'index.js')];
    for (const v of variants) {
      if (existsSync(v)) {
        if (v.endsWith('index.js')) return `${pkg}/${sub}/index.js`;
        const ext = v.slice(v.lastIndexOf('.'));
        return `${pkg}/${sub}${ext}`;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function rewriteSpecifier(fileDir, spec) {
  if (hasExtension(spec)) return null;
  if (looksLikeRelative(spec)) return resolveRelativeTarget(fileDir, spec);
  const pkgSub = splitPackageSpec(spec);
  if (!pkgSub) return null;
  return resolvePackageSubpath(fileDir, pkgSub.pkg, pkgSub.sub);
}

function patchFile(filePath) {
  scanned++;
  const src = readFileSync(filePath, 'utf8');
  if (!isEsmFile(src)) return;

  const fileDir = dirname(filePath);
  let out = src;
  let localAdded = 0;

  // Match `from 'X'` / `from "X"` in import/export statements at any position
  // on the line that starts with import/export.
  const lineRe = /^([ \t]*(?:export|import)\b[^'"\n]*?\bfrom\s*)(['"])([^'"]+)\2/gm;
  out = out.replace(lineRe, (match, lead, quote, spec) => {
    const newSpec = rewriteSpecifier(fileDir, spec);
    if (!newSpec) return match;
    localAdded++;
    return `${lead}${quote}${newSpec}${quote}`;
  });

  // Dynamic `import('X')` calls (less common but worth catching).
  const dynRe = /\bimport\(\s*(['"])([^'"]+)\1\s*\)/g;
  out = out.replace(dynRe, (match, quote, spec) => {
    const newSpec = rewriteSpecifier(fileDir, spec);
    if (!newSpec) return match;
    localAdded++;
    return `import(${quote}${newSpec}${quote})`;
  });

  if (localAdded > 0) {
    if (!DRY_RUN) writeFileSync(filePath, out);
    patched++;
    extensionsAdded += localAdded;
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
    if (entry.isSymbolicLink()) continue; // pnpm symlinks — skip to avoid double-patching
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      // Only patch under a `dist/` segment so we don't touch source-symlinked .ts files.
      if (!full.includes(`${dirname(full).split('/').includes('dist') ? '/dist/' : ''}`)) continue;
      patchFile(full);
    }
  }
}

if (!existsSync(ROOT)) {
  console.error(`[fix-bare-esm] not found: ${ROOT}`);
  process.exit(1);
}

// Walk every direct subdir (the @teambit/* packages).
for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
  if (entry.isSymbolicLink()) continue;
  if (!entry.isDirectory()) continue;
  const pkgDir = join(ROOT, entry.name);
  const distDir = join(pkgDir, 'dist');
  if (!existsSync(distDir)) continue;
  walk(distDir);
}

// Same for the pnpm .pnpm/<key>/node_modules/@teambit/* copies (so the patch
// survives if Node resolves through the .pnpm store).
const pnpmRoot = join(WORKSPACE_ROOT, 'node_modules', '.pnpm');
if (existsSync(pnpmRoot)) {
  for (const key of readdirSync(pnpmRoot, { withFileTypes: true })) {
    if (!key.isDirectory()) continue;
    if (!key.name.startsWith('@teambit+')) continue;
    const inner = join(pnpmRoot, key.name, 'node_modules', '@teambit');
    if (!existsSync(inner)) continue;
    for (const sub of readdirSync(inner, { withFileTypes: true })) {
      if (!sub.isDirectory() || sub.isSymbolicLink()) continue;
      const distDir = join(inner, sub.name, 'dist');
      if (existsSync(distDir)) walk(distDir);
    }
  }
}

console.log(`[fix-bare-esm] scanned ${scanned} files`);
console.log(`[fix-bare-esm] patched ${patched} files (${extensionsAdded} extensions added)${DRY_RUN ? ' [dry-run]' : ''}`);
