/** @flow */
import path from 'path';
import fs from 'fs';
import BitJsonAlreadyExists from '../exceptions/bit-json-already-exists';
import BitJsonNotFound from '../exceptions/bit-json-not-found';
import { BIT_JSON } from '../../constants';

function composePath(bitPath: string) {
  return path.join(bitPath, BIT_JSON);
}

function hasExisting(bitPath: string): boolean {
  return fs.existsSync(composePath(bitPath));
}

export default class BitJson {
  /**
   * dependencies in bit json
   **/
  dependencies: {[string]: string} = {};

  constructor(dependencies: {[string]: string} = {}) {
    this.dependencies = dependencies;
  }

  /**
   * add dependency
   */
  addDependency(name: string, version: string) {
    this.dependencies[name] = version;
  }

  /**
   * remove dependency
   */
  removeDependency(name: string) {
    delete this.dependencies[name];
  } 

  /**
   * check whether dependency exists
   */
  hasDependency(name: string) {
    return !!this.dependencies[name];
  }

  /**
   * convert to plain object
   */
  toPlainObject() {
    return {
      dependencies: this.dependencies
    };
  }

  /**
   * convert to json
   */  
  toJson() {
    return JSON.stringify(this.toPlainObject(), null, 4);
  }

  /**
   * write to file as json
   */
  write(bitPath: string, override: boolean = false): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!override && hasExisting(bitPath)) {
        throw new BitJsonAlreadyExists();
      }

      const repspond = (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      };

      fs.writeFile(
        composePath(bitPath),
        this.toJson(),
        repspond
      );
    });
  }

  /**
   * load existing json in root path
   */
  static load(bitJsonPath: string): BitJson {
    if (!hasExisting(bitJsonPath)) throw new BitJsonNotFound();
    const file = JSON.parse(fs.readFileSync(composePath(bitJsonPath)).toString('utf8'));
    return new BitJson(file.dependencies);
  }
}
