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
import { INLINE_BITS_DIRNAME, BITS_DIRNAME, BIT_JSON, BIT_HIDDEN_DIR } from '../constants';
import * as tar from '../tar';
import { BitJsonNotFound } from '../bit-json/exceptions';
import { toBase64 } from '../utils';
import { Scope } from '../scope';

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
  import(rawId: ?string): Bit {
    if (!rawId) {
      return this.bitJson.dependencies.import();
    }

    const getBitDirForConsumerImport = ({
        bitsDir, name, box, version, remote
      }) => {
      const base64Remote = toBase64(remote);
      return path.join(bitsDir, box, name, base64Remote, version.toString());
    };

    const getBitFromRawContents = ({ contents }) =>
      tar.getContents(contents)
      .then((bitContents) => {
        if (!bitContents[BIT_JSON]) throw new BitJsonNotFound();
        
        const bitJson = JSON.parse(
          bitContents[BIT_JSON].toString('ascii')
        );


        const { name, box, version, impl, spec } = bitJson;
        const remote = 'ssh://ran@104.198.245.134:/home/ranmizrahi/scope';
        
        const implContent = impl ? bitContents[impl] : undefined;
        const specContent = spec ? bitContents[spec] : undefined;

        const bitDir = getBitDirForConsumerImport({
          bitsDir: this.getBitsPath(),
          name,
          box,
          version,
          remote
        });

        return Bit.loadFromMemory({
          name,
          bitDir,
          bitJson,
          impl: implContent,
          spec: specContent,
        });
      });

    const bitId = BitId.parse(rawId, this.bitJson.remotes);
    return bitId.remote.fetch([bitId])
      .then(bits =>
        Promise.all(bits.map(getBitFromRawContents))
      );
  }

  createBit({ name }: { name: string }): Promise<Bit> {
    return Bit.create({ name, bitDir: path.join(this.getInlineBitsPath(), name) }).write();
  }

  removeBit({ name }: { name: string }, { inline }: { inline: boolean }): Promise<Bit> {
    const containingDir = inline ? this.getInlineBitsPath() : this.getBitsPath();
    const bitDir = path.join(containingDir, name); 
    return PartialBit.load(name, bitDir).then(bit => bit.erase());
  }

  resolveBitDir(name: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.includes({ bitName: name, inline: true })
        .then((isInline) => {
          if (isInline) return resolve(path.join(this.getInlineBitsPath(), name));
          return this.includes({ bitName: name, inline: false })
            .then((isExternal) => {
              if (isExternal) return resolve(path.join(this.getBitsPath(), name));
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
    const scope = Scope.create(path.join(projectPath, BIT_HIDDEN_DIR));
    return new Consumer({ projectPath, created: true, scope });
  }

  static load(currentPath: string): Promise<Consumer> {
    const projectPath = locateConsumer(currentPath);
    if (!projectPath) throw new ConsumerNotFound();
    const scope = Scope.load(path.join(projectPath, BIT_HIDDEN_DIR));
    return BitJson.load(projectPath)
    .then(bitJson =>
      new Consumer({
        projectPath,
        bitJson,
        scope
      })
    );
  }
}
