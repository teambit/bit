/** @flow */

import { BitIds, BitId } from '../../bit-id';
import BitMap from '../../consumer/bit-map';
import { MissingBitMapComponent } from '../../consumer/bit-map/exceptions';
import ComponentMap from '../../consumer/bit-map/component-map';
import type { BitMapComponents } from '../../consumer/bit-map/bit-map';

export type BitMapProps = {
  bitmap: BitMap,
  bitmapPath: string,
  version: string
};

export default class ContextBitMap {
  __bitmap: BitMap;
  bitmapPath: string;
  version: string;

  constructor(props: BitMapProps) {
    this.__bitmap = props.bitmap;
    this.bitmapPath = props.bitmapPath;
    this.version = props.version;
  }

  static async load(bitmap: BitMap): Promise<?ContextBitMap> {
    const props = {};
    props.bitmap = bitmap;
    props.bitmapPath = bitmap.mapPath;
    props.version = bitmap.version;
    return new ContextBitMap(props);
  }

  /**
   * get existing bitmap bit-id by bit-id.
   * this used to get the actual bitId from bitmap
   * You can use it to get the scope / version from the bitmap.
   */
  getBitId(
    bitId: BitId,
    ignoreOpts: {
      ignoreVersion?: boolean,
      ignoreScopeAndVersion?: boolean
    } = {},
    opts: {
      throws: boolean
    }
  ): BitId {
    const existingBitId = this.__bitmap.getBitIdIfExist(bitId, ignoreOpts);
    if (!existingBitId && opts.throws) {
      throw new MissingBitMapComponent(existingBitId.toString());
    }
    return existingBitId;
  }

  /**
   * find ids that have the same name but different version
   * if compareWithoutScope is false, the scope should be identical in addition to the name
   */
  findSimilarIds(id: BitId, compareWithoutScope: boolean = false): BitIds {
    return this.__bitmap.findSimilarIds(id, compareWithoutScope);
  }

  /**
   * Return a component id as listed in bit.map file
   * by a path exist in the files object
   *
   * @param {string} componentPath relative to consumer - as stored in bit.map files object
   * @returns {BitId} component id
   * @memberof BitMap
   */
  getComponentIdByPath(componentPath: string, caseSensitive: boolean = true): BitId {
    return this.__bitmap.getComponentIdByPath(componentPath, caseSensitive);
  }

  /**
   * Return a potential componentMap if file is supposed to be part of it
   * by a path exist in the files object
   *
   * @param {string} componentPath relative to consumer - as stored in bit.map files object
   * @returns {ComponentMap} componentMap
   */
  getComponentObjectOfFileByPath(componentPath: string): BitMapComponents {
    return this.__bitmap.getComponentObjectOfFileByPath(componentPath);
  }

  getAllTrackDirs(): { [string]: string } {
    return this.__bitmap.getAllTrackDirs();
  }

  getComponent(
    bitId: BitId,
    ignoreOpts?: {
      ignoreVersion?: boolean,
      ignoreScopeAndVersion?: boolean
    } = {},
    opts?: {
      throws: boolean
    }
  ): ?ComponentMap {
    const componentMap = this.__bitmap.getComponentIfExist(bitId, ignoreOpts);
    if (!componentMap && opts.throws) {
      throw new MissingBitMapComponent(bitId.toString());
    }
    return componentMap;
  }

  getAuthoredAndImportedBitIds(): BitIds {
    return this.__bitmap.getAuthoredAndImportedBitIds();
  }

  getAuthoredExportedComponents(): BitId[] {
    return this.__bitmap.getAuthoredExportedComponents();
  }

  getAllComponents(origin?: ComponentOrigin | ComponentOrigin[]): BitMapComponents {
    // TODO: wrap ComponentMap with better API
    return this.__bitmap.getAllComponents(origin);
  }

  getAllBitIds(origin?: ComponentOrigin[]): BitIds {
    return this.__bitmap.getAllBitIds(origin);
  }

  // TODO: write docs

  // TODO: APIs to consider
  // static reset(dirPath: PathOsBasedAbsolute, resetHard: boolean): void {
  // static parseConfigDir(configDir: ConfigDir, rootDir: string) {
  // removeComponents(ids: BitIds) {
}
