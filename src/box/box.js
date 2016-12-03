/** @flow */
import BoxNotFound from './exceptions/box-not-found';
import { locateBox, pathHasBox } from './box-locator';
import { BoxAlreadyExists } from './exceptions';
import BitJson from './bit-json/bit-json';
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
    this.bitJson = bitJson || new BitJson(this);
    this.external = external || new External(this);
    this.inline = inline || new Inline(this);
    this.created = created;
  }

  write(): Promise<boolean> {
    const self = this;
    const writeInline = () => self.inline.write();
    const writeExternal = () => self.external.write();

    return this.bitJson
      .write()
      .then(writeInline)
      .then(writeExternal);
  }

  static create(path: string = process.cwd()): Box {
    if (pathHasBox(path)) throw new BoxAlreadyExists();
    return new Box({ path }, true);
  }

  static load(path: string): Box {
    const boxPath = locateBox(path);
    if (!boxPath) throw new BoxNotFound();
    return new Box(boxPath, false);
  }
}
