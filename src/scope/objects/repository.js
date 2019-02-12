/** @flow */
import fs from 'fs-extra';
import path from 'path';
import BitObject from './object';
import BitRawObject from './raw-object';
import Ref from './ref';
import { OBJECTS_DIR } from '../../constants';
import { HashNotFound } from '../exceptions';
import { resolveGroupId, mkdirp, writeFile, glob } from '../../utils';
import removeFile from '../../utils/fs-remove-file';
import type Scope from '../../scope/scope';
import ModelComponent from '../models/model-component';
import Symlink from '../models/symlink';
import ScopeMeta from '../models/scopeMeta';
import logger from '../../logger/logger';
import ComponentsIndex from './components-index';
import { BitId } from '../../bit-id';

const OBJECTS_BACKUP_DIR = `${OBJECTS_DIR}.bak`;

export default class Repository {
  objects: BitObject[] = [];
  _cache: { [string]: BitObject } = {};
  _componentsIndex: ComponentsIndex;
  scope: Scope;
  types: { [string]: Function };

  constructor(scope: Scope, objectTypes: Function[] = []) {
    this.scope = scope;
    // TODO: use typesToObject from object-registrar
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

  getBackupPath(dirName?: string): string {
    const backupPath = path.join(this.scope.getPath(), OBJECTS_BACKUP_DIR);
    return dirName ? path.join(backupPath, dirName) : backupPath;
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
    return fs
      .readFile(this.objectPath(ref))
      .then((fileContents) => {
        return BitObject.parseObject(fileContents, this.types);
      })
      .then((parsedObject: BitObject) => {
        this.setCache(parsedObject);
        return parsedObject;
      })
      .catch((err) => {
        if (err.code === 'ENOENT') {
          logger.debug(`Failed finding a ref file ${this.objectPath(ref)}.`);
        } else {
          logger.error(`Failed reading a ref file ${this.objectPath(ref)}. Error: ${err.message}`);
        }
        return null;
      });
  }

  async list(): Promise<BitObject[]> {
    const refs = await this.listRefs();
    return Promise.all(refs.map(ref => this.load(ref)));
  }

  async listRefs(): Promise<Refs[]> {
    const matches = await glob(path.join('*', '*'), { cwd: this.getPath() });
    const refs = matches.map((str) => {
      const hash = str.replace(path.sep, '');
      return new Ref(hash);
    });
    return refs;
  }

  async listRawObjects(): Promise<BitRawObject[]> {
    const refs = await this.listRefs();
    return Promise.all(
      refs.map(async (ref) => {
        try {
          const buffer = await this.loadRaw(ref);
          const bitRawObject = await BitRawObject.fromDeflatedBuffer(buffer, ref.hash, this.types);
          return bitRawObject;
        } catch (err) {
          logger.error(`Couldn't load the ref ${ref} this object is probably corrupted and should be delete`);
          return null;
        }
      })
    );
  }

  async listComponentsIdsIncludeSymlinks(): Promise<BitId[]> {
    const componentsIndex = await this.getComponentsIndex();
    return componentsIndex.getIdsIncludesSymlinks();
  }

  async listComponentsIds(): Promise<BitId[]> {
    const componentsIndex = await this.getComponentsIndex();
    return componentsIndex.getIds();
  }

  async getComponentsIndex(): Promise<ComponentsIndex> {
    if (!this._componentsIndex) {
      this._componentsIndex = await this.loadOptionallyCreateComponentsIndex();
    }
    return this._componentsIndex;
  }

  async loadOptionallyCreateComponentsIndex() {
    try {
      const componentsIndex = await ComponentsIndex.load(this.scope.getPath());
      return componentsIndex;
    } catch (err) {
      if (err.code === 'ENOENT') {
        const bitObjects: BitObject[] = await this.list();
        const componentsIndex = await ComponentsIndex.create(this.scope.getPath(), bitObjects);
        return componentsIndex;
      }
      throw err;
    }
  }

  remove(ref: Ref): Promise<boolean> {
    this.removeFromCache(ref);
    const pathToDelete = this.objectPath(ref);
    logger.debug(`repository.remove: deleting ${pathToDelete}`);
    return removeFile(pathToDelete, true);
  }

  async removeMany(refs: Ref[]): Promise<boolean[]> {
    const results = await Promise.all(refs.map(ref => this.remove(ref)));
    const componentsIndex = await this.getComponentsIndex();
    const removed = componentsIndex.removeMany(refs);
    if (removed) await componentsIndex.write();
    return results;
  }

  loadRaw(ref: Ref): Promise<Buffer> {
    return fs.readFile(this.objectPath(ref));
  }

  async loadRawObject(ref: Ref): Promise<BitRawObject> {
    const buffer = await this.loadRaw(ref);
    const bitRawObject = await BitRawObject.fromDeflatedBuffer(buffer, ref.hash, this.types);
    return bitRawObject;
  }

  loadSync(ref: Ref, throws: boolean = true): BitObject {
    try {
      const objectFile = fs.readFileSync(this.objectPath(ref));
      return BitObject.parseSync(objectFile, this.types);
    } catch (err) {
      if (throws) {
        throw new HashNotFound(ref.toString());
      }
      return null;
    }
  }

  setCache(object: BitObject) {
    this._cache[object.hash().toString()] = object;
    return this;
  }

  getCache(ref: Ref): BitObject {
    return this._cache[ref.toString()];
  }

  removeFromCache(ref: Ref) {
    delete this._cache[ref.toString()];
  }

  backup(dirName?: string) {
    const backupDir = this.getBackupPath(dirName);
    const objectsDir = this.getPath();
    logger.debug(`making a backup of all objects from ${objectsDir} to ${backupDir}`);
    fs.emptyDirSync(backupDir);
    fs.copySync(objectsDir, backupDir);
  }

  add(object: ?BitObject): Repository {
    if (!object) return this;
    // leave the following commented log message, it is very useful for debugging but too verbose when not needed.
    // logger.debug(`repository: adding object ${object.hash().toString()} which consist of the following id: ${object.id()}`);
    this.objects.push(object);
    this.setCache(object);
    return this;
  }

  addMany(objects: BitObject[]): Repository {
    if (!objects || !objects.length) return this;
    objects.forEach(obj => this.add(obj));
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

  async persist(validate: boolean = true): Promise<void> {
    logger.debug(`repository: persisting ${this.objects.length} objects, with validate = ${validate.toString()}`);
    // @TODO handle failures
    if (!validate) this.objects.map(object => (object.validateBeforePersist = false));
    await Promise.all(this.objects.map(object => this.persistOne(object)));
    const componentsIndex = await this.getComponentsIndex();
    const added = componentsIndex.addMany(this.objects);
    if (added) await componentsIndex.write();
  }

  async persistOne(object: BitObject): Promise<boolean> {
    const contents = await object.compress();
    const options = {};
    if (this.scope.groupName) options.gid = resolveGroupId(this.scope.groupName);
    const objectPath = this.objectPath(object.hash());
    logger.debug(`writing an object into ${objectPath}`);
    return writeFile(objectPath, contents, options);
  }
}
