import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import logger from '../../logger/logger';
import { BIT_MAP, DEFAULT_INDEX_NAME } from '../../constants';
import InvalidBitMap from './exceptions/invalid-bit-map';
import { BitId } from '../../bit-id';
import { readFile, outputFile } from '../../utils';

export default class BitMap {
  mapPath: string;
  components: Object<string>;
  constructor(mapPath: string, components: Object<string>) {
    this.mapPath = mapPath;
    this.components = components;
  }

  static async load(dirPath: string): BitMap {
    const mapPath = path.join(dirPath, BIT_MAP);
    let components;
    if (fs.existsSync(mapPath)) {
      try {
        const mapFileContent = await readFile(mapPath);
        components = JSON.parse(mapFileContent.toString('utf8'));
      } catch (e) {
        throw new InvalidBitMap(mapPath);
      }
    } else {
      logger.info('bit.map: unable to find an existing bit.map file');
      components = {};
    }
    return new BitMap(mapPath, components);
  }

  isComponentExist(componentId: string): boolean {
    return !!this.components[componentId];
  }

  getAllComponents(): Object<string> {
    return this.components;
  }

  addComponent(componentId: string,
               componentPaths: string[],
               indexFile?: string,
               specsFiles?: string[]): void {
    logger.debug(`adding to bit.map ${componentId}`);
    if (this.components[componentId]) {
      logger.info(`bit.map: updating an exiting component ${componentId}`);
      if (componentPaths) {
        const allPaths = componentPaths.concat(this.components[componentId].files);
        this.components[componentId].files = R.uniq(allPaths);
      }
      if (indexFile) this.components[componentId].indexFile = indexFile;
      if (specsFiles) {
        const allSpecsFiles = specsFiles.concat(this.components[componentId].specsFiles);
        this.components[componentId].specsFiles = R.uniq(allSpecsFiles);
      }
    } else {
      this.components[componentId] = { files: componentPaths };
      this.components[componentId].indexFile = indexFile || DEFAULT_INDEX_NAME;
      this.components[componentId].specsFiles = specsFiles || [];
    }
  }

  getComponentFiles(id: BitId): ?string {
    if (this.components[id.toString()]) return this.components[id].files;
    return null;
  }

  getComponentImplFile(id: string): ?string {
    if (this.components[id] && this.components[id].implFile) return this.components[id].implFile;
    return null;
  }

  // todo: use this lib: https://github.com/getify/JSON.minify to add comments to this file
  // then, upon creating the file for the first time, add a comment with warnings about modifying
  // the file
  write(): Promise<> {
    logger.debug('writing to bit.map');
    return outputFile(this.mapPath, JSON.stringify(this.components, null, 4));
  }
}
