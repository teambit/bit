/** @flow */
import fs from 'fs';

export default function existsSync(path: string): Boolean {
  return fs.existsSync(path);
}
