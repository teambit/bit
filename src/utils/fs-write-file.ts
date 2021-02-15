import fs from 'fs-extra';
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
  await fs.outputFile(path, contents);
  if (options.gid || options.uid) {
    const user = userInfo();
    await fs.chown(path, options.uid || user.uid, options.gid || user.gid);
  }
}
