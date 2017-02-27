import { loadScope } from '../../../scope';

export function set(key: string, val: string): Promise<Config> {
  return loadScope(process.cwd())
    .then((config) => {
      config.set(key, val);
      return config.write()
        .then(() => config);
    });
}

export function del(key: string): Promise<Config> {
  return loadScope(process.cwd())
    .then((config) => {
      config.delete(key);
      return config.write()
        .then(() => config);
    });
}

export function get(key: string): Promise<?string> {
  return loadScope(process.cwd())
    .then((config) => {
      return config.get(key);
    });
}

export function list(): Promise<any> {
  return loadScope(process.cwd())
    .then(config => config.toPlainObject());
}
