/** @flow */
import { locateConsumer, pathHasConsumer } from './consumer-locator';
import { ConsumerAlreadyExists, ConsumerNotFound } from './exceptions';
import BitJson from '../bit-json';
import Bit from '../bit';
import PartialBit from '../bit/partial-bit';
import { External, Inline } from './drawers';

export type ConsumerProps = {
  path: string,
  created?: boolean,
  bitJson?: BitJson,
  external?: External,
  inline?: Inline
};

export default class Consumer {
  path: string;
  created: boolean;
  bitJson: BitJson;
  external: External;
  inline: Inline;

  constructor({ path, bitJson, external, inline, created = false }: ConsumerProps) {
    this.path = path;
    this.bitJson = bitJson || new BitJson({});
    this.external = external || new External(this);
    this.inline = inline || new Inline(this);
    this.created = created;
  }

  write(): Promise<Consumer> {
    const self = this;
    const createInlineDir = () => self.inline.ensureDir();
    const createExternalDir = () => self.external.ensureDir();
    const returnConsumer = () => this;

    return this.bitJson
      .write({ bitDir: this.path })
      .then(createInlineDir)
      .then(createExternalDir)
      .then(returnConsumer);
  }

  /**
   * get a bit partialy
   **/
  getPartial(name: string): Promise<PartialBit> {
    return PartialBit.load(name, this);
  }

  /**
   * get a bit with all metadata and implemenation
   **/
  get(name: string): Promise<Bit> {
    return PartialBit.load(name, this)
    .then(partial => partial.loadFull());
  }

  /**
   * fetch a bit from a remote, put in the bit.json and in the external directory
   **/
  import({ name, remote }: { name: string, remote: string }): Bit { // eslint-disable-line
    // @TODO
  }

  createBit({ name }: { name: string }): Promise<Bit> {
    return Bit.create({ name, bitDir: this.inline.getPath() }).write();
  }

  removeBit(props: { name: string }, { inline }: { inline: boolean }): Promise<Bit> {
    const bit = new PartialBit({
      ...props, bitDir: inline ? this.inline.getPath() : this.external.getPath()
    });
    
    return bit.erase();
  }

  // createBox(name: string): Promise<Consumer> {
    // return Box.create(name);
  // }
  
  export(name: string, remoteName: string) {
    const remote = this.bitJson.remotes.get(remoteName);
    return this.get(name).then((bit) => {
      return bit.export(remote);
    });
  }

  /**
   * list the bits in the external directory
   **/
  list({ inline }: { inline: boolean }): Promise<string[]> {
    return inline ? this.inline.list() : this.external.list();
  }

  static create(path: string = process.cwd()): Consumer {
    if (pathHasConsumer(path)) throw new ConsumerAlreadyExists();
    return new Consumer({ path, created: true });
  }

  static load(currentPath: string): Promise<Consumer> {
    const path = locateConsumer(currentPath);
    if (!path) throw new ConsumerNotFound();
    return BitJson.load(path)
    .then(bitJson =>
      new Consumer({
        path,
        bitJson
      })
    );
  }
}
