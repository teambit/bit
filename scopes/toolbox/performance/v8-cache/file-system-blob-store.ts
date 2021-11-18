// Copied from https://github.com/zertosh/v8-compile-cache
import { mkdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'fs';
import path, { join } from 'path';

type DumpMap = { [key: string]: [string, number, number] };
type Dump = [Buffer[], DumpMap];

const hasOwnProperty = Object.prototype.hasOwnProperty;

// https://github.com/substack/node-mkdirp/blob/f2003bb/index.js#L55-L98
function mkdirpSync(p_: string): void {
  _mkdirpSync(path.resolve(p_), 0o777);
}

function _mkdirpSync(p: string, mode?: number): void {
  try {
    mkdirSync(p, mode);
  } catch (err0: any) {
    if (err0.code === 'ENOENT') {
      _mkdirpSync(path.dirname(p));
      _mkdirpSync(p);
    } else {
      try {
        const stat = statSync(p);
        if (!stat.isDirectory()) {
          throw err0;
        }
      } catch (err1) {
        throw err0;
      }
    }
  }
}

// https://github.com/zertosh/slash-escape/blob/e7ebb99/slash-escape.js
function slashEscape(str: string): string {
  const ESCAPE_LOOKUP = {
    '\\': 'zB',
    ':': 'zC',
    '/': 'zS',
    '\x00': 'z0',
    z: 'zZ',
  };
  const ESCAPE_REGEX = /[\\:/\x00z]/g; // eslint-disable-line no-control-regex
  return str.replace(ESCAPE_REGEX, (match) => ESCAPE_LOOKUP[match]);
}

export class FileSystemBlobStore {
  private _memoryBlobs: {};
  private _invalidationKeys: {};
  private _dirty: boolean;
  private _storedMap: {};
  private _storedBlob: Buffer;
  private _blobFilename: string;
  private _mapFilename: string;
  private _lockFilename: string;
  private _directory: string;

  constructor(directory: string, prefix: string) {
    const name = prefix ? slashEscape(`${prefix}.`) : '';
    this._blobFilename = join(directory, `${name}BLOB`);
    this._mapFilename = join(directory, `${name}MAP`);
    this._lockFilename = join(directory, `${name}LOCK`);
    this._directory = directory;
    try {
      this._storedBlob = readFileSync(this._blobFilename);
      this._storedMap = JSON.parse(readFileSync(this._mapFilename, { encoding: 'utf8' }));
    } catch (e) {
      this._storedBlob = Buffer.alloc(0);
      this._storedMap = {};
    }
    this._dirty = false;
    this._memoryBlobs = {};
    this._invalidationKeys = {};
  }

  has(key: string, invalidationKey: string) {
    if (hasOwnProperty.call(this._memoryBlobs, key)) {
      return this._invalidationKeys[key] === invalidationKey;
    }
    if (hasOwnProperty.call(this._storedMap, key)) {
      return this._storedMap[key][0] === invalidationKey;
    }
    return false;
  }

  get(key: string, invalidationKey: string) {
    if (hasOwnProperty.call(this._memoryBlobs, key)) {
      if (this._invalidationKeys[key] === invalidationKey) {
        return this._memoryBlobs[key];
      }
    } else if (hasOwnProperty.call(this._storedMap, key)) {
      const mapping = this._storedMap[key];
      if (mapping[0] === invalidationKey) {
        return this._storedBlob.slice(mapping[1], mapping[2]);
      }
    }
    return undefined;
  }

  set(key: string, invalidationKey: string, buffer: Buffer): void {
    this._invalidationKeys[key] = invalidationKey;
    this._memoryBlobs[key] = buffer;
    this._dirty = true;
  }

  delete(key: string): void {
    if (hasOwnProperty.call(this._memoryBlobs, key)) {
      this._dirty = true;
      delete this._memoryBlobs[key];
    }
    if (hasOwnProperty.call(this._invalidationKeys, key)) {
      this._dirty = true;
      delete this._invalidationKeys[key];
    }
    if (hasOwnProperty.call(this._storedMap, key)) {
      this._dirty = true;
      delete this._storedMap[key];
    }
  }

  isDirty(): boolean {
    return this._dirty;
  }

  save(): boolean {
    const dump = this._getDump();
    const blobToStore = Buffer.concat(dump[0]);
    const mapToStore = JSON.stringify(dump[1]);

    try {
      mkdirpSync(this._directory);
      writeFileSync(this._lockFilename, 'LOCK', { flag: 'wx' });
    } catch (error) {
      // Swallow the exception if we fail to acquire the lock.
      return false;
    }

    try {
      writeFileSync(this._blobFilename, blobToStore);
      writeFileSync(this._mapFilename, mapToStore);
    } finally {
      unlinkSync(this._lockFilename);
    }

    return true;
  }

  _getDump(): Dump {
    const buffers: Buffer[] = [];
    const newMap: { [key: string]: [string, number, number] } = {};
    let offset = 0;

    function push(key, invalidationKey, buffer: Buffer) {
      buffers.push(buffer);
      newMap[key] = [invalidationKey, offset, offset + buffer.length];
      offset += buffer.length;
    }

    for (const key of Object.keys(this._memoryBlobs)) {
      const buffer = this._memoryBlobs[key];
      const invalidationKey = this._invalidationKeys[key];
      push(key, invalidationKey, buffer);
    }

    for (const key of Object.keys(this._storedMap)) {
      if (!hasOwnProperty.call(newMap, key)) {
        const mapping = this._storedMap[key];
        const buffer = this._storedBlob.slice(mapping[1], mapping[2]);
        push(key, mapping[0], buffer);
      }
    }

    return [buffers, newMap];
  }
}
