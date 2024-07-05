import fs from 'fs-extra';
import * as path from 'path';

import { GLOBAL_CONFIG, GLOBAL_CONFIG_FILE } from '../constants';

export function getGlobalConfigPath() {
  return path.join(GLOBAL_CONFIG, GLOBAL_CONFIG_FILE);
}

export default class Config extends Map<string, string> {
  toPlainObject() {
    return mapToObject(this);
  }

  toJson() {
    return JSON.stringify(this.toPlainObject(), null, 2);
  }

  write() {
    return fs.outputFile(getGlobalConfigPath(), this.toJson());
  }

  writeSync() {
    return fs.outputFileSync(getGlobalConfigPath(), this.toJson());
  }

  static loadSync(): Config {
    const configPath = getGlobalConfigPath();
    if (!fs.existsSync(configPath)) {
      const config = new Config([]);
      config.writeSync();
      return config;
    }
    const contents = fs.readFileSync(configPath);
    return new Config(Object.entries(JSON.parse(contents.toString())));
  }

  static async load(): Promise<Config> {
    const configPath = getGlobalConfigPath();
    const exists = await fs.pathExists(configPath);
    if (!exists) {
      const config = new Config([]);
      await config.write();
      return config;
    }
    const contents = await fs.readFile(configPath);
    return new Config(Object.entries(JSON.parse(contents.toString())));
  }
}

/**
 * Cast a `Map` to a plain object.
 * Keys are being casted by invoking `toString` on each key.
 * @name mapToObject
 * @param {Map} map to cast
 * @returns {*} plain object
 * @example
 * ```js
 *  mapToObject(new Map([['key', 'val'], ['foo', 'bar']]));
 *  // => { key: 'val', foo: 'bar' }
 * ```
 */
function mapToObject(map: Map<any, any>): { [key: string]: any } {
  const object = {};
  map.forEach((val, key) => {
    object[key.toString()] = val;
  });
  return object;
}
