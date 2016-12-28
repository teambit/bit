/** @flow */
import path from 'path';
import glob from 'glob';
import fs from 'fs';
import { locateConsumer, pathHasConsumer } from './consumer-locator';
import { ConsumerAlreadyExists, ConsumerNotFound } from './exceptions';
import BitJson from '../bit-json';
import { BitId, BitIds } from '../bit-id';
import Bit from '../bit';
import PartialBit from '../bit/partial-bit';
import { INLINE_BITS_DIRNAME, BITS_DIRNAME, BIT_JSON, BIT_HIDDEN_DIR } from '../constants';
import * as tar from '../tar';
import { BitJsonNotFound } from '../bit-json/exceptions';
import { toBase64, flatten } from '../utils';
import { Scope } from '../scope';
import BitInlineId from '../bit-inline-id';
import loadPlugin from '../bit/environment/load-plugin';

const buildBit = bit => bit.build();

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
  bitJson: BitJson,
  scope: Scope
};

export default class Consumer {
  projectPath: string;
  created: boolean;
  bitJson: BitJson;
  scope: Scope;

  constructor({ projectPath, bitJson, scope, created = false }: ConsumerProps) {
    this.projectPath = projectPath;
    this.bitJson = bitJson;
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
    return PartialBit.loadFromInline(bitDir, id.name, this.bitJson)
      .then(partial => partial.loadFull());
  }

  loadBitFromRawContents(contents: Buffer) {
    return tar.getContents(contents)
      .then((bitContents) => {
        if (!bitContents[BIT_JSON]) throw new BitJsonNotFound();
        
        const bitJson = BitJson.loadFromRaw(
          JSON.parse(bitContents[BIT_JSON].toString('ascii'))
        );

        const { name, box, version } = bitJson;
        const impl = bitJson.getImplBasename();
        const spec = bitJson.getSpecBasename();
        
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
  
  push(rawId: string, rawRemote: string) {
    const bitId = BitId.parse(rawId);
    const remote = this.bitJson.getRemotes().get(rawRemote);
    return this.scope.push(bitId, remote);
  }

  /**
   * fetch a bit from a remote, put in the bit.json and in the external directory
   **/
  import(rawId: ?string): Bit {
    if (!rawId) {
      const deps = BitIds.loadDependencies(this.bitJson.dependencies);
      return Promise.all(deps.map((dep) => {
        return this.scope.get(dep, this.bitJson.getRemotes());
      }))
        .then((bits) => {
          return this.writeToBitsDir(flatten(bits));
        });
    }

    const bitId = BitId.parse(rawId);
    return this.scope.get(bitId, this.bitJson.getRemotes())
      .then(bits => this.writeToBitsDir(bits));
  }

  createBit({ id, withSpecs = false }: { id: BitInlineId, withSpecs: boolean }): Promise<Bit> {
    return Bit.create({ 
      box: id.box,
      name: id.name,
      bitDir: id.composeBitPath(this.getPath()),
      withSpecs,
    }).writeWithoutBitJson();
  }

  removeBit(id: BitInlineId): Promise<Bit> {
    const bitDir = id.composeBitPath(this.getPath());
    return PartialBit.loadFromInline(bitDir, id.name, this.bitJson)
    .then(bit => bit.erase());
  }
  
  writeToBitsDir(bits: Bit[]): Promise<Bit[]> {
    const bitsDir = this.getBitsPath();

    const cdAndWrite = (bit: Bit): Promise<Bit> => {
      const bitDirForConsumerImport = getBitDirForConsumerImport({
        bitsDir,
        name: bit.name,
        box: bit.getBox(),
        version: bit.getVersion(),
        remote: bit.scope
      });

      return bit.cd(bitDirForConsumerImport).write()
      .then(buildBit);
    };

    return Promise.all(bits.map(cdAndWrite));
  }

  export(id: BitInlineId) {  
    return this.loadBit(id)
      // .then(bit => bit.validate())
    .then(bit => this.scope.put(bit))
    .then(bits => this.writeToBitsDir(bits))
    .then(() => this.removeBit(id));
  }

  testBit(id: BitInlineId): Promise<Bit> {
    return this.loadBit(id)
    .then((bit) => {
      const bitDir = id.composeBitPath(this.getPath());
      return loadPlugin(bit.bitJson.getTesterName())
      .then(tester => tester.test(bitDir));
    });
  }

  /**
   * list the bits in the inline directory
   **/
  listInline(): Promise<Bit[]> {
    return new Promise((resolve, reject) =>
      glob(path.join('*', '*'), { cwd: this.getInlineBitsPath() }, (err, files) => {
        if (err) reject(err);

        const bitsP = files.map(bitRawId =>
          this.loadBit(BitInlineId.parse(bitRawId))
        );

        return Promise.all(bitsP)
        .then(resolve);
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
    return new Consumer({ projectPath, created: true, scope, bitJson: BitJson.create() });
  }

  static load(currentPath: string): Promise<Consumer> {
    return new Promise((resolve, reject) => {
      const projectPath = locateConsumer(currentPath);
      if (!projectPath) return reject(new ConsumerNotFound());
      const scopeP = Scope.load(path.join(projectPath, BIT_HIDDEN_DIR));
      const bitJsonP = BitJson.load(projectPath);
      return Promise.all([scopeP, bitJsonP])
      .then(([scope, bitJson]) => 
        resolve(
          new Consumer({
            projectPath,
            bitJson,
            scope
          })
        )
      );
    });
  }
}
