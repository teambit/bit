import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, realpathSync } from 'fs';
import { join, relative, resolve, dirname, sep } from 'path';
import { rspack } from '@rspack/core';
import { getCoreAspectPackageName } from '@teambit/aspect-loader';
import { fallbacksProvidePluginConfig } from '@teambit/webpack';
import {
  moduleFileExtensions,
  shouldUseSourceMap,
  imageInlineSizeLimit,
  resolveAlias,
  resolveFallback,
  cssParser,
  mjsRule,
  swcRule,
  sourceMapRule,
  fontRule,
  styleRules,
} from './rspack/rspack.common';
import { postCssConfig } from './rspack/postcss.config';

export const UI_VENDOR_DLL_DIR = 'ui-vendor-dll';
export const UI_VENDOR_DLL_MANIFEST_FILENAME = 'vendor-manifest.json';
export const UI_VENDOR_DLL_CHUNK_FILENAME = 'vendor.js';
export const UI_VENDOR_DLL_CSS_FILENAME = 'vendor.css';
export const UI_VENDOR_DLL_GLOBAL_NAME = '__bitUiVendor__';
export const UI_VENDOR_DLL_EXTRA_PACKAGES = ['react', 'react-dom'];

type FsDeps = { readdirSync: (dir: string) => string[]; existsSync: (p: string) => boolean };
const realFsDeps: FsDeps = { readdirSync, existsSync };

/**
 * every core aspect package that ships browser (ui or preview) runtime code, plus react/react-dom.
 * these are exactly the packages a bundled bit's shims redirect into `bit.app.js` for - the ones a
 * third-party UI root's rspack build cannot compile from source. computed dynamically (not
 * hand-listed) from bit's own installation at the time `BundleUiTask` runs, so it never drifts from
 * what the existing pre-bundle actually covers.
 */
export function resolveUiVendorDllPackages(
  coreAspectIds: string[],
  resolvePackageDir: (packageName: string) => string | undefined,
  fsDeps: FsDeps = realFsDeps
): string[] {
  const corePackages = coreAspectIds
    .map((id) => getCoreAspectPackageName(id))
    .filter((packageName) => {
      const packageDir = resolvePackageDir(packageName);
      if (!packageDir) return false;
      const distDir = join(packageDir, 'dist');
      if (!fsDeps.existsSync(distDir)) return false;
      return fsDeps.readdirSync(distDir).some((f) => f.endsWith('.ui.runtime.js') || f.endsWith('.preview.runtime.js'));
    });
  return [...new Set([...UI_VENDOR_DLL_EXTRA_PACKAGES, ...corePackages])];
}

/**
 * locates a package's root directory via node_modules resolution, without going through the
 * package's `exports` map. Bit's own published packages declare a catch-all `"./*": "./*.ts"`
 * subpath export with no explicit `"./package.json"` entry, so
 * `require.resolve(`${packageName}/package.json`)` gets rewritten to a nonexistent
 * `package.json.ts` and throws for every one of them. Locating the directory first via
 * `require.resolve.paths` and only then checking for `package.json` on disk sidesteps that.
 */
export function resolvePackageDirFromNodeModules(packageName: string): string | undefined {
  try {
    return findPackageDir(packageName, require.resolve.paths(packageName) || []);
  } catch {
    return undefined;
  }
}

function findPackageDir(packageName: string, nodeModulesDirs: string[]): string | undefined {
  return nodeModulesDirs
    .map((nodeModulesDir) => join(nodeModulesDir, ...packageName.split('/')))
    .find((candidate) => existsSync(join(candidate, 'package.json')));
}

/**
 * The actual Bit installation being bundled - located via `@teambit/ui`'s own package directory
 * (this module is compiled into it) rather than `process.cwd()`. `BundleUiTask.execute()` can run
 * from a capsule whose cwd is unrelated to the install that will actually be resolving `react`,
 * `react-dom`, and every other covered package's transitive dependencies - if the dll's rspack
 * compilation resolved bare imports against `process.cwd()/node_modules` first, a `bit build` invoked
 * from a workspace with its own, different dependency versions would bake THOSE versions into the
 * shipped vendor dll instead of the install's own.
 */
export function resolveUiVendorDllSourceRoot(
  resolvePackageDir: (packageName: string) => string | undefined = resolvePackageDirFromNodeModules
): string {
  const uiPackageDir = resolvePackageDir('@teambit/ui');
  // `<root>/node_modules/@teambit/ui` -> `@teambit` -> `node_modules` -> `<root>`
  return uiPackageDir ? dirname(dirname(dirname(uiPackageDir))) : process.cwd();
}

/**
 * per package: find its dist dir, filter for `.ui.runtime.js`/`.preview.runtime.js` files, and
 * `require()` each matched file directly rather than the bare package. Requiring the bare package
 * (its main entry) also pulls in whatever its *other* runtimes need - e.g. `@teambit/pnpm`'s main
 * runtime drags in `@pnpm/napi`, a native `.node` binary loader, unbundlable for any rspack target -
 * and is unrelated to what this feature needs. It's also the functionally correct behavior: a
 * downstream `DllReferencePlugin` consumer resolves each aspect via `aspectDef.runtimePath`, an
 * exact file path, never a bare package specifier - so the DLL's own compilation has to reach that
 * same exact file for `DllReferencePlugin` to later intercept it. Falls back to a bare
 * `require(pkg)` only for a package with no runtime-file concept at all (`react`/`react-dom`).
 *
 * Deliberately reuses `resolvePackageDirFromNodeModules` (not a fresh `require.resolve(pkg +
 * '/package.json')`) for the same reason that helper exists: `@teambit/*` packages' `exports` maps
 * block that path outright for every one of them, which would otherwise silently fall through to
 * the bare-package branch below and never actually fix anything for a real package.
 */
function buildDllEntryContents(packages: string[]): string {
  return packages
    .flatMap((pkg) => {
      const packageDir = resolvePackageDirFromNodeModules(pkg);
      const distDir = packageDir ? join(packageDir, 'dist') : undefined;
      const runtimeFiles =
        distDir && existsSync(distDir)
          ? readdirSync(distDir).filter((f) => f.endsWith('.ui.runtime.js') || f.endsWith('.preview.runtime.js'))
          : [];
      if (!distDir || runtimeFiles.length === 0) {
        return [`exports[${JSON.stringify(pkg)}] = require(${JSON.stringify(pkg)});`];
      }
      return runtimeFiles.map(
        (f) => `exports[${JSON.stringify(`${pkg}/dist/${f}`)}] = require(${JSON.stringify(join(distDir, f))});`
      );
    })
    .join('\n');
}

export type UiVendorDllPaths = { manifestPath: string; chunkPath: string; cssPath?: string };

/**
 * the artifact's files inside an already-located `ui-bundle` directory, or `undefined` if this
 * installation has no dll (no bundle at all, or a bundle predating this feature). `cssPath` alone is
 * `undefined` for an artifact built before the dll emitted css - the other two are still returned.
 */
export function resolveUiVendorDllPaths(bundleUiPath: string | undefined): UiVendorDllPaths | undefined {
  if (!bundleUiPath) return undefined;
  const dllDir = join(bundleUiPath, UI_VENDOR_DLL_DIR);
  const manifestPath = join(dllDir, UI_VENDOR_DLL_MANIFEST_FILENAME);
  const chunkPath = join(dllDir, UI_VENDOR_DLL_CHUNK_FILENAME);
  if (!existsSync(manifestPath) || !existsSync(chunkPath)) return undefined;
  const cssPath = join(dllDir, UI_VENDOR_DLL_CSS_FILENAME);
  return { manifestPath, chunkPath, cssPath: existsSync(cssPath) ? cssPath : undefined };
}

export type UiVendorDllManifestEntry = { id: string | number; buildMeta?: unknown; exports?: string[] | true };
export type UiVendorDllManifest = {
  name: string;
  type: string;
  content: Record<string, UiVendorDllManifestEntry>;
  /** react/react-dom versions this dll's own compilation actually bundled - see `createUiVendorDllReference` */
  reactVersions?: Record<string, string>;
};

/** the `rspack.DllReferencePlugin` options `createUiVendorDllReference` builds */
export type UiVendorDllReference = {
  content: Record<string, UiVendorDllManifestEntry>;
  /** must be the same `context` the consuming compilation uses - keys are relative to it */
  context: string;
  name: string;
  sourceType: string;
};

// rspack writes manifest keys with forward slashes on every platform
const NODE_MODULES_SEGMENT = '/node_modules/';
// pnpm's own virtual-store flattening layer: every package it installs sits behind exactly one of
// these, regardless of hoisting - purely a storage-layout artifact, never a real nested dependency.
const PNPM_STORE_SEGMENT = /\.pnpm\/[^/]+\/node_modules\//g;

/**
 * rspack keys a dll manifest by each module's path relative to the compilation's `context`, and
 * `DllReferencePlugin` matches by recomputing that same relative path from the module it just
 * resolved on the consuming side. Under pnpm every one of those paths runs through
 * `.pnpm/<name>@<version>_<peer-hash>/node_modules/...`, and that hash is derived from the full
 * dependency graph of the install that produced it - no separate project's own install reproduces
 * it, so a raw manifest matches nothing outside the machine that built it (and a miss is silent:
 * `DllReferencePlugin` just lets the module compile from source, no error).
 *
 * The one identity both installs do share is package name + subpath, so that is what the shipped
 * manifest is keyed by. Everything through pnpm's own virtual-store segment - the part that is
 * specific to one install's layout - is dropped (its *last* occurrence, for a package nested inside
 * another pnpm-managed package). A genuine nested `node_modules/<pkg>` that follows it - a real,
 * unhoisted transitive dependency, reproducible by any install that resolves the outer package the
 * same way - is deliberately preserved rather than collapsed to just `<pkg>`: collapsing it would
 * let `createUiVendorDllReference` match it against an unrelated, possibly differently-versioned
 * top-level package of the same name in a consumer that never hoisted it that way at all. A key with
 * no `node_modules/` in it at all (an external, a remote font URL, the generated entry file itself)
 * belongs to no package and is dropped entirely; it could never have matched a consumer's module
 * anyway.
 */
export function toPortableUiVendorDllKey(key: string): string | undefined {
  const pnpmMatches = [...key.matchAll(PNPM_STORE_SEGMENT)];
  if (pnpmMatches.length) {
    const last = pnpmMatches[pnpmMatches.length - 1];
    return `./${key.slice(last.index + last[0].length)}`;
  }
  const firstNodeModules = key.indexOf(NODE_MODULES_SEGMENT);
  if (firstNodeModules === -1) return undefined;
  return `./${key.slice(firstNodeModules + NODE_MODULES_SEGMENT.length)}`;
}

/**
 * the rspack version that builds this dll (currently 1.7.12, resolved by this component's own
 * `package.json`) may differ from the rspack a consumer's own project installs (bit-cloud-bundle's
 * real consumption was tested against rspack 2.2.2). `buildMeta.defaultObject` is one place this
 * actually breaks across versions: 1.7.12 serializes the "redirect-warn" case as an object
 * (`{ redirectWarn: { ignore: boolean } }`), while 2.2.2's Rust-side type only accepts the plain
 * string enum (`'redirect' | 'redirect-warn'`) - passing the object form makes `DllReferencePlugin`
 * fail its *entire* compiler instantiation with `StringExpected ... on JsBuildMeta.defaultObject`,
 * not just skip that one module. Confirmed empirically consuming a real 1.7.12-built manifest from a
 * real 2.2.2 install. Normalizing to the string form here keeps the artifact consumable by both.
 */
function toPortableBuildMeta(buildMeta: unknown): unknown {
  if (!buildMeta || typeof buildMeta !== 'object') return buildMeta;
  const meta = buildMeta as Record<string, unknown>;
  const defaultObject = meta.defaultObject;
  if (!defaultObject || typeof defaultObject !== 'object') return buildMeta;
  const kind = Object.keys(defaultObject)[0]; // 'redirectWarn' | 'redirect'
  const portableDefaultObject =
    kind === 'redirectWarn' ? 'redirect-warn' : kind === 'redirect' ? 'redirect' : defaultObject;
  return { ...meta, defaultObject: portableDefaultObject };
}

/**
 * Packages that carry - or wrap something that carries - a React context whose PROVIDER lives
 * outside this dll's own coverage (in the consumer's own app root, never delegated). Delegating the
 * *consumer* of such a context without also delegating its *provider* is unsafe regardless of how
 * internally version-consistent this dll's own build is: `resolveAlias()` (`rspack.common.ts`)
 * already pins `react-router-dom`/`react-router`/`@remix-run/router` to one copy within this dll's
 * own compilation (2026-09-07, same fix `@apollo/client` already had for the same reason - see that
 * alias's own comment) - real symptom BEFORE that fix: this repo alone carries 4 separately
 * peer-resolved `react-router-dom` copies, so an unaliased dll build baked in two different
 * `useLocation` implementations internally. Even AFTER pinning it, `useLocation()` still threw the
 * exact same way (2026-09-07, confirmed - byte offset in `vendor.js` shifted, meaning the alias did
 * take effect, but the crash didn't move) - because the *real* mismatch isn't inside this dll's own
 * build at all: it's between whichever ONE consistent react-router-dom this dll now bakes in and
 * bit-cloud's OWN, entirely separately-compiled react-router-dom, wrapped in the `<Router>` that
 * bit-cloud's own app root (never delegated) provides. `@teambit/react-router`'s own real barrel
 * (`react-router/index.ts`) re-exports react-router-dom's hooks directly
 * (`export * as ReactRouter from 'react-router-dom'`) - delegating IT hands the consumer bit's own
 * copy of those hooks, tied to bit's own `@remix-run/router` context instance, which the consumer's
 * own, separately-compiled `<Router>` never provides. Bare `react-router-dom`/`react-router`/
 * `@remix-run/router` themselves are excluded too, for the more basic reason that a real consumer's
 * own installed version can have a genuinely different file layout than whatever this dll's producer
 * build resolved (confirmed: bit-cloud-bundle's real `react-router-dom@6.2.2` has no `dist/`
 * directory at all, a different shape than this dll's own build resolved, so its manifest key never
 * matches there - a separate, unrelated key for `react-router-dom/server.mjs` happened to exist at
 * the same relative path in both versions by coincidence, delegating a Node/SSR module in place of
 * the real client one). Unlike a core `@teambit/*` aspect that carries no such foreign context (one
 * version, defined by this branch, genuinely safe to share), every package below either wraps
 * react-router-dom's context directly or is the library itself - excluding them costs only the
 * (rare) case where a consumer's own copy happens to exactly match this dll's producer version;
 * their real dist still compiles fine standalone via `copyBrowserDist`'s browser barrels either way.
 */
const CONTEXT_PROVIDER_MISMATCH_UNSAFE_PACKAGES = new Set([
  'react-router-dom',
  'react-router',
  '@remix-run/router',
  '@teambit/react-router',
  '@teambit/ui-foundation.ui.navigation.react-router-adapter',
  '@teambit/ui-foundation.ui.react-router.slot-router',
  '@teambit/ui-foundation.ui.react-router.use-query',
]);

function packageNameOf(portableKey: string): string | undefined {
  const specifier = portableKey.startsWith('./') ? portableKey.slice(2) : portableKey;
  const packageName = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
  return packageName || undefined;
}

/**
 * BFS through `packageName`'s own `package.json` `dependencies` AND `peerDependencies` (never
 * `devDependencies` - only what actually ships and runs) to check whether requiring it necessarily
 * also runs code from a package in `unsafeRoots`. Generalizes
 * `CONTEXT_PROVIDER_MISMATCH_UNSAFE_PACKAGES` beyond a hand-maintained list of router wrapper
 * packages to every covered core aspect that transitively pulls one in - e.g. `@teambit/workspace`'s
 * own UI directly calls `useLocation()`/`useSearchParams()` from `react-router-dom`, making it
 * exactly as unsafe to delegate as `react-router-dom` itself, even though it is not, and can never
 * practically be, hand-listed alongside the libraries it happens to use this way today.
 *
 * `peerDependencies`, not just `dependencies`, because every core aspect declares its own shared UI
 * libraries that way (verified: `@teambit/workspace`'s own `package.json` lists `react-router-dom`
 * under `peerDependencies`, not `dependencies`, same as `react` itself) - skipping them would make
 * this walk find nothing for any real core aspect at all.
 */
function dependsOnUnsafePackage(
  packageName: string,
  unsafeRoots: Set<string>,
  resolvePackageDir: (packageName: string) => string | undefined,
  visited: Set<string>
): boolean {
  if (unsafeRoots.has(packageName)) return true;
  if (visited.has(packageName)) return false;
  visited.add(packageName);
  const packageDir = resolvePackageDir(packageName);
  if (!packageDir) return false;
  let dependencies: Record<string, string> = {};
  try {
    const packageJson = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf-8'));
    dependencies = { ...packageJson.dependencies, ...packageJson.peerDependencies };
  } catch {
    return false;
  }
  return Object.keys(dependencies).some((dep) => dependsOnUnsafePackage(dep, unsafeRoots, resolvePackageDir, visited));
}

/**
 * `CONTEXT_PROVIDER_MISMATCH_UNSAFE_PACKAGES` plus every one of `packages` (the dll's own covered
 * package list) that transitively depends on one of them - each walked independently, from a fresh
 * `visited` set, so one package's own dependency closure never marks a sibling unsafe by association.
 */
export function resolveContextProviderMismatchUnsafePackages(
  packages: string[],
  resolvePackageDir: (packageName: string) => string | undefined = resolvePackageDirFromNodeModules
): Set<string> {
  const unsafe = new Set(CONTEXT_PROVIDER_MISMATCH_UNSAFE_PACKAGES);
  packages.forEach((pkg) => {
    if (dependsOnUnsafePackage(pkg, CONTEXT_PROVIDER_MISMATCH_UNSAFE_PACKAGES, resolvePackageDir, new Set())) {
      unsafe.add(pkg);
    }
  });
  return unsafe;
}

export function toPortableUiVendorDllManifest(
  manifest: UiVendorDllManifest,
  unsafePackages: Set<string> = CONTEXT_PROVIDER_MISMATCH_UNSAFE_PACKAGES
): UiVendorDllManifest {
  const portableEntries: Array<{ portableKey: string; packageName: string; entry: UiVendorDllManifestEntry }> = [];
  // per-package physical-install identity: the raw prefix `toPortableUiVendorDllKey` stripped off to
  // produce the portable key. Two entries for the same package name with *different* raw prefixes
  // came from two distinct installs (pnpm keeps every version/peer-hash combination in its own store
  // directory) - package name + subpath alone cannot tell a consumer with only one of those installs
  // which is theirs, even for the specific files whose subpath happens not to collide between the two.
  const instancePrefixesByPackage = new Map<string, Set<string>>();

  Object.entries(manifest.content).forEach(([key, entry]) => {
    const portableKey = toPortableUiVendorDllKey(key);
    if (!portableKey) return;
    const packageName = packageNameOf(portableKey);
    if (!packageName || unsafePackages.has(packageName)) return;
    const instancePrefix = key.slice(0, key.length - (portableKey.length - 2));
    const prefixes = instancePrefixesByPackage.get(packageName) ?? new Set<string>();
    prefixes.add(instancePrefix);
    instancePrefixesByPackage.set(packageName, prefixes);
    const portableEntry =
      entry && 'buildMeta' in entry ? { ...entry, buildMeta: toPortableBuildMeta(entry.buildMeta) } : entry;
    portableEntries.push({ portableKey, packageName, entry: portableEntry });
  });

  // a package resolved from more than one physical install has no single right module to delegate
  // any of its files to - drop the whole package, not just the keys that happen to collide, and let
  // the consumer compile all of it from source.
  const ambiguousPackages = new Set(
    [...instancePrefixesByPackage].filter(([, prefixes]) => prefixes.size > 1).map(([name]) => name)
  );

  const content: Record<string, UiVendorDllManifestEntry> = {};
  portableEntries.forEach(({ portableKey, packageName, entry }) => {
    if (!ambiguousPackages.has(packageName)) content[portableKey] = entry;
  });
  return { ...manifest, content };
}

/**
 * turns the shipped portable manifest back into `rspack.DllReferencePlugin` options for one specific
 * consuming install, by resolving each covered package in that install and re-keying its entries by
 * the paths that install's own rspack compilation will produce. This is the supported way to consume
 * the artifact - passing `manifestPath` straight to `DllReferencePlugin` as `manifest` matches
 * nothing, since its keys are package specifiers rather than the context-relative paths rspack
 * compares against.
 *
 * Packages the consumer doesn't have installed (most of the dll's 600+ transitive dependencies) and
 * files it has at a layout where they don't exist are skipped - they simply stay compiled from the
 * consumer's own source. Most package *versions* are deliberately not compared: this artifact
 * replaces the bundled cli's existing shims, which redirect these packages into `bit.app.js`
 * regardless of which version the consuming project declares, so gating on version equality would
 * cover strictly less than what it replaces. React and react-dom are the one deliberate exception -
 * see `hasIncompatibleReactVersion`.
 */
export function createUiVendorDllReference(
  manifestPath: string,
  options: { context: string; resolveFrom?: string }
): UiVendorDllReference | undefined {
  let manifest: UiVendorDllManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch {
    return undefined;
  }
  if (!manifest?.content) return undefined;
  const consumerNodeModulesDirs = nodeModulesDirsFrom(options.resolveFrom || options.context);
  if (manifest.reactVersions && hasIncompatibleReactVersion(manifest.reactVersions, consumerNodeModulesDirs)) {
    // every other delegated module (core aspects included) was compiled against, and internally
    // still references, this exact react runtime - a consumer on a different version would run a
    // renderer and hooks different from the one its own dependency graph selected. Reject the whole
    // reference rather than filtering just the react/react-dom entries: everything else in the dll
    // was built assuming this react, mismatched or not.
    return undefined;
  }
  const packageDirs = new Map<string, string | undefined>();
  const content: Record<string, UiVendorDllManifestEntry> = {};

  Object.entries(manifest.content).forEach(([key, entry]) => {
    const specifier = key.startsWith('./') ? key.slice(2) : key;
    const packageName = specifier.startsWith('@')
      ? specifier.split('/').slice(0, 2).join('/')
      : specifier.split('/')[0];
    const subPath = specifier.slice(packageName.length + 1);
    if (!subPath) return;
    if (!packageDirs.has(packageName)) {
      packageDirs.set(packageName, resolvePackageDirForConsumer(packageName, consumerNodeModulesDirs));
    }
    const packageDir = packageDirs.get(packageName);
    if (!packageDir) return;
    const modulePath = join(packageDir, ...subPath.split('/'));
    if (!existsSync(modulePath)) return;
    content[contextify(options.context, modulePath)] = entry;
  });

  if (!Object.keys(content).length) return undefined;
  return { content, context: options.context, name: manifest.name, sourceType: manifest.type };
}

/**
 * `true` only when BOTH sides declare a version for the same package and they differ - an older or
 * hand-crafted manifest with no `reactVersions` at all, or a consumer install where a covered package
 * is unresolvable (handled elsewhere, by the normal "skip this entry" path), reads as "unknown" here
 * rather than as a mismatch, so this never rejects a reference the pre-version-check manifest format
 * already supported.
 */
function hasIncompatibleReactVersion(
  producerVersions: Record<string, string>,
  consumerNodeModulesDirs: string[]
): boolean {
  return Object.entries(producerVersions).some(([packageName, producerVersion]) => {
    const packageDir = findPackageDir(packageName, consumerNodeModulesDirs);
    if (!packageDir) return false;
    try {
      const { version } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf-8'));
      return Boolean(version) && version !== producerVersion;
    } catch {
      return false;
    }
  });
}

/**
 * `realpathSync` because rspack resolves symlinks by default (`resolve.symlinks`), so the paths it
 * will compare against are the pnpm store's real ones, not the `node_modules/<pkg>` symlinks pnpm
 * puts at the top level.
 */
function resolvePackageDirForConsumer(packageName: string, nodeModulesDirs: string[]): string | undefined {
  try {
    const packageDir = findPackageDir(packageName, nodeModulesDirs);
    return packageDir ? realpathSync(packageDir) : undefined;
  } catch {
    return undefined;
  }
}

/** node's own module lookup order, walked explicitly so it can start from the consumer's root */
function nodeModulesDirsFrom(startDir: string): string[] {
  const dirs: string[] = [];
  let current = resolve(startDir);
  for (let parent = dirname(current); ; parent = dirname(current)) {
    dirs.push(join(current, 'node_modules'));
    if (parent === current) return dirs;
    current = parent;
  }
}

/** the same relative form rspack keys a manifest by: `./a/b` inside the context, `../a` outside it */
function contextify(context: string, absolutePath: string): string {
  const relativePath = relative(context, absolutePath).split(sep).join('/');
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

export async function buildUiVendorDll(
  outputPath: string,
  packages: string[],
  sourceRoot: string = resolveUiVendorDllSourceRoot()
): Promise<void> {
  const dllOutputDir = join(outputPath, UI_VENDOR_DLL_DIR);
  // a reused capsule (or test tmpdir) may already carry a previous run's chunk/manifest/css under a
  // package set or content hash that no longer matches this one - clean the dll's own directory
  // before writing, rather than let rspack's default incremental output leave stale assets alongside
  // the new ones. Scoped to `dllOutputDir`, never the artifact's other, sibling UI/preview output.
  rmSync(dllOutputDir, { recursive: true, force: true });
  mkdirSync(dllOutputDir, { recursive: true });

  // built in a scratch directory outside the artifact tree, never under `dllOutputDir` - unlike
  // every other file rspack writes there, this one is only an input to the compilation, not part of
  // its output: `BundleUiTask`'s artifact glob ships `dllOutputDir` (and everything under it)
  // recursively, and this file's own content embeds this build's absolute local filesystem paths (see
  // `buildDllEntryContents`), which a published artifact must neither carry nor need after
  // compilation. A sibling of `outputPath` itself (not `os.tmpdir()`) - this module is reachable from
  // a browser build via `@teambit/ui`'s barrel (confirmed: `docs.ui.runtime.js` -> the barrel ->
  // here), and `os` has no browser resolve fallback the way `fs`/`path` do, so importing it here broke
  // `build_ui_prebundle`'s real rspack compilation with "Module not found: Can't resolve 'os'" the
  // moment this file shipped. `dirname(outputPath)` needs no new Node builtin at all, and structurally
  // sits outside the glob (`artifacts/ui-bundle/**`) that ships `outputPath` itself, not just cleaned
  // up in time.
  const entryScratchDir = mkdtempSync(join(dirname(outputPath), 'ui-vendor-dll-entry-'));
  const entryFile = join(entryScratchDir, 'vendor-entry.js');
  const entryContents = buildDllEntryContents(packages);
  writeFileSync(entryFile, entryContents);

  try {
    await runUiVendorDllCompiler(entryFile, dllOutputDir, sourceRoot);
  } finally {
    rmSync(entryScratchDir, { recursive: true, force: true });
  }

  const manifestPath = join(dllOutputDir, UI_VENDOR_DLL_MANIFEST_FILENAME);
  const manifest: UiVendorDllManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const unsafePackages = resolveContextProviderMismatchUnsafePackages(packages);
  const portableManifest = toPortableUiVendorDllManifest(manifest, unsafePackages);
  portableManifest.reactVersions = resolveReactVersions();
  writeFileSync(manifestPath, JSON.stringify(portableManifest));
}

/**
 * The react/react-dom versions this dll's own compilation actually bundled, read directly off each
 * package's `package.json` - `createUiVendorDllReference` compares these against the consuming
 * install's own versions before delegating anything.
 */
function resolveReactVersions(): Record<string, string> {
  const versions: Record<string, string> = {};
  UI_VENDOR_DLL_EXTRA_PACKAGES.forEach((pkg) => {
    const packageDir = resolvePackageDirFromNodeModules(pkg);
    if (!packageDir) return;
    try {
      const { version } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf-8'));
      if (version) versions[pkg] = version;
    } catch {
      // no version to record - treated the same as an entry this install never had at all.
    }
  });
  return versions;
}

async function runUiVendorDllCompiler(entryFile: string, dllOutputDir: string, sourceRoot: string): Promise<void> {
  const compiler = rspack({
    mode: 'production',
    entry: entryFile,
    // the actual Bit installation being bundled (see `resolveUiVendorDllSourceRoot`), not
    // `process.cwd()` - `BundleUiTask.execute()` can run from a capsule whose cwd has nothing to do
    // with the install whose `react`, `react-dom`, and other transitive dependencies this
    // compilation must resolve. Only affects the raw manifest keys rspack writes, which
    // `toPortableUiVendorDllManifest` re-keys straight afterwards - but it keeps `resolve.modules`
    // below pointed at the right `node_modules` regardless of where bit was invoked from.
    context: sourceRoot,
    // required for `module.parser: cssParser` below to mean anything - rspack's native 'css'/
    // 'css/module' module types (and their parser options) only exist with this enabled, same as
    // `rspack.browser.config.ts`.
    experiments: {
      css: true,
    },
    output: {
      path: dllOutputDir,
      filename: UI_VENDOR_DLL_CHUNK_FILENAME,
      // rspack's native CSS support does not derive this from `filename` - left unset, extracted CSS
      // falls back to its own default naming, which `resolveUiVendorDllPaths`'s hard-coded
      // `vendor.css` lookup would then miss entirely (`rspack.browser.config.ts` sets its own
      // `output.cssFilename` explicitly for the same reason).
      cssFilename: UI_VENDOR_DLL_CSS_FILENAME,
      library: { name: UI_VENDOR_DLL_GLOBAL_NAME, type: 'window' },
    },
    // the same resolve/module machinery the existing pre-bundle (`rspack.browser.config.ts`) uses -
    // real core aspects' `.ui.runtime.js`/`.preview.runtime.js` files pull in bit's actual UI
    // component library (design-system components, graph rendering, syntax highlighting, GraphQL,
    // etc.), which needs the same CSS/SCSS loader, JSX/TSX transform, and resolve fallback/alias
    // table this config already has - a from-scratch minimal config only ever worked for tiny
    // CommonJS-only fixtures (`lodash.compact`), not real UI code (confirmed: 600 rspack errors
    // against the real production package list before this fix).
    resolve: {
      extensions: moduleFileExtensions.map((ext) => `.${ext}`),
      alias: resolveAlias({ profile: false }),
      fallback: resolveFallback,
      // the DLL's own entry file lives in a scratch tmpdir, outside any node_modules tree and outside
      // `sourceRoot` itself. A bare require there (`react`, `react-dom`, or a test fixture) has no
      // ancestor `node_modules` to walk up to at all, so the explicit `sourceRoot` path covers it.
      // `'node_modules'` is kept alongside it (not replaced) so files that *are* inside the tree -
      // e.g. `@teambit/harmony`'s own pnpm-nested `cleargraph` dependency - still get the default
      // walk-up: a single hardcoded root without it is exactly what broke that resolution earlier.
      modules: [join(sourceRoot, 'node_modules'), 'node_modules'],
    },
    module: {
      parser: cssParser,
      rules: [
        mjsRule(),
        swcRule(),
        sourceMapRule(),
        {
          test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/, /\.svg$/],
          type: 'asset',
          parser: { dataUrlCondition: { maxSize: imageInlineSizeLimit } },
        },
        fontRule(),
        ...styleRules({ sourceMap: shouldUseSourceMap, postCssConfig, resolveUrlLoader: true }),
        {
          exclude: [/\.(cjs|js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/, /\.css$/, /\.s[ac]ss$/, /\.less$/],
          type: 'asset/resource',
        },
      ],
    },
    plugins: [
      new rspack.ProvidePlugin({ process: fallbacksProvidePluginConfig.process }),
      new rspack.IgnorePlugin({ resourceRegExp: /^\.\/locale$/, contextRegExp: /moment$/ }),
      new rspack.DllPlugin({
        path: join(dllOutputDir, UI_VENDOR_DLL_MANIFEST_FILENAME),
        name: UI_VENDOR_DLL_GLOBAL_NAME,
        type: 'window',
        entryOnly: false,
      }),
    ],
    // some covered packages' own `.ui.runtime.js` legitimately imports from `@teambit/ui`'s barrel
    // (e.g. `@teambit/pnpm`'s `pnpm.ui.runtime.js`, `@teambit/yarn`'s `yarn.ui.runtime.js`) - which,
    // same as `rspack.browser.config.ts`'s externals (see that file's comment), has a real
    // require()-reachable edge back into this very module (and everything it imports to build this
    // config) via `bundle-ui.task.ts`. Dead in any actually-executed context (nothing but the
    // Node-only `BundleUiTask.execute()` calls into this file, and the loader/plugin packages below
    // are only ever consumed to build this config object, never executed as part of its output), so
    // safe to externalize here too - kept in sync with `rspack.browser.config.ts`'s list.
    externals: {
      '@rspack/core': 'commonjs @rspack/core',
      '@teambit/aspect-loader': 'commonjs @teambit/aspect-loader',
      '@teambit/webpack': 'commonjs @teambit/webpack',
      'postcss-loader': 'commonjs postcss-loader',
      'postcss-preset-env': 'commonjs postcss-preset-env',
      'resolve-url-loader': 'commonjs resolve-url-loader',
      'sass-loader': 'commonjs sass-loader',
      'rspack-manifest-plugin': 'commonjs rspack-manifest-plugin',
      'postcss-normalize': 'commonjs postcss-normalize',
    },
  });

  await new Promise<void>((resolvePromise, reject) => {
    compiler.run((err, stats) => {
      compiler.close((closeErr) => {
        if (err) return reject(err);
        if (stats?.hasErrors()) return reject(new Error(stats.toString()));
        if (closeErr) return reject(closeErr);
        resolvePromise();
      });
    });
  });
}
