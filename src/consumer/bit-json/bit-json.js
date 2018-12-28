/** @flow */
import R from 'ramda';
import fs from 'fs-extra';
import { InvalidBitJson } from './exceptions';
import AbstractBitJson from './abstract-bit-json';
import type { Compilers, Testers } from './abstract-bit-json';
import type ConsumerBitJson from './consumer-bit-json';
import type { PathOsBased } from '../../utils/path';
import type Component from '../component/consumer-component';

export type BitJsonProps = {
  lang?: string,
  compiler?: string | Compilers,
  tester?: string | Testers,
  dependencies?: Object,
  devDependencies?: Object,
  compilerDependencies?: Object,
  testerDependencies?: Object,
  packageDependencies?: Object,
  devPackageDependencies?: Object,
  peerPackageDependencies?: Object,
  extensions?: Object
};

export default class ComponentBitJson extends AbstractBitJson {
  packageDependencies: { [string]: string };
  devPackageDependencies: ?Object;
  peerPackageDependencies: ?Object;

  constructor({
    compiler,
    tester,
    dependencies,
    devDependencies,
    compilerDependencies,
    testerDependencies,
    packageDependencies,
    devPackageDependencies,
    peerPackageDependencies,
    lang,
    bindingPrefix,
    extensions
  }: BitJsonProps) {
    super({
      compiler,
      tester,
      dependencies,
      devDependencies,
      compilerDependencies,
      testerDependencies,
      lang,
      bindingPrefix,
      extensions
    });
    this.packageDependencies = packageDependencies || {};
    this.devPackageDependencies = devPackageDependencies || {};
    this.peerPackageDependencies = peerPackageDependencies || {};
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

  validate(bitJsonPath: string) {
    if (
      typeof this.compiler !== 'object' ||
      typeof this.tester !== 'object' ||
      (this.getDependencies() && typeof this.getDependencies() !== 'object') ||
      (this.extensions() && typeof this.extensions() !== 'object')
    ) {
      throw new InvalidBitJson(bitJsonPath);
    }
  }

  static fromPlainObject(object: Object): ComponentBitJson {
    const { env, dependencies, packageDependencies, lang, bindingPrefix, extensions } = object;

    return new ComponentBitJson({
      compiler: R.prop('compiler', env),
      tester: R.prop('tester', env),
      dependencies,
      extensions,
      lang,
      bindingPrefix,
      packageDependencies
    });
  }

  mergeWithComponentData(component: Component) {
    this.bindingPrefix = component.bindingPrefix;
    this.lang = component.lang;
  }

  /**
   * Use the consumerBitJson as a base. Override values if exist in componentBitJson
   */
  static mergeWithProto(json, protoBJ: ?ConsumerBitJson): ComponentBitJson {
    const plainProtoBJ = protoBJ ? protoBJ.toPlainObject() : {};
    delete plainProtoBJ.dependencies;
    return ComponentBitJson.fromPlainObject(R.merge(plainProtoBJ, json));
  }

  static create(json = {}, protoBJ: ConsumerBitJson) {
    return ComponentBitJson.mergeWithProto(json, protoBJ);
  }

  static load(dirPath: string, protoBJ?: ConsumerBitJson): Promise<ComponentBitJson> {
    return new Promise((resolve, reject) => {
      try {
        const result = this.loadSync(dirPath, protoBJ);
        return resolve(result);
      } catch (e) {
        return reject(dirPath);
      }
    });
  }

  static loadSync(dirPath: PathOsBased, protoBJ?: ConsumerBitJson): ComponentBitJson {
    if (!dirPath) throw new TypeError('bit-json.loadSync missing dirPath arg');
    let thisBJ = {};
    const bitJsonPath = AbstractBitJson.composePath(dirPath);
    if (fs.existsSync(bitJsonPath)) {
      try {
        thisBJ = fs.readJsonSync(bitJsonPath);
      } catch (e) {
        throw new InvalidBitJson(bitJsonPath);
      }
    } else if (!protoBJ) {
      throw new Error(
        `bit-json.loadSync expects "protoBJ" to be set because component bit.json does not exist at "${dirPath}"`
      );
    }

    const componentBitJson = ComponentBitJson.mergeWithProto(thisBJ, protoBJ);
    componentBitJson.path = bitJsonPath;
    return componentBitJson;
  }
}
