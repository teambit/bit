import path from 'path';
import fs from 'fs-extra';
import logger from '../../logger/logger';
import { BIT_MAP } from '../../constants';
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

  getAllComponents(): Object<string> {
    return this.components;
  }

  addComponent(componentId: string,
               componentPath: string,
               implFile?: string,
               specFile?: string): void {
    logger.debug(`adding to bit.map ${componentId}`);
    if (this.components[componentId]) {
      logger.info(`bit.map: overriding an exiting component ${componentId}`);
    }
    this.components[componentId] = { path: componentPath };
    if (implFile) {
      this.components[componentId].implFile = implFile;
    }
    if (specFile) {
      this.components[componentId].specFile = specFile;
    }
  }

  getComponentPath(id: BitId): ?string {
    if (this.components[id.toString()]) return this.components[id].path;
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
