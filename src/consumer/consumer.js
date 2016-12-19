/** @flow */
import path from 'path';
import glob from 'glob';
import fs from 'fs';
import { locateConsumer, pathHasConsumer } from './consumer-locator';
import { ConsumerAlreadyExists, ConsumerNotFound } from './exceptions';
import BitJson from '../bit-json';
import { BitId } from '../bit-id';
import Bit from '../bit';
import PartialBit from '../bit/partial-bit';
import { INLINE_BITS_DIRNAME, BITS_DIRNAME, BIT_JSON, BIT_HIDDEN_DIR } from '../constants';
import * as tar from '../tar';
import { BitJsonNotFound } from '../bit-json/exceptions';
import { toBase64 } from '../utils';
import { Scope } from '../scope';
import BitInlineId from '../bit-inline-id';

const getBitDirForConsumerImport = ({
  bitsDir, name, box, version, remote
}: {
  bitsDir: string,
  name: string,
  box: string,
  version: number,
  remote: string 
}): string => 
  path.join(bitsDir, box, name, toBase64(remote), version.toString());

export type ConsumerProps = {
  projectPath: string,
  created?: boolean,
  bitJson?: BitJson,
  scope: Scope
};

export default class Consumer {
  projectPath: string;
  created: boolean;
  bitJson: BitJson;
  scope: Scope;

  constructor({ projectPath, bitJson, scope, created = false }: ConsumerProps) {
    this.projectPath = projectPath;
    this.bitJson = bitJson || new BitJson({});
    this.created = created;
    this.scope = scope;
  }

  write(): Promise<Consumer> {
    return this.bitJson
      .write({ bitDir: this.projectPath })
      .then(() => this.scope.ensureDir())
      .then(() => this);
  }

  getInlineBitsPath(): string {
    return path.join(this.projectPath, INLINE_BITS_DIRNAME);
  }

  getBitsPath(): string {
    return path.join(this.projectPath, BITS_DIRNAME);
  }

  getPath(): string {
    return this.projectPath;
  }

  loadBit(id: BitInlineId): Promise<Bit> {
    const bitDir = id.composeBitPath(this.getPath());
    return PartialBit.load(bitDir, id.name)
      .then(partial => partial.loadFull());
  }

  loadBitFromRawContents(contents: Buffer) {
    return tar.getContents(contents)
      .then((bitContents) => {
        if (!bitContents[BIT_JSON]) throw new BitJsonNotFound();
        
        const bitJson = JSON.parse(bitContents[BIT_JSON].toString('ascii'));

        const { name, box, version, impl, spec } = bitJson;
        const remote = 'ssh://ran@104.198.245.134:/home/ranmizrahi/scope';

        const bitDir = getBitDirForConsumerImport({
          bitsDir: this.getBitsPath(), name, box, version, remote
        });

        return Bit.loadFromMemory({
          name,
          bitDir,
          bitJson,
          impl: impl ? bitContents[impl] : undefined,
          spec: spec ? bitContents[spec] : undefined,
        });
      });
  }
  
  /**
   * fetch a bit from a remote, put in the bit.json and in the external directory
   **/
  import(rawId: ?string): Bit {
    if (!rawId) {
      return this.bitJson.dependencies.import();
    }

    const bitId = BitId.parse(rawId);
    return bitId.scope.fetch([bitId])
      .then(bits => Promise.all(bits.map(({ contents }) => this.loadBitFromRawContents(contents))));
  }

  createBit(id: BitInlineId): Promise<Bit> {
    return Bit.create({ 
      box: id.box,
      name: id.name,
      bitDir: id.composeBitPath(this.getPath())
    }).write();
  }

  removeBit(id: BitInlineId): Promise<Bit> {
    const bitDir = id.composeBitPath(this.getPath());
    return PartialBit.load(bitDir, id.name)
    .then(bit => bit.erase());
  }
  
  // @TODO change from name to BitID
  export(id: BitInlineId) {
    const cdAndWrite = (bit: Bit): Bit => 
      bit.cd(
        getBitDirForConsumerImport({
          bitsDir: this.getBitsPath(),
          name: bit.getName(),
          box: bit.getBox(),
          version: bit.getVersion(),
          remote: bit.getScope()
        })
      ).write();

    return this.loadBit(id)
      // .then(bit => bit.validate())
    .then(bit => this.scope.put(bit))
    .then(bits => Promise.all(bits.map(cdAndWrite)));
    // .then(() => this.removeBit(id));
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
    const scope = Scope.create(path.join(projectPath, BIT_HIDDEN_DIR));
    return new Consumer({ projectPath, created: true, scope });
  }

  static load(currentPath: string): Promise<Consumer> {
    const projectPath = locateConsumer(currentPath);
    if (!projectPath) throw new ConsumerNotFound();
    const scopeP = Scope.load(path.join(projectPath, BIT_HIDDEN_DIR));
    const bitJsonP = BitJson.load(projectPath);
    return Promise.all([scopeP, bitJsonP])
    .then(([scope, bitJson]) => 
      new Consumer({
        projectPath,
        bitJson,
        scope
      })
    );
  }
}
