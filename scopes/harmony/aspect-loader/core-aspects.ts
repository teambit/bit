import { BitError } from '@teambit/bit-error';
import { existsSync, readdir } from 'fs-extra';
import { join, resolve } from 'path';
import { Config } from '@teambit/bvm.config';

let _bvmConfig;

function getAspectDirFromPath(id: string, pathsToResolveAspects?: string[]): string {
  const aspectName = getCoreAspectName(id);
  const packageName = getCoreAspectPackageName(id);

  let moduleDirectory;
  if (pathsToResolveAspects && pathsToResolveAspects.length) {
    moduleDirectory = require.resolve(packageName, { paths: pathsToResolveAspects });
  } else {
    moduleDirectory = require.resolve(packageName);
  }
  const dirPath = join(moduleDirectory, '../..'); // to remove the "index.js" at the end
  if (!existsSync(dirPath)) {
    throw new Error(`unable to find ${aspectName} in ${dirPath}`);
  }
  return dirPath;
}

export function getAspectDir(id: string): string {
  const aspectName = getCoreAspectName(id);
  let dirPath;

  try {
    dirPath = getAspectDirFromPath(id);
  } catch (err: any) {
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
  if (!_bvmConfig) {
    _bvmConfig = Config.load(false, ['env', 'file']);
  }
  const bvmConfig = _bvmConfig;
  let version;
  if (bvmDirOptions?.version) {
    version = bvmDirOptions?.version;
  } else {
    const link = bvmDirOptions?.linkName || bvmConfig.getDefaultLinkName();
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

export function getAspectDistDir(id: string) {
  return resolve(`${getAspectDir(id)}/dist`);
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
