import fs from 'fs-extra';

import logger from '../../../logger/logger';
import { identityFile } from '../../../utils';

async function readKey(keyPath: string | null | undefined) {
  if (!keyPath) return '';

  try {
    const fileBuffer = await fs.readFile(keyPath);
    return fileBuffer;
  } catch (e) {
    return '';
  }
}

export default (async function keyGetter(keyPath?: string) {
  if (keyPath) return readKey(keyPath);
  const sshFile = await identityFile();
  logger.debug(`ssh, reading ssh key at ${sshFile}`);
  return readKey(sshFile);
});
