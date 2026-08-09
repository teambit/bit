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
  const installed = join(paths.repoRoot, 'node_modules', packageName, 'package.json');
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

export async function generatePackageJson(paths: BundlePaths, bitVersion: string, externals: string[]) {
  const wsJsoncRaw = await fs.readFile(join(paths.repoRoot, 'workspace.jsonc'), 'utf8');
  const wsJsonc: any = parse(wsJsoncRaw);
  const wsPolicy = wsJsonc?.['teambit.dependencies/dependency-resolver']?.policy;
  const repoPkgJson = await fs.readJson(join(paths.repoRoot, 'package.json'));

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
      'the packages that could not be inlined into bit.app.js. installed *inside* the bundle dir so ' +
      'that a package manager run here can never touch the generated @teambit/* shims one level up.',
    dependencies: Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))),
  };
  await fs.writeJson(join(paths.bundleDir, 'package.json'), packageJson, { spaces: 2 });
  return { dependencies, unresolved };
}
