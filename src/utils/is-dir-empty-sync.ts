import { readDirIgnoreSystemFilesSync } from '@teambit/toolbox.fs.readdir-skip-system-files';

export default function isDirEmptySync(dirPath: string): boolean {
  return !readDirIgnoreSystemFilesSync(dirPath).length;
}
