/** @flow */
import path from 'path';
import fs from 'fs-extra';
import { GLOBAL_CONFIG, GLOBAL_CONFIG_FILE } from '../constants';
import { mapToObject, objectToTupleArray } from '../utils';

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
    try {
      const configPath = getPath();
      if (!fs.existsSync(configPath)) {
        const config = new Config([]);
        config.writeSync();
        return config;
      }
      const contents = fs.readFileSync(configPath);
      return new Config(objectToTupleArray(JSON.parse(contents.toString())));
    } catch (err) {
      return err;
    }
  }

  static async load(): Promise<Config> {
    try {
      const configPath = getPath();
      const exists = await fs.exists(configPath);
      if (!exists) {
        const config = new Config([]);
        await config.write();
        return config;
      }
      const contents = await fs.readFile(configPath);
      return new Config(objectToTupleArray(JSON.parse(contents.toString())));
    } catch (err) {
      return err;
    }
  }
}
