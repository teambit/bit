/* eslint max-classes-per-file: 0 */
import fs from 'fs-extra';
import { Mutex } from 'async-mutex';
import * as path from 'path';
import { LaneId } from '@teambit/lane-id';
import { logger } from '@teambit/legacy.logger';
import { InvalidIndexJson } from '@teambit/legacy.scope';
import { ModelComponent, Symlink } from '../models';
import Lane from '../models/lane';
import type BitObject from './object';
import type Ref from './ref';
import { difference } from 'lodash';
import type { NativeImportOperation } from './rust-object-operation';
import type { SnapshotIndexOperation } from './rust-snapshot';

const COMPONENTS_INDEX_FILENAME = 'index.json';

export interface IndexItem {
  hash: string;
  toIdentifierString(): string;
}

export class ComponentItem implements IndexItem {
  constructor(
    public id: { scope: string | null; name: string },
    public isSymlink: boolean,
    public hash: string
  ) {}

  toIdentifierString(): string {
    const scope = this.id.scope ? `${this.id.scope}/` : '';
    return `component "${scope}${this.id.name}"`;
  }
}

export class LaneItem implements IndexItem {
  constructor(
    public id: { scope: string; name: string },
    public hash: string
  ) {}

  toIdentifierString() {
    const scope = this.id.scope ? `${this.id.scope}/` : '';
    return `lane "${scope}${this.id.name}"`;
  }

  toLaneId(): LaneId {
    return new LaneId({ name: this.id.name, scope: this.id.scope });
  }
}

export enum IndexType {
  components = 'components',
  lanes = 'lanes',
}

type Index = { [IndexType.components]: ComponentItem[]; [IndexType.lanes]: LaneItem[] };

export class ScopeIndex {
  nativeImportOperation?: NativeImportOperation;
  nativeSnapshotOperation?: SnapshotIndexOperation;
  indexPath: string;
  index: Index;
  _writeIndexMutex?: Mutex;
  constructor(indexPath: string, index: Index = { [IndexType.components]: [], [IndexType.lanes]: [] }) {
    this.indexPath = indexPath;
    this.index = index;
  }
  get writeIndexMutex() {
    if (!this._writeIndexMutex) {
      this._writeIndexMutex = new Mutex();
    }
    return this._writeIndexMutex;
  }
  static async load(basePath: string): Promise<ScopeIndex> {
    const indexPath = this._composePath(basePath);
    try {
      const indexRaw = await fs.readJson(indexPath);
      const getIndexWithBackwardCompatibility = (): Index => {
        if (Array.isArray(indexRaw)) {
          return { [IndexType.components]: indexRaw, [IndexType.lanes]: [] };
        }
        return indexRaw;
      };
      const indexObject = getIndexWithBackwardCompatibility();
      const index = {
        [IndexType.components]: indexObject[IndexType.components].map(
          (c) => new ComponentItem(c.id, c.isSymlink, c.hash)
        ),
        [IndexType.lanes]: indexObject[IndexType.lanes].map((l) => new LaneItem(l.id, l.hash)),
      };
      return new ScopeIndex(indexPath, index);
    } catch (err: any) {
      if (err.message.includes('Unexpected token')) {
        throw new InvalidIndexJson(indexPath, err.message);
      }
      throw err;
    }
  }
  static create(basePath: string): ScopeIndex {
    const indexPath = this._composePath(basePath);
    return new ScopeIndex(indexPath);
  }
  static async reset(basePath: string) {
    const indexPath = this._composePath(basePath);
    logger.debug(`ComponentsIndex, deleting the index file at ${indexPath}`);
    await fs.remove(indexPath);
  }
  async write() {
    // write only one at a time to avoid corrupting the json file.
    await this.writeIndexMutex.runExclusive(async () => {
      // Snapshot policy must not bypass extensions installed after module initialization.
      const operation =
        (hasDefaultSnapshotIndexMethods(this) ? this.nativeSnapshotOperation : undefined) || this.nativeImportOperation;
      const snapshot = Boolean(operation && operation === this.nativeSnapshotOperation);
      const contents =
        operation && process.platform === 'linux' ? JSON.stringify(this.index, null, 2) + '\n' : undefined;
      const saved =
        operation && process.platform === 'linux'
          ? await operation.request({ kind: 'indexWrite', contents }, (value) => {
              if (typeof value !== 'boolean') throw new Error('invalid native index acknowledgement');
              return value;
            })
          : undefined;
      if (
        saved &&
        (!snapshot || (hasDefaultSnapshotIndexMethods(this) && contents === JSON.stringify(this.index, null, 2) + '\n'))
      ) {
        operation!.stats.indexes++;
        return;
      }
      await fs.writeJson(this.indexPath, this.index, { spaces: 2 });
    });
  }
  getAll(): IndexItem[] {
    return Object.values(this.index).flat();
  }

  getHashes(indexType: IndexType): string[] {
    return this.index[indexType].map((indexItem: IndexItem) => indexItem.hash);
  }
  getHashesByQuery(indexType: IndexType, filter: Function): string[] {
    // @ts-ignore how to tell TS that all this.index.prop are array?
    return this.index[indexType].filter(filter).map((indexItem: IndexItem) => indexItem.hash);
  }
  getHashesIncludeSymlinks(): string[] {
    return this.index.components.map((indexItem) => indexItem.hash);
  }
  addMany(bitObjects: BitObject[]): boolean {
    const added = bitObjects.map((bitObject) => this.addOne(bitObject));
    return added.some((oneAdded) => oneAdded); // return true if one of the objects was added
  }

  async addManyForImport(bitObjects: BitObject[], operation?: SnapshotIndexOperation): Promise<boolean> {
    const objects = bitObjects.filter(
      (object) => object instanceof ModelComponent || object instanceof Symlink || object instanceof Lane
    );
    if (
      !operation ||
      this.addMany !== ScopeIndex.prototype.addMany ||
      this.addOne !== ScopeIndex.prototype.addOne ||
      this.find !== ScopeIndex.prototype.find ||
      this._exist !== ScopeIndex.prototype._exist ||
      !objects.length ||
      objects.some(
        (object) =>
          object instanceof Lane &&
          (object.toLaneId !== Lane.prototype.toLaneId ||
            typeof object.scope !== 'string' ||
            typeof object.name !== 'string')
      ) ||
      this.index.lanes.some(
        (item) =>
          item.toLaneId !== LaneItem.prototype.toLaneId ||
          typeof item.id.name !== 'string' ||
          (item.id.scope && typeof item.id.scope !== 'string')
      )
    )
      return this.addMany(bitObjects);
    const projected = objects.map((object) => ({
      hash: object.hash().toString(),
      id: { scope: (object as ModelComponent).scope || null, name: (object as ModelComponent).name },
      category: object instanceof Lane ? 'lane' : 'component',
    }));
    const initialCounts = { component: this.index.components.length, lane: this.index.lanes.length };
    const plan = await operation.plan(
      () => ({
        kind: 'index',
        components: this.index.components,
        lanes: this.index.lanes.map((item) => ({
          hash: item.hash,
          id: { scope: item.id.scope || null, name: item.id.name },
        })),
        objects: objects.map((object) => ({
          hash: object.hash().toString(),
          id: { scope: (object as ModelComponent).scope || null, name: (object as ModelComponent).name },
          category: object instanceof Lane ? 'lane' : 'component',
        })),
      }),
      (value) => {
        if (value === null) return undefined;
        if (!Array.isArray(value)) throw new Error('invalid native index actions');
        const counts = { ...initialCounts };
        for (const entry of value) {
          if (
            !Array.isArray(entry) ||
            entry.length !== 3 ||
            !['add', 'rename'].includes(entry[0]) ||
            !Number.isInteger(entry[1]) ||
            entry[1] < 0 ||
            entry[1] >= objects.length ||
            !Number.isInteger(entry[2])
          )
            throw new Error('invalid native index action');
          const category = projected[entry[1]].category as keyof typeof counts;
          if (entry[0] === 'add') {
            if (entry[2] !== counts[category]++) throw new Error('invalid native index append');
          } else if (category !== 'lane' || entry[2] < 0 || entry[2] >= counts.lane)
            throw new Error('invalid native lane rename');
        }
        return value as [string, number, number][];
      }
    );
    const added = plan?.apply((actions) => {
      if (!actions) return undefined;
      for (const [kind, offset, index] of actions) {
        const object = objects[offset];
        if (kind === 'rename') this.index.lanes[index].id = (object as Lane).toLaneId();
        else if (object instanceof Lane) this.index.lanes.push(new LaneItem(object.toLaneId(), projected[offset].hash));
        else
          this.index.components.push(
            new ComponentItem(projected[offset].id, object instanceof Symlink, projected[offset].hash)
          );
      }
      return actions.length > 0;
    });
    return added === undefined ? this.addMany(bitObjects) : added;
  }
  addOne(bitObject: BitObject): boolean {
    if (!(bitObject instanceof ModelComponent) && !(bitObject instanceof Symlink) && !(bitObject instanceof Lane))
      return false;
    const hash = bitObject.hash().toString();

    if (bitObject instanceof Lane) {
      const found = this.find(hash) as LaneItem | undefined;
      if (found) {
        if ((found as LaneItem).toLaneId().isEqual(bitObject.toLaneId())) return false;
        found.id = bitObject.toLaneId();
      } else {
        const laneItem = new LaneItem(bitObject.toLaneId(), hash);
        this.index.lanes.push(laneItem);
      }
      return true;
    }
    if (bitObject instanceof ModelComponent || bitObject instanceof Symlink) {
      if (this._exist(hash)) return false;
      const componentItem = new ComponentItem(
        { scope: bitObject.scope || null, name: bitObject.name },
        bitObject instanceof Symlink,
        hash
      );
      this.index.components.push(componentItem);
    }
    return true;
  }
  removeMany(refs: Ref[]): boolean {
    const removed = refs.map((ref) => this.removeOne(ref.toString()));
    return removed.some((removedOne) => removedOne); // return true if one of the objects was removed
  }
  removeOne(hash: string): boolean {
    for (const entity of Object.keys(IndexType)) {
      const found = this.index[entity].find((indexItem) => indexItem.hash === hash);
      if (found) {
        this.index[entity] = difference(this.index[entity], [found]);
        return true;
      }
    }
    return false;
  }
  async deleteFile() {
    logger.debug(`ComponentsIndex, deleting the index file at ${this.indexPath}`);
    await fs.remove(this.indexPath);
  }
  getPath() {
    return this.indexPath;
  }
  /**
   * it's obviously not accurate. a local path might include 'bithub' as part of the path as well.
   * however, it's needed only for suppressing the error message when the indexJson is outdate,
   * so if it happens on a local scope it's okay.
   * for other purposes, don't rely on this.
   */
  isFileOnBitHub() {
    return this.indexPath.includes('/bithub/') || this.indexPath.includes('/tmp/scope-fs/');
  }
  find(hash: string): IndexItem | null {
    for (const entity of Object.keys(IndexType)) {
      const found = this.index[entity].find((indexItem) => indexItem.hash === hash);
      if (found) return found;
    }
    return null;
  }
  _exist(hash: string): boolean {
    return Boolean(this.find(hash));
  }
  static _composePath(basePath: string): string {
    return path.join(basePath, COMPONENTS_INDEX_FILENAME);
  }
}

const snapshotIndexDefaults = ['write', 'addManyForImport', 'addMany', 'addOne', 'find', '_exist', 'getPath'].map(
  (name) => [name, ScopeIndex.prototype[name]] as const
);

function hasDefaultSnapshotIndexMethods(index: ScopeIndex): boolean {
  return (
    Object.getPrototypeOf(index) === ScopeIndex.prototype &&
    snapshotIndexDefaults.every(([name, method]) => index[name] === method)
  );
}

/** The native snapshot writer targets the ordinary scope index beside its objects directory. */
export function canPersistSnapshotIndexNatively(index: ScopeIndex, objectsDirectory: string): boolean {
  return (
    hasDefaultSnapshotIndexMethods(index) &&
    typeof index.indexPath === 'string' &&
    path.resolve(index.indexPath) === path.join(path.dirname(path.resolve(objectsDirectory)), COMPONENTS_INDEX_FILENAME)
  );
}
