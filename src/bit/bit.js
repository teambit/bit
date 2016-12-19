/** @flow */
import fs from 'fs-extra';
import path from 'path';
import { Impl, Specs } from './sources';
import { mkdirp } from '../utils';
import BitJson from '../bit-json';
import { Remotes } from '../remotes';
import BitAlreadyExistsInternalyException from './exceptions/bit-already-exist-internaly';
import PartialBit from './partial-bit';
import { BitId } from '../bit-id';
import loadTranspiler from './environment/load-transpiler';
import { DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME } from '../constants';

function saveBuildSync({ bundle, bitPath }) {  
  const outputFile = path.join(bitPath, 'dist', 'bundle.js');
  fs.outputFileSync(outputFile, bundle);
}

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

  build() {
    return loadTranspiler(this.bitJson.transpiler)
    .then(({ transpile }) => {
      const src = this.impl.src;
      const { code, map } = transpile(src); // eslint-disable-line
      const outputFile = path.join(this.bitDir, DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME);
      fs.outputFileSync(outputFile, code);
    });
  }

  fetchDependencies(): BitId[] {
    // return this.bitJson.dependencies.map((dependency) => {
      // return dependency.fetch();
    // });
  }

  write(): Promise<boolean> {
    const bitPath = this.bitDir; 
    return new Promise((resolve, reject) => {
      return fs.stat(bitPath, (err) => {
        if (!err) return reject(new BitAlreadyExistsInternalyException(this.name));
        
        return mkdirp(bitPath)
        .then(() => this.impl.write(bitPath, this))
        .then(() => this.bitJson.write({ bitDir: bitPath }))
        .then(resolve);
      });
    });
  }

  static load(name: string, bitDir: string): Promise<Bit> {  
    return PartialBit.load(name, bitDir)
      .then(partialBit => 
        partialBit.loadFull()
      );
  }

  static loadFromMemory({ name, bitDir, bitJson, impl, spec }: {
    name: string,
    bitDir: string,
    bitJson: Object,
    impl: Buffer,
    spec: Buffer
  }) {
    return new Bit({
      name,
      bitDir,
      bitJson: BitJson.loadFromRaw(bitJson),
      impl: impl ? new Impl(impl.toString()) : undefined,
      spec: spec ? new Specs(spec.toString()) : undefined
    }); 
  }

  static create({ box, name, bitDir }: { box: string, name: string, bitDir: string }) {
    return new Bit({
      name,
      bitDir,
      bitJson: new BitJson({ name, box }),
      impl: Impl.create({ name }),
      specs: Specs.create({ name }),
    });
  }
}
