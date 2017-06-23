import path from 'path';
import fs from 'fs-extra';
import logger from '../../logger/logger';
import { BIT_LOCK } from '../../constants';
import InvalidBitLock from './exceptions/invalid-bit-lock';
import { BitId } from '../../bit-id';
import { readFile, outputFile } from '../../utils';

export default class BitLock {
  lockPath: string;
  components: Object<string>;
  constructor(lockPath: string, components: Object<string>) {
    this.lockPath = lockPath;
    this.components = components;
  }

  static async load(dirPath: string): BitLock {
    const lockPath = path.join(dirPath, BIT_LOCK);
    let components;
    if (fs.existsSync(lockPath)) {
      try {
        const lockFileContent = await readFile(lockPath);
        components = JSON.parse(lockFileContent.toString('utf8'));
      } catch (e) {
        throw new InvalidBitLock(lockPath);
      }
    } else {
      logger.info('bit.lock: unable to find an existing bit.lock file');
      components = {};
    }
    return new BitLock(lockPath, components);
  }

  getAllComponents(): Object<string> {
    return this.components;
  }

  addComponent(componentId: string, componentPath: string): void {
    logger.debug(`adding to bit.lock ${componentId}`);
    let stat;
    try {
      stat = fs.lstatSync(componentPath);
    } catch (err) {
      throw new Error(`The path ${componentPath} doesn't exist`);
    }
    if (this.components[componentId]) {
      logger.info(`bit.lock: overriding an exiting component ${componentId}`);
    }
    if (stat.isFile()) {
      this.components[componentId] = {
        path: path.dirname(componentPath),
        implFile: path.basename(componentPath)
      };
    } else {
      this.components[componentId] = { path: componentPath };
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
    logger.debug('writing to bit.lock');
    return outputFile(this.lockPath, JSON.stringify(this.components, null, 4));
  }
}
