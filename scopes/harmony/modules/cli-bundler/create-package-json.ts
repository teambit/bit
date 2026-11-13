import fs from 'fs-extra';
import { join } from 'path';
import { parse } from 'comment-json';
import { externalsNotInstalled } from './externals';
import type { BundlePaths } from './config';
import { resolvePackageDir } from './resolve-package-dir';

/** `@scope/name/deep/path` -> `@scope/name` */
export function rootPackageName(specifier: string): string {
  const parts = specifier.split('/');
  if (parts[0].startsWith('@')) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}

/**
 * Externals that are transitive-only in this repo, so pnpm never hoists them to the root and there
 * is no installed copy to read a version from.
 */
const FALLBACK_VERSIONS: Record<string, string> = {
  'source-map-support': '^0.5.21',
};

/**
 * The version actually installed in the repo is the one the bundle was built and tested against, so
 * it is the most truthful thing to pin. workspace.jsonc is the fallback for packages that are only
 * declared (e.g. resolved through a peer) and the repo's package.json after that.
 */
async function resolveVersion(paths: BundlePaths, packageName: string, wsPolicy: any, repoPkgJson: any) {
  // resolve rather than path-join - under a capsule the externals hoist to the capsule root, and a
  // join only sees the capsule's own node_modules. Getting this wrong is quiet: the version simply
  // falls through to the workspace.jsonc/package.json fallbacks, which do not exist in a capsule
  // either, so the external lands in `unresolved` and is dropped from the published dependencies.
  const packageDir = resolvePackageDir(paths.packagesRoot, packageName);
  if (packageDir) {
    const { version } = await fs.readJson(join(packageDir, 'package.json'));
    if (version) return version;
  }
  const fromPolicy = wsPolicy?.dependencies?.[packageName] ?? wsPolicy?.peerDependencies?.[packageName];
  if (fromPolicy) return typeof fromPolicy === 'string' ? fromPolicy : fromPolicy.version;
  return (
    repoPkgJson?.dependencies?.[packageName] ||
    repoPkgJson?.devDependencies?.[packageName] ||
    repoPkgJson?.peerDependencies?.[packageName] ||
    FALLBACK_VERSIONS[packageName]
  );
}

/**
 * Both fallbacks are repo-root files: they exist when `packagesRoot` is this repo, and do not when it
 * is a capsule. That is not an error - in a capsule every external is a real dependency, so the
 * installed copy read by `resolveVersion` answers first and the fallbacks are never consulted.
 */
async function readJsonIfExists(filePath: string, parseFn: (raw: string) => any): Promise<any> {
  try {
    return parseFn(await fs.readFile(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Every dependency declaration a bundled package must NOT keep.
 *
 * The whole point of the bundle is that those ~160 packages are *inside* `bit.app.js`. Leaving them
 * declared would make a consumer's install re-download the entire tree the bundle exists to avoid -
 * the 1.2 GB this replaces - and worse, resolve a *second* copy of every core aspect next to the
 * shims, so `@teambit/workspace` could resolve to a published package rather than the bundle slice.
 * Only the externals survive, because they are the packages deliberately left out of the bundle.
 */
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
  'peerDependenciesMeta',
] as const;

/**
 * `require('@teambit/bit')` has to keep resolving for code installed *outside* the distribution -
 * an installed aspect that imports the API, and every workspace bit links, whose
 * `node_modules/@teambit/bit` points at this package root.
 *
 * The root holds no code of its own (the CLI is the single file under `dist/core-aspects/bundle`),
 * so it needs an entry that points into the distribution. The `bit` shim is exactly that entry: it
 * is what the same bare require resolves to from *inside* the bundle, so both sides get one module
 * instance out of node's cache. Without this the root manifest carries no usable `main` at all -
 * the capsule's `dist/index.js` does not exist here, and the stand-in manifest declares none - and
 * the require fails with "Cannot find module '@teambit/bit'".
 *
 * Written with forward slashes: package.json paths are posix, whatever the build host is.
 */
const SHIM_ENTRY_REL = 'dist/core-aspects/node_modules/@teambit/bit/dist/index.js';
const SHIM_TYPES_REL = 'dist/core-aspects/node_modules/@teambit/bit/dist/index.d.ts';

/**
 * Turn the capsule's own package.json into the published one, in place.
 *
 * Identity (name, version, componentId, license, engines, ...) is kept exactly as bit generated it -
 * this *is* `@teambit/bit`, and the release pipeline's expectations about it must not change. Only
 * the dependency surface is rewritten, plus the `bin` that makes the launcher the package entry.
 */
async function writeInPlacePackageJson(paths: BundlePaths, dependencies: Record<string, string>, unresolved: string[]) {
  const packageJsonPath = join(paths.rootOutDir, 'package.json');
  const existing = await fs.readJson(packageJsonPath);
  const removed = DEPENDENCY_FIELDS.flatMap((field) => Object.keys(existing[field] || {}));

  DEPENDENCY_FIELDS.forEach((field) => delete existing[field]);
  existing.dependencies = dependencies;
  // bvm and `npm i -g` invoke this; it is generated by `generate-bin` at the package root.
  existing.bin = { bit: './bin/bit' };
  // overrides the capsule's own `dist/index.js`, which a bundled build does not emit
  existing.main = SHIM_ENTRY_REL;
  existing.types = SHIM_TYPES_REL;

  await fs.writeJson(packageJsonPath, existing, { spaces: 2 });
  // eslint-disable-next-line no-console
  console.log(
    `[bundle] package.json: ${removed.length} declared dependencies replaced by ${
      Object.keys(dependencies).length
    } externals (everything else is inside the bundle)`
  );
  return { dependencies, unresolved };
}

export async function generatePackageJson(
  paths: BundlePaths,
  bitVersion: string,
  externals: string[],
  options?: { inPlace?: boolean }
) {
  const wsJsonc = await readJsonIfExists(join(paths.packagesRoot, 'workspace.jsonc'), (raw) => parse(raw));
  const wsPolicy = wsJsonc?.['teambit.dependencies/dependency-resolver']?.policy;
  const repoPkgJson = await readJsonIfExists(join(paths.packagesRoot, 'package.json'), JSON.parse);

  const names = Array.from(new Set(externals.map(rootPackageName))).filter((n) => !externalsNotInstalled.has(n));
  const dependencies: Record<string, string> = {};
  const unresolved: string[] = [];
  await Promise.all(
    names.map(async (name) => {
      const version = await resolveVersion(paths, name, wsPolicy, repoPkgJson);
      if (!version) {
        unresolved.push(name);
        return;
      }
      dependencies[name] = version;
    })
  );

  if (unresolved.length) {
    // These are marked external, so the bundle does NOT contain them - they have to be installed
    // alongside it. Dropping one silently produces a bundle that builds cleanly and then fails at
    // runtime with "Cannot find module". Usually it means the package is not a declared dependency
    // of `@teambit/bit`, which is exactly what has to be fixed for the published layout (§9b).
    // eslint-disable-next-line no-console
    console.warn(
      `[bundle] ${unresolved.length} external(s) have no resolvable version and were left out of the ` +
        `package.json - the bundle will fail at runtime unless they are installed: ${unresolved.join(', ')}`
    );
  }

  const sortedDependencies = Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)));

  if (options?.inPlace) {
    return writeInPlacePackageJson(paths, sortedDependencies, unresolved);
  }

  const packageJson = {
    name: '@teambit/bit-bundle-externals',
    version: bitVersion,
    private: true,
    description:
      'stands in for the published @teambit/bit package.json. the externals are declared as ordinary ' +
      'dependencies, so a package manager installs them into the install root - which the upward ' +
      'node_modules walk from dist/core-aspects/bundle reaches one level beyond the shims.',
    bin: { bit: './bin/bit' },
    main: SHIM_ENTRY_REL,
    types: SHIM_TYPES_REL,
    dependencies: Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))),
  };
  await fs.writeJson(join(paths.rootOutDir, 'package.json'), packageJson, { spaces: 2 });
  return { dependencies, unresolved };
}
