/** @flow */
import fs from 'fs-extra';
import pathlib from 'path';

export default (async function removeFile(path: string, propogateDirs: boolean = false): Promise<boolean> {
  const res = await fs.unlink(path);
  if (!propogateDirs) return res;
  const { dir } = pathlib.parse(path);
  const files = await fs.readdir(dir);
  if (files.length !== 0) return res;
  await fs.remove(dir);
  return res;
});
