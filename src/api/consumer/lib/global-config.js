/** @flow */
import { GlobalConfig } from '../../../global-config';

export function set(key: string, val: string) {
  return GlobalConfig.load()
    .then((config) => {
      config.set(key, val);
      return config.write()
        .then(() => config);
    });
}

export function del(key: string) {
  return GlobalConfig.load()
    .then((config) => {
      config.delete(key);
      return config.write()
        .then(() => config);
    });
}

export function get(key: string) {
  return GlobalConfig.load()
    .then((config) => {
      return config.get(key);
    });
}

export function list() {
  return GlobalConfig.load()
    .then(config => config.toPlainObject());
}
