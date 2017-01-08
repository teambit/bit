/** @flow */
import path from 'path';
import BitObject from './object';
import Ref from './ref';
import { OBJECTS_DIR } from '../constants';
import { mkdirp, writeFile, allSettled, readFile } from '../utils';
import { Scope } from '../scope';

export default class Repository {
  objects: BitObject[] = [];
  scope: Scope;
  types: {[string]: Function};

  constructor(scope: Scope, objectTypes: Function[] = []) {
    this.scope = scope;
    this.types = objectTypes.reduce((map, objectType) => {
      map[objectType.name] = objectType;
      return map;
    }, {});
  }

  ensureDir() {
    return mkdirp(this.getPath());
  }

  getPath() {
    return path.join(this.scope.getPath(), OBJECTS_DIR);
  }

  objectPath(hash: string): string {
    return path.join(this.getPath(), hash.slice(0, 2), hash.slice(2));
  }

  load(ref: Ref): Promise<BitObject> {
    return readFile(this.objectPath(ref.hash))
      .then(fileContents => BitObject.parse(fileContents, this.types));
  }

  add(object: BitObject): Repository {
    this.objects.push(object);
    return this;
  }

  persist(): Promise<> {
    // @TODO handle failures
    return allSettled(this.objects.map(object => this.persistOne(object)));
  }

  persistOne(object: BitObject): Promise<> {
    return object.compress()
      .then((contents) => {
        return writeFile(this.objectPath(object.hash()), contents);
      }); 
  }
}

