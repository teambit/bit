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

  save(data: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const fileName = v4();
      fs.outputFile(this.composePath(`${fileName}.js`), data, (err) => {
        if (err) return reject(err);
        return resolve(fileName);
      });
    });
  }

  remove(fileName: string): Promise<any> {
    return new Promise((resolve, reject) => {
      fs.remove(this.composePath(`${fileName}.js`), (err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
  }

  clear(): Promise<any> {
    return new Promise((resolve, reject) => {
      fs.rmdir(this.getPath(), (err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
  }
}
