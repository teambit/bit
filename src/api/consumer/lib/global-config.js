/** @flow */
import { GlobalConfig } from '../../../global-config';
import Config from '../../../global-config/config';

export function set(key: string, val: string): Promise<Config> {
  return GlobalConfig.load()
    .then((config) => {
      config.set(key, val);
      return config.write()
        .then(() => config);
    });
}

export function setSync(key: string, val: string): Config {
  const config = GlobalConfig.loadSync();
  config.set(key, val);
  config.writeSync();
  return config;
}

export function del(key: string): Promise<Config> {
  return GlobalConfig.load()
    .then((config) => {
      config.delete(key);
      return config.write()
        .then(() => config);
    });
}

export function delSync(key: string): Config {
  const config = GlobalConfig.loadSync();
  config.delete(key);
  config.writeSync();
  return config;
}

export function get(key: string): Promise<?string> {
  return GlobalConfig.load()
    .then((config) => {
      return config.get(key);
    });
}

export function getSync(key: string): ?string {
  const config = GlobalConfig.loadSync();
  return config.get(key);
}

export function list(): Promise<any> {
  return GlobalConfig.load()
    .then(config => config.toPlainObject());
}

export function listSync(): any {
  const config = GlobalConfig.loadSync();
  return config.toPlainObject();
}
