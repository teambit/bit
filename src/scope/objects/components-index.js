// @flow
import path from 'path';
import fs from 'fs-extra';
import BitId from '../../bit-id/bit-id';
import { ModelComponent, Symlink } from '../models';

const COMPONENTS_INDEX_FILENAME = 'index.json';

type IndexItem = { id: { scope: ?string, name: string }, isSymlink: boolean };

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
  static async create(basePath: string, componentsList: Array<ModelComponent | Symlink>): Promise<ComponentsIndex> {
    const indexPath = this._composePath(basePath);
    const componentsIndex = new ComponentsIndex([], indexPath);
    componentsList.forEach(component => componentsIndex.add(component.toBitId(), component instanceof Symlink));
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
  add(id: BitId, isSymlink: boolean = false): boolean {
    if (!(id instanceof BitId)) throw new TypeError('ComponentsIndex.add expects to get an instance of BitId');
    if (this.exist(id)) return false;
    this.index.push({ id: { scope: id.scope || null, name: id.name }, isSymlink });
    return true;
  }
  find(id: BitId): ?IndexItem {
    return this.index.find(indexItem => this._isEqual(indexItem, id));
  }
  exist(id: BitId): boolean {
    return Boolean(this.find(id));
  }
  remove(id: BitId): boolean {
    const indexInIndexArray = this._findIndex(id);
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
  _findIndex(id: BitId) {
    return this.index.findIndex(indexItem => this._isEqual(indexItem, id));
  }
  _isEqual(indexItem: IndexItem, id: BitId): boolean {
    const isScopeEqual = (scopeA: ?string, scopeB: ?string): boolean => {
      if (!scopeA && !scopeB) return true;
      return scopeA === scopeB;
    };
    return indexItem.id.name === id.name && isScopeEqual(indexItem.id.scope, id.scope);
  }
}
