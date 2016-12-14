/** @flow */
import path from 'path';
import glob from 'glob';
import fs from 'fs';
import { locateConsumer, pathHasConsumer } from './consumer-locator';
import { ConsumerAlreadyExists, ConsumerNotFound } from './exceptions';
import BitJson from '../bit-json';
import BitId from '../bit-id';
import Bit from '../bit';
import PartialBit from '../bit/partial-bit';
import { INLINE_BITS_DIRNAME, BITS_DIRNAME } from '../constants';

export type ConsumerProps = {
  projectPath: string,
  created?: boolean,
  bitJson?: BitJson
};

export default class Consumer {
  projectPath: string;
  created: boolean;
  bitJson: BitJson;

  constructor({ projectPath, bitJson, created = false }: ConsumerProps) {
    this.projectPath = projectPath;
    this.bitJson = bitJson || new BitJson({});
    this.created = created;
  }

  write(): Promise<Consumer> {
    const returnConsumer = () => this;

    return this.bitJson
      .write({ bitDir: this.projectPath })
      .then(returnConsumer);
  }

  getInlineBitsPath(): string {
    return path.join(this.projectPath, INLINE_BITS_DIRNAME);
  }

  getBitsPath(): string {
    return path.join(this.projectPath, BITS_DIRNAME);
  }

  /**
   * get a bit partialy
   **/
  getPartial(name: string): Promise<PartialBit> {
    return this.resolveBitDir(name)
    .then(bitDir => 
      PartialBit.load(name, bitDir)
    );
  }

  /**
   * get a bit with all metadata and implemenation
   **/
  get(name: string): Promise<Bit> {
    return this.getPartial(name)
    .then(partial => partial.loadFull());
  }

  /**
   * fetch a bit from a remote, put in the bit.json and in the external directory
   **/
  import(rawId: string): Bit { // eslint-disable-line
    const bitId = BitId.parse(rawId, this.bitJson.remotes);
    return bitId.scope.fetch([bitId]);
  }

  createBit({ name }: { name: string }): Promise<Bit> {
    return Bit.create({ name, bitDir: this.getInlineBitsPath() }).write();
  }

  removeBit(props: { name: string }, { inline }: { inline: boolean }): Promise<Bit> {
    const bitDir = inline ? this.getInlineBitsPath() : this.getBitsPath(); 
    return PartialBit.load(props.name, bitDir).then(bit => bit.erase());
  }

  resolveBitDir(name: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.includes({ bitName: name, inline: true })
        .then((isInline) => {
          if (isInline) return resolve(this.getInlineBitsPath());
          return this.includes({ bitName: name, inline: false })
            .then((isExternal) => {
              if (isExternal) return resolve(this.getBitsPath());
              return reject(new Error('bit not found error'));
            });
        });
    });
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
  list({ inline }: { inline: ?boolean }): Promise<string[]> {
    const dirToList = inline ? this.getInlineBitsPath() : this.getBitsPath();

    return new Promise((resolve, reject) =>
      glob(path.join(dirToList, '/*'), (err, files) => {
        resolve(files.map(fullPath => path.basename(fullPath)));
        reject(err);
      })
    );
  }

  includes({ inline, bitName }: { inline: ?boolean, bitName: string }): Promise<boolean> {
    const dirToCheck = inline ? this.getInlineBitsPath() : this.getBitsPath();

    return new Promise((resolve) => {
      return fs.stat(path.join(dirToCheck, bitName), (err) => {
        if (err) return resolve(false);
        return resolve(true);
      });
    });
  }

  static create(projectPath: string = process.cwd()): Consumer {
    if (pathHasConsumer(projectPath)) throw new ConsumerAlreadyExists();
    return new Consumer({ projectPath, created: true });
  }

  static load(currentPath: string): Promise<Consumer> {
    const projectPath = locateConsumer(currentPath);
    if (!projectPath) throw new ConsumerNotFound();
    return BitJson.load(projectPath)
    .then(bitJson =>
      new Consumer({
        projectPath,
        bitJson
      })
    );
  }
}
