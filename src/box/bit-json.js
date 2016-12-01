/** @flow */
import * as pathlib from 'path';
import * as fs from 'fs';
import { BIT_JSON } from '../constants';

export default class BitJson {
  dependencies: { string: string } = {};
  path: string;

  constructor(path: string, dependencies: {string: string} = {}) {
    this.path = path;
    this.dependencies = dependencies;
  }

  composePath() {
    return this.composeWithPath(this.path);
  }

  static composeWithPath(path: string) {
    return pathlib.join(path, BIT_JSON);
  }

  addDependency(name, version) {
    this.dependencies[name] = version;
  }

  removeDependency(name) {
    delete this.dependencies[name];
  } 

  hasDependency(name) {
    return !!this.dependencies[name];
  }

  toPlainObject() {
    return {
      dependencies: this.dependencies
    };
  }

  toJson() {
    JSON.stringify(this.toPlainObject(), null, 4);
  }

  write(override: boolean) {
    if (!override && this.hasExisting()) {
      throw new BitJsonExists();
    }

    return fs.writeFileSync(
      this.composePath(),
      this.toJson()
    );
  }

  static hasExisting(path: string): boolean {
    return fs.existsSync(this.composeWithPath(path));
  }

  static load(path: string): ?BitJson {
    if (!this.hasExisting(path)) throw new BitJsonNotFound();
    const file = JSON.parse(fs.readFileSync(this.composeWithPath(path), 'utf8').toString);
    return new BitJson(path, file.dependencies);
  }
}
