import fs from 'fs-extra';
import pathLib from 'path';
import writeFileAtomic from 'write-file-atomic';
import { userInfo } from 'os';

export type ChownOptions = {
  uid?: number | null | undefined;
  gid?: number | null | undefined;
};

export default async function writeFile(
  path: string,
  contents: string | Buffer,
  options: ChownOptions = {}
): Promise<void> {
  let chown;
  if (options.gid || options.uid) {
    const user = userInfo();
    chown = { uid: options.uid || user.uid, gid: options.gid || user.gid };
  }
  await fs.ensureDir(pathLib.dirname(path));
  await writeFileAtomic(path, contents, { chown });
}
