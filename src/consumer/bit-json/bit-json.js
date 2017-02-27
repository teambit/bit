/** @flow */
import R from 'ramda';
import path from 'path';
import fs from 'fs';
import { BIT_JSON } from '../../constants';
import { BitJsonAlreadyExists, InvalidBitJson } from './exceptions';
import AbstractBitJson from './abstract-bit-json';
import ConsumerBitJson from './consumer-bit-json';

export function composePath(bitPath: string) {
  return path.join(bitPath, BIT_JSON);
}

export function hasExisting(bitPath: string): boolean {
  return fs.existsSync(composePath(bitPath));
}

export type BitJsonProps = {
  impl?: string;
  spec?: string;  
  compiler?: string;
  tester?: string;
  dependencies?: Object;
  packageDependencies?: Object;
};

export default class BitJson extends AbstractBitJson {
  impl: string;
  spec: string; 
  compiler: string;
  tester: string;
  dependencies: {[string]: string};
  packageDependencies: {[string]: string};

  constructor({ 
    impl, spec, compiler, tester, dependencies, packageDependencies
  }: BitJsonProps) {
    super({ impl, spec, compiler, tester, dependencies });
    this.packageDependencies = packageDependencies || {};
  }

  toPlainObject() {
    const superObject = super.toPlainObject();
    return R.merge(superObject, {
      packageDependencies: this.getPackageDependencies()
    });
  }

  getPackageDependencies(): Object {
    return this.packageDependencies;
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

  validate() {
    if (
      typeof this.getImplBasename() !== 'string' ||
      typeof this.compilerId !== 'string' ||
      typeof this.testerId !== 'string' ||
      typeof this.getDependencies() !== 'object'
    ) throw new InvalidBitJson();
  }

  static fromPlainObject(object: Object): BitJson {
    const { sources, env, dependencies, packageDependencies } = object;
    return new BitJson({
      impl: R.prop('impl', sources),
      spec: R.prop('spec', sources),
      compiler: R.prop('compiler', env),
      tester: R.prop('tester', env),
      dependencies,
      packageDependencies,
    });
  }

  static mergeWithProto(json, protoBJ: ?ConsumerBitJson): BitJson {
    const plainProtoBJ = protoBJ ? protoBJ.toPlainObject() : {};
    delete plainProtoBJ.dependencies;

    return BitJson.fromPlainObject(
      R.merge(plainProtoBJ, json)
    );
  }

  static create(json = {}, protoBJ: ConsumerBitJson) {
    return this.mergeWithProto(json, protoBJ);
  }

  static load(dirPath: string, protoBJ?: ConsumerBitJson) {
    return new Promise((resolve, reject) => {
      let thisBJ = {};
      const bitJsonPath = composePath(dirPath);
      if (fs.existsSync(bitJsonPath)) {
        try {
          thisBJ = JSON.parse(fs.readFileSync(bitJsonPath).toString('utf8'));
        } catch (e) {
          return reject(new InvalidBitJson(bitJsonPath));
        }
      }
      
      const mergedBJ = this.mergeWithProto(thisBJ, protoBJ);
      return resolve(mergedBJ);
    });
  }

  static loadSync(dirPath: string, protoBJ?: ConsumerBitJson) {
    let thisBJ = {};
    const bitJsonPath = composePath(dirPath);
    if (fs.existsSync(bitJsonPath)) {
      try {
        thisBJ = JSON.parse(fs.readFileSync(bitJsonPath).toString('utf8'));
      } catch (e) {
        throw new InvalidBitJson(bitJsonPath);
      }
    }

    return this.mergeWithProto(thisBJ, protoBJ);
  }
}
