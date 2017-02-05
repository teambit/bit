/** @flow */
import * as fs from 'fs';
import * as path from 'path';
import Source from './source';
import createTemplate from '../templates/impl.default-template';
import BitId from '../../../bit-id';
import InvalidImpl from '../exceptions/invalid-impl';
import MissingImpl from '../exceptions/missing-impl';
import { Scope } from '../../../scope';

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

  serialize() {
    return this.src;
  }

  static deserialize(str: string) {
    return new Impl(str);
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

  static create(name: string, compilerId: BitId, scope: Scope): Impl {
    function getTemplate() {
      try {
        const testerModule = scope.loadEnvironment(compilerId);
        return testerModule.getTemplate(name);
      } catch (e) {
        return createTemplate({ name });
      }
    }

    return new Impl(getTemplate());
  }
}
