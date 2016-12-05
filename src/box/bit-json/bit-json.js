/** @flow */
import * as pathlib from 'path';
import * as fs from 'fs';
import BitJsonAlreadyExists from '../exceptions/bit-json-already-exists';
import BitJsonNotFound from '../exceptions/bit-json-not-found';
import { BIT_JSON } from '../../constants';

function composeWithPath(path: string) {
  return pathlib.join(path, BIT_JSON);
}

function hasExisting(path: string): boolean {
  return fs.existsSync(composeWithPath(path));
}

export default class BitJson {
  /**
   * dependencies in bit json
   **/
  dependencies: {[string]: string} = {};
  
  /**
   * contained box
   */
  path: string;

  constructor(path: string, dependencies: {[string]: string} = {}) {
    this.path = path;
    this.dependencies = dependencies;
  }

  /**
   * compose concerete path for bit.json in root path.
   */ 
  composePath() {
    return composeWithPath(this.path);
  }

  /**
   * test whether bit.json already exists in root path
   */
  hasExisting(): boolean {
    return hasExisting(this.path);
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
  write(override: boolean = false): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!override && this.hasExisting(this.path)) {
        throw new BitJsonAlreadyExists();
      }

      const repspond = (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      };

      fs.writeFile(
        this.composePath(),
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
    const file = JSON.parse(fs.readFileSync(composeWithPath(bitJsonPath)).toString('utf8'));
    return new BitJson(bitJsonPath, file.dependencies);
  }
}
