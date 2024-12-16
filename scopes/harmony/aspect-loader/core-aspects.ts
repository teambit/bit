import { BitError } from '@teambit/bit-error';
import { existsSync, pathExists, readdir } from 'fs-extra';
import { join, resolve } from 'path';
import { Config } from '@teambit/bvm.config';
import { findCurrentBvmDir } from '@teambit/bvm.path';
import findRoot from 'find-root';

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
function resolveFromBvmDir(packageName: string): string | undefined {
  const currentBitDir = findCurrentBvmDir();
  if (currentBitDir) {
    return resolve(currentBitDir, 'node_modules', packageName);
  }
  return undefined;
}

function getAspectDirFromPath(id: string, pathsToResolveAspects?: string[]): string {
  const aspectName = getCoreAspectName(id);
  const packageName = getCoreAspectPackageName(id);

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

export function getAspectDir(id: string): string {
  const aspectName = getCoreAspectName(id);
  let dirPath;

  try {
    dirPath = getAspectDirFromPath(id);
  } catch {
    dirPath = resolve(__dirname, '../..', aspectName, 'dist');
  }
  if (!existsSync(dirPath)) {
    // Maybe it's bundle
    const aspectPackage = getCoreAspectPackageName(id);
    try {
      dirPath = findRoot(require.resolve(aspectPackage));
    } catch {
      throw new Error(`unable to find ${aspectName}`);
    }
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

// function getCoreAspectDirFromPath(resolvedModulesPath: string): string {
//   if (!resolvedModulesPath.includes('@teambit')) {
//     throw new Error(`unable to find core aspect in ${resolvedModulesPath}`);
//   }
//   let currentDir = resolvedModulesPath;
//   let parentDir = dirname(currentDir);
//   while (basename(parentDir) !== '@teambit') {
//     currentDir = parentDir;
//     parentDir = dirname(currentDir);
//   }
//   return currentDir;
// }

export function getAspectDistDir(id: string) {
  const aspectDir = getAspectDir(id);
  // When running from bundle there won't be a dist folder
  return resolve(`${aspectDir}/dist`);
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

export async function getAspectDef(aspectName: string, runtime?: string) {
  let dirPath = getAspectDir(aspectName);
  const distDirPath = getAspectDistDir(aspectName);
  const isDistDirExists = await pathExists(distDirPath);
  if (distDirPath && isDistDirExists) {
    dirPath = join(dirPath, '..');
  }

  const filesDir = distDirPath && isDistDirExists ? distDirPath : dirPath;
  const files = await readdir(filesDir);
  let runtimeFile;
  if (runtime) {
    runtimeFile = files.find((file) => file.includes(`.${runtime}.runtime.js`)) || null;
  }
  const aspectFile = files.find((file) => file.includes(`.aspect.js`)) || null;

  return {
    id: aspectName,
    aspectPath: dirPath,
    aspectFilePath: aspectFile ? resolve(`${dirPath}/${aspectFile}`) : null,
    runtimePath: runtimeFile ? resolve(`${dirPath}/${runtimeFile}`) : null,
  };
}
