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
  DEFAULT_BINDINGS_PREFIX,
  DEFAULT_EXTENSIONS
} from '../../constants';

export type AbstractBitJsonProps = {
  impl?: string,
  spec?: string,
  compiler?: string,
  tester?: string,
  dependencies?: Object,
  lang?: string,
  bindingPrefix?: string,
  extensions?: Object
};

export default class AbstractBitJson {
  /** @deprecated * */
  impl: string;
  /** @deprecated * */
  spec: string;
  compiler: string;
  tester: string;
  dependencies: { [string]: string };
  lang: string;
  bindingPrefix: string;
  extensions: Object;

  constructor({ impl, spec, compiler, tester, dependencies, lang, bindingPrefix, extensions }: AbstractBitJsonProps) {
    this.impl = impl || DEFAULT_IMPL_NAME;
    this.spec = spec || DEFAULT_SPECS_NAME;
    this.compiler = compiler || DEFAULT_COMPILER_ID;
    this.tester = tester || DEFAULT_TESTER_ID;
    this.dependencies = dependencies || DEFAULT_DEPENDENCIES;
    this.lang = lang || DEFAULT_LANGUAGE;
    this.bindingPrefix = bindingPrefix || DEFAULT_BINDINGS_PREFIX;
    this.extensions = extensions || DEFAULT_EXTENSIONS;
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
    const isPropDefaultOrNull = (val, key) => {
      if (!val) return false;
      if (key === 'lang') return !(key === 'lang' && val === DEFAULT_LANGUAGE);
      if (key === 'bindingPrefix') return !(key === 'bindingPrefix' && val === DEFAULT_BINDINGS_PREFIX);
      return true;
    };

    return filterObject(
      {
        lang: this.lang,
        bindingPrefix: this.bindingPrefix,
        env: {
          compiler: this.compilerId,
          tester: this.testerId
        },
        dependencies: this.dependencies,
        extensions: this.extensions
      },
      isPropDefaultOrNull
    );
  }

  toJson(readable: boolean = true) {
    if (!readable) return JSON.stringify(this.toPlainObject());
    return JSON.stringify(this.toPlainObject(), null, 4);
  }
}
