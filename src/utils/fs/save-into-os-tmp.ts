import path from 'path';
import fs from 'fs-extra';
import { v4 } from 'uuid';
import { BIT_TEMP_ROOT } from '@teambit/defender.fs.global-bit-temp-dir';
import { PathOsBased } from '../path';

const BASE_PATH = path.join(BIT_TEMP_ROOT, 'tmp');

export async function saveIntoOsTmp(data: string, filename = v4(), ext = '.js'): Promise<PathOsBased> {
  const filePath = path.join(BASE_PATH, `${filename}${ext}`);
  await fs.outputFile(filePath, data);
  return filePath;
}
