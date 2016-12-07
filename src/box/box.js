/** @flow */
import BoxNotFound from './exceptions/box-not-found';
import { locateBox, pathHasBox } from './box-locator';
import { BoxAlreadyExists } from './exceptions';
import BitJson from './bit-json/bit-json';
import Bit from '../bit';
import PartialBit from '../bit/partial-bit';
import { External, Inline, BitMap } from './bit-maps';

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
    this.bitJson = bitJson || BitJson.create({ hidden: false });
    this.external = external || new External(this);
    this.inline = inline || new Inline(this);
    this.created = created;
  }

  write(): Promise<Box> {
    const self = this;
    const createInlineDir = () => self.inline.ensureDir();
    const createExternalDir = () => self.external.ensureDir();
    const returnBox = () => this;

    return this.bitJson
      .write({ dirPath: this.path })
      .then(createInlineDir)
      .then(createExternalDir)
      .then(returnBox);
  }

  /**
   * get a bit
   **/
  get(name: string): Promise<Bit> {
    return PartialBit.load(name, this);
  }

  /**
   * fetch a bit from a remote, put in the bit.json and in the external directory
   **/
  import({ name, remote }: { name: string, remote: string }): Bit { // eslint-disable-line
    // @TODO
  }

  createBit(props: { name: string }): Promise<Bit> {
    const bit = Bit.create({ ...props, bitMap: this.inline });
    return this.inline.add(bit);
  }

  removeBit(props: { name: string }, { inline }: { inline: boolean }): Promise<Bit> {
    const bit = new PartialBit({ ...props, bitMap: this.inline });
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

  static load(currentPath: string): Promise<Box> {
    const path = locateBox(currentPath);
    if (!path) throw new BoxNotFound();
    return BitJson.load(path)
    .then(bitJson =>
      new Box({
        path,
        bitJson
      })
    );
  }
}
