#!/usr/bin/env node
// Post-compile sweep: in every ESM `.js` file under `@teambit/*/dist`,
// find re-exports like `export { A, B, C } from './foo.js'` where the target
// module doesn't actually export all of those names (they're type-only in
// TS source — interfaces, type aliases — that babel preset-typescript can't
// strip because it doesn't have cross-file type info). Drop the missing
// names from the re-export list; if every name is missing, drop the whole
// statement.
//
// Why this is needed: TS source like
//   export { foo, MyType } from './x';
// compiles to JS with both names in the export list. In CJS, exports of
// nonexistent values are silently `undefined`. In ESM, Node validates the
// import graph eagerly — a re-export of a name the source module doesn't
// actually export throws SyntaxError at module-init time.
//
// The proper fix is `export type { MyType } from './x';` in source. Until
// the workspace is codemodded to use that syntax, this sweep is the
// pragmatic band-aid.
//
// Idempotent.

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(HERE, '..', '..');
const ROOT = join(WORKSPACE_ROOT, 'node_modules', '@teambit');
const DRY_RUN = process.argv.includes('--dry-run');

let scanned = 0;
let patched = 0;
let removedNames = 0;
let droppedStatements = 0;

const exportCache = new Map();

function getExportedNames(modulePath) {
  if (exportCache.has(modulePath)) return exportCache.get(modulePath);
  let src;
  try {
    src = readFileSync(modulePath, 'utf8');
  } catch {
    exportCache.set(modulePath, null);
    return null;
  }
  const names = new Set();
  // `export const x =`, `export let x =`, `export var x =`, `export function x`,
  // `export class x`, `export async function x`, `export default class X`.
  const declRe = /export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
  for (const m of src.matchAll(declRe)) names.add(m[1]);
  // `export { a, b as c }` (single-line; we don't care about multi-line for now).
  const namedRe = /export\s*\{\s*([^}]+)\s*\}\s*(?:from\s*['"][^'"]+['"]\s*)?;/g;
  for (const m of src.matchAll(namedRe)) {
    for (const piece of m[1].split(',')) {
      const trimmed = piece.trim();
      if (!trimmed) continue;
      const asMatch = trimmed.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (asMatch) names.add(asMatch[2]);
      else if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) names.add(trimmed);
    }
  }
  // `export default ...` → contributes 'default'.
  if (/\bexport\s+default\b/.test(src)) names.add('default');
  // Re-exports from other modules add transitively — for the heuristic we
  // accept them too (we'd over-strip otherwise).
  const transRe = /export\s+\*\s+from\s*['"]([^'"]+)['"]/g;
  for (const _ of src.matchAll(transRe)) {
    // mark unknown — we don't recurse, but a bare `export *` means we can't
    // know what names are exported, so we'd skip filtering for this file.
    exportCache.set(modulePath, null);
    return null;
  }
  exportCache.set(modulePath, names);
  return names;
}

function isEsmFile(content) {
  return /^\s*(export|import)\b/m.test(content);
}

function resolveLocal(fileDir, spec) {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return null;
  const abs = resolve(fileDir, spec);
  if (existsSync(abs)) return abs;
  return null;
}

function patchFile(filePath) {
  scanned++;
  const src = readFileSync(filePath, 'utf8');
  if (!isEsmFile(src)) return;
  const fileDir = dirname(filePath);
  let out = src;
  let touched = false;

  // Match: `export { A, B, C } from "./x.js";` (single-line)
  const re = /export\s*\{\s*([^}]+)\s*\}\s*from\s*(['"])([^'"]+)\2;?/g;
  out = out.replace(re, (match, listText, q, spec) => {
    const targetPath = resolveLocal(fileDir, spec);
    if (!targetPath) return match;
    const targetExports = getExportedNames(targetPath);
    if (!targetExports) return match; // unknown → leave alone
    const items = listText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const kept = [];
    let drops = 0;
    for (const item of items) {
      // Handle `A as B` — check that source export A exists.
      const asMatch = item.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      const sourceName = asMatch ? asMatch[1] : item;
      if (targetExports.has(sourceName)) kept.push(item);
      else drops++;
    }
    if (drops === 0) return match;
    touched = true;
    removedNames += drops;
    if (kept.length === 0) {
      droppedStatements++;
      return `// bvm-patches: dropped type-only re-export from ${spec}`;
    }
    return `export { ${kept.join(', ')} } from ${q}${spec}${q};`;
  });

  if (touched) {
    if (!DRY_RUN) writeFileSync(filePath, out);
    patched++;
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
  console.error(`[fix-type-reexports] not found: ${ROOT}`);
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

console.log(`[fix-type-reexports] scanned ${scanned} files`);
console.log(`[fix-type-reexports] patched ${patched} files (${removedNames} names removed, ${droppedStatements} statements dropped)${DRY_RUN ? ' [dry-run]' : ''}`);
