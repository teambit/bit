import fs from 'fs-extra';
import uniqBy from 'lodash.uniqby';
import * as path from 'path';
import R from 'ramda';

import { OBJECTS_DIR } from '../../constants';
import logger from '../../logger/logger';
import { glob, resolveGroupId, writeFile } from '../../utils';
import removeFile from '../../utils/fs-remove-file';
import { PathOsBasedAbsolute } from '../../utils/path';
import { HashNotFound, OutdatedIndexJson } from '../exceptions';
import RemoteLanes from '../lanes/remote-lanes';
import UnmergedComponents from '../lanes/unmerged-components';
import ScopeMeta from '../models/scopeMeta';
import { ScopeJson } from '../scope-json';
import ScopeIndex, { IndexType } from './components-index';
import BitObject from './object';
import { ObjectItem, ObjectList } from './object-list';
import BitRawObject from './raw-object';
import Ref from './ref';
import { ContentTransformer, onPersist, onRead } from './repository-hooks';

const OBJECTS_BACKUP_DIR = `${OBJECTS_DIR}.bak`;

export default class Repository {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  objects: { [key: string]: BitObject } = {};
  objectsToRemove: Ref[] = [];
  scopeJson: ScopeJson;
  onRead: ContentTransformer;
  onPersist: ContentTransformer;
  scopePath: string;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  scopeIndex: ScopeIndex;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  _cache: { [key: string]: BitObject } = {};
  remoteLanes!: RemoteLanes;
  unmergedComponents!: UnmergedComponents;
  constructor(scopePath: string, scopeJson: ScopeJson) {
    this.scopePath = scopePath;
    this.scopeJson = scopeJson;
    this.onRead = onRead(scopePath, scopeJson);
    this.onPersist = onPersist(scopePath, scopeJson);
  }

  static async load({ scopePath, scopeJson }: { scopePath: string; scopeJson: ScopeJson }): Promise<Repository> {
    const repository = new Repository(scopePath, scopeJson);
    const scopeIndex = await repository.loadOptionallyCreateScopeIndex();
    repository.scopeIndex = scopeIndex;
    repository.remoteLanes = new RemoteLanes(scopePath);
    repository.unmergedComponents = await UnmergedComponents.load(scopePath);
    return repository;
  }

  static create({ scopePath, scopeJson }: { scopePath: string; scopeJson: ScopeJson }): Repository {
    const repository = new Repository(scopePath, scopeJson);
    const scopeIndex = ScopeIndex.create(scopePath);
    repository.scopeIndex = scopeIndex;
    return repository;
  }

  static reset(scopePath: string): Promise<void> {
    return ScopeIndex.reset(scopePath);
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

  async getScopeMetaObject(): Promise<ObjectItem> {
    const license = await this.getLicense();
    const object = ScopeMeta.fromObject({ license, name: this.scopeJson.name });
    return { ref: object.hash(), buffer: await object.compress() };
  }

  objectPath(ref: Ref): string {
    return path.join(this.getPath(), this.hashPath(ref));
  }

  async has(ref: Ref): Promise<boolean> {
    const objectPath = this.objectPath(ref);
    return fs.pathExists(objectPath);
  }

  async load(ref: Ref, throws = false): Promise<BitObject> {
    const cached = this.getCache(ref);
    if (cached) {
      return cached;
    }
    // @ts-ignore @todo: fix! it should return BitObject | null.
    return fs
      .readFile(this.objectPath(ref))
      .then((fileContents) => {
        return this.onRead(fileContents);
      })
      .then((fileContents) => {
        return BitObject.parseObject(fileContents);
      })
      .then((parsedObject: BitObject) => {
        this.setCache(parsedObject);
        return parsedObject;
      })
      .catch((err) => {
        if (err.code !== 'ENOENT') {
          logger.error(`Failed reading a ref file ${this.objectPath(ref)}. Error: ${err.message}`);
          throw err;
        }
        logger.trace(`Failed finding a ref file ${this.objectPath(ref)}.`);
        if (throws) throw err;
        return null;
      });
  }

  async list(): Promise<BitObject[]> {
    const refs = await this.listRefs();
    return Promise.all(refs.map((ref) => this.load(ref)));
  }
  async listRefs(cwd = this.getPath()): Promise<Array<Ref>> {
    const matches = await glob(path.join('*', '*'), { cwd });
    const refs = matches.map((str) => {
      const hash = str.replace(path.sep, '');
      return new Ref(hash);
    });
    return refs;
  }

  async listRawObjects(): Promise<any> {
    const refs = await this.listRefs();
    return Promise.all(
      refs.map(async (ref) => {
        try {
          const buffer = await this.loadRaw(ref);
          const bitRawObject = await BitRawObject.fromDeflatedBuffer(buffer, ref.hash);
          return bitRawObject;
        } catch (err) {
          logger.error(`Couldn't load the ref ${ref} this object is probably corrupted and should be delete`);
          return null;
        }
      })
    );
  }

  async listObjectsFromIndex(indexType: IndexType, filter?: Function): Promise<BitObject[]> {
    const hashes = filter ? this.scopeIndex.getHashesByQuery(indexType, filter) : this.scopeIndex.getHashes(indexType);
    return this._getBitObjectsByHashes(hashes);
  }

  getHashFromIndex(indexType: IndexType, filter: Function): string | null {
    const hashes = this.scopeIndex.getHashesByQuery(indexType, filter);
    if (hashes.length > 2) throw new Error('getHashFromIndex expect to get zero or one result');
    return hashes.length ? hashes[0] : null;
  }

  async _getBitObjectsByHashes(hashes: string[]): Promise<BitObject[]> {
    const bitObjects = await Promise.all(
      hashes.map(async (hash) => {
        const bitObject = await this.load(new Ref(hash));
        if (!bitObject) {
          const indexJsonPath = this.scopeIndex.getPath();
          if (this.scopeIndex.isFileOnBitHub()) {
            logger.error(
              `repository._getBitObjectsByHashes, indexJson at "${indexJsonPath}" is outdated and needs to be deleted`
            );
            return null;
          }
          const indexItem = this.scopeIndex.find(hash);
          if (!indexItem) throw new Error(`_getBitObjectsByHashes failed finding ${hash}`);
          await this.scopeIndex.deleteFile();
          // @ts-ignore componentId must be set as it was retrieved from indexPath before
          throw new OutdatedIndexJson(indexItem.toIdentifierString(), indexJsonPath);
        }
        return bitObject;
      })
    );
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return bitObjects.filter((b) => b); // remove nulls;
  }

  async loadOptionallyCreateScopeIndex(): Promise<ScopeIndex> {
    try {
      const scopeIndex = await ScopeIndex.load(this.scopePath);
      return scopeIndex;
    } catch (err) {
      if (err.code === 'ENOENT') {
        const bitObjects: BitObject[] = await this.list();
        const scopeIndex = ScopeIndex.create(this.scopePath);
        const added = scopeIndex.addMany(bitObjects);
        if (added) await scopeIndex.write();
        return scopeIndex;
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
    const bitRawObject = await BitRawObject.fromDeflatedBuffer(buffer, ref.hash);
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
      return BitObject.parseSync(transformedContent);
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

  clearCache() {
    this._cache = {};
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
    objects.forEach((obj) => this.add(obj));
    return this;
  }

  removeObject(ref: Ref) {
    this.objectsToRemove.push(ref);
  }

  removeManyObjects(refs: Ref[]) {
    if (!refs || !refs.length) return;
    refs.forEach((ref) => this.removeObject(ref));
  }

  findMany(refs: Ref[]): Promise<BitObject[]> {
    return Promise.all(refs.map((ref) => this.load(ref)));
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
    await this.remoteLanes.write();
    await this.unmergedComponents.write();
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
    Object.keys(this.objects).forEach((hash) => {
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
    await Promise.all(uniqRefs.map((ref) => this._deleteOne(ref)));
    const removed = this.scopeIndex.removeMany(uniqRefs);
    if (removed) await this.scopeIndex.write();
  }

  async _writeMany(): Promise<void> {
    if (R.isEmpty(this.objects)) return;
    logger.debug(`Repository._writeMany: writing ${Object.keys(this.objects).length} objects`);
    // @TODO handle failures
    await Promise.all(Object.keys(this.objects).map((hash) => this._writeOne(this.objects[hash])));
    const added = this.scopeIndex.addMany(R.values(this.objects));
    if (added) await this.scopeIndex.write();
  }

  /**
   * do not call this method directly. always call this.removeObject() and once done with all objects,
   * call this.persist()
   */
  _deleteOne(ref: Ref): Promise<boolean> {
    this.removeFromCache(ref);
    const pathToDelete = this.objectPath(ref);
    logger.trace(`repository._deleteOne: deleting ${pathToDelete}`);
    return removeFile(pathToDelete, true);
  }

  /**
   * always prefer this.persist().
   * this method doesn't write to scopeIndex. so using this method for ModelComponent or
   * Symlink makes the index outdated.
   */
  async _writeOne(object: BitObject): Promise<boolean> {
    const contents = await object.compress();
    const options = {};
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (this.scopeJson.groupName) options.gid = await resolveGroupId(this.scopeJson.groupName);
    const objectPath = this.objectPath(object.hash());
    logger.trace(`repository._writeOne: ${objectPath}`);
    // Run hook to transform content pre persisting
    const transformedContent = this.onPersist(contents);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return writeFile(objectPath, transformedContent, options);
  }

  async writeObjectsToPendingDir(objectList: ObjectList, pendingDir: PathOsBasedAbsolute) {
    await Promise.all(
      objectList.objects.map(async (object) => {
        const objPath = path.join(pendingDir, this.hashPath(object.ref));
        await fs.outputFile(objPath, object.buffer);
      })
    );
  }

  async readObjectsFromPendingDir(pendingDir: PathOsBasedAbsolute) {
    const refs = await this.listRefs(pendingDir);
    const objects = await Promise.all(
      refs.map(async (ref) => {
        const buffer = await fs.readFile(path.join(pendingDir, this.hashPath(ref)));
        return { ref, buffer };
      })
    );
    return new ObjectList(objects);
  }

  private hashPath(ref: Ref) {
    const hash = ref.toString();
    return path.join(hash.slice(0, 2), hash.slice(2));
  }
}
