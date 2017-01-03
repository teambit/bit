/** @flow */
import path from 'path';
import glob from 'glob';
import fs from 'fs';
import R from 'ramda';
import { locateConsumer, pathHasConsumer } from './consumer-locator';
import { ConsumerAlreadyExists, ConsumerNotFound } from './exceptions';
import ConsumerBitJson from '../bit-json/consumer-bit-json';
import BitJson from '../bit-json/bit-json';
import { BitId, BitIds } from '../bit-id';
import Bit from '../bit';
import PartialBit from '../bit/partial-bit';
import { INLINE_BITS_DIRNAME, BITS_DIRNAME, BIT_JSON, BIT_HIDDEN_DIR, ENV_BITS_DIRNAME } from '../constants';
import * as tar from '../tar';
import { BitJsonNotFound } from '../bit-json/exceptions';
import { flatten } from '../utils';
import { Scope } from '../scope';
import BitInlineId from '../bit-inline-id';
import loadPlugin from '../bit/environment/load-plugin';
import npmInstall from '../npm';

const buildBit = (bit: Bit): Promise<Bit> => {
  if (bit.hasCompiler()) return bit.build();
  return Promise.resolve(bit);
};

const getBitDirForConsumerImport = ({
  bitsDir, name, box, version, scope
}: {
  bitsDir: string,
  name: string,
  box: string,
  version: string,
  scope: string 
}): string => 
  path.join(bitsDir, box, name, scope, version);

const cdAndWrite = (bit: Bit, bitsDir: string): Promise<Bit> => {
  const bitDirForConsumerImport = getBitDirForConsumerImport({
    bitsDir,
    name: bit.name,
    box: bit.getBox(),
    version: bit.getVersion(),
    scope: bit.scope
  });

  return bit.cd(bitDirForConsumerImport).write()
    .then(buildBit);
};

export type ConsumerProps = {
  projectPath: string,
  created?: boolean,
  bitJson: ConsumerBitJson,
  scope: Scope
};

export default class Consumer {
  projectPath: string;
  created: boolean;
  bitJson: ConsumerBitJson;
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

  getEnvBitsPath(): string {
    return path.join(this.scope.getPath(), ENV_BITS_DIRNAME);
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
        
        const bitJson = BitJson.fromPlainObject(
          JSON.parse(bitContents[BIT_JSON].toString('ascii'))
        );

        const { name, box, version } = bitJson;
        const impl = bitJson.getImplBasename();
        const spec = bitJson.getSpecBasename();
        
        const scope = ''; // TODO - fetch real scope name from bit.scope

        const bitDir = getBitDirForConsumerImport({
          bitsDir: this.getBitsPath(), name, box, version, scope
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
    return this.scope.push(bitId, rawRemote);
  }

  import(rawId: ?string, envBit: bool): Bit {
    if (!rawId) {
      const deps = BitIds.loadDependencies(this.bitJson.dependencies);
      // const envs = BitIds // @TODO - load the compiler and tester if there are
      return Promise.all(deps.map((dep) => {
        return this.scope.get(dep);
      })).then((bits) => {
        return this.writeToBitsDir(flatten(bits));
      });
    }

    const bitId = BitId.parse(rawId);
    return this.scope.get(bitId)
      .then((bits) => {
        if (envBit) {
          return this.writeToEnvBitsDir(bits);
          // @TODO implement to write in the special env dir
        }

        return this.writeToBitsDir(bits);
      });
  }

  createBit({ id, withSpecs = false, withBitJson = false }: {
    id: BitInlineId, withSpecs: boolean, withBitJson: boolean }): Promise<Bit> {
    const bitJson = BitJson.create({ name: id.name, box: id.box }, this.bitJson);
    return Bit.create({ 
      bitJson,
      name: id.name,
      bitDir: id.composeBitPath(this.getPath()),
      withSpecs,
    }).write(withBitJson);
  }

  removeBit(id: BitInlineId): Promise<Bit> {
    const bitDir = id.composeBitPath(this.getPath());
    return PartialBit.loadFromInline(bitDir, id.name, this.bitJson)
    .then(bit => bit.erase());
  }
  
  writeToEnvBitsDir(bits: Bit[]): Promise<Bit[]> {
    const bitsDir = this.getEnvBitsPath();
    
    const installPacakgeDependencies = (bit) => {
      const deps = bit.bitJson.getPackageDependencies();
      return Promise.all(
        R.values(
          R.mapObjIndexed(
            (value, key) => npmInstall({ name: key, version: value, dir: bit.getPath() })
          , deps)
        )
      ).then(() => bit);
    };

    return Promise.all(
      bits.map(bit => 
        cdAndWrite(bit, bitsDir)
        .then(installPacakgeDependencies)
      )
    );
  }

  writeToBitsDir(bits: Bit[]): Promise<Bit[]> {
    const bitsDir = this.getBitsPath();

    return Promise.all(bits.map(bit => cdAndWrite(bit, bitsDir)));
  }

  export(id: BitInlineId) {  
    return this.loadBit(id)
      // .then(bit => bit.validate())
    .then(bit => this.scope.put(bit))
    .then(bits => this.writeToBitsDir(bits));
    // .then(() => this.removeBit(id));
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
        .then(resolve)
        .catch(reject);
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

  static create(projectPath: string = process.cwd()): Promise<Consumer> {
    if (pathHasConsumer(projectPath)) throw new ConsumerAlreadyExists();
    const scopeP = Scope.create(path.join(projectPath, BIT_HIDDEN_DIR));

    return scopeP.then(scope => 
      new Consumer({
        projectPath,
        created: true,
        scope,
        bitJson: ConsumerBitJson.create()
      })
    );
  }

  static load(currentPath: string): Promise<Consumer> {
    return new Promise((resolve, reject) => {
      const projectPath = locateConsumer(currentPath);
      if (!projectPath) return reject(new ConsumerNotFound());
      const scopeP = Scope.load(path.join(projectPath, BIT_HIDDEN_DIR));
      const bitJsonP = ConsumerBitJson.load(projectPath);
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
