import fs from 'fs-extra';
import * as path from 'path';

import { GLOBAL_CONFIG, GLOBAL_CONFIG_FILE } from '../constants';
import { mapToObject } from '../utils';

function getPath() {
  return path.join(GLOBAL_CONFIG, GLOBAL_CONFIG_FILE);
}

export default class Config extends Map<string, string> {
  toPlainObject() {
    return mapToObject(this);
  }

  toJson() {
    return JSON.stringify(this.toPlainObject());
  }

  write() {
    return fs.outputFile(getPath(), this.toJson());
  }

  writeSync() {
    return fs.outputFileSync(getPath(), this.toJson());
  }

  static loadSync(): Config {
    const configPath = getPath();
    if (!fs.existsSync(configPath)) {
      const config = new Config([]);
      config.writeSync();
      return config;
    }
    const contents = fs.readFileSync(configPath);
    return new Config(Object.entries(JSON.parse(contents.toString())));
  }

  static async load(): Promise<Config> {
    const configPath = getPath();
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
