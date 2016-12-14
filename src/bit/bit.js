/** @flow */
import fs from 'fs-extra';
import path from 'path';
import * as bitCache from '../cache';
import { pack } from '../tar';
import { Impl, Specs } from './sources';
import BitJson from '../bit-json';
import { Consumer } from '../consumer';
import { mkdirp } from '../utils';
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
  name: string,
  bitDir: string; 
  bitJson: BitJson;
  impl: Impl,
  specs?: Specs, 
};

export default class Bit extends PartialBit {
  name: string;
  bitDir: string; 
  bitJson: BitJson;
  impl: Impl;
  specs: ?Specs;

  constructor(bitProps: BitProps) {
    super({ name: bitProps.name, bitDir: bitProps.bitDir });
    this.bitJson = bitProps.bitJson;
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

  composeTarFileName() {
    return `${this.name}_${this.bitJson.version}.tar`;
  }

  toTar() {
    const bitPath = this.getPath();
    return bitCache.get(this)
      .catch((err) => {
        if (err.code !== 'ENOENT') throw err;
        return bitCache.set(this, pack(bitPath)); 
      });
  }

  write(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      return fs.stat(this.getPath(), (err) => {
        if (!err) return reject(new BitAlreadyExistsInternalyException(this.name));
        const bitPath = this.getPath(); 

        return mkdirp(bitPath)
        .then(() => this.impl.write(bitPath, this))
        .then(() => this.bitJson.write({ dirPath: bitPath }))
        .then(resolve);
      });
    });
  }

  static load(name: string, consumer: Consumer): Promise<Bit> {  
    return this.resolveDir(name, consumer)
      .then((bitDir) => {
        return Bit.create({
          name,
          bitDir
        });
      });
  }

  static create(props: PartialBitProps) {
    const { name, bitDir } = props;

    return new Bit({
      name,
      bitDir,
      bitJson: new BitJson({ name }),
      impl: Impl.create({ name }),
      specs: Specs.create({ name }),
    });
  }
}
