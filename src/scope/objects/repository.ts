import R from 'ramda';
import fs from 'fs-extra';
import * as path from 'path';
import uniqBy from 'lodash.uniqby';
import BitObject from './object';
import BitRawObject from './raw-object';
import Ref from './ref';
import { OBJECTS_DIR } from '../../constants';
import { HashNotFound, OutdatedIndexJson } from '../exceptions';
import { resolveGroupId, writeFile, glob } from '../../utils';
import removeFile from '../../utils/fs-remove-file';
import ScopeMeta from '../models/scopeMeta';
import logger from '../../logger/logger';
import ComponentsIndex from './components-index';
import { ScopeJson } from '../scope-json';
import { typesObj } from '../object-registrar';
import { onPersist, onRead, ContentTransformer } from './repository-hooks';

const OBJECTS_BACKUP_DIR = `${OBJECTS_DIR}.bak`;

export default class Repository {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  objects: { [key: string]: BitObject } = {};
  objectsToRemove: Ref[] = [];
  scopeJson: ScopeJson;
  onRead: ContentTransformer;
  onPersist: ContentTransformer;
  scopePath: string;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  types: { [key: string]: Function };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  componentsIndex: ComponentsIndex;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  _cache: { [key: string]: BitObject } = {};
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  constructor(scopePath: string, scopeJson: ScopeJson, types: { [key: string]: Function } = typesObj) {
    this.scopePath = scopePath;
    this.scopeJson = scopeJson;
    this.types = types;
    this.onRead = onRead(scopePath, scopeJson);
    this.onPersist = onPersist(scopePath, scopeJson);
  }

  static async load({ scopePath, scopeJson }: { scopePath: string; scopeJson: ScopeJson }): Promise<Repository> {
    const repository = new Repository(scopePath, scopeJson, typesObj);
    const componentsIndex = await repository.loadOptionallyCreateComponentsIndex();
    repository.componentsIndex = componentsIndex;
    return repository;
  }

  static create({ scopePath, scopeJson }: { scopePath: string; scopeJson: ScopeJson }): Repository {
    const repository = new Repository(scopePath, scopeJson, typesObj);
    const componentsIndex = ComponentsIndex.create(scopePath);
    repository.componentsIndex = componentsIndex;
    return repository;
  }

  static reset(scopePath: string): Promise<void> {
    return ComponentsIndex.reset(scopePath);
  }

  static getPathByScopePath(scopePath: string) {
    return path.join(scopePath, OBJECTS_DIR);
  }

  ensureDir() {
    return fs.ensureDir(this.getPath());
  }

  getPath() {
    return Repository.getPathByScopePath(this.scopePath);
  }

  getBackupPath(dirName?: string): string {
    const backupPath = path.join(this.scopePath, OBJECTS_BACKUP_DIR);
    return dirName ? path.join(backupPath, dirName) : backupPath;
  }

  getLicense(): Promise<string> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.scopeJson.getPopulatedLicense();
  }

  getScopeMetaObject(): Promise<Buffer> {
    return this.getLicense().then(license => ScopeMeta.fromObject({ license, name: this.scopeJson.name }).compress());
  }

  objectPath(ref: Ref): string {
    const hash = ref.toString();
    return path.join(this.getPath(), hash.slice(0, 2), hash.slice(2));
  }

  load(ref: Ref, throws = false): Promise<BitObject> {
    if (this.getCache(ref)) return Promise.resolve(this.getCache(ref));
    // @ts-ignore @todo: fix! it should return BitObject | null.
    return fs
      .readFile(this.objectPath(ref))
      .then(fileContents => {
        return this.onRead(fileContents);
      })
      .then(fileContents => {
        return BitObject.parseObject(fileContents, this.types);
      })
      .then((parsedObject: BitObject) => {
        this.setCache(parsedObject);
        return parsedObject;
      })
      .catch(err => {
        if (err.code !== 'ENOENT') {
          logger.error(`Failed reading a ref file ${this.objectPath(ref)}. Error: ${err.message}`);
          throw err;
        }
        logger.silly(`Failed finding a ref file ${this.objectPath(ref)}.`);
        if (throws) throw err;
        return null;
      });
  }

  async list(): Promise<BitObject[]> {
    const refs = await this.listRefs();
    return Promise.all(refs.map(ref => this.load(ref)));
  }
  async listRefs(): Promise<Array<Ref>> {
    const matches = await glob(path.join('*', '*'), { cwd: this.getPath() });
    const refs = matches.map(str => {
      const hash = str.replace(path.sep, '');
      return new Ref(hash);
    });
    return refs;
  }

  async listRawObjects(): Promise<any> {
    const refs = await this.listRefs();
    return Promise.all(
      refs.map(async ref => {
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

  async listComponentsIncludeSymlinks(): Promise<BitObject[]> {
    const hashes = this.componentsIndex.getHashesIncludeSymlinks();
    return this._getBitObjectsByHashes(hashes);
  }

  async listComponents(): Promise<BitObject[]> {
    const hashes = this.componentsIndex.getHashes();
    return this._getBitObjectsByHashes(hashes);
  }

  async _getBitObjectsByHashes(hashes: string[]): Promise<BitObject[]> {
    const bitObjects = await Promise.all(
      hashes.map(async hash => {
        const bitObject = await this.load(new Ref(hash));
        if (!bitObject) {
          const componentId = this.componentsIndex.getIdByHash(hash);
          const indexJsonPath = this.componentsIndex.getPath();
          if (this.componentsIndex.isFileOnBitHub()) {
            logger.error(
              `repository._getBitObjectsByHashes, indexJson at "${indexJsonPath}" is outdated and needs to be deleted`
            );
            return null;
          }
          await this.componentsIndex.deleteFile();
          // $FlowFixMe componentId must be set as it was retrieved from indexPath before
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          throw new OutdatedIndexJson(componentId, indexJsonPath);
        }
        return bitObject;
      })
    );
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return bitObjects.filter(b => b); // remove nulls;
  }

  async loadOptionallyCreateComponentsIndex(): Promise<ComponentsIndex> {
    try {
      const componentsIndex = await ComponentsIndex.load(this.scopePath);
      return componentsIndex;
    } catch (err) {
      if (err.code === 'ENOENT') {
        const bitObjects: BitObject[] = await this.list();
        const componentsIndex = ComponentsIndex.create(this.scopePath);
        componentsIndex.addMany(bitObjects);
        await componentsIndex.write();
        return componentsIndex;
      }
      throw err;
    }
  }

  async loadRaw(ref: Ref): Promise<Buffer> {
    const raw = await fs.readFile(this.objectPath(ref));
    // Run hook to transform content pre reading
    const transformedContent = this.onRead(raw);
    return transformedContent;
  }

  async loadRawObject(ref: Ref): Promise<BitRawObject> {
    const buffer = await this.loadRaw(ref);
    const bitRawObject = await BitRawObject.fromDeflatedBuffer(buffer, ref.hash, this.types);
    return (bitRawObject as any) as BitRawObject;
  }

  /**
   * prefer using `this.load()` for an async version, which also writes to the cache
   */
  loadSync(ref: Ref, throws = true): BitObject {
    try {
      const objectFile = fs.readFileSync(this.objectPath(ref));
      // Run hook to transform content pre reading
      const transformedContent = this.onRead(objectFile);
      return BitObject.parseSync(transformedContent, this.types);
    } catch (err) {
      if (throws) {
        throw new HashNotFound(ref.toString());
      }
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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

  add(object: BitObject | null | undefined): Repository {
    if (!object) return this;
    // leave the following commented log message, it is very useful for debugging but too verbose when not needed.
    // logger.debug(`repository: adding object ${object.hash().toString()} which consist of the following id: ${object.id()}`);
    this.objects[object.hash().toString()] = object;
    this.setCache(object);
    return this;
  }

  addMany(objects: BitObject[]): Repository {
    if (!objects || !objects.length) return this;
    objects.forEach(obj => this.add(obj));
    return this;
  }

  removeObject(ref: Ref) {
    this.objectsToRemove.push(ref);
  }

  removeManyObjects(refs: Ref[]) {
    if (!refs || !refs.length) return;
    refs.forEach(ref => this.removeObject(ref));
  }

  findMany(refs: Ref[]): Promise<BitObject[]> {
    return Promise.all(refs.map(ref => this.load(ref)));
  }

  /**
   * persist objects changes (added and removed) into the filesystem
   * do not call this function multiple times in parallel, otherwise, it'll damage the index.json file.
   * call this function only once after you added and removed all applicable objects.
   */
  async persist(validate = true): Promise<void> {
    logger.debug(`Repository.persist, validate = ${validate.toString()}`);
    await this._deleteMany();
    this._validateObjects(validate);
    await this._writeMany();
  }

  /**
   * normally, the validation step takes place just before the acutal writing of the file.
   * however, this can be an issue where a component has an invalid version. the component could
   * be saved before validating the version (see #1727). that's why we validate here before writing
   * anything to the filesystem.
   * the open question here is whether should we validate again before the actual writing or it
   * should be enough to validate here?
   * for now, it does validate again before saving, only to be 100% sure nothing happens in a few
   * lines of code until the actual writing. however, if the performance penalty is noticeable, we
   * can easily revert it by changing `bitObject.validateBeforePersist = false` line run regardless
   * the `validate` argument.
   */
  _validateObjects(validate: boolean) {
    Object.keys(this.objects).forEach(hash => {
      const bitObject = this.objects[hash];
      // @ts-ignore some BitObject classes have validate() method
      if (validate && bitObject.validate) {
        // @ts-ignore
        bitObject.validate();
      }
      if (!validate) {
        bitObject.validateBeforePersist = false;
      }
    });
  }

  async _deleteMany(): Promise<void> {
    if (!this.objectsToRemove.length) return;
    const uniqRefs = uniqBy(this.objectsToRemove, 'hash');
    logger.debug(`Repository._deleteMany: deleting ${uniqRefs.length} objects`);
    await Promise.all(uniqRefs.map(ref => this._deleteOne(ref)));
    const removed = this.componentsIndex.removeMany(uniqRefs);
    if (removed) await this.componentsIndex.write();
  }

  async _writeMany(): Promise<void> {
    if (R.isEmpty(this.objects)) return;
    logger.debug(`Repository._writeMany: writing ${Object.keys(this.objects).length} objects`);
    // @TODO handle failures
    await Promise.all(Object.keys(this.objects).map(hash => this._writeOne(this.objects[hash])));
    const added = this.componentsIndex.addMany(R.values(this.objects));
    if (added) await this.componentsIndex.write();
  }

  /**
   * do not call this method directly. always call this.removeObject() and once done with all objects,
   * call this.persist()
   */
  _deleteOne(ref: Ref): Promise<boolean> {
    this.removeFromCache(ref);
    const pathToDelete = this.objectPath(ref);
    logger.silly(`repository._deleteOne: deleting ${pathToDelete}`);
    return removeFile(pathToDelete, true);
  }

  /**
   * always prefer this.persist().
   * this method doesn't write to componentsIndex. so using this method for ModelComponent or
   * Symlink makes the index outdated.
   */
  async _writeOne(object: BitObject): Promise<boolean> {
    const contents = await object.compress();
    const options = {};
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (this.scopeJson.groupName) options.gid = await resolveGroupId(this.scopeJson.groupName);
    const objectPath = this.objectPath(object.hash());
    logger.silly(`repository._writeOne: ${objectPath}`);
    // Run hook to transform content pre persisting
    const transformedContent = this.onPersist(contents);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return writeFile(objectPath, transformedContent, options);
  }
}
