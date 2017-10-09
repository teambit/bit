/** @flow */
import fs from 'fs';
import path from 'path';
import glob from 'glob';
import BitObject from './object';
import Ref from './ref';
import { OBJECTS_DIR } from '../../constants';
import { HashNotFound } from '../exceptions';
import { resolveGroupId, mkdirp, writeFile, removeFile, readFile } from '../../utils';
import { Scope } from '../../scope';
import { Component, Symlink, ScopeMeta } from '../models';
import logger from '../../logger/logger';

export default class Repository {
  objects: BitObject[] = [];
  _cache: { [string]: BitObject } = {};
  scope: Scope;
  types: { [string]: Function };

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

  getLicense(): Promise<string> {
    return this.scope.scopeJson.getPopulatedLicense();
  }

  getScopeMetaObject(): Promise<Buffer> {
    return this.getLicense().then(license => ScopeMeta.fromObject({ license, name: this.scope.name }).compress());
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
      .catch(() => {
        logger.debug(`Failed reading a ref file ${this.objectPath(ref)}`);
        return null;
      });
  }

  list(): Promise<BitObject[]> {
    return new Promise((resolve, reject) => {
      return glob(path.join('*', '*'), { cwd: this.getPath() }, (err, matches) => {
        if (err) reject(err);
        const refs = matches.map(str => str.replace(path.sep, ''));
        return Promise.all(refs.map(ref => this.load(ref))).then(resolve);
      });
    });
  }

  listComponents(includeSymlinks: boolean = true): Promise<Component[]> {
    // @TODO - write
    const filterComponents = refs =>
      refs.filter(
        ref => (includeSymlinks ? ref instanceof Component || ref instanceof Symlink : ref instanceof Component)
      );

    return this.list().then(filterComponents);
  }

  remove(ref: Ref) {
    return removeFile(this.objectPath(ref), true);
  }

  removeMany(refs: Ref[]): Promise {
    return Promise.all(refs.map(ref => this.remove(ref)));
  }

  loadRaw(ref: Ref): Promise<Buffer> {
    return readFile(this.objectPath(ref));
  }

  loadSync(ref: Ref, throws: boolean = true): BitObject {
    try {
      return BitObject.parseSync(fs.readFileSync(this.objectPath(ref)), this.types);
    } catch (err) {
      if (throws) throw new HashNotFound(ref.toString());
      return null;
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
    // leave the following commented log message, it is very useful for debugging but too verbose when not needed.
    // logger.debug(`repository: adding object ${object.hash().toString()} which consist of the following id: ${object.id()}`);
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
    logger.debug(`repository: persisting ${this.objects.length} objects`);
    // @TODO handle failures
    return Promise.all(this.objects.map(object => this.persistOne(object)));
  }

  persistOne(object: BitObject): Promise<boolean> {
    return object.compress().then((contents) => {
      const options = {};
      if (this.scope.groupName) options.gid = resolveGroupId(this.scope.groupName);
      const objectPath = this.objectPath(object.hash());
      logger.debug(`writing an object into ${objectPath}`);
      return writeFile(objectPath, contents, options);
    });
  }
}
