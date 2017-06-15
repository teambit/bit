import path from 'path';
import fs from 'fs-extra';
import logger from '../../logger/logger';
import { BIT_LOCK } from '../../constants';
import InvalidBitLock from './exceptions/invalid-bit-lock';

export default class BitLock {
  lockPath: string;
  components: Object<string>;
  constructor(lockPath: string, components: Object<string>) {
    this.lockPath = lockPath;
    this.components = components;
  }

  static load(dirPath: string): BitLock {
    const lockPath = path.join(dirPath, BIT_LOCK);
    let components;
    if (fs.existsSync(lockPath)) {
      try {
        components = JSON.parse(fs.readFileSync(lockPath).toString('utf8'));
      } catch (e) {
        throw new InvalidBitLock(lockPath);
      }
    } else {
      logger.info('bit.lock: unable to find an existing bit.lock file');
      components = {};
    }
    return new BitLock(lockPath, components);
  }

  getAllComponents() {
    return this.components;
  }

  addComponent(componentId: string, componentPath: string): void {
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

  getComponentPath(id: string): ?string {
    if (this.components[id]) return this.components[id].path;
    return null;
  }

  getComponentImplFile(id: string): ?string {
    if (this.components[id] && this.components[id].implFile) return this.components[id].implFile;
    return null;
  }

  // todo: use this lib: https://github.com/getify/JSON.minify to add comments to this file
  // then, upon creating the file for the first time, add a comment with warnings about modifying
  // the file
  write() {
    fs.outputFileSync(this.lockPath, JSON.stringify(this.components, null, 4));
  }
}
