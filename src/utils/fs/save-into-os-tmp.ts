import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { v4 } from 'uuid';
import { PathOsBased } from '../path';

const BASE_PATH = path.join(os.tmpdir(), 'bit', 'tmp');

export async function saveIntoOsTmp(data: string, filename = v4(), ext = '.js'): Promise<PathOsBased> {
  const filePath = path.join(BASE_PATH, `${filename}${ext}`);
  await fs.outputFile(filePath, data);
  return filePath;
}
