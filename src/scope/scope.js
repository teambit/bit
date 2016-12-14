/** @flow */
import { Parse } from 'tar';
import * as pathlib from 'path';
import { propogateUntil, pathHas, bufferToReadStream } from '../utils';
import { extract, getContents } from '../tar';
import { BIT_SOURCES_DIRNAME } from '../constants';
import { ScopeNotFound, ScopeAlreadyExists } from './exceptions';
import Box from '../box';
import { Source, Cache, Tmp } from './repositories';
import BitJson from '../bit-json';
import Bit from '../bit';
import { BIT_JSON } from '../constants';

const pathHasScope = pathHas([BIT_SOURCES_DIRNAME]);

export type ScopeProps = {
  path: string,
  created?: boolean;
  cache?: Cache;
  tmp?: Tmp;
  sources?: Source
};

export default class Scope {
  // globals: Global;
  // boxes: Box;
  // cache: Cache;
  // scopeJson: ScopeJson;
  created: boolean = false;
  cache: Cache;
  tmp: Tmp;
  sources: Source;
  path: string;

  constructor({ path, cache, sources, tmp, created }: ScopeProps) {
    this.path = path;
    this.cache = cache || new Cache(this);
    this.sources = sources || new Source(this);
    this.created = created || false;
    this.tmp = tmp || new Tmp(this);
  }

  prepareBitRegistration(name: string, bitJson: BitJson) {
    if (!bitJson.validate()) throw new Error('');
    return pathlib.join(this.tmp.getPath(), `${name}_${bitJson.version}.tar`);
  }

  ensureDir() {
    const self = this;

    return this.cache
      .ensureDir()
      .then(() => self.sources.ensureDir())
      .then(() => self.tmp.ensureDir())
      .then(() => self); 
  }
  

  upload(name: string, tar: Buffer) {
    return getContents(tar)
      .then((files) => {
        const bitJson = BitJson.loadFromString(files[BIT_JSON]);
        
        const bit = Bit.loadFromMemory(
          name,
          this.sources.getBitPath(name),
          bitJson,
          files[bitJson.impl],
          files[bitJson.spec]
        );

        return bit.write();
      });
  }

  getPath() {
    return this.path;
  }

  static create(path: string = process.cwd()) {
    if (pathHasScope(path)) return this.load(path);
    return new Scope({ path, created: true });
  }

  static load(absPath: string) {
    const scopePath = propogateUntil(absPath, pathHasScope);
    if (!scopePath) throw new ScopeNotFound();
    return new Scope({ path: scopePath });
  }
}
