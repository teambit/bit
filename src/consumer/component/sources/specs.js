/** @flow */
import fs from 'fs';
import * as path from 'path';
import Source from './source';
import BitId from '../../../bit-id';
import createTemplate from '../templates/specs.default-template';
import { Scope } from '../../../scope';

export default class Specs extends Source {
  write(bitPath: string, fileName: string, force?: boolean = true): Promise<any> {
    const filePath = path.join(bitPath, fileName);
    if (!force && fs.existsSync(filePath)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, this.src, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      });
    });
  }

  serialize() {
    return this.src;
  }

  static deserialize(str: string) {
    return new Specs(str);
  }

  static load(specsPath: string): Specs|null {
    try {
      const data = fs.readFileSync(specsPath);
      return new Specs(data.toString());
    } catch (err) {
      return null; // when cant load specs it's ok, just return undefined';
    }
  }

  static create(name: string, testerId: BitId, scope: Scope): Specs {
    function getTemplate() {
      try {
        const testerModule = scope.loadEnvironment(testerId);
        return testerModule.getTemplate(name);
      } catch (e) {
        return createTemplate({ name });
      }
    }

    return new Specs(getTemplate());
  }
}
