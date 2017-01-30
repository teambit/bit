/** @flow */
import fs from 'fs';
import path from 'path';
import glob from 'glob';
import BitObject from './object';
import Ref from './ref';
import { OBJECTS_DIR } from '../../constants';
import { HashNotFound } from '../exceptions';
import { resolveGroupId, mkdirp, writeFile, removeFile, allSettled, readFile, inflate } from '../../utils';
import { Scope } from '../../scope';
import Component from '../models/component';

export default class Repository {
  objects: BitObject[] = [];
  _cache: {[string]: BitObject} = {};
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
    if (this.getCache(ref)) return Promise.resolve(this.getCache(ref));
    return readFile(this.objectPath(ref))
      .then((fileContents) => {
        return BitObject.parseObject(fileContents, this.types);
      })
      .catch(() => null);
  }

  list():Promise<[]> {
    // @TODO - write
    const filterComponents = refs =>
      refs.filter(ref => ref instanceof Component);

    return new Promise((resolve, reject) => {
      return glob(path.join('*', '*'), { cwd: this.getPath() }, (err, matches) => {
        if (err) reject(err);
        const refs = matches.map(str => str.replace(path.sep, ''));
        Promise.all(refs.map(ref => this.load(ref)))
        .then(filterComponents)
        .then(resolve);
      });
    });
  }

  remove(ref: Ref) {
    return removeFile(this.objectPath(ref), true);
  }

  removeMany(refs: Ref[]) {
    return Promise.all(refs.map(ref => this.remove(ref)));
  }

  loadRaw(ref: Ref): Promise<Buffer> {
    return readFile(this.objectPath(ref));
  }

  loadSync(ref: Ref): BitObject {
    try {
      return BitObject.parseSync(fs.readFileSync(this.objectPath(ref)), this.types);
    } catch (err) {
      throw new HashNotFound(ref.toString());
    }
  }

  setCache(object: BitObject) {
    this._cache[object.hash().toString()] = object;
    return this;
  }

  getCache(ref: Ref) {
    return this._cache[ref.toString()];
  }

  add(object: ?BitObject): Repository {
    if (!object) return this;
    this.objects.push(object);
    this.setCache(object);
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
    return Promise.all(this.objects.map(object => this.persistOne(object)));
  }

  persistOne(object: BitObject): Promise<boolean> {
    return object.compress()
      .then((contents) => {
        const options = {};
        if (this.scope.groupName) options.gid = resolveGroupId(this.scope.groupName);
        return writeFile(this.objectPath(object.hash()), contents, options);
      }); 
  }
}

