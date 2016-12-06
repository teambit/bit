/** @flow */
import BoxNotFound from './exceptions/box-not-found';
import { locateBox, pathHasBox } from './box-locator';
import { BoxAlreadyExists } from './exceptions';
import BitJson from './bit-json/bit-json';
import Bit from '../bit';
import { External, Inline, BitMap } from './bit-maps';
import type { BitProps } from '../bit/bit';

export type BoxProps = {
  path: string,
  created?: boolean,
  bitJson?: BitJson,
  external?: External,
  inline?: Inline
};

export default class Box {
  path: string;
  created: boolean;
  bitJson: BitJson;
  external: BitMap;
  inline: BitMap;

  constructor({ path, bitJson, external, inline, created = false }: BoxProps) {
    this.path = path;
    this.bitJson = bitJson || new BitJson();
    this.external = external || new External(this);
    this.inline = inline || new Inline(this);
    this.created = created;
  }

  write(): Promise<boolean> {
    const self = this;
    const createInlineDir = () => self.inline.ensureDir();
    const createExternalDir = () => self.external.ensureDir();
    const returnBox = () => this;

    return this.bitJson
      .write(this.path)
      .then(createInlineDir)
      .then(createExternalDir)
      .then(returnBox);
  }

  /**
   * get a bit
   **/
  get(name: string): Bit {
    return Bit.load(name, this);
  }

  /**
   * fetch a bit from a remote, put in the bit.json and in the external directory
   **/
  import({ name, remote }: { name: string, remote: string }): Bit {
    // @TODO
  }

  createBit(props: BitProps): Promise<Box> {
    const bit = new Bit(props);
    return this.inline.add(bit);
  }

  removeBit(props: BitProps, { inline }: { inline: boolean }): Promise<Box> {
    const bit = new Bit(props);
    return inline ? this.inline.remove(bit) : this.external.remove(bit);
  }
  
  /**
   * list the bits in the external directory
   **/
  list({ inline }: { inline: boolean }): Promise<string[]> {
    return inline ? this.inline.list() : this.external.list();
  }

  static create(path: string = process.cwd()): Box {
    if (pathHasBox(path)) throw new BoxAlreadyExists();
    return new Box({ path, created: true });
  }

  static load(currentPath: string): Box {
    const path = locateBox(currentPath);
    if (!path) throw new BoxNotFound();

    return new Box({
      path,
      // bitJson: BitJson.load()
    });
  }
}
