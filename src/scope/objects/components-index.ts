import * as path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import BitId from '../../bit-id/bit-id';
import { ModelComponent, Symlink } from '../models';
import { BitObject, Ref } from '.';
import logger from '../../logger/logger';
import InvalidIndexJson from '../exceptions/invalid-index-json';

const COMPONENTS_INDEX_FILENAME = 'index.json';

type IndexItem = { id: { scope: string | null | undefined; name: string }; isSymlink: boolean; hash: string };

export default class ComponentsIndex {
  indexPath: string;
  index: IndexItem[];
  constructor(indexPath: string, index: IndexItem[] = []) {
    this.indexPath = indexPath;
    this.index = index;
  }
  static async load(basePath: string): Promise<ComponentsIndex> {
    const indexPath = this._composePath(basePath);
    try {
      const index = await fs.readJson(indexPath);
      return new ComponentsIndex(indexPath, index);
    } catch (err) {
      if (err.message.includes('Unexpected token')) {
        throw new InvalidIndexJson(indexPath, err.message);
      }
      throw err;
    }
  }
  static create(basePath: string): ComponentsIndex {
    const indexPath = this._composePath(basePath);
    return new ComponentsIndex(indexPath);
  }
  static async reset(basePath: string) {
    const indexPath = this._composePath(basePath);
    logger.debug(`ComponentsIndex, deleting the index file at ${indexPath}`);
    await fs.remove(indexPath);
  }
  async write() {
    return fs.writeJson(this.indexPath, this.index, { spaces: 2 });
  }
  getIds(): BitId[] {
    return this.index.filter(indexItem => !indexItem.isSymlink).map(indexItem => this.indexItemToBitId(indexItem));
  }
  getIdsIncludesSymlinks(): BitId[] {
    return this.index.map(indexItem => this.indexItemToBitId(indexItem));
  }
  getIdByHash(hash: string): BitId | null | undefined {
    const foundIndexItem = this.index.find(indexItem => indexItem.hash === hash);
    if (!foundIndexItem) return null;
    return this.indexItemToBitId(foundIndexItem);
  }
  getHashes(): string[] {
    return this.index.filter(indexItem => !indexItem.isSymlink).map(indexItem => indexItem.hash);
  }
  getHashesIncludeSymlinks(): string[] {
    return this.index.map(indexItem => indexItem.hash);
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
    if (this._exist(hash)) return false;
    this.index.push({
      id: { scope: bitObject.scope || null, name: bitObject.name },
      isSymlink: bitObject instanceof Symlink,
      hash
    });
    return true;
  }
  removeMany(refs: Ref[]): boolean {
    const removed = refs.map(ref => this.removeOne(ref.toString()));
    return removed.some(removedOne => removedOne); // return true if one of the objects was removed
  }
  removeOne(hash: string): boolean {
    const found = this._find(hash);
    if (!found) return false;
    this.index = R.without([found], this.index);
    return true;
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
    return this.indexPath.includes('/bithub/');
  }
  _find(hash: string): IndexItem | null | undefined {
    return this.index.find(indexItem => indexItem.hash === hash);
  }
  _exist(hash: string): boolean {
    return Boolean(this._find(hash));
  }
  static _composePath(basePath: string): string {
    return path.join(basePath, COMPONENTS_INDEX_FILENAME);
  }
}
