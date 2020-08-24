import fs from 'fs-extra';
import { userInfo } from 'os';

export type Options = {
  uid?: number | null | undefined;
  gid?: number | null | undefined;
};

export default (async function writeFile(
  path: string,
  contents: string | Buffer,
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  options?: Options = {}
): Promise<void> {
  await fs.outputFile(path, contents);
  if (options.gid || options.uid) {
    const user = userInfo();
    await fs.chown(path, options.uid || user.uid, options.gid || user.gid);
  }
});
