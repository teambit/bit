/** @flow */
import fs from 'fs-extra';
import { Impl, Specs } from './sources';
import BitJson from '../box/bit-json/bit-json';
import { Box } from '../box';
import { Drawer } from '../box/drawers';
import { mkdirp } from '../utils';
import BitAlreadyExistsInternalyException from './exceptions/bit-already-exist-internaly';
import PartialBit from './partial-bit';
import type { PartialBitProps } from './partial-bit';

export type BitProps = {
  name: string,
  drawer: Drawer; 
  bitJson: BitJson;
  impl: Impl,
  specs?: Specs, 
};

export default class Bit extends PartialBit {
  name: string;
  drawer: Drawer; 
  bitJson: BitJson;
  impl: Impl;
  specs: ?Specs;

  constructor(bitProps: BitProps) {
    super({ name: bitProps.name, drawer: bitProps.drawer });
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

  export() {
    return Promise.resolve();
    // this.validate();
    // this.push();
    // @TODO
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

  static load(name: string, box: Box): Promise<Bit> {  
    return this.resolveDrawer(name, box)
      .then((drawer) => {
        return Bit.create({ name, drawer });
      });
  }

  static create(props: PartialBitProps) {
    const { name, drawer } = props;

    return new Bit({
      name,
      drawer,
      bitJson: BitJson.create({ hidden: true }),
      impl: Impl.create(this),
      specs: Specs.create(this),
    });
  }
}
