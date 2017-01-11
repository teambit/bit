/** @flow */
import fs from 'fs';
import path from 'path';
import BitObject from './object';
import Ref from './ref';
import { OBJECTS_DIR } from '../../constants';
import { mkdirp, writeFile, allSettled, readFile } from '../../utils';
import { Scope } from '../../scope';

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

  objectPath(ref: Ref): string {
    const hash = ref.toString();
    return path.join(this.getPath(), hash.slice(0, 2), hash.slice(2));
  }

  load(ref: Ref): Promise<BitObject> {
    return readFile(this.objectPath(ref))
      .then(fileContents => BitObject.parseObject(fileContents, this.types))
      .catch(() => null);
  }

  loadRaw(ref: Ref): Promise<Buffer> {
    return readFile(this.objectPath(ref));
  }

  loadSync(ref: Ref): BitObject {
    return BitObject.parseSync(fs.readFileSync(this.objectPath(ref)), this.types);
  }

  add(object: ?BitObject): Repository {
    if (!object) return this;
    this.objects.push(object);
    return this;
  }

  /**
   * alias to `load`
   */
  findOne(ref: Ref): Promise<BitObject> {
    return this.load(ref);
  }

  findMany(refs: Ref[]): Promise<BitObject[]> {
    return Promise.all(refs.map(ref => this.load(ref)));
  }

  persist(): Promise<[]> {
    // @TODO handle failures
    return allSettled(this.objects.map(object => this.persistOne(object)));
  }

  persistOne(object: BitObject): Promise<boolean> {
    return object.compress()
      .then((contents) => {
        return writeFile(this.objectPath(object.hash()), contents);
      }); 
  }
}

