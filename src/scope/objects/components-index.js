// @flow
import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import BitId from '../../bit-id/bit-id';
import { ModelComponent, Symlink } from '../models';
import { BitObject, Ref } from '.';

const COMPONENTS_INDEX_FILENAME = 'index.json';

type IndexItem = { id: { scope: ?string, name: string }, isSymlink: boolean, hash: string };

export default class ComponentsIndex {
  indexPath: string;
  index: IndexItem[];
  constructor(indexPath: string, index: IndexItem[] = []) {
    this.indexPath = indexPath;
    this.index = index;
  }
  static async load(basePath: string): Promise<ComponentsIndex> {
    const indexPath = this._composePath(basePath);
    const index = await fs.readJson(indexPath);
    return new ComponentsIndex(indexPath, index);
  }
  static create(basePath: string): ComponentsIndex {
    const indexPath = this._composePath(basePath);
    return new ComponentsIndex(indexPath);
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
  find(hash: string): ?IndexItem {
    return this.index.find(indexItem => indexItem.hash === hash);
  }
  exist(hash: string): boolean {
    return Boolean(this.find(hash));
  }
  removeMany(refs: Ref[]): boolean {
    const removed = refs.map(ref => this.removeOne(ref.toString()));
    return removed.some(removedOne => removedOne); // return true if one of the objects was removed
  }
  removeOne(hash: string): boolean {
    const found = this.find(hash);
    if (!found) return false;
    this.index = R.without([found], this.index);
    return true;
  }
  async write() {
    return fs.writeJson(this.indexPath, this.index, { spaces: 2 });
  }
  static _composePath(basePath: string): string {
    return path.join(basePath, COMPONENTS_INDEX_FILENAME);
  }
}
