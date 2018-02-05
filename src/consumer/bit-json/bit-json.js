/** @flow */
import R from 'ramda';
import path from 'path';
import fs from 'fs';
import { BIT_JSON } from '../../constants';
import { InvalidBitJson } from './exceptions';
import AbstractBitJson from './abstract-bit-json';
import ConsumerBitJson from './consumer-bit-json';
import type { PathOsBased } from '../../utils/path';

export function composePath(bitPath: PathOsBased): PathOsBased {
  return path.join(bitPath, BIT_JSON);
}

export function hasExisting(bitPath: PathOsBased): boolean {
  return fs.existsSync(composePath(bitPath));
}

export type BitJsonProps = {
  impl?: string,
  spec?: string,
  lang?: string,
  compiler?: string,
  tester?: string,
  dependencies?: Object,
  devDependencies?: Object,
  packageDependencies?: Object,
  devPackageDependencies?: Object,
  extensions?: Object
};

/**
 * Component's bit.json
 */
export default class BitJson extends AbstractBitJson {
  packageDependencies: { [string]: string };

  constructor({
    impl,
    spec,
    compiler,
    tester,
    dependencies,
    devDependencies,
    packageDependencies,
    devPackageDependencies,
    lang,
    bindingPrefix,
    extensions
  }: BitJsonProps) {
    super({ impl, spec, compiler, tester, dependencies, devDependencies, lang, bindingPrefix, extensions });
    this.packageDependencies = packageDependencies || {};
    this.devPackageDependencies = devPackageDependencies || {};
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

      fs.writeFile(composePath(bitDir), this.toJson(), repspond);
    });
  }

  validate(bitJsonPath: string) {
    if (
      typeof this.getImplBasename() !== 'string' ||
      typeof this.compilerId !== 'string' ||
      typeof this.testerId !== 'string' ||
      (this.lang && typeof this.testerId !== 'string') ||
      (this.getDependencies() && typeof this.getDependencies() !== 'object') ||
      (this.extensions() && typeof this.extensions() !== 'object')
    ) {
      throw new InvalidBitJson(bitJsonPath);
    }
  }

  static fromPlainObject(object: Object): BitJson {
    const { sources = {}, env, dependencies, packageDependencies, lang, bindingPrefix, extensions } = object;

    return new BitJson({
      impl: R.prop('impl', sources),
      spec: R.prop('spec', sources),
      compiler: R.prop('compiler', env),
      tester: R.prop('tester', env),
      dependencies,
      extensions,
      lang,
      bindingPrefix,
      packageDependencies
    });
  }

  mergeWithComponentData(component) {
    this.compiler = component.compilerId ? component.compilerId.toString() : null;
    this.tester = component.testerId ? component.testerId.toString() : null;
    this.bindingPrefix = component.bindingPrefix;
    this.lang = component.lang;
  }

  /**
   * Use the consumerBitJson as a base. Override values if exist in componentBitJson
   */
  static mergeWithProto(json, protoBJ: ?ConsumerBitJson): BitJson {
    const plainProtoBJ = protoBJ ? protoBJ.toPlainObject() : {};
    delete plainProtoBJ.dependencies;
    return BitJson.fromPlainObject(R.merge(plainProtoBJ, json));
  }

  static create(json = {}, protoBJ: ConsumerBitJson) {
    return this.mergeWithProto(json, protoBJ);
  }

  static load(dirPath: string, protoBJ?: ConsumerBitJson): Promise<BitJson> {
    return new Promise((resolve, reject) => {
      try {
        const result = this.loadSync(dirPath, protoBJ);
        return resolve(result);
      } catch (e) {
        return reject(dirPath);
      }
    });
  }

  static loadSync(dirPath: PathOsBased, protoBJ?: ConsumerBitJson) {
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
