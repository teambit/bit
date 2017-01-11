/** @flow */
import * as fs from 'fs';
import * as path from 'path';
import Source from './source';
import BitId from '../../../bit-id';
import createTemplate from '../templates/specs.default-template';
import Environment from '../../../scope/repositories/environment';

export default class Specs extends Source {
  write(bitPath: string, fileName: string): Promise<any> {
    return new Promise((resolve, reject) => {
      fs.writeFile(path.join(bitPath, fileName), this.src, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      });
    });
  }
  
  static load(specsPath: string): Specs|null {
    try {
      const data = fs.readFileSync(specsPath);
      return new Specs(data.toString());
    } catch (err) {
      return null; // when cant load specs it's ok, just return undefined';
    }
  }

  static create(name: string, testerId: BitId, environment: Environment): Specs {
    function getTemplate() {
      try {
        const testerModule = environment.get(testerId);
        return testerModule.getTemplate(name);
      } catch (e) {
        return createTemplate({ name });
      }
    }

    return new Specs(getTemplate());
  }
}
