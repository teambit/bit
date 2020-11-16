import readDirIgnoreDsStore from './read-dir-ignore-ds-store';

export default async function isDirEmpty(dirPath: string): Promise<boolean> {
  const files = await readDirIgnoreDsStore(dirPath);
  return !files.length;
}
