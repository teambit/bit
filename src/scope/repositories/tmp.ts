import fs from 'fs-extra';
import * as path from 'path';
import { v4 } from 'uuid';

import { BIT_TMP_DIRNAME } from '../../constants';
import logger from '../../logger/logger';
import { PathOsBased } from '../../utils/path';
import Repository from '../repository';

export default class Tmp extends Repository {
  getPath(): string {
    return path.join(super.getPath(), BIT_TMP_DIRNAME);
  }

  composePath(p: string): string {
    return path.join(this.getPath(), p);
  }

  async save(data: string, ext = '.js'): Promise<PathOsBased> {
    const fileName = v4();
    const filePath = this.composePath(`${fileName}${ext}`);
    await fs.outputFile(filePath, data);
    return filePath;
  }

  saveSync(data: string, ext = '.js'): PathOsBased {
    const fileName = v4();
    const filePath = this.composePath(`${fileName}${ext}`);
    fs.outputFileSync(filePath, data);
    return filePath;
  }

  remove(fileNameOrPath: string, ext = '.js'): Promise<any> {
    const fileName = path.parse(fileNameOrPath).name;
    const filePath = this.composePath(`${fileName}${ext}`);
    logger.info(`tmp.remove, deleting ${filePath}`);
    return fs.remove(filePath);
  }

  removeSync(fileNameOrPath: string, ext = '.js'): any {
    const fileName = path.parse(fileNameOrPath).name;
    const filePath = this.composePath(`${fileName}${ext}`);
    logger.info(`tmp.removeSync, deleting ${filePath}`);
    return fs.removeSync(filePath);
  }

  clear(): Promise<any> {
    const dirToDelete = this.getPath();
    logger.info(`tmp.clear, deleting ${dirToDelete}`);
    return fs.emptyDir(dirToDelete);
  }

  clearSync(): any {
    const dirToDelete = this.getPath();
    logger.info(`tmp.clearSync, deleting ${dirToDelete}`);
    return fs.emptyDirSync(dirToDelete);
  }
}
