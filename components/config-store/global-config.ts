import fs from 'fs-extra';
import * as path from 'path';
import { homedir } from 'os';

// Path resolution is inlined here (rather than imported from
// `@teambit/legacy.constants`) to break the import cycle
//   config-store → config-getter → global-config → legacy.constants → config-store
// which used to be papered over by the babel `lazy: () => true` thunk
// transform. The thunk has been removed because it blocks the ESM migration
// (lazy require is CJS-only). Keep these constants in sync with the same
// names in `legacy.constants/constants.ts` if either ever moves.

const CACHE_GLOBALS_ENV = 'BIT_GLOBALS_DIR';

function getCacheRoot(): string {
  const fromEnvVar = process.env[CACHE_GLOBALS_ENV];
  if (fromEnvVar && typeof fromEnvVar === 'string') return fromEnvVar;
  if (process.platform === 'darwin' || process.platform === 'linux') {
    return path.join(homedir(), 'Library', 'Caches', 'Bit');
  }
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'Bit');
  }
  return path.join(homedir(), '.bit');
}

const GLOBAL_CONFIG_DIR = path.join(getCacheRoot(), 'config');
const GLOBAL_CONFIG_FILE = 'config.json';

// Owner-only perms for the global config file. It can hold the user's
// bit-cloud token and other secrets, so match the AWS/gcloud baseline
// of 0600 instead of relying on the umask default (often 0644).
const CONFIG_FILE_MODE = 0o600;

export function getGlobalConfigPath() {
  return path.join(GLOBAL_CONFIG_DIR, GLOBAL_CONFIG_FILE);
}

export class GlobalConfig extends Map<string, string> {
  toPlainObject() {
    return mapToObject(this);
  }

  toJson() {
    return JSON.stringify(this.toPlainObject(), null, 2);
  }

  async write() {
    const configPath = getGlobalConfigPath();
    await fs.outputFile(configPath, this.toJson(), { mode: CONFIG_FILE_MODE });
    // Node's `mode` write option is only honored when the file is created,
    // so chmod explicitly to tighten any pre-existing file written under
    // the default umask.
    await fs.chmod(configPath, CONFIG_FILE_MODE);
  }

  writeSync() {
    const configPath = getGlobalConfigPath();
    fs.outputFileSync(configPath, this.toJson(), { mode: CONFIG_FILE_MODE });
    fs.chmodSync(configPath, CONFIG_FILE_MODE);
  }

  static loadSync(): GlobalConfig {
    const configPath = getGlobalConfigPath();
    if (!fs.existsSync(configPath)) {
      const config = new GlobalConfig([]);
      config.writeSync();
      return config;
    }
    const contents = fs.readFileSync(configPath);
    return new GlobalConfig(Object.entries(JSON.parse(contents.toString())));
  }

  static async load(): Promise<GlobalConfig> {
    const configPath = getGlobalConfigPath();
    const exists = await fs.pathExists(configPath);
    if (!exists) {
      const config = new GlobalConfig([]);
      await config.write();
      return config;
    }
    const contents = await fs.readFile(configPath);
    return new GlobalConfig(Object.entries(JSON.parse(contents.toString())));
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
