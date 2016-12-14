/** @flow */
import fs from 'fs-extra';
import path from 'path';
import { Impl, Specs } from './sources';
import { mkdirp } from '../utils';
import BitJson from '../bit-json';
import BitAlreadyExistsInternalyException from './exceptions/bit-already-exist-internaly';
import PartialBit from './partial-bit';
import { Remote } from '../remotes';
import type { PartialBitProps } from './partial-bit';
import loadTranspiler from './environment/load-transpiler';

function saveBuild({ bundle, bitPath }) {  
  const outputDir = path.join(bitPath, 'dist');
  const outputFile = path.join(outputDir, 'bundle.js');
  
  return new Promise((resolve, reject) => {
    fs.ensureDir(outputDir, (err) => {
      if (err) reject(err);
    });

    fs.writeFile(outputFile, bundle, (err) => {
      if (err) reject(err);
    });

    resolve();
  });
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

  validate(): ?string {
    try {
      this.bitJson.validate();
    } catch (err) {
      console.error(err); // TODO - pretty print on the return value of this func
      return err.message;
    }
    
    return null;
  }

  build() {
    return loadTranspiler(this.bitJson.transpiler)
    .then(({ transpile }) => {
      const src = this.impl.src;
      const { code, map } = transpile(src); // eslint-disable-line
      return saveBuild({ bundle: code, bitPath: this.getPath() });
    });
  }

  export(remote: Remote) {
    this.validate();
    return remote.push(this);
  }

  write(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      return fs.stat(this.getPath(), (err) => {
        if (!err) return reject(new BitAlreadyExistsInternalyException(this.name));
        const bitPath = this.getPath(); 

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

  static loadFromMemory(name: string, bitDir: string, bitJson: BitJson, impl: Buffer, spec: Buffer) {
    return new Bit({
      name,
      bitDir,
      bitJson,
      impl: new Impl(impl.toString()),
      spec: new Specs(spec.toString)
    }); 
  }

  static create(props: PartialBitProps) {
    const { name, bitDir, bitJson } = props;

    return new Bit({
      name,
      bitDir,
      bitJson,
      impl: Impl.create({ name }),
      specs: Specs.create({ name }),
    });
  }
}
