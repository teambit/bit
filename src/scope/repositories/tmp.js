/** @flow */
import fs from 'fs-extra';
import { v4 } from 'uuid';
import * as path from 'path';
import Repository from '../repository';
import { BIT_TMP_DIRNAME } from '../../constants';

export default class Tmp extends Repository {
  getPath(): string {
    return path.join(super.getPath(), BIT_TMP_DIRNAME);
  }

  composePath(p: string): string {
    return path.join(this.getPath(), p);
  }

  save(data: string, ext: string = '.js'): Promise<string> {
    return new Promise((resolve, reject) => {
      const fileName = v4();
      const filePath = this.composePath(`${fileName}${ext}`);
      fs.outputFile(filePath, data, (err) => {
        if (err) return reject(err);
        return resolve(filePath);
      });
    });
  }

  saveSync(data: string, ext: string = '.js'): string {
    const fileName = v4();
    const filePath = this.composePath(`${fileName}${ext}`);
    fs.outputFileSync(filePath, data);
    return filePath;
  }

  remove(fileNameOrPath: string, ext: string = '.js'): Promise<any> {
    return new Promise((resolve, reject) => {
      const fileName = path.parse(fileNameOrPath).name;
      const filePath = this.composePath(`${fileName}${ext}`);
      fs.remove(filePath, (err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
  }

  removeSync(fileNameOrPath: string, ext: string = '.js'): any {
    const fileName = path.parse(fileNameOrPath).name;
    const filePath = this.composePath(`${fileName}${ext}`);
    return fs.removeSync(filePath);
  }

  clear(): Promise<any> {
    return new Promise((resolve, reject) => {
      fs.rmdir(this.getPath(), (err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
  }

  clearSync(): any {
    return fs.rmdirSync(this.getPath());
  }
}
