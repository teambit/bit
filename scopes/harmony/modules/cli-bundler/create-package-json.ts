import fs from 'fs-extra';
import { join } from 'path';
import { parse } from 'comment-json';
import { externalsNotInstalled } from './externals';
import type { BundlePaths } from './config';

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
  const installed = join(paths.packagesRoot, 'node_modules', packageName, 'package.json');
  if (await fs.pathExists(installed)) {
    const { version } = await fs.readJson(installed);
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

export async function generatePackageJson(paths: BundlePaths, bitVersion: string, externals: string[]) {
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

  const packageJson = {
    name: '@teambit/bit-bundle-externals',
    version: bitVersion,
    private: true,
    description:
      'stands in for the published @teambit/bit package.json. the externals are declared as ordinary ' +
      'dependencies, so a package manager installs them into the install root - which the upward ' +
      'node_modules walk from dist/core-aspects/bundle reaches one level beyond the shims.',
    bin: { bit: './bin/bit' },
    dependencies: Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))),
  };
  await fs.writeJson(join(paths.rootOutDir, 'package.json'), packageJson, { spaces: 2 });
  return { dependencies, unresolved };
}
