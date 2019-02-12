// @flow
import path from 'path';
import fs from 'fs-extra';
import BitId from '../../bit-id/bit-id';
import { ModelComponent, Symlink } from '../models';
import { BitObject, Ref } from '.';

const COMPONENTS_INDEX_FILENAME = 'index.json';

type IndexItem = { id: { scope: ?string, name: string }, isSymlink: boolean, hash: string };

export default class ComponentsIndex {
  index: IndexItem[];
  indexPath: string;
  constructor(index: IndexItem[], indexPath: string) {
    this.index = index;
    this.indexPath = indexPath;
  }
  static async load(basePath: string): Promise<ComponentsIndex> {
    const indexPath = this._composePath(basePath);
    const index = await fs.readJson(indexPath);
    return new ComponentsIndex(index, indexPath);
  }
  static async create(basePath: string, bitObjects: BitObject[]): Promise<ComponentsIndex> {
    const indexPath = this._composePath(basePath);
    const componentsIndex = new ComponentsIndex([], indexPath);
    componentsIndex.addMany(bitObjects);
    await componentsIndex.write();
    return componentsIndex;
  }
  getIds(): BitId[] {
    return this.index.filter(indexItem => !indexItem.isSymlink).map(indexItem => this.indexItemToBitId(indexItem));
  }
  getIdsIncludesSymlinks(): BitId[] {
    return this.index.map(indexItem => this.indexItemToBitId(indexItem));
  }
  indexItemToBitId(indexItem: IndexItem) {
    // $FlowFixMe box is not needed
    return new BitId(indexItem.id);
  }
  addMany(bitObjects: BitObject[]): boolean {
    const added = bitObjects.map(bitObject => this.addOne(bitObject));
    return added.some(oneAdded => oneAdded); // return true if one of the objects was added
  }
  addOne(bitObject: BitObject): boolean {
    if (!(bitObject instanceof ModelComponent) && !(bitObject instanceof Symlink)) return false;
    const hash = bitObject.hash().toString();
    if (this.exist(hash)) return false;
    this.index.push({
      id: { scope: bitObject.scope || null, name: bitObject.name },
      isSymlink: bitObject instanceof Symlink,
      hash
    });
    return true;
  }
  find(id: BitId): ?IndexItem {
    return this.index.find(indexItem => this._isEqual(indexItem, id));
  }
  findByHash(hash: string): ?IndexItem {
    return this.index.find(indexItem => indexItem.hash === hash);
  }
  exist(hash: string): boolean {
    return Boolean(this.findByHash(hash));
  }
  removeMany(refs: Ref[]): boolean {
    const removed = refs.map(ref => this.remove(ref.toString()));
    return removed.some(removedOne => removedOne); // return true if one of the objects was removed
  }
  remove(hash: string): boolean {
    const indexInIndexArray = this._findIndex(hash);
    if (indexInIndexArray === -1) return false; // not found
    this.index.splice(indexInIndexArray);
    return true;
  }
  async write() {
    return fs.writeJson(this.indexPath, this.index, { spaces: 2 });
  }
  static _composePath(basePath: string): string {
    return path.join(basePath, COMPONENTS_INDEX_FILENAME);
  }
  _findIndex(hash: string) {
    return this.index.findIndex(indexItem => indexItem.hash === hash);
  }
  _isEqual(indexItem: IndexItem, id: BitId): boolean {
    const isScopeEqual = (scopeA: ?string, scopeB: ?string): boolean => {
      if (!scopeA && !scopeB) return true;
      return scopeA === scopeB;
    };
    return indexItem.id.name === id.name && isScopeEqual(indexItem.id.scope, id.scope);
  }
}
