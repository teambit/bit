/** @flow */
import fs from 'fs-extra';
import path from 'path';
import { Impl, Specs } from './sources';
import { mkdirp } from '../utils';
import BitJson from '../bit-json';
import { Scope } from '../scope';
import PartialBit from './partial-bit';
import { getContents } from '../tar';
import { BIT_JSON } from '../constants';
import { BitId } from '../bit-id';
import { DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME } from '../constants';

export type BitProps = {
  name: string;
  scope: string;
  bitDir: string; 
  bitJson: BitJson;
  impl: Impl;
  specs?: Specs; 
};

export default class Bit extends PartialBit {
  name: string;
  scope: string;
  bitDir: string;
  bitJson: BitJson;
  impl: Impl;
  specs: ?Specs;

  constructor(bitProps: BitProps) {
    super(bitProps);
    this.specs = bitProps.specs;
    this.impl = bitProps.impl;
  }

  build(scope: Scope): Promise<Bit> {
    return new Promise((resolve, reject) => {
      if (!this.hasCompiler()) { return resolve(this); }
      try {
        const compilerName = this.bitJson.getCompilerName();
        return scope.loadEnvironment(BitId.parse(compilerName))
        .then(({ compile }) => {
          const src = this.impl.src;
          const { code, map } = compile(src); // eslint-disable-line
          const outputFile = path.join(this.bitDir, DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME);
          fs.outputFileSync(outputFile, code);
          return resolve(this);
        });
      } catch (e) { return reject(e); }
    });
  }

  write(withBitJson: boolean): Promise<Bit> {
    return this.writeWithoutBitJson()
    .then(() => { if (withBitJson) return this.bitJson.write({ bitDir: this.bitDir }); }) // eslint-disable-line
    .then(() => this);
  }

  writeWithoutBitJson(): Promise<Bit> {
    const bitPath = this.bitDir; 
    return mkdirp(bitPath)
    .then(() => this.impl.write(bitPath, this.bitJson.getImplBasename()))
    .then(() => { if (this.specs) return this.specs.write(bitPath, this.bitJson.getSpecBasename()); }) // eslint-disable-line
    .then(() => this);
  }

  static load(bitDir: string, name: string, scopeName: string): Promise<Bit> {  
    return PartialBit.load(bitDir, name, scopeName)
      .then(partialBit => partialBit.loadFull());
  }

  static loadFromMemory({ name, bitDir, bitJson, impl, spec, scope }: {
    name: string,
    scope: string,
    bitDir: string,
    bitJson: BitJson,
    impl: ?Buffer|string,
    spec: ?Buffer|string
  }) {
    return new Bit({
      name,
      scope,
      bitDir,
      bitJson,
      impl: impl ? new Impl(impl.toString()) : undefined,
      spec: spec ? new Specs(spec.toString()) : undefined
    }); 
  }

  static create({ scope, name, bitDir, bitJson, withSpecs }:
  { scope: string, name: string, bitDir: string, bitJson: BitJson, withSpecs: boolean }) {
    return new Bit({
      name,
      scope,
      bitDir,
      bitJson,
      impl: Impl.create(bitJson),
      specs: withSpecs ? Specs.create(bitJson) : undefined,
    });
  }

  static fromTar({ tarball, scope }) {
    return getContents(tarball)
      .then((files) => {
        const bitJson = BitJson.fromPlainObject(JSON.parse(files[BIT_JSON]));
        return Bit.loadFromMemory({
          name: bitJson.name,
          bitDir: bitJson.name,
          scope,
          bitJson,
          impl: bitJson.getImplBasename() ? files[bitJson.getImplBasename()] : undefined,
          spec: bitJson.getSpecBasename() ? files[bitJson.getSpecBasename()] : undefined
        });
      });
  }
}
