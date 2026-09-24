import fs from 'fs-extra';
import { Mutex } from 'async-mutex';
import { compact, uniqBy, differenceWith, isEqual } from 'lodash';
import { BitError } from '@teambit/bit-error';
import type { ComponentID } from '@teambit/component-id';
import { HASH_SIZE, isSnap } from '@teambit/component-version';
import * as path from 'path';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { OBJECTS_DIR } from '@teambit/legacy.constants';
import { logger } from '@teambit/legacy.logger';
import type { ChownOptions, PathOsBasedAbsolute } from '@teambit/legacy.utils';
import { writeFile } from '@teambit/legacy.utils';
import { glob } from 'glob';
import { removeEmptyDir } from '@teambit/toolbox.fs.remove-empty-dir';
import { concurrentIOLimit } from '@teambit/harmony.modules.concurrency';
import type { Types, ScopeJson } from '@teambit/legacy.scope';
import { HashNotFound, OutdatedIndexJson, UnmergedComponents, RemoteLanes } from '@teambit/legacy.scope';
import type { IndexType, IndexItem } from './scope-index';
import { ScopeIndex } from './scope-index';
import BitObject from './object';
import type { ObjectItem } from './object-list';
import { ObjectList } from './object-list';
import BitRawObject from './raw-object';
import Ref from './ref';
import { LiveObjects } from './live-objects';
import type { InMemoryCache } from '@teambit/harmony.modules.in-memory-cache';
import { getCacheOptionsForObjects, createInMemoryCache } from '@teambit/harmony.modules.in-memory-cache';
import { ScopeMeta, Lane, ModelComponent } from '../models';

type ContentTransformer = (content: Buffer) => Buffer;
const OBJECTS_BACKUP_DIR = `${OBJECTS_DIR}.bak`;
const TRASH_DIR = 'trash';
const MAX_COMPRESSED_SIZE_TO_CACHE = 100 * 1024; // don't cache big files (mainly artifacts) to prevent out-of-memory
/**
 * how much of an object file to read when all that's needed is its header. the header holds the
 * type and is a few dozen bytes, which 512 compressed bytes always cover - and every byte past it
 * is inflated for nothing (4KB inflates ten times as much, across every object in the scope). a
 * chunk that falls short anyway is read in full.
 */
const OBJECT_HEADER_CHUNK_SIZE = 512;

/** `mtimeMs` lets a caller tell an object that has been here a while from one just written */
export type ObjectWithType = { ref: Ref; type: string; size: number; mtimeMs: number };
/** `unreadable` holds the objects that couldn't be classified, so a caller can refuse to act on a partial inventory */
export type ObjectsWithType = { objects: ObjectWithType[]; unreadable: Ref[] };

export default class Repository {
  objects: { [key: string]: BitObject } = {};
  objectsToRemove: Ref[] = [];
  scopeJson: ScopeJson;
  onRead: ContentTransformer;
  onPersist: ContentTransformer;
  scopePath: string;
  scopeIndex: ScopeIndex;
  protected cache: InMemoryCache<BitObject>;
  private liveObjects = new LiveObjects();
  remoteLanes!: RemoteLanes;
  unmergedComponents!: UnmergedComponents;
  _persistMutex?: Mutex;
  constructor(scopePath: string, scopeJson: ScopeJson) {
    this.scopePath = scopePath;
    this.scopeJson = scopeJson;
    this.onRead = (content: Buffer) => Repository.onPostObjectRead?.(content) || content;
    this.onPersist = (content: Buffer) => Repository.onPreObjectPersist?.(content) || content;
    this.cache = createInMemoryCache(getCacheOptionsForObjects());
  }

  get persistMutex() {
    if (!this._persistMutex) {
      this._persistMutex = new Mutex();
    }
    return this._persistMutex;
  }

  static async load({ scopePath, scopeJson }: { scopePath: string; scopeJson: ScopeJson }): Promise<Repository> {
    const repository = new Repository(scopePath, scopeJson);
    await repository.init();
    return repository;
  }

  async init() {
    const scopeIndex = await this.loadOptionallyCreateScopeIndex();
    this.scopeIndex = scopeIndex;
    this.remoteLanes = new RemoteLanes(this.scopePath);
    this.unmergedComponents = await UnmergedComponents.load(this.scopePath);
  }

  static async create({ scopePath, scopeJson }: { scopePath: string; scopeJson: ScopeJson }): Promise<Repository> {
    const repository = new Repository(scopePath, scopeJson);
    const scopeIndex = ScopeIndex.create(scopePath);
    repository.scopeIndex = scopeIndex;
    repository.unmergedComponents = await UnmergedComponents.load(scopePath);
    repository.remoteLanes = new RemoteLanes(scopePath);
    return repository;
  }

  static reset(scopePath: string): Promise<void> {
    return ScopeIndex.reset(scopePath);
  }

  static getPathByScopePath(scopePath: string) {
    return path.join(scopePath, OBJECTS_DIR);
  }

  static onPostObjectsPersist: () => Promise<void>;

  /**
   * Hook for transforming content before objects are persisted to the filesystem.
   * Note: This function cannot be async because it's used by the synchronous `loadSync` method
   * which needs to maintain sync behavior for compatibility with existing code.
   */
  static onPreObjectPersist?: (content: Buffer) => Buffer;

  /**
   * Hook for transforming content after objects are read from the filesystem.
   * Note: This function cannot be async because it's used by the synchronous `loadSync` method
   * which needs to maintain sync behavior for compatibility with existing code.
   */
  static onPostObjectRead?: (content: Buffer) => Buffer;

  /**
   * whether `onPostObjectRead` actually transforms anything.
   *
   * the scope aspect installs the hook above unconditionally - it's a reduce over a slot that is
   * usually empty - so the hook being set says nothing about whether object content is transformed.
   * only a caller that can skip reading content altogether needs to tell the two apart.
   */
  static hasPostObjectReadTransformer?: () => boolean;

  async reLoadScopeIndex() {
    this.scopeIndex = await this.loadOptionallyCreateScopeIndex();
  }

  /**
   * current scope index difference with <scope_folder>/index.json content, reload it
   * @deprecated use Scope aspect `watchSystemFiles` instead, it's way more efficient.
   */
  public async reloadScopeIndexIfNeed(force = false) {
    const latestScopeIndex = await this.loadOptionallyCreateScopeIndex();
    if (force) {
      this.scopeIndex = latestScopeIndex;
      return;
    }

    const currentAllScopeIndexItems = this.scopeIndex.getAll();
    const latestAllScopeIndexItems = latestScopeIndex.getAll();

    if (currentAllScopeIndexItems.length !== latestAllScopeIndexItems.length) {
      this.scopeIndex = latestScopeIndex;
      return;
    }

    if (differenceWith(currentAllScopeIndexItems, latestAllScopeIndexItems, isEqual).length) {
      this.scopeIndex = latestScopeIndex;
    }
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

  getTrashDir() {
    return path.join(this.scopePath, TRASH_DIR);
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

  async hasMultiple(refs: Ref[]): Promise<Ref[]> {
    const concurrency = concurrentIOLimit();
    const existingRefs = await pMapPool(
      refs,
      async (ref) => {
        const pathExists = await this.has(ref);
        return pathExists ? ref : null;
      },
      { concurrency }
    );
    return compact(existingRefs);
  }

  async load(ref: Ref, throws = false): Promise<BitObject> {
    // during tag, the updated objects are in `this.objects`.
    // `this.cache` is less reliable, because if it reaches its max, then it loads from the filesystem, which may not
    // be there yet (in case of "version" object), or may be out-of-date (in case of "component" object).
    const inMemoryObjects = this.objects[ref.hash.toString()];
    if (inMemoryObjects) return inMemoryObjects;
    if (ref.hash.length < HASH_SIZE) {
      ref = await this.getFullRefFromShortHash(ref);
    }
    const cached = this.getCache(ref);
    if (cached) {
      return cached;
    }
    let fileContentsRaw: Buffer;
    const objectPath = this.objectPath(ref);
    try {
      fileContentsRaw = await fs.readFile(objectPath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        logger.error(`Failed reading a ref file ${objectPath}. Error: ${err.message}`);
        throw err;
      }
      logger.trace(`Failed finding a ref file ${objectPath}.`);
      if (throws) {
        // if we just `throw err` we loose the stack trace.
        // see https://stackoverflow.com/questions/68022123/no-stack-in-fs-promises-readfile-enoent-error
        const msg = `fatal: failed finding an object file ${objectPath} in the filesystem at ${err.path}`;
        throw Object.assign(err, { stack: new Error(msg).stack });
      }
      // @ts-ignore @todo: fix! it should return BitObject | null.
      return null;
    }
    const compressedSize = fileContentsRaw.byteLength;
    const fileContents = this.onRead(fileContentsRaw);
    // uncomment to debug the transformed objects by onRead
    // console.log('transformedContent load', ref.toString(), BitObject.parseSync(fileContents).getType());
    const { object: parsedObject, inflatedSize } = await BitObject.parseObjectWithSize(fileContents, objectPath);
    if (compressedSize < MAX_COMPRESSED_SIZE_TO_CACHE) {
      this.setCache(parsedObject, inflatedSize);
    } else {
      this.liveObjects.set(ref.toString(), parsedObject, inflatedSize, false);
    }
    return parsedObject;
  }

  /**
   * this is restricted to provide objects according to the given types. Otherwise, big scopes (>1GB) could crush.
   * example usage: `this.list([ModelComponent, Symlink, Lane])`
   */
  async list(types: Types): Promise<BitObject[]> {
    const refs = await this.listRefs();
    const concurrency = concurrentIOLimit();
    logger.debug(
      `Repository.list, ${refs.length} refs are going to be loaded, searching for types: ${types.map((t) => t.name).join(', ')}`
    );
    const objects: BitObject[] = [];
    const loadGracefully = process.argv.includes('--never-exported');
    const isTypeIncluded = (obj: BitObject) => types.some((type) => type.name === obj.constructor.name); // avoid using "obj instanceof type" for Harmony to call this function successfully
    await pMapPool(
      refs,
      async (ref) => {
        const object = loadGracefully
          ? await this.loadRefDeleteIfInvalid(ref)
          : await this.loadRefOnlyIfType(ref, types);
        if (!object) return;
        if (loadGracefully && !isTypeIncluded(object)) return;
        objects.push(object);
      },
      {
        concurrency,
        onCompletedChunk: (completed) => {
          if (completed % 1000 === 0) logger.debug(`Repository.list, completed ${completed} out of ${refs.length}`);
        },
      }
    );
    return objects;
  }

  /**
   * classify every object in the scope by its type, along with its size on the filesystem.
   *
   * needed by the garbage collector, which must know the type of each object but has no use for
   * its content. inflating every object would mean inflating gigabytes of file-content (`Source`)
   * objects, so only the first chunk of each file is read - enough to hold the header, which is
   * where the type is. when a content transformer is registered (`onPostObjectRead`), it applies
   * to the whole buffer, so in that case the file is read in full.
   */
  async listObjectsWithType(): Promise<ObjectsWithType> {
    const refs = await this.listRefs();
    const concurrency = concurrentIOLimit();
    logger.debug(`Repository.listObjectsWithType, classifying ${refs.length} objects`);
    const results = await pMapPool(refs, (ref) => this.getObjectTypeGracefully(ref), { concurrency });
    const objects = compact(results.map((result) => result.object));
    const unreadable = compact(results.map((result) => result.unreadable));
    if (unreadable.length) {
      logger.warn(`Repository.listObjectsWithType, unable to classify ${unreadable.length} objects`);
    }
    return { objects, unreadable };
  }

  /**
   * the objects that couldn't be classified are reported rather than skipped. a caller that acts on
   * this inventory (the garbage collector) has to know that it's incomplete, because an object it
   * can't see is one it can't reason about.
   */
  private async getObjectTypeGracefully(ref: Ref): Promise<{ object?: ObjectWithType; unreadable?: Ref }> {
    const objectPath = this.objectPath(ref);
    try {
      const stat = await fs.stat(objectPath);
      const type = await this.readObjectType(objectPath, stat.size);
      return { object: { ref, type, size: stat.size, mtimeMs: stat.mtimeMs } };
    } catch (err: any) {
      logger.warn(`Repository.listObjectsWithType, failed reading ${objectPath}. Error: ${err.message}`);
      return { unreadable: ref };
    }
  }

  private async readObjectType(objectPath: string, size: number): Promise<string> {
    const readInFull = async () => BitObject.parseObjectType(this.onRead(await fs.readFile(objectPath)), objectPath);
    // when there's no way to tell, assume the content is transformed and read in full. it's the
    // slow answer, never the wrong one.
    const isTransformed = Repository.hasPostObjectReadTransformer
      ? Repository.hasPostObjectReadTransformer()
      : Boolean(Repository.onPostObjectRead);
    if (isTransformed) return readInFull();
    const chunkSize = Math.min(OBJECT_HEADER_CHUNK_SIZE, size);
    // `Uint8Array` rather than `Buffer` - see `parseObjectTypeFromChunk`
    const chunk = new Uint8Array(chunkSize);
    const fileDescriptor = await fs.open(objectPath, 'r');
    try {
      await fs.read(fileDescriptor, chunk, 0, chunkSize, 0);
    } finally {
      await fs.close(fileDescriptor);
    }
    return BitObject.parseObjectTypeFromChunk(chunk) || readInFull();
  }

  async loadRefDeleteIfInvalid(ref: Ref) {
    try {
      return await this.load(ref, true);
    } catch (err: any) {
      // this is needed temporarily to allow `bit reset --never-exported` to fix the bit-id-comp-id error.
      // in a few months, we can remove this condition (around min 2024)
      if (err.constructor.name === 'BitIdCompIdError' || err.constructor.name === 'MissingScope') {
        logger.debug(`bit-id-comp-id error, moving an object to trash ${ref.toString()}`);
        await this.moveOneObjectToTrash(ref);
        return undefined;
      }
      throw err;
    }
  }

  async loadRefOnlyIfType(ref: Ref, types: Types): Promise<BitObject | null> {
    const objectPath = this.objectPath(ref);
    const fileContentsRaw = await fs.readFile(objectPath);
    const fileContents = this.onRead(fileContentsRaw);
    const typeNames = types.map((type) => type.name);
    const parsedObject = await BitObject.parseObjectOnlyIfType(fileContents, typeNames, objectPath);
    return parsedObject;
  }

  async listRefs(cwd = this.getPath()): Promise<Array<Ref>> {
    const matches = await glob(path.join('*', '*'), { cwd });
    const refs = matches.map((str) => {
      const hash = str.replace(path.sep, '');
      if (!isSnap(hash)) {
        logger.error(`fatal: the file "${str}" is not a valid bit object path`);
        return null;
      }
      return new Ref(hash);
    });
    return compact(refs);
  }

  async listRefsStartWith(shortHash: Ref): Promise<Array<Ref>> {
    const pathPrefix = this.hashPath(shortHash);
    const matches = await glob(`${pathPrefix}*`, { cwd: this.getPath() });
    const refs = matches.map((str) => {
      const hash = str.replace(path.sep, '');
      if (!isSnap(hash)) {
        logger.error(`fatal: the file "${str}" is not a valid bit object path`);
        return null;
      }
      return new Ref(hash);
    });
    return compact(refs);
  }

  async listRawObjects(): Promise<any> {
    const refs = await this.listRefs();
    const concurrency = concurrentIOLimit();
    return pMapPool(
      refs,
      async (ref) => {
        try {
          const buffer = await this.loadRaw(ref);
          const bitRawObject = await BitRawObject.fromDeflatedBuffer(buffer, ref.hash);
          return bitRawObject;
        } catch {
          logger.error(`Couldn't load the ref ${ref} this object is probably corrupted and should be delete`);
          return null;
        }
      },
      { concurrency }
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
    const missingIndexItems: IndexItem[] = [];
    const bitObjects = await Promise.all(
      hashes.map(async (hash) => {
        const bitObject = await this.load(new Ref(hash));
        if (!bitObject) {
          const indexItem = this.scopeIndex.find(hash);
          if (!indexItem) throw new Error(`_getBitObjectsByHashes failed finding ${hash}`);
          missingIndexItems.push(indexItem);
          return;
        }
        return bitObject;
      })
    );
    if (missingIndexItems.length) {
      this.scopeIndex.removeMany(missingIndexItems.map((item) => new Ref(item.hash)));
      await this.scopeIndex.write();
      const missingStringified = missingIndexItems.map((item) => item.toIdentifierString());
      throw new OutdatedIndexJson(missingStringified);
    }
    return compact(bitObjects);
  }

  async loadOptionallyCreateScopeIndex(): Promise<ScopeIndex> {
    try {
      const scopeIndex = await ScopeIndex.load(this.scopePath);
      return scopeIndex;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        const bitObjects: BitObject[] = await this.list([ModelComponent, Lane]);
        const scopeIndex = ScopeIndex.create(this.scopePath);
        const added = scopeIndex.addMany(bitObjects);
        if (added) await scopeIndex.write();
        return scopeIndex;
      }
      throw err;
    }
  }

  async loadRaw(ref: Ref): Promise<Buffer> {
    if (ref.hash.length < HASH_SIZE) {
      ref = await this.getFullRefFromShortHash(ref);
    }
    const raw = await fs.readFile(this.objectPath(ref));
    // Run hook to transform content pre reading
    const transformedContent = this.onRead(raw);
    // uncomment to debug the transformed objects by onRead
    // console.log('transformedContent loadRaw', ref.toString(), BitObject.parseSync(transformedContent).getType());
    return transformedContent;
  }

  async getFullRefFromShortHash(ref: Ref): Promise<Ref> {
    const refs = await this.listRefsStartWith(ref);
    if (refs.length > 1) {
      throw new Error(
        `found ${refs.length} objects with the same short hash ${ref.toString()}, please use longer hash`
      );
    }
    if (refs.length === 0) {
      throw new Error(`failed finding an object with the short hash ${ref.toString()}`);
    }
    return refs[0];
  }

  async loadManyRaw(refs: Ref[]): Promise<ObjectItem[]> {
    const concurrency = concurrentIOLimit();
    const uniqRefs = uniqBy(refs, 'hash');
    return pMapPool(uniqRefs, async (ref) => ({ ref, buffer: await this.loadRaw(ref) }), { concurrency });
  }

  async loadManyRawIgnoreMissing(refs: Ref[]): Promise<ObjectItem[]> {
    const concurrency = concurrentIOLimit();
    const results = await pMapPool(
      refs,
      async (ref) => {
        try {
          const buffer = await this.loadRaw(ref);
          return { ref, buffer };
        } catch (err: any) {
          if (err.code === 'ENOENT') return null;
          throw err;
        }
      },
      { concurrency }
    );
    return compact(results);
  }

  async loadRawObject(ref: Ref): Promise<BitRawObject> {
    const buffer = await this.loadRaw(ref);
    const bitRawObject = await BitRawObject.fromDeflatedBuffer(buffer, ref.hash);
    return bitRawObject as any as BitRawObject;
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
    } catch {
      if (throws) {
        throw new HashNotFound(ref.toString());
      }
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return null;
    }
  }

  /**
   * `size` is the object's inflated content size (see `InMemoryCache.set`).
   */
  setCache(object: BitObject, size?: number) {
    const key = object.hash().toString();
    this.cache.set(key, object, size);
    this.liveObjects.set(key, object, size, true);
    return this;
  }

  /**
   * an object evicted from the cache is still returned as long as it's in use elsewhere (see `LiveObjects`).
   */
  getCache(ref: Ref): BitObject | undefined {
    const key = ref.toString();
    const cached = this.cache.get(key);
    if (cached) return cached;
    const live = this.liveObjects.get(key);
    if (!live) return undefined;
    if (live.cacheable) this.cache.set(key, live.object, live.size); // it's in use again
    return live.object;
  }

  removeFromCache(ref: Ref) {
    this.cache.delete(ref.toString());
    this.liveObjects.delete(ref.toString());
  }

  async clearCache() {
    logger.debug('repository.clearCache');
    this.clearObjectsFromCache();
    await this.init();
  }
  clearObjectsFromCache() {
    logger.debug('repository.clearObjectsFromCache');
    this.cache.deleteAll();
    this.liveObjects.clear();
  }

  backup(dirName?: string) {
    const backupDir = this.getBackupPath(dirName);
    const objectsDir = this.getPath();
    logger.debug(`making a backup of all objects from ${objectsDir} to ${backupDir}`);
    fs.emptyDirSync(backupDir);
    fs.copySync(objectsDir, backupDir);
  }

  add(object: BitObject | null | undefined): Repository {
    // console.trace(`repository: adding object ${object?.hash().toString()}`);
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
   * important! use this method only for commands that are non running on an http server.
   *
   * it's better to remove/delete objects directly and not using the `objects` member.
   * it helps to avoid multiple processes running concurrently on an http server.
   *
   * persist objects changes (added and removed) into the filesystem
   * do not call this function multiple times in parallel, otherwise, it'll damage the index.json file.
   * call this function only once after you added and removed all applicable objects.
   */
  async persist(validate = true): Promise<void> {
    // do not let two requests enter this critical area, otherwise, refs/index.json/objects could
    // be corrupted
    logger.debug(`Repository.persist, going to acquire a lock`);
    await this.persistMutex.runExclusive(async () => {
      logger.debug(`Repository.persist, validate = ${validate.toString()}, a lock has been acquired`);
      await this.deleteObjectsFromFS(this.objectsToRemove);
      this.validateObjects(validate, Object.values(this.objects));
      await this.writeObjectsToTheFS(Object.values(this.objects));
      await this.writeRemoteLanes();
      await this.unmergedComponents.write();
    });
    logger.debug(`Repository.persist, completed. the lock has been released`);
    this.clearObjects();
    if (Repository.onPostObjectsPersist) {
      Repository.onPostObjectsPersist().catch((err) => {
        logger.error('fatal: onPostObjectsPersist encountered an error (this error does not stop the process)', err);
      });
    }
  }

  async writeRemoteLanes() {
    await this.remoteLanes.write();
  }

  /**
   * this is especially critical for http server, where one process lives long and serves multiple
   * exports. without this, the objects get accumulated over time and being rewritten over and over
   * again.
   */
  private clearObjects() {
    this.objects = {};
    this.objectsToRemove = [];
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
  validateObjects(validate: boolean, objects: BitObject[]) {
    objects.forEach((bitObject) => {
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

  async deleteObjectsFromFS(refs: Ref[]): Promise<void> {
    if (!refs.length) return;
    const uniqRefs = uniqBy(refs, 'hash');
    logger.debug(`Repository._deleteMany: deleting ${uniqRefs.length} objects`);
    const concurrency = concurrentIOLimit();
    await pMapPool(uniqRefs, (ref) => this._deleteOne(ref), { concurrency });
    const removed = this.scopeIndex.removeMany(uniqRefs);
    if (removed) await this.scopeIndex.write();
  }

  async moveObjectsToDir(refs: Ref[], dir: string): Promise<void> {
    if (!refs.length) return;
    const uniqRefs = uniqBy(refs, 'hash');
    logger.debug(`Repository.moveObjectsToDir: ${uniqRefs.length} objects`);
    const concurrency = concurrentIOLimit();
    await pMapPool(uniqRefs, (ref) => this.moveOneObjectToDir(ref, dir), { concurrency });
    const removed = this.scopeIndex.removeMany(uniqRefs);
    if (removed) await this.scopeIndex.write();
  }

  async moveObjectsToTrash(refs: Ref[]): Promise<void> {
    await this.moveObjectsToDir(refs, TRASH_DIR);
  }

  async listTrash(): Promise<Ref[]> {
    return this.listRefs(this.getTrashDir());
  }

  async getFromTrash(refs: Ref[]): Promise<BitObject[]> {
    const objectsFromTrash = await Promise.all(
      refs.map(async (ref) => {
        const trashObjPath = path.join(this.getTrashDir(), this.hashPath(ref));
        let buffer: Buffer;
        try {
          buffer = await fs.readFile(trashObjPath);
        } catch (err: any) {
          if (err.code === 'ENOENT') {
            throw new BitError(`unable to find the object ${ref.toString()} in the trash`);
          }
          throw err;
        }
        return BitObject.parseObject(buffer, trashObjPath);
      })
    );
    return objectsFromTrash;
  }

  async restoreFromTrash(refs: Ref[]) {
    logger.debug(`Repository.restoreFromTrash: ${refs.length} objects`);
    const objectsFromTrash = await this.getFromTrash(refs);
    await this.writeObjectsToTheFS(objectsFromTrash);
  }

  async restoreFromDir(dir: string, overwrite = false) {
    await fs.copy(path.join(this.scopePath, dir), this.getPath(), { overwrite });
  }

  private async moveOneObjectToDir(ref: Ref, dir: string) {
    const currentPath = this.objectPath(ref);
    const absDir = path.join(this.scopePath, dir);
    const fullPath = path.join(absDir, this.hashPath(ref));
    await fs.move(currentPath, fullPath, { overwrite: true });
    this.removeFromCache(ref);
  }

  private async moveOneObjectToTrash(ref: Ref) {
    await this.moveOneObjectToDir(ref, TRASH_DIR);
  }

  async deleteRecordsFromUnmergedComponents(compIds: ComponentID[]) {
    this.unmergedComponents.removeMultipleComponents(compIds);
    await this.unmergedComponents.write();
  }

  /**
   * write all objects to the FS and index the components/lanes/symlink objects
   */
  async writeObjectsToTheFS(objects: BitObject[]): Promise<void> {
    const count = objects.length;
    if (!count) return;
    logger.trace(`Repository.writeObjectsToTheFS: started writing ${count} objects`);
    const concurrency = concurrentIOLimit();
    await pMapPool(objects, (obj) => this._writeOne(obj), {
      concurrency,
    });
    logger.trace(`Repository.writeObjectsToTheFS: completed writing ${count} objects`);

    const added = this.scopeIndex.addMany(objects);
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
   * always prefer this.persist() or this.writeObjectsToTheFS()
   * this method doesn't write to scopeIndex. so using this method for ModelComponent or
   * Symlink makes the index outdated.
   */
  async _writeOne(object: BitObject): Promise<void> {
    const { buffer: contents, inflatedSize } = await object.compressWithSize();
    const options: ChownOptions = {};
    if (this.scopeJson.groupName) options.gid = await resolveGroupId(this.scopeJson.groupName);
    const hash = object.hash();
    const objectPath = this.objectPath(hash);
    logger.trace(`repository._writeOne: ${objectPath}`);
    // Run hook to transform content pre persisting
    const transformedContent = this.onPersist(contents);
    await writeFile(objectPath, transformedContent, options);
    // once written, the object is the up-to-date one. this also replaces the size-estimate of objects that
    // were cached by `add()`.
    if (this.cache.has(hash.toString())) this.cache.set(hash.toString(), object, inflatedSize);
    this.liveObjects.set(
      hash.toString(),
      object,
      inflatedSize,
      transformedContent.byteLength < MAX_COMPRESSED_SIZE_TO_CACHE
    );
  }

  async writeObjectsToPendingDir(objectList: ObjectList, pendingDir: PathOsBasedAbsolute) {
    // Refs come from client-supplied tar entry names. Validate the whole batch
    // before any writes so a crafted ref can't escape pendingDir AND so we
    // don't leave orphan files in pendingDir when one entry is rejected mid-batch.
    // Mirrors the isSnap check listRefs already applies on the read path.
    for (const object of objectList.objects) {
      const ref = object.ref.toString();
      if (!isSnap(ref)) throw new BitError(`invalid object ref: ${JSON.stringify(ref)}`);
    }
    const options: ChownOptions = {};
    if (this.scopeJson.groupName) options.gid = await resolveGroupId(this.scopeJson.groupName);
    await Promise.all(
      objectList.objects.map(async (object) => {
        const objPath = path.join(pendingDir, this.hashPath(object.ref));
        await writeFile(objPath, object.buffer, options);
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

async function removeFile(filePath: string, propagateDirs = false): Promise<boolean> {
  try {
    await fs.unlink(filePath);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // the file doesn't exist, that's fine, no need to do anything
      return false;
    }
    throw err;
  }
  if (!propagateDirs) return true;
  const { dir } = path.parse(filePath);
  await removeEmptyDir(dir);
  return true;
}

async function resolveGroupId(groupName: string): Promise<number | null | undefined> {
  // unix group ids are meaningless on Windows, which has no /etc/group and no process.getgid
  if (!process.getgid) return null;
  let groupFileContent: string;
  try {
    groupFileContent = await fs.readFile('/etc/group', 'utf8');
  } catch (err: any) {
    logger.error('resolveGroupId', err);
    throw new BitError(`unable to resolve group id of "${groupName}", got an error ${err.message}`);
  }
  const groupLine = groupFileContent.split('\n').find((line) => line.split(':')[0] === groupName);
  if (!groupLine) {
    throw new BitError(`unable to resolve group id of "${groupName}", the group does not exist`);
  }
  const gid = Number(groupLine.split(':')[2]);
  if (Number.isNaN(gid)) {
    throw new BitError(`unable to resolve group id of "${groupName}", got an error parsing /etc/group`);
  }
  return gid;
}
