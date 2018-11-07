/** @flow */
import fs from 'fs-extra';
import { v4 } from 'uuid';
import * as path from 'path';
import Repository from '../repository';
import { BIT_TMP_DIRNAME } from '../../constants';
import type { PathOsBased } from '../../utils/path';
import logger from '../../logger/logger';

export default class Tmp extends Repository {
  getPath(): string {
    return path.join(super.getPath(), BIT_TMP_DIRNAME);
  }

  composePath(p: string): string {
    return path.join(this.getPath(), p);
  }

  save(data: string, ext: string = '.js'): Promise<PathOsBased> {
    return new Promise((resolve, reject) => {
      const fileName = v4();
      const filePath = this.composePath(`${fileName}${ext}`);
      fs.outputFile(filePath, data, (err) => {
        if (err) return reject(err);
        return resolve(filePath);
      });
    });
  }

  saveSync(data: string, ext: string = '.js'): PathOsBased {
    const fileName = v4();
    const filePath = this.composePath(`${fileName}${ext}`);
    fs.outputFileSync(filePath, data);
    return filePath;
  }

  remove(fileNameOrPath: string, ext: string = '.js'): Promise<any> {
    const fileName = path.parse(fileNameOrPath).name;
    const filePath = this.composePath(`${fileName}${ext}`);
    logger.info(`tmp, deleting ${filePath}`);
    return fs.remove(filePath);
  }

  removeSync(fileNameOrPath: string, ext: string = '.js'): any {
    const fileName = path.parse(fileNameOrPath).name;
    const filePath = this.composePath(`${fileName}${ext}`);
    logger.info(`tmp, deleting ${filePath}`);
    return fs.removeSync(filePath);
  }

  clear(): Promise<any> {
    const dirToDelete = this.getPath();
    logger.info(`tmp, deleting ${dirToDelete}`);
    return fs.emptyDir(dirToDelete);
  }

  clearSync(): any {
    const dirToDelete = this.getPath();
    logger.info(`tmp, deleting ${dirToDelete}`);
    return fs.emptyDirSync(dirToDelete);
  }
}
