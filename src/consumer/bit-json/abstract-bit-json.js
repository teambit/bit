/** @flow */
import R from 'ramda';
import { BitIds, BitId } from '../../bit-id';
import { filterObject } from '../../utils';
import type { ExtensionOptions } from '../../extensions/extension';
import CompilerExtension from '../../extensions/compiler-extension';
import type { CompilerExtensionOptions } from '../../extensions/compiler-extension';
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

export type RegularExtensionObject = {
  rawConfig: Object,
  options: ExtensionOptions
};

export type CompilerExtensionObject = {
  rawConfig: Object,
  options: CompilerExtensionOptions
};

export type Extensions = { [extensionName: string]: RegularExtensionObject };
export type Compilers = { [compilerName: string]: CompilerExtensionObject };

export type AbstractBitJsonProps = {
  impl?: string,
  spec?: string,
  compiler?: string | Compilers,
  tester?: string,
  dependencies?: Object,
  devDependencies?: Object,
  lang?: string,
  bindingPrefix?: string,
  extensions?: Extensions
};

export default class AbstractBitJson {
  /** @deprecated * */
  impl: string;
  /** @deprecated * */
  spec: string;
  _compiler: Compilers;
  tester: string;
  dependencies: { [string]: string };
  devDependencies: { [string]: string };
  lang: string;
  bindingPrefix: string;
  extensions: Extensions;

  constructor({
    impl,
    spec,
    compiler,
    tester,
    dependencies,
    devDependencies,
    lang,
    bindingPrefix,
    extensions
  }: AbstractBitJsonProps) {
    this.impl = impl || DEFAULT_IMPL_NAME;
    this.spec = spec || DEFAULT_SPECS_NAME;
    this._compiler = compiler || {};
    this.tester = tester || DEFAULT_TESTER_ID;
    this.dependencies = dependencies || DEFAULT_DEPENDENCIES;
    this.devDependencies = devDependencies || DEFAULT_DEPENDENCIES;
    this.lang = lang || DEFAULT_LANGUAGE;
    this.bindingPrefix = bindingPrefix || DEFAULT_BINDINGS_PREFIX;
    this.extensions = extensions || DEFAULT_EXTENSIONS;
  }

  get compiler(): Compilers {
    return transformCompilerToObject(this._compiler);
  }

  set compiler(compiler: string | Compilers) {
    this._compiler = transformCompilerToObject(compiler);
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
    return !!this.compiler && this.compiler !== NO_PLUGIN_TYPE && !R.isEmpty(this.compiler);
  }

  async loadCompiler(consumerPath: string, scopePath: string): Promise<?CompilerExtension> {
    if (!this.hasCompiler()) {
      return null;
    }
    // TODO: Gilad - support more than one key of compiler
    const compilerName = Object.keys(this.compiler)[0];
    const compilerObject = this.compiler[compilerName];
    const compilerProps = {
      name: compilerName,
      consumerPath,
      scopePath,
      rawConfig: compilerObject.rawConfig,
      options: compilerObject.options
    };
    const compiler = await CompilerExtension.load(compilerProps);
    return compiler;
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
      if (key === 'lang') return val !== DEFAULT_LANGUAGE;
      if (key === 'bindingPrefix') return val !== DEFAULT_BINDINGS_PREFIX;
      if (key === 'extensions') return !R.equals(val, DEFAULT_EXTENSIONS);
      return true;
    };

    return filterObject(
      {
        lang: this.lang,
        bindingPrefix: this.bindingPrefix,
        env: {
          compiler: this.compiler,
          tester: this.tester
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

const transformCompilerToObject = (compiler): Compilers => {
  if (typeof compiler === 'string') {
    return {
      [compiler]: {
        rawConfig: {},
        options: {}
      }
    };
  }
  return compiler;
};
