/** @flow */
import * as fs from 'fs';
import * as path from 'path';
import Source from './source';
import BitJson from '../../bit-json';
import createTemplate from '../templates/specs.default-template';
import loadPlugin from '../environment/load-plugin';

export default class Specs extends Source {
  write(bitPath: string, fileName: string): Promise<any> {
    return new Promise((resolve, reject) => {
      fs.writeFile(path.join(bitPath, fileName), this.src, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      });
    });
  }
  
  static load(bitPath: string, fileName: string): Specs {
    try {
      const data = fs.readFileSync(path.join(bitPath, fileName));
      return new Specs(data.toString());
    } catch (err) {
      return undefined; // when cant load specs it's ok, just return undefined';
    }
  }

  static create(name, testerId): Specs {
    function getTemplate() {
      try {
        const testerModule = loadPlugin(testerId);
        return testerModule.getTemplate(name);
      } catch (e) {
        return createTemplate({ name });
      }
    }

    return new Specs(getTemplate());
  }
}
