/** @flow */
import * as pathlib from 'path';
import * as fs from 'fs';
import BitJsonAlreadyExists from './exceptions/bit-json-already-exists';
import { BIT_JSON } from '../constants';

function composeWithPath(path: string) {
  return pathlib.join(path, BIT_JSON);
}

function hasExisting(path: string): boolean {
  return fs.existsSync(composeWithPath(path));
}

export default class BitJson {
  dependencies: {[string]: string} = {};
  path: string;

  constructor(path: string, dependencies: {[string]: string} = {}) {
    this.path = path;
    this.dependencies = dependencies;
  }

  composePath() {
    return composeWithPath(this.path);
  }

  hasExisting(): boolean {
    return hasExisting(this.path);
  }

  addDependency(name: string, version: string) {
    this.dependencies[name] = version;
  }

  removeDependency(name: string) {
    delete this.dependencies[name];
  } 

  hasDependency(name: string) {
    return !!this.dependencies[name];
  }

  toPlainObject() {
    return {
      dependencies: this.dependencies
    };
  }

  toJson() {
    return JSON.stringify(this.toPlainObject(), null, 4);
  }

  write(override: boolean = false) {
    if (!override && this.hasExisting(this.path)) {
      throw new BitJsonAlreadyExists();
    }

    return fs.writeFileSync(
      this.composePath(),
      this.toJson()
    );
  }

  static load(path: string): ?BitJson {
    if (!hasExisting(path)) throw new BitJsonAlreadyExists();
    const file = JSON.parse(fs.readFileSync(composeWithPath(path)).toString('utf8'));
    return new BitJson(path, file.dependencies);
  }
}
