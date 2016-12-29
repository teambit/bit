/** @flow */
import R from 'ramda';
import path from 'path';
import fs from 'fs';
import { BIT_JSON, DEFAULT_BIT_VERSION } from '../constants';
import { BitJsonAlreadyExists } from './exceptions';
import AbstractBitJson from './abstract-bit-json';
import ConsumerBitJson from './consumer-bit-json';

export function composePath(bitPath: string) {
  return path.join(bitPath, BIT_JSON);
}

export function hasExisting(bitPath: string): boolean {
  return fs.existsSync(composePath(bitPath));
}

export type BitJsonProps = {
  name: string;
  box: string;
  version: string;
  impl?: string;
  spec?: string;  
  compiler?: string;
  tester?: string;
  remotes?: Object;
  dependencies?: Object;
};

export default class BitJson extends AbstractBitJson {
  name: string;
  box: string;
  version: string;
  impl: string;
  spec: string; 
  compiler: string;
  tester: string;
  remotes: {[string]: string};
  dependencies: {[string]: string};

  constructor({ 
    name, box, version, impl, spec, compiler, tester, dependencies, remotes
  }: BitJsonProps) {
    super({ impl, spec, compiler, tester, remotes, dependencies });
    this.name = name;
    this.box = box;
    this.version = version;
  }

  toPlainObject() {
    const superObject = super.toPlainObject();
    return R.merge(superObject, {
      name: this.name,
      box: this.box,
      version: this.version
    });
  }
 
  toJson(readable: boolean = true) {
    if (!readable) return JSON.stringify(this.toPlainObject());
    return JSON.stringify(this.toPlainObject(), null, 4);
  }

  write({ bitDir, override = true }: { bitDir: string, override?: boolean }): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!override && hasExisting(bitDir)) {
        throw new BitJsonAlreadyExists();
      }

      const repspond = (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      };

      fs.writeFile(
        composePath(bitDir),
        this.toJson(),
        repspond
      );
    });
  }

  static fromPlainObject(object: Object): BitJson {
    const { name, box, version, sources, env, remotes, dependencies } = object;
    return new BitJson({
      name,
      box,
      version,
      impl: R.prop('impl', sources),
      spec: R.prop('spec', sources),
      compiler: R.prop('compiler', env),
      tester: R.prop('tester', env),
      remotes,
      dependencies,
    });
  }

  static create(json = {}, protoBJ: ConsumerBitJson) {
    return new BitJson(R.merge(json, protoBJ.toPlainObject()));
  }

  static load(dirPath: string, protoBJ?: ConsumerBitJson) {
    return new Promise((resolve) => {
      let thisBJ = {};
      try {
        thisBJ = JSON.parse(fs.readFileSync(composePath(dirPath)).toString('utf8'));
      } catch (e) {} // eslint-disable-line
      
      if (!R.prop('name', thisBJ)) thisBJ.name = path.basename(dirPath);
      if (!R.prop('box', thisBJ)) thisBJ.box = path.basename(path.dirname(dirPath));
      if (!R.prop('version', thisBJ)) thisBJ.version = DEFAULT_BIT_VERSION;

      const mergedBJ = R.merge(thisBJ, protoBJ ? protoBJ.toPlainObject() : {});
      return resolve(new BitJson(mergedBJ));
    });
  }
}
