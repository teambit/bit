/** @flow */
import * as fs from 'fs';
import * as path from 'path';
import Source from './source';
import createTemplate from '../templates/impl.default-template';
import BitJson from '../../bit-json';
import loadPlugin from '../environment/load-plugin';

export default class Impl extends Source {
  write(bitPath: string, fileName: string): Promise<any> {
    return new Promise((resolve, reject) =>
      fs.writeFile(path.join(bitPath, fileName), this.src, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      })
    );
  }
  
  static load(bitPath: string, fileName: string): Promise<Impl> {
    return new Promise((resolve, reject) => 
      fs.readFile(path.join(bitPath, fileName), (err, data) => {
        if (err) return reject(err);
        return resolve(new Impl(data.toString()));
      })
    );
  }

  static create(bitJson: BitJson): Impl {
    function getTemplate() {
      (bitJson.getCompilerName()); // @TODO make sure it get the template 
      try {
        const testerModule = loadPlugin(bitJson.getCompilerName());
        return testerModule.getTemplate(bitJson.name);
      } catch (e) {
        return createTemplate(bitJson);
      }
    }

    return new Impl(getTemplate());
  }
}
