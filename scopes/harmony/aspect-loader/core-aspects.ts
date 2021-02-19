import { existsSync, readdir } from 'fs-extra';
import { join, resolve } from 'path';

export function getAspectDir(id: string): string {
  const aspectName = getCoreAspectName(id);
  const packageName = getCoreAspectPackageName(id);
  let dirPath: string;
  try {
    const moduleDirectory = require.resolve(packageName);
    dirPath = join(moduleDirectory, '../..'); // to remove the "index.js" at the end
  } catch (err) {
    dirPath = resolve(__dirname, '../..', aspectName, 'dist');
  }
  if (!existsSync(dirPath)) {
    throw new Error(`unable to find ${aspectName} in ${dirPath}`);
  }
  return dirPath;
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

  return {
    id: aspectName,
    aspectPath: join(dirPath, '..'),
    runtimePath: runtimeFile ? resolve(`${dirPath}/${runtimeFile}`) : null,
  };
}
