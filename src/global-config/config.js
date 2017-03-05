/** @flow */
import path from 'path';
import fs from 'fs';
import { GLOBAL_CONFIG, GLOBAL_CONFIG_FILE } from '../constants';
import { mapToObject, objectToTupleArray, writeFile, readFile } from '../utils';

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
    return writeFile(getPath(), this.toJson());
  }

  writeSync() {
    return fs.writeFileSync(getPath(), this.toJson());
  }

  static loadSync(): Config {
    try {
      const contents = fs.readFileSync(getPath());
      return new Config(objectToTupleArray(JSON.parse(contents.toString())));
    } catch (err) {
      if (err.code !== 'ENOENT') return err;
      const config = new Config([]);
      config.writeSync();
      return config;
    }
  }

  static load(): Promise<Config> {
    return readFile(getPath())
      .then(contents => new Config(objectToTupleArray(JSON.parse(contents.toString()))))
      .catch((err) => {
        if (err.code !== 'ENOENT') return err;
        const config = new Config([]);
        return config.write()
          .then(() => config);
      });
  }
}
