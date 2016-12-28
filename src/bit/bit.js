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
    super({ name: bitProps.name, bitDir: bitProps.bitDir, bitJson: bitProps.bitJson });
    this.specs = bitProps.specs;
    this.impl = bitProps.impl;
  }

  build(): Promise<Bit> {
    return loadPlugin(this.bitJson.getCompilerName())
    .then(({ transpile }) => {
      const src = this.impl.src;
      const { code, map } = transpile(src); // eslint-disable-line
      const outputFile = path.join(this.bitDir, DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME);
      fs.outputFileSync(outputFile, code);
      return this;
    });
  }

  // fetchDependencies(): BitId[] {
    // return this.bitJson.dependencies.map((dependency) => {
      // return dependency.fetch();
    // });
  // }

  write(): Promise<Bit> {
    return this.writeWithoutBitJson()
    .then(() => this.bitJson.write({ bitDir: this.bitDir }))
    .then(() => this);
  }

  writeWithoutBitJson(): Promise<Bit> {
    const bitPath = this.bitDir; 
    return mkdirp(bitPath)
    .then(() => this.impl.write(bitPath, this))
    .then(() => { return this.specs ? this.specs.write(bitPath) : undefined; })
    .then(() => this);
  }

  static load(bitDir: string, name: string): Promise<Bit> {  
    return PartialBit.load(bitDir, name)
      .then(partialBit => 
        partialBit.loadFull()
      );
  }

  static loadFromMemory({ name, bitDir, bitJson, impl, spec }: {
    name: string,
    bitDir: string,
    bitJson: BitJson,
    impl: Buffer,
    spec: Buffer
  }) {
    return new Bit({
      name,
      bitDir,
      bitJson,
      impl: impl ? new Impl(impl.toString()) : undefined,
      spec: spec ? new Specs(spec.toString()) : undefined
    }); 
  }

  static create({ box, name, bitDir, withSpecs }:
  { box: string, name: string, bitDir: string, withSpecs: boolean }) {
    const bitJson = BitJson.create({ name, box });
    return new Bit({
      name,
      bitDir,
      bitJson,
      impl: Impl.create(bitJson),
      specs: withSpecs ? Specs.create(bitJson) : undefined,
    });
  }
}
