/** @flow */
import fs from 'fs-extra';
import path from 'path';
import { Impl, Specs } from './sources';
import { mkdirp } from '../utils';
import BitJson from '../bit-json';
import { Remotes } from '../remotes';
import PartialBit from './partial-bit';
import { BitId } from '../bit-id';
import loadPlugin from './environment/load-plugin';
import { DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME } from '../constants';

export type BitProps = {
  name: string;
  bitDir: string; 
  bitJson: BitJson;
  impl: Impl;
  specs?: Specs; 
};

export default class Bit extends PartialBit {
  name: string;
  bitDir: string;
  bitJson: BitJson;
  impl: Impl;
  specs: ?Specs;

  constructor(bitProps: BitProps) {
    super(bitProps);
    this.specs = bitProps.specs;
    this.impl = bitProps.impl;
  }

  build(): Promise<Bit> {
    return new Promise((resolve, reject) => {
      try {
        const { transpile } = loadPlugin(this.bitJson.getCompilerName());
        const src = this.impl.src;
        const { code, map } = transpile(src); // eslint-disable-line
        const outputFile = path.join(this.bitDir, DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME);
        fs.outputFileSync(outputFile, code);
        return resolve(this);
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
    impl: Buffer,
    spec: Buffer
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

  static create({ name, bitDir, bitJson, withSpecs }:
  { name: string, bitDir: string, bitJson: BitJson, withSpecs: boolean }) {
    return new Bit({
      name,
      bitDir,
      bitJson,
      impl: Impl.create(bitJson),
      specs: withSpecs ? Specs.create(bitJson) : undefined,
    });
  }
}
