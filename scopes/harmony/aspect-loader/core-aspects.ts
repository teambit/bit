import { BitError } from '@teambit/bit-error';
import { existsSync, readdir } from 'fs-extra';
import { join, resolve } from 'path';
import { Config } from '@teambit/bvm.config';
import { findCurrentBvmDir } from '@teambit/bvm.path';

let _bvmConfig;

export function getBvmDir(): string {
  if (!_bvmConfig) {
    _bvmConfig = Config.load(false, ['env', 'file']);
  }

  const bvmConfig = _bvmConfig;
  return bvmConfig.getBvmDirectory();
}

function isRunFromBvm() {
  return __dirname.includes('.bvm') || __dirname.includes(getBvmDir());
}

function resolveFromPaths(packageName: string, aspectName: string, pathsToResolveAspects: string[]): string {
  const moduleDirectory = require.resolve(packageName, { paths: pathsToResolveAspects });
  const dirPath = join(moduleDirectory, '../..'); // to remove the "index.js" at the end
  if (!existsSync(dirPath)) {
    throw new Error(`unable to find ${aspectName} in ${dirPath}`);
  }
  return dirPath;
}

function resolveFromCurrDir(packageName: string, aspectName: string): string | undefined {
  try {
    const moduleDirectory = require.resolve(packageName);
    const dirPath = join(moduleDirectory, '../..'); // to remove the "index.js" at the end
    if (!existsSync(dirPath)) {
      throw new Error(`unable to find ${aspectName} in ${dirPath}`);
    }
    return dirPath;
  } catch {
    return undefined;
  }
}
/**
 * where a bundled distribution keeps the packages it ships, relative to its root. it installs only
 * `@teambit/bit` at that root and nests every other `@teambit/*` as a shim package inside it - see
 * `scopes/harmony/modules/cli-bundler/config.ts`, which explains why the nesting is what makes a
 * bare `require('@teambit/<name>')` resolve to the shim.
 */
const BUNDLED_SHIMS_DIR = join('node_modules', '@teambit', 'bit', 'dist', 'core-aspects', 'node_modules');

/**
 * resolve a package that ships inside a bit installation, whichever layout that installation has:
 * `<dir>/node_modules/<pkg>` for the module-per-file distribution, the nested shim for a bundled
 * one. this is what makes a bundled bit installed by bvm usable at all - the path below it is the
 * only one that exists there, and callers that got the non-existing one instead either threw
 * ("unable to find <aspect> in <path>", on the first aspect the CLI needed) or linked a workspace
 * to a directory that isn't there.
 *
 * when neither layout has the package, the module-per-file path is returned anyway - that is what
 * callers used to get unconditionally, and several of them answer a missing directory with a
 * fallback of their own, so handing them `undefined` would turn that into a throw.
 */
export function resolvePackageFromBitInstallation(bitDir: string, packageName: string): string {
  const fromRoot = resolve(bitDir, 'node_modules', packageName);
  if (existsSync(fromRoot)) return fromRoot;
  const fromShims = resolve(bitDir, BUNDLED_SHIMS_DIR, packageName);
  if (existsSync(fromShims)) return fromShims;
  return fromRoot;
}

function resolveFromBvmDir(packageName: string): string | undefined {
  const currentBitDir = findCurrentBvmDir();
  if (!currentBitDir) return undefined;
  return resolvePackageFromBitInstallation(currentBitDir, packageName);
}

function getAspectDirFromPath(id: string, pathsToResolveAspects?: string[], isCore = true): string {
  const aspectName = getCoreAspectName(id);
  // a non-core aspect is resolved by the package name a component gets when it is published
  // ("@teambit/react.react"). an env that *used* to be a core aspect is not core anymore, yet every
  // published version of it carries the core-aspects package name ("@teambit/react") - it was core
  // when they were published. fall back to it, so such an env resolves under either convention.
  const packageNames = isCore
    ? [getCoreAspectPackageName(id)]
    : [getNonCorePackageName(id), getCoreAspectPackageName(id)];

  for (const packageName of packageNames) {
    if (pathsToResolveAspects && pathsToResolveAspects.length) {
      try {
        return resolveFromPaths(packageName, aspectName, pathsToResolveAspects);
      } catch {
        continue;
      }
    }
    const isRunFromBvmDir = isRunFromBvm();
    const resolvers = isRunFromBvmDir
      ? [resolveFromBvmDir, resolveFromCurrDir]
      : [resolveFromCurrDir, resolveFromBvmDir];
    for (const resolver of resolvers) {
      const currResolved = resolver(packageName, aspectName);
      if (currResolved) return currResolved;
    }
  }
  throw new Error(`unable to find ${aspectName}`);
}

export function getAspectDir(id: string, isCore = true): string {
  const aspectName = getCoreAspectName(id);
  let dirPath;

  try {
    dirPath = getAspectDirFromPath(id, undefined, isCore);
  } catch {
    dirPath = resolve(__dirname, '../..', aspectName, 'dist');
  }
  if (!existsSync(dirPath)) {
    throw new Error(`unable to find ${aspectName} in ${dirPath}`);
  }
  return dirPath;
}

type BvmDirOptions = {
  version?: string;
  linkName?: string;
};

export function getAspectDirFromBvm(id: string, bvmDirOptions?: BvmDirOptions): string {
  // Resolve from default link
  if (!bvmDirOptions) {
    const packageName = getCoreAspectPackageName(id);
    const resolved = resolveFromBvmDir(packageName);
    if (resolved) return resolved;
  }

  if (!_bvmConfig) {
    _bvmConfig = Config.load(false, ['env', 'file']);
  }

  const bvmConfig = _bvmConfig;
  let version;
  if (bvmDirOptions?.version) {
    version = bvmDirOptions?.version;
  } else {
    const link = bvmDirOptions?.linkName || bvmConfig.getDefaultLinkName();
    if (!link) {
      throw new BitError(`can't find link in bvm config. most likely bvm is not installed`);
    }
    const links = bvmConfig.getLinks();
    version = links[link];
    if (!version) {
      throw new BitError(`can't find link named ${bvmDirOptions?.linkName} in bvm config`);
    }
  }
  const { versionDir, exists } = bvmConfig.getSpecificVersionDir(version, true);
  if (!exists) {
    throw new BitError(`can't find version ${version} in bvm folder`);
  }
  return getAspectDirFromPath(id, [versionDir]);
}

export function getAspectDistDir(id: string, isCore = true) {
  return resolve(`${getAspectDir(id, isCore)}/dist`);
}

export function getCoreAspectName(id: string): string {
  const [, ...name] = id.split('/');
  const aspectName = name.join('.');
  return aspectName;
}

export function getCoreAspectPackageName(id: string): string {
  const aspectName = getCoreAspectName(id);
  return `@teambit/${aspectName}`;
}

/**
 * naive conversion without loading the component. if a component has a custom-package-name, it won't work.
 * id for example: 'org.frontend/ui/button'
 * convert it to package-name, for example: '@org/frontend.ui.button'
 */
export function getNonCorePackageName(id: string): string {
  const [scope, ...name] = id.split('/');
  const aspectName = name.join('.');
  // a scope that has an owner ("teambit.react") splits into the npm scope and the first segment of
  // the name ("@teambit/react.<name>"); a scope without one is the npm scope on its own.
  const scopePrefix = scope.includes('.') ? `@${scope.replace('.', '/')}.` : `@${scope}/`;
  return `${scopePrefix}${aspectName}`;
}

export async function getAspectDef(aspectName: string, runtime?: string) {
  const dirPath = getAspectDistDir(aspectName);

  const files = await readdir(dirPath);
  let runtimeFile;
  if (runtime) {
    runtimeFile = files.find((file) => file.includes(`.${runtime}.runtime.js`)) || null;
  }
  const aspectFile = files.find((file) => file.includes(`.aspect.js`)) || null;

  return {
    id: aspectName,
    aspectPath: join(dirPath, '..'),
    aspectFilePath: aspectFile ? resolve(`${dirPath}/${aspectFile}`) : null,
    runtimePath: runtimeFile ? resolve(`${dirPath}/${runtimeFile}`) : null,
  };
}
