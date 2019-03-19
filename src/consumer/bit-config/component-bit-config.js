/** @flow */
import R from 'ramda';
import fs from 'fs-extra';
import { InvalidBitJson } from './exceptions';
import AbstractBitConfig from './abstract-bit-config';
import type { Compilers, Testers } from './abstract-bit-config';
import type ConsumerBitConfig from './consumer-bit-config';
import type { PathOsBased } from '../../utils/path';
import type Component from '../component/consumer-component';

export type BitConfigProps = {
  lang?: string,
  compiler?: string | Compilers,
  tester?: string | Testers,
  bindingPrefix: string,
  extensions?: Object,
  overrides?: Object
};

export default class ComponentBitConfig extends AbstractBitConfig {
  overrides: ?Object;
  constructor({ compiler, tester, lang, bindingPrefix, extensions, overrides }: BitConfigProps) {
    super({
      compiler,
      tester,
      lang,
      bindingPrefix,
      extensions
    });
    this.overrides = overrides;
    this.writeToBitJson = true; // will be changed later to work similar to consumer-bit-config
  }

  toPlainObject() {
    const superObject = super.toPlainObject();
    return R.merge(superObject, {
      overrides: this.overrides
    });
  }

  toJson(readable: boolean = true) {
    if (!readable) return JSON.stringify(this.toPlainObject());
    return JSON.stringify(this.toPlainObject(), null, 4);
  }

  validate(bitJsonPath: string) {
    if (
      typeof this.compiler !== 'object' ||
      typeof this.tester !== 'object' ||
      (this.extensions() && typeof this.extensions() !== 'object')
    ) {
      throw new InvalidBitJson(bitJsonPath);
    }
  }

  static fromPlainObject(object: Object): ComponentBitConfig {
    const { env, lang, bindingPrefix, extensions, overrides } = object;

    return new ComponentBitConfig({
      compiler: R.prop('compiler', env),
      tester: R.prop('tester', env),
      extensions,
      lang,
      bindingPrefix,
      overrides
    });
  }

  mergeWithComponentData(component: Component) {
    this.bindingPrefix = component.bindingPrefix;
    this.lang = component.lang;
  }

  /**
   * Use the consumerBitConfig as a base. Override values if exist in componentBitConfig
   */
  static mergeWithProto(json, protoBJ: ?ConsumerBitConfig): ComponentBitConfig {
    const plainProtoBJ = protoBJ ? protoBJ.toPlainObject() : {};
    delete plainProtoBJ.dependencies;
    return ComponentBitConfig.fromPlainObject(R.merge(plainProtoBJ, json));
  }

  static create(json = {}, protoBJ: ConsumerBitConfig) {
    return ComponentBitConfig.mergeWithProto(json, protoBJ);
  }

  static load(dirPath: string, protoBJ?: ConsumerBitConfig): Promise<ComponentBitConfig> {
    return new Promise((resolve, reject) => {
      try {
        const result = this.loadSync(dirPath, protoBJ);
        return resolve(result);
      } catch (e) {
        return reject(dirPath);
      }
    });
  }

  static loadSync(dirPath: PathOsBased, protoBJ?: ConsumerBitConfig): ComponentBitConfig {
    if (!dirPath) throw new TypeError('component-bit-config.loadSync missing dirPath arg');
    let thisBJ = {};
    const bitJsonPath = AbstractBitConfig.composeBitJsonPath(dirPath);
    if (fs.existsSync(bitJsonPath)) {
      try {
        thisBJ = fs.readJsonSync(bitJsonPath);
      } catch (e) {
        throw new InvalidBitJson(bitJsonPath);
      }
    } else if (!protoBJ) {
      throw new Error(
        `bit-config.loadSync expects "protoBJ" to be set because component bit.json does not exist at "${dirPath}"`
      );
    }

    const componentBitConfig = ComponentBitConfig.mergeWithProto(thisBJ, protoBJ);
    componentBitConfig.path = bitJsonPath;
    return componentBitConfig;
  }
}
