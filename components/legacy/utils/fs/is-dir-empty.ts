import { readDirIgnoreSystemFiles } from '@teambit/toolbox.fs.readdir-skip-system-files';

export default async function isDirEmpty(dirPath: string): Promise<boolean> {
  const files = await readDirIgnoreSystemFiles(dirPath);
  return !files.length;
}
