import { resolve, join } from 'path';
import { readdir, existsSync } from 'fs-extra';

export function getAspectDir(id: string): string {
  const aspectName = id.split('/')[1];
  let dirPath: string;
  try {
    const moduleDirectory = require.resolve(`@teambit/${aspectName}`);
    dirPath = join(moduleDirectory, '..'); // to remove the "index.js" at the end
  } catch (err) {
    dirPath = resolve(__dirname, '../..', aspectName, 'dist');
  }
  if (!existsSync(dirPath)) {
    throw new Error(`unable to find ${aspectName} in ${dirPath}`);
  }
  return dirPath;
}

export async function getAspectDef(aspectName: string, runtime: string) {
  const dirPath = getAspectDir(aspectName);
  const files = await readdir(dirPath);
  const runtimeFile = files.find((file) => file.includes(`.${runtime}.runtime.js`)) || null;

  return {
    aspectPath: join(dirPath, '..'),
    runtimePath: runtimeFile ? resolve(`${dirPath}/${runtimeFile}`) : null,
  };
}
