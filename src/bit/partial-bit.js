/** @flow */
import fs from 'fs-extra';
import path from 'path';
import R from 'ramda';
import { pack } from '../tar';
import * as bitCache from '../cache';
import { CacheNotFound } from '../cache/exceptions';
import { Impl, Specs } from './sources';
import BitJson from '../bit-json';
import ConsumerBitJson from '../bit-json/consumer-bit-json';
import BitNotFoundException from './exceptions/bit-not-found';
import { BitIds, BitId } from '../bit-id';
import { remoteResolver, Remotes } from '../remotes';
import { Scope } from '../scope';
import Bit from './bit';
import { isDirEmptySync } from '../utils';
import { composePath as composeBitJsonPath } from '../bit-json/bit-json';
import validations from './validations';

export type PartialBitProps = {
  name: string;
  bitDir: string;
  bitJson: BitJson;
  scope: string;
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
    this.scope = bitProps.scope;
  }

  validate(): boolean {
    try {
      this.validateOrThrow();
      return true;
    } catch (e) {
      return false;
    }
  }

  validateOrThrow() {
    const bit = this;
    function runValidation(func) { return func(bit); }
    R.values(validations).forEach(runValidation);
    return true;
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

  isLocal(scope: Scope) {
    return this.getId().isLocal(scope);
  }

  cd(newDir: string) {
    this.bitDir = newDir;
    return this;
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
  
  /**
   * @deprecated
   */
  composeTarFileName() {
    return `${this.scope}_${this.getBox()}_${this.name}_${this.bitJson.version}.tar`;
  }

  toTar() {
    return bitCache.get(this.getId())
      .catch((err) => {
        if (!(err instanceof CacheNotFound)) throw err;
        return bitCache.set(this.getId(), pack(this.getArchiveFiles())); 
      });
  }

  cache() {
    return bitCache
      .set(this.getId(), pack(this.getArchiveFiles()))
      .then(() => this); 
  }

  loadFull(): Promise<Bit> {
    return Promise.all([
      Impl.load(this.bitDir, this.bitJson.getImplBasename()),
      Specs.load(this.bitDir, this.bitJson.getSpecBasename())
    ]).then(([impl, specs ]) => 
      new Bit({
        name: this.name,
        scope: this.scope,
        bitDir: this.bitDir,
        bitJson: this.bitJson,
        impl,
        specs
      })
    );
  }

  static loadFromInline(
    bitDir: string, name: string, protoBJ: ConsumerBitJson, scope: string
  ): Promise<PartialBit> {
    return BitJson.load(bitDir, protoBJ)
      .then(bitJson => new PartialBit({ name, bitDir, bitJson, scope }));
  }

  static load(bitDir: string, name: string, scope: string): Promise<PartialBit> {
    return BitJson.load(bitDir)
      .then(bitJson => new PartialBit({ name, bitDir, bitJson, scope }));
  }
}
