#!/usr/bin/env node
// Rewrites `import { XAspect, ... } from '@teambit/<pkg>'` so XAspect comes
// from `@teambit/<pkg>/dist/<file>.aspect.js` directly instead of the heavy
// barrel index.ts. Other named imports (including types) stay on the barrel.
//
// The barrel evaluates every transitive re-export eagerly once babel-lazy is
// off, so this is a free perf win for any source file that only needed the
// aspect manifest from the barrel.
//
// Run: node scripts/codemod-aspect-imports.mjs [--dry] [--scope=scopes]
// Idempotent.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const NODE_MODULES = join(REPO_ROOT, 'node_modules');

const DRY = process.argv.includes('--dry');
const ROOTS = ['scopes', 'components'];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '__fixtures__',
  '__snapshots__',
  '.git',
  'artifacts',
  // e2e-helper fixtures emulate user-authored aspect code; keep them as
  // someone unaware of the codemod would write them.
  'excluded-fixtures',
]);

// pkg → aspect file name (e.g. `pnpm.aspect.js`), populated lazily from node_modules.
const aspectFileCache = new Map();

function findAspectFile(pkg) {
  if (aspectFileCache.has(pkg)) return aspectFileCache.get(pkg);
  const dist = join(NODE_MODULES, pkg, 'dist');
  if (!existsSync(dist)) {
    aspectFileCache.set(pkg, null);
    return null;
  }
  let files;
  try {
    files = readdirSync(dist).filter((f) => f.endsWith('.aspect.js') && !f.endsWith('.map'));
  } catch {
    aspectFileCache.set(pkg, null);
    return null;
  }
  if (files.length !== 1) {
    aspectFileCache.set(pkg, null);
    return null;
  }
  aspectFileCache.set(pkg, files[0]);
  return files[0];
}

function* walkSourceFiles(root) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        stack.push(full);
        continue;
      }
      if (!e.isFile()) continue;
      if (!/\.(ts|tsx|mts|cts)$/.test(e.name)) continue;
      if (e.name.endsWith('.d.ts')) continue;
      yield full;
    }
  }
}

// Parse a single `import` statement starting at `start` in `src`.
// Returns { end, kind: 'value'|'type', names: Array<{ original, alias, isType }>, raw, pkg }
// or null if not a parseable `import { ... } from '@teambit/<pkg>';` line.
function parseImport(src, start) {
  // Match the prefix
  const prefix = src.slice(start, start + 7);
  if (prefix !== 'import ') return null;
  // Find the `from '...'` end of the statement
  // Allow multi-line. Stop at the matching closing quote + semicolon/newline.
  const m = src.slice(start).match(/^import\s+(type\s+)?(\{[^}]*\})\s+from\s+['"]([^'"]+)['"];?/);
  if (!m) return null;
  const stmt = m[0];
  const isTypeOnly = !!m[1];
  const namedBlock = m[2];
  const spec = m[3];
  if (!/^@teambit\/[\w-]+$/.test(spec)) return null;
  const inside = namedBlock.slice(1, -1).trim();
  if (!inside) return null;
  // Split by commas at top level
  const parts = inside.split(',').map((s) => s.trim()).filter(Boolean);
  const names = parts.map((p) => {
    const isType = /^type\s+/.test(p);
    const body = p.replace(/^type\s+/, '');
    const asMatch = body.match(/^([\w$]+)(\s+as\s+([\w$]+))?$/);
    if (!asMatch) return { original: body, alias: body, isType };
    return { original: asMatch[1], alias: asMatch[3] || asMatch[1], isType };
  });
  return { end: start + stmt.length, kind: isTypeOnly ? 'type' : 'value', names, raw: stmt, pkg: spec };
}

function rewriteFile(filename) {
  const src = readFileSync(filename, 'utf8');
  // Quick reject if no @teambit imports
  if (!src.includes("from '@teambit/") && !src.includes('from "@teambit/')) return false;

  let out = '';
  let i = 0;
  let changed = false;

  while (i < src.length) {
    // Find next "import " at start of line
    if ((i === 0 || src[i - 1] === '\n') && src.startsWith('import ', i)) {
      const parsed = parseImport(src, i);
      if (parsed) {
        const { end, kind, names, pkg } = parsed;
        if (kind === 'value') {
          // Find the aspect symbol among value names (one named XAspect, isType: false)
          const aspectIdx = names.findIndex((n) => !n.isType && /Aspect$/.test(n.original) && n.original !== 'Aspect');
          if (aspectIdx !== -1) {
            const aspectFile = findAspectFile(pkg);
            if (aspectFile) {
              const aspectName = names[aspectIdx];
              const rest = names.filter((_, idx) => idx !== aspectIdx);
              const aspectSpec = aspectName.alias === aspectName.original
                ? aspectName.original
                : `${aspectName.original} as ${aspectName.alias}`;
              const aspectLine = `import { ${aspectSpec} } from '${pkg}/dist/${aspectFile}';`;
              let replacement;
              if (rest.length === 0) {
                replacement = aspectLine;
              } else {
                const restSpecs = rest.map((n) => {
                  const tprefix = n.isType ? 'type ' : '';
                  return n.alias === n.original ? `${tprefix}${n.original}` : `${tprefix}${n.original} as ${n.alias}`;
                });
                replacement = `${aspectLine}\nimport { ${restSpecs.join(', ')} } from '${pkg}';`;
              }
              out += replacement;
              i = end;
              changed = true;
              continue;
            }
          }
        }
      }
    }
    out += src[i];
    i += 1;
  }
  if (!changed) return false;
  if (!DRY) writeFileSync(filename, out);
  return true;
}

let scanned = 0;
let rewritten = 0;
for (const root of ROOTS) {
  const abs = join(REPO_ROOT, root);
  if (!existsSync(abs)) continue;
  for (const file of walkSourceFiles(abs)) {
    scanned += 1;
    if (rewriteFile(file)) {
      rewritten += 1;
      if (rewritten <= 20) console.log((DRY ? '[dry] ' : '') + 'rewrote', file.slice(REPO_ROOT.length + 1));
    }
  }
}
console.log(`\nscanned ${scanned} files; ${DRY ? 'would rewrite' : 'rewrote'} ${rewritten}`);
