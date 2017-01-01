/** @flow */
import * as fs from 'fs';
import * as path from 'path';
import Source from './source';
import createTemplate from '../templates/impl.default-template';
import BitJson from '../../bit-json';
import loadPlugin from '../environment/load-plugin';
import InvalidImpl from '../exceptions/invalid-impl';
import MissingImpl from '../exceptions/missing-impl';

export default class Impl extends Source {
  write(bitPath: string, fileName: string): Promise<any> {
    return new Promise((resolve, reject) =>
      fs.writeFile(path.join(bitPath, fileName), this.src, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      })
    );
  }
  
  validate() {
    if (typeof this.src !== 'string') throw new InvalidImpl();
  }

  static load(bitPath: string, fileName: string): Promise<Impl> {
    const implPath = path.join(bitPath, fileName);
    return new Promise((resolve, reject) => 
      fs.readFile(implPath, (err, data) => {
        if (err) {
          if (err.code === 'ENOENT') { reject(new MissingImpl(implPath)); }
          return reject(err);
        }
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
