/** @flow */
import path from 'path';
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
