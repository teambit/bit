#!/usr/bin/env node
/* eslint no-console: 0 */
/**
 * Summarize an rspack stats file written by `BIT_UI_BUNDLE_STATS`.
 *
 *   BIT_UI_BUNDLE_STATS=1 bit build "teambit.ui-foundation/ui" --tasks BundleUI --reuse-capsules --unmodified
 *   node scripts/analyze-bundle.mjs bundle-stats/scope-ssr.stats.json
 *
 * Prints the assets, then the heaviest npm packages and workspace scopes, so it is obvious which
 * dependency is responsible for a bundle's size rather than only how large the bundle is.
 */
import { readFileSync, existsSync } from 'fs';
import { basename } from 'path';

const TOP = Number(process.env.TOP || 25);

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Attribute a module to something a human can act on. Anything under node_modules is charged to its
 * package (scoped names kept whole); everything else is charged to its workspace directory, which
 * for this repo means the aspect or component it came from.
 */
function bucketOf(name) {
  if (!name) return '(unknown)';
  const clean = name.replace(/^.*?!/, '').replace(/\?.*$/, '');
  const segments = clean.split(/[\\/]/);
  const lastNodeModules = segments.lastIndexOf('node_modules');
  if (lastNodeModules !== -1) {
    const first = segments[lastNodeModules + 1];
    if (!first) return '(node_modules)';
    const pkg = first.startsWith('@') ? `${first}/${segments[lastNodeModules + 2] ?? ''}` : first;
    return `node_modules/${pkg}`;
  }
  for (const root of ['scopes', 'components', 'e2e']) {
    const at = segments.indexOf(root);
    if (at !== -1) return segments.slice(at, at + 3).join('/');
  }
  return clean.startsWith('webpack') || clean.startsWith('external') ? '(runtime)' : '(other)';
}

/** rspack nests concatenated/child modules; only leaves carry a size worth counting once. */
function walkModules(modules, visit, seen = new Set()) {
  for (const mod of modules ?? []) {
    const id = mod.identifier ?? mod.name;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    if (mod.modules?.length) walkModules(mod.modules, visit, seen);
    else visit(mod);
  }
}

function analyze(file) {
  const stats = JSON.parse(readFileSync(file, 'utf8'));

  console.log(`\n=== ${basename(file)} ===\n`);

  const assets = (stats.assets ?? [])
    .filter((a) => a?.name && !a.name.endsWith('.map'))
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
  const assetTotal = assets.reduce((sum, a) => sum + a.size, 0);
  console.log(`assets: ${assets.length}, total ${mb(assetTotal)}\n`);
  for (const asset of assets.slice(0, TOP)) {
    console.log(`  ${mb(asset.size).padStart(10)}  ${asset.name}`);
  }
  if (assets.length > TOP) console.log(`  ... and ${assets.length - TOP} more`);

  const buckets = new Map();
  let moduleTotal = 0;
  walkModules(stats.modules, (mod) => {
    const size = mod.size ?? 0;
    moduleTotal += size;
    const bucket = bucketOf(mod.name ?? mod.identifier);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + size);
  });

  if (!buckets.size) {
    console.log('\nno module information in this stats file.');
    return;
  }

  const ranked = [...buckets].sort((a, b) => b[1] - a[1]);
  console.log(`\nmodules: ${mb(moduleTotal)} across ${buckets.size} packages/scopes (parsed, pre-minification)\n`);
  for (const [bucket, size] of ranked.slice(0, TOP)) {
    const share = ((size / moduleTotal) * 100).toFixed(1).padStart(5);
    console.log(`  ${mb(size).padStart(10)}  ${share}%  ${bucket}`);
  }
  if (ranked.length > TOP) {
    const rest = ranked.slice(TOP).reduce((sum, [, size]) => sum + size, 0);
    console.log(`  ${mb(rest).padStart(10)}         ... and ${ranked.length - TOP} more`);
  }
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node scripts/analyze-bundle.mjs <stats.json> [...]');
  process.exit(1);
}
for (const file of files) {
  if (!existsSync(file)) {
    console.error(`no such stats file: ${file}`);
    process.exit(1);
  }
  analyze(file);
}
