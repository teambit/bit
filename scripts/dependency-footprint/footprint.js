#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Dependency-footprint harness.
 *
 * Reports how many packages `npm install <pkg>` would bring in for components of this workspace,
 * without publishing anything. The dependencies of each workspace component come from Bit's own
 * dependency model (the same data the published package.json is generated from), and third-party
 * packages are resolved through pnpm-lock.yaml.
 *
 * Each target is measured in two modes:
 *   as-is        - what consumers install today.
 *   host-aspects - core aspects are treated as provided by the host (as if they were optional
 *                  peers), so they and their dependencies are not counted.
 *
 * Usage:
 *   node scripts/dependency-footprint/footprint.js [targets...] [options]
 *
 * Targets are package names (e.g. @teambit/builder) or the name of a set from sets.json
 * (e.g. env-facing). Without targets, every set in sets.json is measured.
 *
 * Options:
 *   --top=<n>           how many top direct dependencies to list per target (default: 15, 0 to hide)
 *   --list              print every package in the closure
 *   --json=<path>       write the results as JSON
 *   --baseline=<path>   compare the totals with baseline.json or with a previous --json output
 *   --update-baseline   write the totals of the measured targets to baseline.json (refused when
 *                       some dependencies are not found in pnpm-lock.yaml)
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_PATH = path.join(__dirname, 'baseline.json');
const SETS_PATH = path.join(__dirname, 'sets.json');

function parseArgs(argv) {
  const opts = { targets: [], top: 15, list: false, json: undefined, baseline: undefined, updateBaseline: false };
  argv.forEach((arg) => {
    if (!arg.startsWith('--')) {
      opts.targets.push(arg);
      return;
    }
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (key === 'top') opts.top = parseInt(value, 10);
    else if (key === 'list') opts.list = true;
    else if (key === 'json') opts.json = value;
    else if (key === 'baseline') opts.baseline = value;
    else if (key === 'update-baseline') opts.updateBaseline = true;
    else throw new Error(`unknown option "${arg}"`);
  });
  return opts;
}

/**
 * load Bit in-process and return the dependency manifest of every workspace component, keyed by
 * package name, plus the package names of the core aspects.
 */
async function collectWorkspaceManifests() {
  const { loadBit } = require(path.join(REPO_ROOT, 'node_modules/@teambit/bit'));
  const harmony = await loadBit(REPO_ROOT);
  const workspace = harmony.get('teambit.workspace/workspace');
  const depResolver = harmony.get('teambit.dependencies/dependency-resolver');
  const aspectLoader = harmony.get('teambit.harmony/aspect-loader');
  const components = await workspace.list();
  const manifests = {};
  components.forEach((component) => {
    const packageName = depResolver.getPackageName(component);
    const manifest = depResolver.getDependencies(component).toDependenciesManifest();
    manifests[packageName] = { id: component.id.toStringWithoutVersion(), ...manifest };
  });
  const coreAspectPackages = Object.keys(aspectLoader.getCoreAspectsPackagesAndIds());
  return { manifests, coreAspectPackages };
}

function readLockfile() {
  const yaml = require(require.resolve('js-yaml', { paths: [REPO_ROOT] }));
  const lockfile = yaml.load(fs.readFileSync(path.join(REPO_ROOT, 'pnpm-lock.yaml'), 'utf8'));
  return { snapshots: lockfile.snapshots, packages: lockfile.packages };
}

/** "@scope/name@1.0.0(peer@1.0.0)" -> "@scope/name" */
function nameFromSnapshotKey(key) {
  const at = key.indexOf('@', 1);
  return key.slice(0, at);
}

/**
 * resolves dependencies into graph nodes. a node is either a workspace component ("ws:<pkg>") or a
 * lockfile snapshot ("<pkg>@<resolved-version>").
 */
class Resolver {
  constructor(manifests, { snapshots, packages }) {
    this.manifests = manifests;
    this.snapshots = snapshots;
    this.packages = packages;
    this.unresolved = new Set();
    // the injected copies of workspace components ("@teambit/x@file:...") carry the versions pnpm
    // resolved for their third-party dependencies.
    this.resolvedVersionsByPkg = {};
    // every snapshot key by package name, used when a dependency isn't found in an injected copy.
    this.snapshotKeysByName = {};
    Object.keys(snapshots).forEach((key) => {
      const name = nameFromSnapshotKey(key);
      (this.snapshotKeysByName[name] = this.snapshotKeysByName[name] || []).push(key);
      const version = key.slice(name.length + 1);
      if (version.startsWith('file:')) {
        const resolved = (this.resolvedVersionsByPkg[name] = this.resolvedVersionsByPkg[name] || {});
        const deps = { ...snapshots[key].dependencies, ...snapshots[key].optionalDependencies };
        Object.entries(deps).forEach(([dep, ver]) => {
          if (!resolved[dep]) resolved[dep] = ver;
        });
      }
    });
    this.semver = require(require.resolve('semver', { paths: [REPO_ROOT] }));
  }

  /** dependencies of a node, as [dependencyName, childNode] pairs. */
  children(node) {
    if (node.startsWith('ws:')) {
      const pkg = node.slice(3);
      const manifest = this.manifests[pkg];
      const deps = { ...manifest.dependencies, ...manifest.optionalDependencies };
      // npm 7+ and pnpm (auto-install-peers) install non-optional peers.
      Object.entries(manifest.peerDependencies).forEach(([dep, range]) => {
        if (!manifest.peerDependenciesMeta[dep]?.optional) deps[dep] = range;
      });
      return Object.entries(deps).map(([dep, range]) => [dep, this.resolveFromWorkspaceComponent(pkg, dep, range)]);
    }
    const snapshot = this.snapshots[node];
    // pnpm also writes the resolved optional peers into optionalDependencies. npm doesn't install
    // them for this package, so skip them. a package that really needs one reaches it on its own.
    const peers = this.packages[node.split('(')[0]]?.peerDependencies || {};
    const optionalDeps = Object.entries(snapshot.optionalDependencies || {}).filter(([dep]) => !peers[dep]);
    const deps = { ...snapshot.dependencies, ...Object.fromEntries(optionalDeps) };
    return Object.entries(deps).map(([dep, version]) => [dep, this.resolveFromSnapshot(dep, version)]);
  }

  resolveFromWorkspaceComponent(pkg, dep, range) {
    if (this.manifests[dep]) return `ws:${dep}`;
    const resolvedVersion = this.resolvedVersionsByPkg[pkg]?.[dep];
    if (resolvedVersion) return this.resolveFromSnapshot(dep, resolvedVersion);
    return this.resolveByRange(dep, range);
  }

  resolveFromSnapshot(dep, version) {
    if (this.manifests[dep] && (version.startsWith('file:') || version.startsWith('link:'))) return `ws:${dep}`;
    const key = `${dep}@${version}`;
    if (this.snapshots[key]) return key;
    // an npm alias ("uri-js": "uri-js-replace@1.0.1") is written as the real name and version.
    if (this.snapshots[version]) return version;
    // an aliased dependency ("npm:other@1.0.0") or a key pnpm wrote with a different peers suffix.
    const plainVersion = version.split('(')[0];
    return this.resolveByRange(dep, plainVersion);
  }

  resolveByRange(dep, range) {
    if (this.manifests[dep]) return `ws:${dep}`;
    const keys = this.snapshotKeysByName[dep] || [];
    const exact = keys.find((key) => key.slice(dep.length + 1).split('(')[0] === range);
    if (exact) return exact;
    const matching = keys.find((key) => {
      const version = key.slice(dep.length + 1).split('(')[0];
      return this.semver.valid(version) && this.semver.satisfies(version, range);
    });
    if (matching) return matching;
    this.unresolved.add(`${dep}@${range}`);
    return null;
  }
}

/** every node reachable from the given roots, skipping dependencies whose name is in `skip`. */
function closure(resolver, roots, skip = new Set()) {
  const seen = new Set();
  const stack = [...roots];
  while (stack.length) {
    const node = stack.pop();
    if (seen.has(node)) continue;
    seen.add(node);
    resolver.children(node).forEach(([dep, child]) => {
      if (child && !skip.has(dep)) stack.push(child);
    });
  }
  return seen;
}

function nodeName(node) {
  return node.startsWith('ws:') ? node.slice(3) : nameFromSnapshotKey(node);
}

/**
 * measure the targets' closure in one mode. `skip` holds the package names a host provides.
 * for every direct dependency, reports its own closure and its exclusive part - the packages that
 * would no longer be installed if that dependency were dropped.
 */
function measure(resolver, rootPkgs, skip) {
  const roots = rootPkgs.map((pkg) => `ws:${pkg}`);
  const rootSkip = new Set([...skip].filter((pkg) => !rootPkgs.includes(pkg)));
  const all = closure(resolver, roots, rootSkip);
  const directs = new Map();
  roots.forEach((root) =>
    resolver.children(root).forEach(([dep, child]) => {
      if (child && !rootSkip.has(dep) && !roots.includes(child)) directs.set(child, dep);
    })
  );
  const directDeps = [...directs.entries()].map(([child, dep]) => {
    const own = closure(resolver, [child], rootSkip);
    const others = closure(
      resolver,
      [...directs.keys()].filter((other) => other !== child),
      new Set([...rootSkip, ...rootPkgs])
    );
    const exclusive = [...own].filter((node) => !others.has(node) && !roots.includes(node));
    return { name: dep, closure: own.size, exclusive: exclusive.length };
  });
  directDeps.sort((a, b) => b.exclusive - a.exclusive || b.closure - a.closure);
  const packages = [...all].filter((node) => !roots.includes(node)).map(nodeName);
  return {
    total: packages.length,
    teambitPackages: packages.filter((name) => name.startsWith('@teambit/')).length,
    directDeps,
    packages: packages.sort(),
  };
}

function printResult(target, rootPkgs, results, opts) {
  const description = rootPkgs.length > 1 ? `${rootPkgs.length} packages` : rootPkgs[0];
  console.log(`\n${target}${target !== rootPkgs[0] ? ` (${description})` : ''}`);
  Object.entries(results).forEach(([mode, result]) => {
    console.log(
      `  ${mode.padEnd(13)} ${String(result.total).padStart(5)} packages (${result.teambitPackages} @teambit)`
    );
  });
  if (opts.top > 0) {
    Object.entries(results).forEach(([mode, result]) => {
      console.log(`  top direct dependencies, ${mode} (closure / exclusive):`);
      result.directDeps.slice(0, opts.top).forEach((dep) => {
        console.log(
          `    ${dep.name.padEnd(50)} ${String(dep.closure).padStart(5)} ${String(dep.exclusive).padStart(6)}`
        );
      });
    });
  }
  if (opts.list) {
    Object.entries(results).forEach(([mode, result]) =>
      console.log(`  packages, ${mode}:\n    ${result.packages.join('\n    ')}`)
    );
  }
}

/** a mode in baseline.json is a total, in a --json output it is the whole result. */
function baselineTotal(value) {
  return typeof value === 'object' && value !== null ? value.total : value;
}

function compareWithBaseline(totals, baselinePath) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  console.log(`\ncompared with ${path.relative(process.cwd(), baselinePath)}:`);
  Object.entries(totals).forEach(([target, modes]) => {
    if (!baseline[target]) {
      console.log(`  ${target}: not in the baseline`);
      return;
    }
    const diffs = Object.entries(modes).map(([mode, total]) => {
      const before = baselineTotal(baseline[target][mode]);
      if (typeof before !== 'number') return `${mode} ${total} (not in the baseline)`;
      const delta = total - before;
      return `${mode} ${before} -> ${total} (${delta > 0 ? '+' : ''}${delta})`;
    });
    console.log(`  ${target}: ${diffs.join(', ')}`);
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const sets = JSON.parse(fs.readFileSync(SETS_PATH, 'utf8'));
  const targets = opts.targets.length ? opts.targets : Object.keys(sets);

  const { manifests, coreAspectPackages } = await collectWorkspaceManifests();
  const resolver = new Resolver(manifests, readLockfile());
  const modes = { 'as-is': new Set(), 'host-aspects': new Set(coreAspectPackages) };

  const output = {};
  const totals = {};
  targets.forEach((target) => {
    const rootPkgs = sets[target] || [target];
    const missing = rootPkgs.filter((pkg) => !manifests[pkg]);
    if (missing.length) throw new Error(`${missing.join(', ')} is not a component of this workspace`);
    const results = {};
    Object.entries(modes).forEach(([mode, skip]) => {
      results[mode] = measure(resolver, rootPkgs, skip);
    });
    printResult(target, rootPkgs, results, opts);
    output[target] = results;
    totals[target] = Object.fromEntries(Object.entries(results).map(([mode, result]) => [mode, result.total]));
  });

  if (resolver.unresolved.size) {
    console.log(`\n${resolver.unresolved.size} dependencies were not found in pnpm-lock.yaml and are not counted:`);
    console.log(`  ${[...resolver.unresolved].sort().join('\n  ')}`);
  }
  if (opts.baseline) compareWithBaseline(totals, opts.baseline);
  if (opts.json) fs.writeFileSync(opts.json, JSON.stringify(output, null, 2));
  if (opts.updateBaseline) {
    if (resolver.unresolved.size) {
      throw new Error('baseline.json was not updated, because some dependencies were not found in pnpm-lock.yaml');
    }
    const baseline = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) : {};
    Object.assign(baseline, totals);
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`\nupdated ${path.relative(process.cwd(), BASELINE_PATH)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
