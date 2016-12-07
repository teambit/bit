/** @flow */
import fs from 'fs-extra';
import { Impl, Specs } from './sources';
import BitJson from '../box/bit-json/bit-json';
import { Box } from '../box';
import { BitMap } from '../box/bit-maps';
import { mkdirp } from '../utils';
import BitAlreadyExistsInternalyException from './exceptions/bit-already-exist-internaly';
import PartialBit from './partial-bit';
import type { PartialBitProps } from './partial-bit';

export type BitProps = {
  name: string,
  bitMap: BitMap; 
  bitJson: BitJson;
  impl: Impl,
  specs?: Specs, 
};

export default class Bit extends PartialBit {
  name: string;
  bitMap: BitMap; 
  bitJson: BitJson;
  impl: Impl;
  specs: ?Specs;

  constructor(bitProps: BitProps) {
    super({ name: bitProps.name, bitMap: bitProps.bitMap });
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
    
    return undefined;
  }

  export() {
    return Promise.resolve();
    // this.validate();
    // this.push();
    // @TODO
  }

  write(map: BitMap): Promise<boolean> {
    return new Promise((resolve, reject) => {
      return fs.stat(this.getPath(map), (err) => {
        if (!err) return reject(new BitAlreadyExistsInternalyException(this.name));
        const bitPath = this.getPath(map); 

        return mkdirp(bitPath)
        .then(() => this.impl.write(bitPath, this))
        .then(() => this.bitJson.write({ dirPath: bitPath }))
        .then(resolve);
      });
    });
  }

  static load(name: string, box: Box): Promise<Bit> {  
    return this.resolveBitMap(name, box)
      .then((bitMap) => {
        return Bit.create({ name, bitMap });
      });
  }

  static create(props: PartialBitProps) {
    const { name, bitMap } = props;

    return new Bit({
      name,
      bitMap,
      bitJson: BitJson.create({ hidden: true }),
      impl: Impl.create(this),
      specs: Specs.create(this),
    });
  }
}
