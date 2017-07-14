/** @flow */
import R from 'ramda';
import path from 'path';
import fs from 'fs';
import { BIT_JSON } from '../../constants';
import { InvalidBitJson } from './exceptions';
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
  lang?: string;
  compiler?: string;
  tester?: string;
  dependencies?: Object;
  packageDependencies?: Object;
};

/**
 * Component's bit.json
 */
export default class BitJson extends AbstractBitJson {
  packageDependencies: {[string]: string};

  constructor({
    impl, spec, compiler, tester, dependencies, packageDependencies, lang,
  }: BitJsonProps) {
    super({ impl, spec, compiler, tester, dependencies, lang });
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
        return resolve(false);
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

  validate(bitJsonPath: string) {
    if (
      typeof this.getImplBasename() !== 'string' ||
      typeof this.compilerId !== 'string' ||
      typeof this.testerId !== 'string' ||
      (this.lang && typeof this.testerId !== 'string') ||
      (this.getDependencies() && typeof this.getDependencies() !== 'object')
    ) throw new InvalidBitJson(bitJsonPath);
  }

  static fromPlainObject(object: Object): BitJson {
    const { sources, env, dependencies, packageDependencies, lang } = object;
    return new BitJson({
      impl: R.prop('impl', sources),
      spec: R.prop('spec', sources),
      compiler: R.prop('compiler', env),
      tester: R.prop('tester', env),
      dependencies,
      lang,
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

  static load(dirPath?: string, protoBJ?: ConsumerBitJson): Promise<BitJson> {
    return new Promise((resolve, reject) => {
      try{
        const result = this.loadSync(dirPath, protoBJ);
        return resolve(result);
      } catch (e) {
        return reject(bitJsonPath);
      }
    });
  }

  static loadSync(dirPath: string, protoBJ?: ConsumerBitJson) {
    let thisBJ = {};
    if (dirPath) {
      const bitJsonPath = composePath(dirPath);
      if (fs.existsSync(bitJsonPath)) {
        try {
          thisBJ = JSON.parse(fs.readFileSync(bitJsonPath).toString('utf8'));
        } catch (e) {
          throw new InvalidBitJson(bitJsonPath);
        }
      }
    }

    return this.mergeWithProto(thisBJ, protoBJ);
  }
}
