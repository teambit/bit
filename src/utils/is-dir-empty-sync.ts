import { readDirSyncIgnoreDsStore } from './fs/read-dir-ignore-ds-store';

export default function isDirEmptySync(dirPath: string): boolean {
  return !readDirSyncIgnoreDsStore(dirPath).length;
}
