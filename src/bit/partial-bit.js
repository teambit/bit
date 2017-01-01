/** @flow */
import fs from 'fs-extra';
import path from 'path';
import * as bitCache from '../cache';
import { pack } from '../tar';
import { Impl, Specs } from './sources';
import BitJson from '../bit-json';
import ConsumerBitJson from '../bit-json/consumer-bit-json';
import BitNotFoundException from './exceptions/bit-not-found';
import { BitIds, BitId } from '../bit-id';
import { remoteResolver, Remotes } from '../remotes';
import { Scope } from '../scope';
import Bit from './bit';
import InvalidBit from './exceptions/invalid-bit';
import { isDirEmptySync } from '../utils';
import { LOCAL_SCOPE_NOTATION } from '../constants';
import { composePath as composeBitJsonPath } from '../bit-json/bit-json';

export type PartialBitProps = {
  name: string;
  bitDir: string;
  bitJson: BitJson;
  scope?: string;
};

export default class PartialBit {
  name: string;
  bitDir: string;
  bitJson: BitJson;
  scope: string;

  constructor(bitProps: PartialBitProps) {
    this.name = bitProps.name;
    this.bitDir = bitProps.bitDir;
    this.bitJson = bitProps.bitJson;
    this.scope = bitProps.scope || LOCAL_SCOPE_NOTATION;
  }

  validate(): bool {
    return this.bitJson.validate();
  }
  
  remotes(): BitIds {
    return this.bitJson.getRemotes();
  }

  dependencies(): BitIds {
    return BitIds.loadDependencies(this.bitJson.dependencies);
  }

  getName() {
    return this.name;
  }
  
  getBox() {
    return this.bitJson.box;
  }
  
  getPath() {
    return this.bitDir;
  }

  getVersion() {
    return this.bitJson.version;
  }
  
  hasCompiler(): boolean {
    return this.bitJson.hasCompiler();
  }

  hasTester(): boolean {
    return this.bitJson.hasTester();
  }

  getScope(localScope: Scope, remotes: Remotes) {
    return remoteResolver(this.scope, remotes, localScope);
  }

  // @TODO change to bit id once adding scope to bit 
  getId() {
    return new BitId({
      scope: this.scope,
      name: this.name,
      box: this.bitJson.box,
      version: this.bitJson.version
    });
  }

  isLocal() {
    return this.scope === LOCAL_SCOPE_NOTATION;
  }

  cd(newDir: string) {
    this.bitDir = newDir;
    return this;
  }

  validateOrThrow() {
    if (!this.validate()) throw new InvalidBit();
  }

  erase(): Promise<PartialBit> {
    return new Promise((resolve, reject) => {
      return fs.stat(this.bitDir, (err) => {
        if (err) reject(new BitNotFoundException());
        return fs.remove(this.bitDir, (e) => {
          if (e) return reject(e);
          const containingDir = path.join(this.bitDir, '..');
          if (isDirEmptySync(containingDir)) fs.removeSync(containingDir);
          return resolve(this);
        });
      });
    });
  }

  getArchiveFiles() {
    return [
      path.join(this.bitDir, this.bitJson.getImplBasename()),
      path.join(this.bitDir, this.bitJson.getSpecBasename()),
      composeBitJsonPath(this.bitDir)
    ];
  }
  
  composeTarFileName() {
    return `${this.name}_${this.bitJson.version}.tar`;
  }

  toTar() {
    return bitCache.get(this)
      .catch((err) => {
        if (err.code !== 'ENOENT') throw err;
        return bitCache.set(this, pack(this.getArchiveFiles())); 
      });
  }

  loadFull(): Promise<Bit> {
    return Promise.all([
      Impl.load(this.bitDir, this.bitJson.getImplBasename()),
      Specs.load(this.bitDir, this.bitJson.getSpecBasename())
    ]).then(([impl, specs ]) => 
      new Bit({
        name: this.name,
        bitDir: this.bitDir,
        bitJson: this.bitJson,
        impl,
        specs
      })
    );
  }

  static loadFromInline(
    bitDir: string, name: string, protoBJ: ConsumerBitJson
  ): Promise<PartialBit> {
    return BitJson.load(bitDir, protoBJ)
      .then(bitJson => new PartialBit({ name, bitDir, bitJson }));
  }

  static load(bitDir: string, name: string): Promise<PartialBit> {
    return BitJson.load(bitDir)
      .then(bitJson => new PartialBit({ name, bitDir, bitJson }));
  }
}
