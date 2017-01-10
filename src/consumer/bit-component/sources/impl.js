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

  static load(implPath: string): Impl {
    try {
      const data = fs.readFileSync(implPath);
      return new Impl(data.toString());
    } catch (err) {
      if (err.code === 'ENOENT') { throw new MissingImpl(implPath); }
      throw err;
    }
  }

  static create(name, compilerId): Impl {
    function getTemplate() {
      try {
        const testerModule = loadPlugin(compilerId);
        return testerModule.getTemplate(name);
      } catch (e) {
        return createTemplate({ name });
      }
    }

    return new Impl(getTemplate());
  }
}
