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
 * where the core aspects sit inside a bundled distribution, relative to its root. the bundle
 * installs only `@teambit/bit` at the root and keeps every other core aspect as a shim package
 * nested under it - see `scopes/harmony/modules/cli-bundler/config.ts`, which explains why the
 * nesting is what makes a bare `require('@teambit/<aspect>')` resolve to the shim.
 */
const BUNDLED_SHIMS_DIR = join('node_modules', '@teambit', 'bit', 'dist', 'core-aspects', 'node_modules');

function resolveFromBvmDir(packageName: string): string | undefined {
  const currentBitDir = findCurrentBvmDir();
  if (!currentBitDir) return undefined;
  const fromRoot = resolve(currentBitDir, 'node_modules', packageName);
  if (existsSync(fromRoot)) return fromRoot;
  // a bundled bit installed by bvm has nothing but `@teambit/bit` at that root, so the path above
  // does not exist and this resolver - which runs first whenever bit runs from ~/.bvm - used to
  // hand back a directory that isn't there. `getAspectDir` then threw "unable to find <aspect> in
  // <path>" on the very first aspect it needed, and the bundled CLI could not start at all.
  const fromShims = resolve(currentBitDir, BUNDLED_SHIMS_DIR, packageName);
  if (existsSync(fromShims)) return fromShims;
  // neither layout has it: keep returning the root path, as before. callers that guard with
  // existsSync stay on the path they have always taken, instead of getting a new throw from the
  // resolution below them.
  return fromRoot;
}

function getAspectDirFromPath(id: string, pathsToResolveAspects?: string[], isCore = true): string {
  const aspectName = getCoreAspectName(id);
  const packageName = isCore ? getCoreAspectPackageName(id) : getNonCorePackageName(id);

  if (pathsToResolveAspects && pathsToResolveAspects.length) {
    const fromPaths = resolveFromPaths(packageName, aspectName, pathsToResolveAspects);
    return fromPaths;
  }
  const isRunFromBvmDir = isRunFromBvm();
  const resolvers = isRunFromBvmDir ? [resolveFromBvmDir, resolveFromCurrDir] : [resolveFromCurrDir, resolveFromBvmDir];
  for (const resolver of resolvers) {
    const currResolved = resolver(packageName, aspectName);
    if (currResolved) return currResolved;
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

/**
 * resolve a directory that ships *inside* an aspect's own package - currently the pre-built UI and
 * preview bundles under `artifacts/`, which `bit start` serves instead of running rspack.
 *
 * the aspect as resolved for the *running* bit is tried first, so a distribution serves the
 * artifacts it shipped with rather than whichever bit happens to be linked in bvm. only then does it
 * fall back to the bvm installation, which is what a bit running from source needs: there
 * `@teambit/<aspect>` is a symlink to the workspace component and carries no artifacts.
 *
 * returns `undefined` rather than throwing - a missing pre-bundle is a normal state that callers
 * answer by building one.
 */
export function getAspectArtifactDir(id: string, artifactDir: string): string | undefined {
  const resolvers = [() => getAspectDir(id), () => getAspectDirFromBvm(id)];
  for (const resolver of resolvers) {
    try {
      const dirPath = join(resolver(), artifactDir);
      if (existsSync(dirPath)) return dirPath;
    } catch {
      // an aspect that resolves nowhere is handled by the next resolver, or by returning undefined
    }
  }
  return undefined;
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
function getNonCorePackageName(id: string): string {
  const [scope, ...name] = id.split('/');
  const aspectName = name.join('.');
  return `@${scope.replace('.', '/')}.${aspectName}`;
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
