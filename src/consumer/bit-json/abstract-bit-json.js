/** @flow */
import R from 'ramda';
import { BitIds, BitId } from '../../bit-id';
import { filterObject } from '../../utils';
import {
  DEFAULT_COMPILER_ID,
  DEFAULT_TESTER_ID,
  DEFAULT_IMPL_NAME,
  DEFAULT_SPECS_NAME,
  DEFAULT_DEPENDENCIES,
  NO_PLUGIN_TYPE,
  DEFAULT_LANGUAGE,
} from '../../constants';

export type AbstractBitJsonProps = {
  impl?: string;
  spec?: string;
  compiler?: string;
  tester?: string;
  dependencies?: Object;
  lang?: string;
};

export default class AbstractBitJson {
  /** @deprecated **/
  impl: string;
  /** @deprecated **/
  spec: string;
  compiler: string;
  tester: string;
  dependencies: {[string]: string};
  lang: string;

  constructor({
    impl,
    spec,
    compiler,
    tester,
    dependencies,
    lang,
  }: AbstractBitJsonProps) {
    this.impl = impl || DEFAULT_IMPL_NAME;
    this.spec = spec || DEFAULT_SPECS_NAME;
    this.compiler = compiler || DEFAULT_COMPILER_ID;
    this.tester = tester || DEFAULT_TESTER_ID;
    this.dependencies = dependencies || DEFAULT_DEPENDENCIES;
    this.lang = lang || DEFAULT_LANGUAGE;
  }

  get compilerId(): string {
    return this.compiler;
  }

  set compilerId(compilerId: string) {
    this.compiler = compilerId;
  }

  get testerId(): string {
    return this.tester;
  }

  set testerId(testerId: string) {
    this.tester = testerId;
  }

  addDependencies(bitIds: BitId[]): this {
    const idObjects = R.mergeAll(bitIds.map(bitId => bitId.toObject()));
    this.dependencies = R.merge(this.dependencies, idObjects);
    return this;
  }

  addDependency(bitId: BitId): this {
    this.dependencies = R.merge(this.dependencies, bitId.toObject());
    return this;
  }

  getImplBasename(): string {
    return this.impl;
  }

  setImplBasename(name: string) {
    this.impl = name;
    return this;
  }

  getSpecBasename(): string {
    return this.spec;
  }

  setSpecBasename(name: string) {
    this.spec = name;
    return this;
  }

  hasCompiler(): boolean {
    return !!this.compiler && this.compiler !== NO_PLUGIN_TYPE;
  }

  hasTester(): boolean {
    return !!this.tester && this.tester !== NO_PLUGIN_TYPE;
  }

  getDependencies(): BitIds {
    return BitIds.fromObject(this.dependencies);
  }

  toPlainObject(): Object {
    const isLangPropDefaultOrNull = (val, key) => {
      if (!val) return false;
      return !(key === 'lang' && val === DEFAULT_LANGUAGE);
    };

    const self = this;
    function getSources() {
      if (!self.getImplBasename() && !self.getSpecBasename()) {
        return null;
      }

      return filterObject({
        impl: self.getImplBasename(),
        spec: self.getSpecBasename()
      }, val => val);
    }

    return filterObject({
      lang: this.lang,
      env: {
        compiler: this.compilerId,
        tester: this.testerId,
      },
      dependencies: this.dependencies
    }, isLangPropDefaultOrNull);
  }

  toJson(readable: boolean = true) {
    if (!readable) return JSON.stringify(this.toPlainObject());
    return JSON.stringify(this.toPlainObject(), null, 4);
  }
}
