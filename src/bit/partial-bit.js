/** @flow */
import * as path from 'path';
import fs from 'fs-extra';
import { Impl, Specs } from './sources';
import BitJson from '../bit-json';
import { Consumer } from '../consumer';
import { Drawer } from '../consumer/drawers';
import BitNotFoundException from './exceptions/bit-not-found';
import Bit from './bit';

export type PartialBitProps = {
  name: string;
  drawer: Drawer; 
};

export default class PartialBit {
  name: string;
  drawer: Drawer; 

  constructor(bitProps: PartialBitProps) {
    this.name = bitProps.name;
    this.drawer = bitProps.drawer;
  }

  getPath() {
    return path.join(this.drawer.getPath(), this.name);
  }

  erase(): Promise<PartialBit> {
    return new Promise((resolve, reject) => {
      return fs.stat(this.getPath(), (err) => {
        if (err) reject(new BitNotFoundException());
        return fs.remove(this.getPath(), (e) => {
          if (e) return reject(e);
          return resolve(this);
        });
      });
    });
  }

  loadFull(): Promise<Bit> {
    return Promise.all([
      BitJson.load(this.getPath(), true),
      Impl.load(this.getPath()),
      Specs.load(this.getPath())
    ]).then(([ bitJson, impl, specs ]) => 
      new Bit({
        name: this.name,
        drawer: this.drawer,
        bitJson,
        impl,
        specs
      })
    );
  }

  static resolveDrawer(name: string, consumer: Consumer): Promise<Drawer> {
    return new Promise((resolve, reject) => {
      consumer.inline.includes(name)
        .then((isInline) => {
          if (isInline) return resolve(consumer.inline);
          return consumer.external.includes(name)
            .then((isExternal) => {
              if (isExternal) return resolve(consumer.external);
              return reject(new Error('bit not found error'));
            });
        });
    });
  }

  static load(name: string, consumer: Consumer): Promise<PartialBit> {  
    return this.resolveDrawer(name, consumer)
      .then((drawer) => {
        return new PartialBit({ name, drawer });
      });
  }
}
